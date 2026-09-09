from pathlib import Path
import sys

src_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
s = src_path.read_text()

anchor = 'async function runEmailAlertsSweep(env, options = {}) {'
assert s.count(anchor) == 1, f'runEmailAlertsSweep anchor count={s.count(anchor)}'
helper = r'''
async function fetchPublishedOffersForEmailDistrict(distritoAPD, shared = {}) {
  const districtKey = norm(String(distritoAPD || ""));
  if (!districtKey) return [];

  if (!shared.districts) shared.districts = new Map();
  if (shared.districts.has(districtKey)) {
    return await shared.districts.get(districtKey);
  }

  const promise = (async () => {
    const rowsPerPage = 150;
    const maxPages = 6;
    const docs = [];

    for (let page = 0; page < maxPages; page += 1) {
      const start = page * rowsPerPage;
      const escapedDistrict = String(distritoAPD || "").replace(/(["\\])/g, "\\$1");
      const q = `descdistrito:"${escapedDistrict}" AND estado:"Publicada"`;
      const url =
        `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select` +
        `?q=${encodeURIComponent(q)}&rows=${rowsPerPage}&start=${start}&wt=json&sort=ult_movimiento%20desc`;

      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`APD publicada respondió ${res.status}: ${errText}`);
      }

      const buffer = await res.arrayBuffer();
      const rawText = new TextDecoder("latin1").decode(buffer);
      const data = JSON.parse(rawText || "{}");
      const pageDocs = Array.isArray(data?.response?.docs) ? data.response.docs : [];

      for (const doc of pageDocs) {
        if (norm(doc?.descdistrito || "") !== districtKey) continue;
        if (!ofertaVigente(doc)) continue;
        docs.push(doc);
      }

      const numFound = Number(data?.response?.numFound ?? 0);
      if (pageDocs.length < rowsPerPage || start + pageDocs.length >= numFound) break;
    }

    return docs;
  })();

  shared.districts.set(districtKey, promise);
  return await promise;
}

async function refreshEmailUserOfferStateFromAbc(env, userId, shared = {}) {
  const prefs = await getUserPrefs(env, userId);
  if (!prefs || !prefs.alertas_activas || !prefs.alertas_email) {
    return { ok: true, skipped: true, reason: "email_preferences_disabled", total: 0 };
  }

  if (!shared.catalogos) {
    shared.catalogos = await cargarCatalogos(env).catch(() => ({ distritos: [], cargos: [] }));
  }

  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, shared.catalogos);
  const distritos = distritosPrefsAPD(prefsCanon);
  const allDocs = [];
  const seenDocs = new Set();

  for (const distrito of distritos) {
    const docs = await fetchPublishedOffersForEmailDistrict(distrito, shared);
    for (const doc of docs) {
      const key = buildSourceOfferKeyFromOferta2(doc) || buildSourceOfferKeyFromOferta(doc);
      if (!key || seenDocs.has(key)) continue;
      seenDocs.add(key);
      allDocs.push(doc);
    }
  }

  const resultados = [];
  const seenAlerts = new Set();

  for (const oferta of allDocs) {
    const evaluacion = coincideOfertaConPreferenciasAPD(oferta, prefsCanon);
    if (!evaluacion?.match) continue;

    const item = adaptOffer(oferta);
    item.offer_id = item.offer_id || item.source_offer_key || "";
    item.detalle_match = evaluacion?.detalle || {};
    item.motivo_match = evaluacion?.motivo || "Coincide con preferencias";

    const key = `${item.source_offer_key}|${item.escuela}|${item.turno}`;
    if (seenAlerts.has(key)) continue;
    seenAlerts.add(key);
    resultados.push(item);
  }

  const syncResult = await syncUserOfferState(env, userId, resultados);
  return {
    ok: true,
    refreshed: true,
    districts: distritos.length,
    source_docs: allDocs.length,
    matched: resultados.length,
    sync_result: syncResult
  };
}

async function markEmailAlertsAsEmailed(env, rows) {
  const nowIso = new Date().toISOString();
  let marked = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.id;
    if (!id) continue;

    const patch = { last_emailed_at: nowIso };
    if (!row?.first_emailed_at) patch.first_emailed_at = nowIso;

    await supabasePatchById(env, "user_offer_state", id, patch);
    marked += 1;
  }

  return { ok: true, marked, at: nowIso };
}

'''
s = s.replace(anchor, helper + anchor)

old_query = '`user_offer_state?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=offer_id,offer_payload,last_seen_at&order=last_seen_at.desc&limit=${encodeURIComponent(String(limit))}`'
new_query = '`user_offer_state?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&first_emailed_at=is.null&select=id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at&order=last_seen_at.desc&limit=${encodeURIComponent(String(limit))}`'
assert s.count(old_query) >= 1, f'load query occurrences={s.count(old_query)}'
# Only first occurrence is the email sweep helper; later copies belong to other channels.
s = s.replace(old_query, new_query, 1)

old_map = '''      .map((row) => ({
        offer_id: row?.offer_id || "",
        offer_payload: normalizeOfferPayload(row?.offer_payload || {}),
        last_seen_at: row?.last_seen_at || ""
      }))
      .filter((item) => {
        const p = item.offer_payload || {};
        return !!('''
new_map = '''      .map((row) => ({
        id: row?.id || null,
        offer_id: row?.offer_id || "",
        offer_payload: normalizeOfferPayload(row?.offer_payload || {}),
        last_seen_at: row?.last_seen_at || "",
        first_emailed_at: row?.first_emailed_at || null,
        last_emailed_at: row?.last_emailed_at || null
      }))
      .filter((item) => {
        if (item.first_emailed_at) return false;
        const p = item.offer_payload || {};
        return !!('''
assert s.count(old_map) >= 1, f'email map anchor count={s.count(old_map)}'
s = s.replace(old_map, new_map, 1)

# Shared ABC/cache context once per sweep.
old_ctx = '''  let lastProcessedUserId = cursorUserId || "";

  for (const row of rowsToProcess) {'''
new_ctx = '''  let lastProcessedUserId = cursorUserId || "";
  const emailRefreshShared = { catalogos: null, districts: new Map() };

  for (const row of rowsToProcess) {'''
assert s.count(old_ctx) == 1
s = s.replace(old_ctx, new_ctx)

# Refresh live ABC state only after active-plan check, before stored-state read.
old_stored = '''const emailPlanCode = getPlanCodeValue(resolvedPlanForEmail) || "TRIAL_7D";
const emailCanShowPid = canShowPidForPlan(emailPlanCode);

    const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);'''
new_stored = '''const emailPlanCode = getPlanCodeValue(resolvedPlanForEmail) || "TRIAL_7D";
const emailCanShowPid = canShowPidForPlan(emailPlanCode);

    let refreshResult = null;
    try {
      refreshResult = await refreshEmailUserOfferStateFromAbc(env, userId, emailRefreshShared);
    } catch (err) {
      failedDigests += 1;
      if (failed_samples.length < 10) {
        failed_samples.push({
          user_id: userId,
          destination: user.email || null,
          reason: "abc_refresh_failed",
          error: err?.message || String(err || "")
        });
      }
      pushDebug({
        user_id: userId,
        stage: "abc_refresh",
        skipped: true,
        reason: "abc_refresh_failed",
        destination: user.email,
        error: err?.message || String(err || "")
      });
      continue;
    }

    pushDebug({
      user_id: userId,
      stage: "abc_refresh",
      skipped: false,
      destination: user.email,
      refresh: refreshResult || null
    });

    const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);'''
assert s.count(old_stored) == 1, f'stored anchor count={s.count(old_stored)}'
s = s.replace(old_stored, new_stored)

# Preserve row id / email markers through visibleSource normalization.
old_visible_map = '''      visibleSource.map((item) => ({
        offer_id: item?.offer_id || "",
        offer_payload: normalizeOfferPayload(item?.offer_payload || item || {}),
        last_seen_at: item?.last_seen_at || ""
      }))'''
new_visible_map = '''      visibleSource.map((item) => ({
        id: item?.id || null,
        offer_id: item?.offer_id || "",
        offer_payload: normalizeOfferPayload(item?.offer_payload || item || {}),
        last_seen_at: item?.last_seen_at || "",
        first_emailed_at: item?.first_emailed_at || null,
        last_emailed_at: item?.last_emailed_at || null
      }))'''
assert s.count(old_visible_map) == 1, f'visible map count={s.count(old_visible_map)}'
s = s.replace(old_visible_map, new_visible_map)

old_success = '''    if (send?.ok) {
      sentDigests += 1;
      notifiedAlertsCount += shownCount;

      if (perUserSentKey) {'''
new_success = '''    if (send?.ok) {
      try {
        await markEmailAlertsAsEmailed(env, visibleSource);
      } catch (err) {
        console.error("EMAIL STATE MARK ERROR:", {
          user_id: userId,
          offer_ids: visibleOfferIds,
          error: err?.message || String(err || "")
        });
      }

      sentDigests += 1;
      notifiedAlertsCount += shownCount;

      if (perUserSentKey) {'''
assert s.count(old_success) == 1, f'success anchor count={s.count(old_success)}'
s = s.replace(old_success, new_success)

out_path.write_text(s)
print(out_path)

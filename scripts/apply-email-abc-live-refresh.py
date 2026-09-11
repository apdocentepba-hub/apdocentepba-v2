from pathlib import Path
import sys

src_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
s = src_path.read_text()

# Email-sweep follow-up:
# 1) first_emailed_at is history only; per-slot dedupe remains the guard.
# 2) use canonical ABC idoferta for user_offer_state identity.
# 3) compute PID in the email refresh with the same evaluatePidCompatibility +
#    buildAlertItem path used by the web alert view, so refreshing email cannot
#    overwrite a canonical row with a PID-empty payload.
# 4) expose canonical row id and PID evidence in debug samples for deploy smoke.
required = [
    'async function refreshEmailUserOfferStateFromAbc',
    'refreshEmailUserOfferStateFromAbc(env, userId, emailRefreshShared)',
    'await markEmailAlertsAsEmailed(env, visibleSource)',
    '`email:slot:${slotKey}:user:${userId}:sent`',
    'source_offer_key: buildSourceOfferKeyFromOferta2(oferta)',
    'async function obtenerUltimaPidGuardada',
    'function evaluatePidCompatibility',
    'function buildAlertItem',
]
missing = [marker for marker in required if marker not in s]
if missing:
    raise SystemExit('required live-refresh/PID markers missing: ' + ', '.join(missing))

# Active offers may repeat in later digest slots.
old_query = (
    '&is_active=eq.true&first_emailed_at=is.null&select='
    'id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at'
)
new_query = (
    '&is_active=eq.true&select='
    'id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at'
)
if old_query in s:
    if s.count(old_query) != 1:
        raise SystemExit(f'unexpected old query count={s.count(old_query)}')
    s = s.replace(old_query, new_query, 1)
elif new_query not in s:
    raise SystemExit('expected email stored-state query shape not found')

old_filter = '        if (item.first_emailed_at) return false;\n'
if old_filter in s:
    if s.count(old_filter) != 1:
        raise SystemExit(f'unexpected first_emailed filter count={s.count(old_filter)}')
    s = s.replace(old_filter, '', 1)

# Canonical identity: idoferta. Keep source_offer_key only for traceability.
old_identity = '    item.offer_id = item.offer_id || item.source_offer_key || "";'
new_identity = '    item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();'
if old_identity in s:
    if s.count(old_identity) != 1:
        raise SystemExit(f'unexpected email identity line count={s.count(old_identity)}')
    s = s.replace(old_identity, new_identity, 1)
elif new_identity not in s:
    raise SystemExit('expected email refresh identity assignment not found')

# Load PID once per user refresh using the same saved-PID source as the web path.
old_context = '''  const resultados = [];
  const seenAlerts = new Set();

  for (const oferta of allDocs) {'''
new_context = '''  const pidData = await obtenerUltimaPidGuardada(userId).catch(() => null);
  const pidRows = normalizePidRows(pidData);
  const districtIndex = buildDistrictIndex(shared.catalogos);
  const pidMeta = pidData?.result
    ? {
        listado: pidData.result.listado || "",
        anio: pidData.result.anio || ""
      }
    : null;

  const resultados = [];
  const seenAlerts = new Set();

  for (const oferta of allDocs) {'''
if old_context in s:
    if s.count(old_context) != 1:
        raise SystemExit(f'unexpected email refresh context count={s.count(old_context)}')
    s = s.replace(old_context, new_context, 1)
elif 'const pidData = await obtenerUltimaPidGuardada(userId).catch(() => null);' not in s[s.find('async function refreshEmailUserOfferStateFromAbc'):s.find('async function markEmailAlertsAsEmailed')]:
    raise SystemExit('expected email refresh context insertion point not found')

# Build exactly the PID-rich alert shape used by the web path.
old_item = '''    const item = adaptOffer(oferta);
    item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();
    item.detalle_match = evaluacion?.detalle || {};
    item.motivo_match = evaluacion?.motivo || "Coincide con preferencias";'''
new_item = '''    const pidEvalBase = evaluatePidCompatibility(
      oferta,
      pidData,
      pidRows,
      districtIndex
    );
    const pidInfo = {
      ...pidEvalBase,
      meta: pidMeta
    };
    const item = buildAlertItem(oferta, evaluacion, pidInfo);
    item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();
    item.detalle_match = evaluacion?.detalle || {};
    item.motivo_match = evaluacion?.motivo || "Coincide con preferencias";'''
if old_item in s:
    if s.count(old_item) != 1:
        raise SystemExit(f'unexpected email refresh item block count={s.count(old_item)}')
    s = s.replace(old_item, new_item, 1)
elif 'buildAlertItem(oferta, evaluacion, pidInfo)' not in s[s.find('async function refreshEmailUserOfferStateFromAbc'):s.find('async function markEmailAlertsAsEmailed')]:
    raise SystemExit('expected email refresh item block not found')

# Make dry-run diagnostics verify the actual state row + PID payload, not the
# traceability source key (D_<iddetalle>), which intentionally remains present.
old_debug = '''      return {
        offer_id: String(
          p.source_offer_key ||
          p.iddetalle ||
          p.idoferta ||
          p.offer_id ||
          ""
        ).trim(),
        total_postulantes: p.total_postulantes,
        puntaje_primero: p.puntaje_primero,
        listado_origen_primero: p.listado_origen_primero || ""
      };'''
new_debug = '''      return {
        state_offer_id: String(item?.offer_id || p.offer_id || "").trim(),
        source_offer_key: String(p.source_offer_key || "").trim(),
        idoferta: String(p.idoferta || "").trim(),
        iddetalle: String(p.iddetalle || "").trim(),
        pid_compatible: !!p.pid_compatible,
        pid_reason: p.pid_reason || "",
        pid_area: p.pid_area || "",
        pid_bloque: p.pid_bloque || "",
        pid_puntaje_total_base: p.pid_puntaje_total_base,
        pid_puntaje_total_final: p.pid_puntaje_total_final,
        pid_listado: p.pid_listado || "",
        pid_anio: p.pid_anio || "",
        total_postulantes: p.total_postulantes,
        puntaje_primero: p.puntaje_primero,
        listado_origen_primero: p.listado_origen_primero || ""
      };'''
if old_debug in s:
    if s.count(old_debug) != 1:
        raise SystemExit(f'unexpected enrichedSamples block count={s.count(old_debug)}')
    s = s.replace(old_debug, new_debug, 1)
elif 'state_offer_id: String(item?.offer_id || p.offer_id || "").trim()' not in s:
    raise SystemExit('expected enrichedSamples debug block not found')

# Final safety assertions.
if 'first_emailed_at=is.null' in s:
    raise SystemExit('never-emailed eligibility filter still present')
if 'if (item.first_emailed_at) return false;' in s:
    raise SystemExit('previously-emailed postfilter still present')
if old_identity in s:
    raise SystemExit('email refresh still promotes source_offer_key over idoferta')
refresh = s[s.find('async function refreshEmailUserOfferStateFromAbc'):s.find('async function markEmailAlertsAsEmailed')]
if 'const item = adaptOffer(oferta);' in refresh:
    raise SystemExit('email refresh still builds PID-empty adaptOffer payload')

out_path.write_text(s)
print(out_path)

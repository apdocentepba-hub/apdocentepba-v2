var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// profile_listados_api.js
var API_URL_PREFIX = "/api";
var PD_ABC_SYNC_SOURCE = "abc_public";
function pdCorsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
__name(pdCorsHeaders, "pdCorsHeaders");
function pdJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: pdCorsHeaders() });
}
__name(pdJson, "pdJson");
function pdNorm(v) {
  return String(v || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
__name(pdNorm, "pdNorm");
function pdTokens(v) {
  const stop = /* @__PURE__ */ new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "EN", "A"]);
  return [...new Set(
    pdNorm(v).split(" ").map((x) => x.trim()).filter((x) => x.length > 1 && !stop.has(x))
  )];
}
__name(pdTokens, "pdTokens");
function pdGetBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? String(auth.slice(7) || "").trim() : "";
}
__name(pdGetBearerToken, "pdGetBearerToken");
function pdGetAuthedUserId(request, body = null, url = null) {
  const bearer = pdGetBearerToken(request);
  const hinted = String(body?.user_id || url?.searchParams?.get("user_id") || "").trim();
  if (bearer && hinted && bearer !== hinted) {
    throw new Error("La sesi\xF3n no coincide con el user_id enviado");
  }
  return bearer || hinted;
}
__name(pdGetAuthedUserId, "pdGetAuthedUserId");
async function pdSupabaseRequest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }
  return data;
}
__name(pdSupabaseRequest, "pdSupabaseRequest");
async function pdSupabaseSelect(env, query) {
  return await pdSupabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}
__name(pdSupabaseSelect, "pdSupabaseSelect");
async function pdSupabaseInsertReturning(env, table, data) {
  const rows = await pdSupabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}
__name(pdSupabaseInsertReturning, "pdSupabaseInsertReturning");
async function pdSupabaseUpsert(env, table, rows, conflict) {
  return await pdSupabaseRequest(env, `${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}
__name(pdSupabaseUpsert, "pdSupabaseUpsert");
async function pdGetUserById(env, userId) {
  const rows = await pdSupabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
__name(pdGetUserById, "pdGetUserById");
function pdNormalizeDni(raw) {
  return String(raw || "").replace(/\D/g, "");
}
__name(pdNormalizeDni, "pdNormalizeDni");
async function pdSha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(pdSha256Hex, "pdSha256Hex");
function pdNormalizeListadoType(raw) {
  const value = pdNorm(raw);
  if (!value) return "OFICIAL";
  if (value.includes("108A")) return "108A";
  if (value.includes("108B") && value.includes("FINES")) return "108B_FINES";
  if (value.includes("108B") && value.includes("EMERGEN")) return "108B_EMERGENCIA";
  if (value.includes("108B")) return "108B";
  if (value.includes("FINES")) return "FINES";
  if (value.includes("EMERGEN")) return "EMERGENCIA";
  if (value.includes("OFICIAL")) return "OFICIAL";
  return value || "OTRO";
}
__name(pdNormalizeListadoType, "pdNormalizeListadoType");
function pdParsePuntaje(raw) {
  const text = String(raw || "").trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(/,/g, ".") : text;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
__name(pdParsePuntaje, "pdParsePuntaje");
function pdNormalizeListadoRow(row, fallback = {}) {
  const cargo = String(row?.cargo || fallback.cargo || "").trim();
  const materia = String(row?.materia || fallback.materia || "").trim();
  const joined = [cargo, materia].filter(Boolean).join(" ").trim();
  return {
    anio: Number(row?.anio || fallback.anio || (/* @__PURE__ */ new Date()).getFullYear()),
    tipo_listado: pdNormalizeListadoType(row?.tipo_listado || fallback.tipo_listado),
    distrito: pdNorm(row?.distrito || fallback.distrito || ""),
    cargo,
    materia,
    cargo_materia_normalizado: pdNorm(
      row?.cargo_materia_normalizado || joined || row?.texto || fallback.texto || ""
    ),
    puntaje: row?.puntaje != null ? pdParsePuntaje(row.puntaje) : pdParsePuntaje(fallback.puntaje),
    fuente: String(row?.fuente || fallback.fuente || "manual").trim() || "manual",
    raw_text: String(row?.raw_text || fallback.raw_text || "").trim(),
    confidence: row?.confidence != null ? Number(row.confidence) : 1,
    validado: row?.validado === true || fallback.validado === true
  };
}
__name(pdNormalizeListadoRow, "pdNormalizeListadoRow");
function pdParseListadoText(rawText, fallback = {}) {
  const lines = String(rawText || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const chunks = line.split("|").map((x) => x.trim()).filter(Boolean);
    if (chunks.length >= 4) {
      rows.push(
        pdNormalizeListadoRow(
          {
            tipo_listado: chunks[0],
            cargo: chunks[1],
            materia: chunks[1],
            puntaje: chunks[2],
            distrito: chunks[3],
            raw_text: line,
            confidence: 0.95,
            fuente: "paste"
          },
          fallback
        )
      );
      continue;
    }
    const puntajeMatch = line.match(/(\d{1,3}[.,]\d{1,2}|\d{1,3})\s*$/);
    const puntaje = puntajeMatch ? pdParsePuntaje(puntajeMatch[1]) : null;
    const textWithoutScore = puntajeMatch ? line.slice(0, puntajeMatch.index).trim() : line;
    if (!textWithoutScore) continue;
    rows.push(
      pdNormalizeListadoRow(
        {
          cargo: textWithoutScore,
          puntaje,
          distrito: fallback.distrito || "",
          tipo_listado: fallback.tipo_listado || "OFICIAL",
          raw_text: line,
          confidence: puntaje != null ? 0.75 : 0.55,
          fuente: "paste"
        },
        fallback
      )
    );
  }
  return rows.filter((row) => row.cargo_materia_normalizado);
}
__name(pdParseListadoText, "pdParseListadoText");
function pdSafeOfferId(offer) {
  return String(offer?.offer_id || offer?.source_offer_key || offer?.idoferta || offer?.iddetalle || offer?.id || "").trim();
}
__name(pdSafeOfferId, "pdSafeOfferId");
function pdNormalizeOfferText(offer) {
  const fields = [
    offer?.cargo,
    offer?.materia,
    offer?.area,
    offer?.title,
    offer?.descripcioncargo,
    offer?.descripcionarea
  ].map((x) => pdNorm(x)).filter(Boolean);
  return [...new Set(fields)].join(" ");
}
__name(pdNormalizeOfferText, "pdNormalizeOfferText");
function pdComputeEligibilityForOffer(offer, listados) {
  const offerId = pdSafeOfferId(offer);
  const offerText = pdNormalizeOfferText(offer);
  const offerDistrito = pdNorm(offer?.distrito || offer?.descdistrito || "");
  let best = null;
  const offerTokens = pdTokens(offerText);
  if (!offerTokens.length) {
    return {
      offer_id: offerId,
      compatible: false,
      match_type: "sin_match",
      puntaje_usuario: null,
      tipo_listado_detectado: null,
      score_competitividad: 0,
      confidence_level: "sin_datos",
      strategic_message: "La oferta no trae texto suficiente para comparar."
    };
  }
  for (const row of Array.isArray(listados) ? listados : []) {
    const base = pdNorm(
      row?.cargo_materia_normalizado || [row?.cargo, row?.materia].filter(Boolean).join(" ")
    );
    if (!base) continue;
    const rowTokens = pdTokens(base);
    if (!rowTokens.length) continue;
    const overlap = rowTokens.filter((token) => offerTokens.includes(token));
    const overlapCount = overlap.length;
    const coverageRow = overlapCount / Math.max(rowTokens.length, 1);
    const coverageOffer = overlapCount / Math.max(offerTokens.length, 1);
    const dice = 2 * overlapCount / Math.max(rowTokens.length + offerTokens.length, 1);
    let score = Math.max(coverageRow, coverageOffer, dice);
    if (offerDistrito && row?.distrito && pdNorm(row.distrito) === offerDistrito) {
      score += 0.05;
    }
    if (score < 0.45) continue;
    const puntajeUsuario = row?.puntaje != null ? Number(row.puntaje) : null;
    const puntajePrimero = offer?.puntaje_primero != null ? Number(offer.puntaje_primero) : null;
    let competitiveness = score;
    let confidenceLevel = score >= 0.85 ? "alta" : score >= 0.65 ? "media" : "baja";
    let strategicMessage = puntajeUsuario != null ? `Puntaje detectado: ${puntajeUsuario.toFixed(2)}` : "Compatible, pero sin puntaje usable detectado";
    if (puntajeUsuario != null && Number.isFinite(puntajePrimero)) {
      const delta = puntajeUsuario - puntajePrimero;
      competitiveness = Math.max(0, Math.min(1.2, 0.65 + delta / 20));
      if (delta >= 0.25) {
        confidenceLevel = "muy_alta";
        strategicMessage = `Alta oportunidad: tu puntaje (${puntajeUsuario.toFixed(2)}) supera al primero visible (${puntajePrimero.toFixed(2)}).`;
      } else if (delta >= -0.5) {
        confidenceLevel = "alta";
        strategicMessage = `Buena oportunidad: tu puntaje (${puntajeUsuario.toFixed(2)}) est\xE1 muy cerca del primero visible (${puntajePrimero.toFixed(2)}).`;
      } else if (delta >= -2) {
        confidenceLevel = "media";
        strategicMessage = `Compatible, pero hoy el primero visible marca ${puntajePrimero.toFixed(2)}.`;
      } else {
        confidenceLevel = "baja";
        strategicMessage = `Compatible, aunque la competencia visible hoy parece alta (${puntajePrimero.toFixed(2)}).`;
      }
    }
    const candidate = {
      offer_id: offerId,
      compatible: true,
      match_type: score >= 0.85 ? "exacto" : score >= 0.65 ? "fuerte" : "parcial",
      puntaje_usuario: puntajeUsuario,
      tipo_listado_detectado: row?.tipo_listado || null,
      score_competitividad: Math.round(competitiveness * 100) / 100,
      confidence_level: confidenceLevel,
      strategic_message: strategicMessage
    };
    if (!best || (candidate.score_competitividad || 0) > (best.score_competitividad || 0)) {
      best = candidate;
    }
  }
  return best || {
    offer_id: offerId,
    compatible: false,
    match_type: "sin_match",
    puntaje_usuario: null,
    tipo_listado_detectado: null,
    score_competitividad: 0,
    confidence_level: "sin_datos",
    strategic_message: "No encontramos habilitaci\xF3n compatible en tus listados cargados."
  };
}
__name(pdComputeEligibilityForOffer, "pdComputeEligibilityForOffer");
async function pdFetchAbcListadoPublic(dni) {
  const normalizedDni = pdNormalizeDni(dni);
  if (normalizedDni.length < 7 || normalizedDni.length > 9) {
    throw new Error("Ingres\xE1 un DNI v\xE1lido antes de sincronizar");
  }
  const pageSize = 200;
  const maxPages = 6;
  const baseUrls = [
    "https://abc.gob.ar/select/",
    "https://abc.gob.ar/select",
    "https://abc.gob.ar/listado-oficial/select/",
    "https://abc.gob.ar/listado-oficial/select"
  ];
  const errors = [];
  for (const baseUrl of baseUrls) {
    try {
      const docsTemp = [];
      let facetsTemp = null;
      for (let page = 0; page < maxPages; page += 1) {
        const start = page * pageSize;
        const params = new URLSearchParams();
        params.set("q", `busqueda=${normalizedDni}`);
        params.set("wt", "json");
        params.set("rows", String(pageSize));
        params.set("start", String(start));
        params.set("sort", "orden asc");
        params.set("facet", "true");
        params.set("facet.mincount", "1");
        params.set("json.nl", "map");
        params.append("facet.field", "distrito");
        params.append("facet.field", "rama");
        params.append("facet.field", "cargo_area");
        params.append("facet.field", "aniolistado");
        const url = `${baseUrl}?${params.toString()}`;
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: {
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://abc.gob.ar/listado-oficial",
            "Origin": "https://abc.gob.ar",
            "User-Agent": "Mozilla/5.0"
          }
        });
        const text = await res.text();
        const trimmed = String(text || "").trim();
        const contentType = res.headers.get("content-type") || "";
        if (!trimmed) {
          throw new Error(`Respuesta vac\xEDa | status=${res.status} | url=${url}`);
        }
        if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<!doctype")) {
          throw new Error(
            `ABC devolvi\xF3 HTML | status=${res.status} | content-type=${contentType} | url=${url} | snippet=${trimmed.slice(0, 180)}`
          );
        }
        let data = null;
        try {
          data = JSON.parse(trimmed);
        } catch {
          throw new Error(
            `ABC devolvi\xF3 algo no JSON | status=${res.status} | content-type=${contentType} | url=${url} | snippet=${trimmed.slice(0, 180)}`
          );
        }
        if (!res.ok || Number(data?.responseHeader?.status ?? 1) !== 0) {
          throw new Error(
            `ABC respondi\xF3 error JSON | status=${res.status} | url=${url} | body=${trimmed.slice(0, 180)}`
          );
        }
        const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
        if (!facetsTemp && data?.facet_counts) facetsTemp = data.facet_counts;
        docsTemp.push(...docs);
        const numFound = Number(data?.response?.numFound || 0);
        if (!docs.length || docsTemp.length >= numFound) {
          return { dni: normalizedDni, docs: docsTemp, facets: facetsTemp };
        }
      }
      return { dni: normalizedDni, docs: docsTemp, facets: facetsTemp };
    } catch (err) {
      errors.push(String(err?.message || err));
    }
  }
  throw new Error(errors.join(" || "));
}
__name(pdFetchAbcListadoPublic, "pdFetchAbcListadoPublic");
function pdBuildListadoSummary(rows) {
  const distritos = [...new Set(rows.map((row) => pdNorm(row?.distrito || "")).filter(Boolean))].sort();
  const anios = [...new Set(rows.map((row) => Number(row?.anio || 0)).filter(Boolean))].sort((a, b) => b - a);
  const tipos = [...new Set(rows.map((row) => String(row?.tipo_listado || "").trim()).filter(Boolean))].sort();
  return {
    total_rows: rows.length,
    distritos,
    anios,
    tipos
  };
}
__name(pdBuildListadoSummary, "pdBuildListadoSummary");
function pdMapAbcDocToListadoRow(doc, dni) {
  const cargoArea = String(doc?.cargo_area || "").trim();
  const rama = String(doc?.rama || "").trim();
  const tipoListado = pdNormalizeListadoType(doc?.tipo_listado || doc?.listado || "OFICIAL");
  const anio = Number(doc?.aniolistado || (/* @__PURE__ */ new Date()).getFullYear()) || (/* @__PURE__ */ new Date()).getFullYear();
  const distrito = pdNorm(doc?.distrito || "");
  const rawPayload = {
    source: "abc_public",
    dni,
    documento: String(doc?.documento || ""),
    nombre: String(doc?.nombre || ""),
    apellido: String(doc?.apellido || ""),
    distrito: String(doc?.distrito || ""),
    rama,
    cargo_area: cargoArea,
    puntaje: String(doc?.puntaje || ""),
    orden: doc?.orden ?? null,
    aniolistado: String(doc?.aniolistado || ""),
    apto_fisico: String(doc?.apto_fisico || ""),
    recalificacionlaboral: String(doc?.recalificacionlaboral || ""),
    source_id: String(doc?.id || ""),
    source_timestamp: String(doc?.timestamp || "")
  };
  return pdNormalizeListadoRow(
    {
      anio,
      tipo_listado: tipoListado,
      distrito,
      cargo: cargoArea,
      materia: rama,
      cargo_materia_normalizado: cargoArea,
      puntaje: doc?.puntaje,
      fuente: PD_ABC_SYNC_SOURCE,
      raw_text: JSON.stringify(rawPayload),
      confidence: 1,
      validado: true
    },
    { distrito, tipo_listado: tipoListado, anio }
  );
}
__name(pdMapAbcDocToListadoRow, "pdMapAbcDocToListadoRow");
async function pdDeleteUserAutoSyncedListados(env, userId) {
  await pdSupabaseRequest(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&fuente=eq.${encodeURIComponent(PD_ABC_SYNC_SOURCE)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
}
__name(pdDeleteUserAutoSyncedListados, "pdDeleteUserAutoSyncedListados");
async function pdUpdateIdentityProfileSync(env, userId, patch = {}) {
  const profileRows = await pdSupabaseSelect(
    env,
    `user_identity_profile?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,dni,dni_hash,consentimiento_datos&limit=1`
  ).catch(() => []);
  const profile = Array.isArray(profileRows) ? profileRows[0] || null : null;
  if (!profile) return null;
  const rows = await pdSupabaseUpsert(
    env,
    "user_identity_profile",
    [{
      user_id: userId,
      dni: profile.dni,
      dni_hash: profile.dni_hash,
      consentimiento_datos: profile.consentimiento_datos === true,
      ...patch,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }],
    "user_id"
  ).catch(() => null);
  return Array.isArray(rows) ? rows[0] || null : rows;
}
__name(pdUpdateIdentityProfileSync, "pdUpdateIdentityProfileSync");
async function handleProfileMe(request, env, url) {
  const userId = pdGetAuthedUserId(request, null, url);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const user = await pdGetUserById(env, userId);
  if (!user) return pdJson({ ok: false, message: "Usuario no encontrado" }, 404);
  const profileRows = await pdSupabaseSelect(
    env,
    `user_identity_profile?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,dni,consentimiento_datos,last_sync_at,sync_status,created_at,updated_at&limit=1`
  ).catch(() => []);
  const listadosRows = await pdSupabaseSelect(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&select=id,cargo,materia,puntaje,tipo_listado,validado,fuente,distrito,anio&order=updated_at.desc`
  ).catch(() => []);
  const items = Array.isArray(listadosRows) ? listadosRows : [];
  const autoRows = items.filter((x) => String(x?.fuente || "").trim() === PD_ABC_SYNC_SOURCE);
  const manualRows = items.filter((x) => String(x?.fuente || "").trim() !== PD_ABC_SYNC_SOURCE);
  const syncSummary = pdBuildListadoSummary(autoRows);
  return pdJson({
    ok: true,
    profile: Array.isArray(profileRows) ? profileRows[0] || null : null,
    stats: {
      listados_total: items.length,
      listados_validados: items.filter((x) => x.validado === true).length,
      listados_sync_abc: autoRows.length,
      listados_manual: manualRows.length
    },
    sync_summary: syncSummary
  });
}
__name(handleProfileMe, "handleProfileMe");
async function handleSaveDni(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const user = await pdGetUserById(env, userId);
  if (!user) return pdJson({ ok: false, message: "Usuario no encontrado" }, 404);
  const dni = pdNormalizeDni(body?.dni);
  const consentimiento = body?.consentimiento_datos === true;
  if (dni.length < 7 || dni.length > 9) return pdJson({ ok: false, message: "Ingres\xE1 un DNI v\xE1lido" }, 400);
  if (!consentimiento) return pdJson({ ok: false, message: "Necesitamos tu consentimiento para usar estos datos" }, 400);
  const dniHash = await pdSha256Hex(dni);
  const rows = await pdSupabaseUpsert(
    env,
    "user_identity_profile",
    [{
      user_id: userId,
      dni,
      dni_hash: dniHash,
      consentimiento_datos: true,
      sync_status: "ready",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }],
    "user_id"
  );
  return pdJson({ ok: true, message: "DNI guardado", profile: Array.isArray(rows) ? rows[0] || null : null });
}
__name(handleSaveDni, "handleSaveDni");
async function handleMisListados(request, env, url) {
  const userId = pdGetAuthedUserId(request, null, url);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const rows = await pdSupabaseSelect(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&select=*&order=updated_at.desc`
  ).catch((err) => {
    throw new Error(`No se pudieron leer tus listados: ${err?.message || err}`);
  });
  const items = Array.isArray(rows) ? rows : [];
  return pdJson({
    ok: true,
    items,
    summary: {
      total: items.length,
      sync_abc: items.filter((row) => String(row?.fuente || "").trim() === PD_ABC_SYNC_SOURCE).length,
      manual: items.filter((row) => String(row?.fuente || "").trim() !== PD_ABC_SYNC_SOURCE).length
    }
  });
}
__name(handleMisListados, "handleMisListados");
async function handleImportManual(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const sourceRows = Array.isArray(body?.rows) ? body.rows : [body];
  const rows = sourceRows.map((row) => pdNormalizeListadoRow(row, { fuente: "manual" })).filter((row) => row.cargo_materia_normalizado);
  if (!rows.length) return pdJson({ ok: false, message: "No hay filas v\xE1lidas para guardar" }, 400);
  const payload = rows.map((row) => ({ ...row, user_id: userId, updated_at: (/* @__PURE__ */ new Date()).toISOString() }));
  const inserted = await pdSupabaseRequest(env, "user_listados", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  await pdSupabaseInsertReturning(env, "user_listados_imports", {
    user_id: userId,
    source_type: "manual",
    source_name: "Carga manual",
    raw_content: JSON.stringify(sourceRows),
    parse_status: "ok",
    parse_message: "Filas cargadas manualmente",
    imported_rows: payload.length
  }).catch(() => null);
  return pdJson({
    ok: true,
    message: "Listados guardados",
    imported: Array.isArray(inserted) ? inserted.length : payload.length,
    items: Array.isArray(inserted) ? inserted : []
  });
}
__name(handleImportManual, "handleImportManual");
async function handleImportPaste(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const rawText = String(body?.raw_text || "").trim();
  if (!rawText) return pdJson({ ok: false, message: "Peg\xE1 alg\xFAn texto del listado" }, 400);
  const parsedRows = pdParseListadoText(rawText, {
    anio: body?.anio,
    tipo_listado: body?.tipo_listado,
    distrito: body?.distrito,
    fuente: "paste",
    raw_text: rawText
  });
  if (!parsedRows.length) {
    return pdJson({ ok: false, message: "No pudimos interpretar filas v\xE1lidas desde el texto pegado" }, 400);
  }
  const payload = parsedRows.map((row) => ({ ...row, user_id: userId, updated_at: (/* @__PURE__ */ new Date()).toISOString() }));
  const inserted = await pdSupabaseRequest(env, "user_listados", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  await pdSupabaseInsertReturning(env, "user_listados_imports", {
    user_id: userId,
    source_type: "paste",
    source_name: "Pegado manual",
    raw_content: rawText,
    parse_status: "ok",
    parse_message: `Filas detectadas: ${payload.length}`,
    imported_rows: payload.length
  }).catch(() => null);
  return pdJson({
    ok: true,
    message: `Texto interpretado. Filas cargadas: ${payload.length}`,
    imported: payload.length,
    items: Array.isArray(inserted) ? inserted : []
  });
}
__name(handleImportPaste, "handleImportPaste");
async function handleSyncPublicAbc(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const user = await pdGetUserById(env, userId);
  if (!user) return pdJson({ ok: false, message: "Usuario no encontrado" }, 404);
  const profileRows = await pdSupabaseSelect(
    env,
    `user_identity_profile?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,dni,consentimiento_datos&limit=1`
  ).catch(() => []);
  const profile = Array.isArray(profileRows) ? profileRows[0] || null : null;
  if (!profile?.dni) {
    return pdJson({ ok: false, message: "Primero guard\xE1 tu DNI en el perfil docente" }, 400);
  }
  if (profile?.consentimiento_datos !== true) {
    return pdJson({ ok: false, message: "Primero acept\xE1 el consentimiento de datos" }, 400);
  }
  await pdUpdateIdentityProfileSync(env, userId, { sync_status: "running" }).catch(() => null);
  try {
    const fetched = await pdFetchAbcListadoPublic(profile.dni);
    const normalizedRows = fetched.docs.map((doc) => pdMapAbcDocToListadoRow(doc, fetched.dni)).filter((row) => row.cargo_materia_normalizado);
    await pdDeleteUserAutoSyncedListados(env, userId);
    let inserted = [];
    if (normalizedRows.length) {
      const payload = normalizedRows.map((row) => ({
        ...row,
        user_id: userId,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }));
      inserted = await pdSupabaseRequest(env, "user_listados", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
    }
    const summary = pdBuildListadoSummary(normalizedRows);
    await pdSupabaseInsertReturning(env, "user_listados_imports", {
      user_id: userId,
      source_type: "abc_public",
      source_name: "ABC p\xFAblico por DNI",
      raw_content: JSON.stringify({
        dni: fetched.dni,
        total_docs: fetched.docs.length,
        facets: fetched.facets || null
      }),
      parse_status: "ok",
      parse_message: `ABC p\xFAblico sincronizado. Registros: ${normalizedRows.length}`,
      imported_rows: normalizedRows.length
    }).catch(() => null);
    await pdUpdateIdentityProfileSync(env, userId, {
      last_sync_at: (/* @__PURE__ */ new Date()).toISOString(),
      sync_status: normalizedRows.length ? "ok" : "empty"
    }).catch(() => null);
    return pdJson({
      ok: true,
      message: normalizedRows.length ? `Sincronizaci\xF3n completada. Registros tra\xEDdos: ${normalizedRows.length}` : "La consulta a ABC no devolvi\xF3 registros para ese DNI",
      imported: normalizedRows.length,
      items: Array.isArray(inserted) ? inserted : [],
      summary,
      facets: fetched.facets || null
    });
  } catch (err) {
    await pdSupabaseInsertReturning(env, "user_listados_imports", {
      user_id: userId,
      source_type: "abc_public",
      source_name: "ABC p\xFAblico por DNI",
      raw_content: JSON.stringify({ dni: profile.dni }),
      parse_status: "error",
      parse_message: String(err?.message || "No se pudo sincronizar con ABC"),
      imported_rows: 0
    }).catch(() => null);
    await pdUpdateIdentityProfileSync(env, userId, {
      sync_status: "error"
    }).catch(() => null);
    return pdJson({ ok: false, message: err?.message || "No se pudo sincronizar con ABC" }, 502);
  }
}
__name(handleSyncPublicAbc, "handleSyncPublicAbc");
async function handleDeleteListado(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const id = String(body?.id || "").trim();
  if (!id) return pdJson({ ok: false, message: "Falta el id del listado" }, 400);
  await pdSupabaseRequest(
    env,
    `user_listados?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  return pdJson({ ok: true, message: "Listado eliminado" });
}
__name(handleDeleteListado, "handleDeleteListado");
async function fetchStoredOffers(env, userId) {
  const rows = await pdSupabaseSelect(
    env,
    `user_offer_state?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=offer_id,offer_payload&order=last_seen_at.desc&limit=200`
  ).catch(() => []);
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row.offer_payload || {},
    offer_id: row.offer_id || row.offer_payload?.offer_id || ""
  }));
}
__name(fetchStoredOffers, "fetchStoredOffers");
async function handleEligibilityRecompute(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const listados = await pdSupabaseSelect(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&select=id,tipo_listado,distrito,cargo,materia,cargo_materia_normalizado,puntaje,validado&order=updated_at.desc`
  ).catch((err) => {
    throw new Error(`No se pudieron leer tus listados: ${err?.message || err}`);
  });
  if (!Array.isArray(listados) || !listados.length) {
    return pdJson({ ok: true, items: [], summary: { compatibles: 0, total: 0 }, message: "Todav\xEDa no cargaste listados." });
  }
  const sourceOffers = Array.isArray(body?.offers) && body.offers.length ? body.offers : await fetchStoredOffers(env, userId);
  const offers = sourceOffers.filter((item) => pdSafeOfferId(item));
  const computed = offers.map((offer) => ({
    user_id: userId,
    ...pdComputeEligibilityForOffer(offer, listados),
    computed_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  if (computed.length) {
    await pdSupabaseUpsert(
      env,
      "offer_eligibility",
      computed.map((item) => ({
        user_id: item.user_id,
        offer_id: item.offer_id,
        compatible: item.compatible,
        match_type: item.match_type,
        puntaje_usuario: item.puntaje_usuario,
        tipo_listado_detectado: item.tipo_listado_detectado,
        score_competitividad: item.score_competitividad,
        confidence_level: item.confidence_level,
        strategic_message: item.strategic_message,
        computed_at: item.computed_at
      })),
      "user_id,offer_id"
    ).catch(() => null);
  }
  return pdJson({
    ok: true,
    items: computed,
    summary: {
      total: computed.length,
      compatibles: computed.filter((item) => item.compatible).length,
      muy_altas: computed.filter((item) => item.confidence_level === "muy_alta").length,
      altas: computed.filter((item) => item.confidence_level === "alta").length
    }
  });
}
__name(handleEligibilityRecompute, "handleEligibilityRecompute");
async function handleEligibilityList(request, env, url) {
  const userId = pdGetAuthedUserId(request, null, url);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);
  const rows = await pdSupabaseSelect(
    env,
    `offer_eligibility?user_id=eq.${encodeURIComponent(userId)}&select=*&order=computed_at.desc&limit=200`
  ).catch(() => []);
  return pdJson({ ok: true, items: Array.isArray(rows) ? rows : [] });
}
__name(handleEligibilityList, "handleEligibilityList");
async function handleProfileListadosRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === `${API_URL_PREFIX}/profile/me` && request.method === "GET") {
    return await handleProfileMe(request, env, url);
  }
  if (path === `${API_URL_PREFIX}/profile/save-dni` && request.method === "POST") {
    return await handleSaveDni(request, env);
  }
  if (path === `${API_URL_PREFIX}/listados/mis-listados` && request.method === "GET") {
    return await handleMisListados(request, env, url);
  }
  if (path === `${API_URL_PREFIX}/listados/import-manual` && request.method === "POST") {
    return await handleImportManual(request, env);
  }
  if (path === `${API_URL_PREFIX}/listados/import-paste` && request.method === "POST") {
    return await handleImportPaste(request, env);
  }
  if (path === `${API_URL_PREFIX}/listados/sync-public-abc` && request.method === "POST") {
    return await handleSyncPublicAbc(request, env);
  }
  if (path === `${API_URL_PREFIX}/listados/delete` && request.method === "POST") {
    return await handleDeleteListado(request, env);
  }
  if (path === `${API_URL_PREFIX}/eligibility/recompute` && request.method === "POST") {
    return await handleEligibilityRecompute(request, env);
  }
  if (path === `${API_URL_PREFIX}/eligibility/mis-alertas` && request.method === "GET") {
    return await handleEligibilityList(request, env, url);
  }
  return null;
}
__name(handleProfileListadosRoute, "handleProfileListadosRoute");

// worker.js
async function supabaseInsert(env, table, data) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return true;
}
__name(supabaseInsert, "supabaseInsert");
async function supabaseInsertReturning(env, table, data) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation"
    },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inv\xE1lida de Supabase insert returning: ${text}`);
  }
}
__name(supabaseInsertReturning, "supabaseInsertReturning");
var API_VERSION = "2026-03-27";
var API_URL_PREFIX2 = "/api";
var HISTORICO_DAYS_DEFAULT = 30;
var HISTORICO_INSERT_BATCH = 150;
var HISTORICO_POSTULANTES_LIMIT = 8;
var USER_CAPTURE_ROWS_PER_PAGE = 150;
var USER_CAPTURE_MAX_PAGES = 25;
var PROVINCIA_SCOPE = "PROVINCIA_FULL";
var PROVINCIA_CAPTURE_ROWS_PER_PAGE = 150;
var PROVINCIA_STEP_PAGES = 4;
var PROVINCIA_SUMMARY_LIMIT = 2e4;
var PROVINCIA_DAYS_DEFAULT = 30;
var PROVINCIA_RUNNING_STALE_MS = 10 * 60 * 1e3;
var WHATSAPP_ALERT_SWEEP_MAX_USERS = 20;
var WHATSAPP_ALERTS_PER_USER_MAX = 3;
var WHATSAPP_ALERT_LOG_LOOKBACK = 200;
var WHATSAPP_QUERY_ALERTS_LIMIT = 5;
var TELEGRAM_QUERY_ALERTS_LIMIT = 5;
var TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS = 60 * 60 * 6;
var WHATSAPP_MESSAGE_DEDUPE_TTL_SECONDS = 60 * 60 * 6;
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
__name(jsonResponse, "jsonResponse");
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
__name(corsHeaders, "corsHeaders");
function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}
__name(normalizeEmail, "normalizeEmail");
function normalizeText(v) {
  return String(v || "").trim();
}
__name(normalizeText, "normalizeText");
async function ensureTrialIfNoSubscriptions(env, userId, email, source = "trial_auto") {
  const existing = await supabaseSelect(
    env,
    `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status&limit=1`
  ).catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) {
    return {
      ok: true,
      created: false,
      subscription: existing[0]
    };
  }
  const row = await supabaseInsert(env, "user_subscriptions", {
    user_id: userId,
    plan_code: "TRIAL_7D",
    status: "ACTIVE",
    source,
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString(),
    current_period_ends_at: null,
    mercadopago_preapproval_id: null,
    mercadopago_payer_email: email || null,
    external_reference: `${userId}:TRIAL_7D:${Date.now()}`
  });
  return {
    ok: true,
    created: true,
    subscription: Array.isArray(row) ? row[0] : row
  };
}
__name(ensureTrialIfNoSubscriptions, "ensureTrialIfNoSubscriptions");
async function handleRegister(body, env) {
  try {
    const nombre = normalizeText(body?.nombre);
    const apellido = normalizeText(body?.apellido);
    const email = normalizeEmail(body?.email);
    const password = normalizeText(body?.password);
    const celular = normalizeText(body?.celular);
    if (!nombre) return jsonResponse({ ok: false, error: "Falta nombre" }, 400);
    if (!apellido) return jsonResponse({ ok: false, error: "Falta apellido" }, 400);
    if (!email) return jsonResponse({ ok: false, error: "Falta email" }, 400);
    if (!password || password.length < 6) {
      return jsonResponse({ ok: false, error: "La contrase\xF1a debe tener al menos 6 caracteres" }, 400);
    }
    const existingUser = await findUserByEmail(env, email);
    if (existingUser?.id) {
      return jsonResponse({ ok: false, error: "Ese email ya est\xE1 registrado" }, 409);
    }
    const nuevoUsuarioRaw = await supabaseInsertReturning(env, "users", {
      nombre,
      apellido,
      email,
      celular,
      password_hash: password,
      activo: true
    });
    const nuevoUsuario = Array.isArray(nuevoUsuarioRaw) ? nuevoUsuarioRaw[0] : nuevoUsuarioRaw;
    if (!nuevoUsuario?.id) {
      return jsonResponse({ ok: false, error: "No se pudo obtener el ID del usuario creado" }, 500);
    }
    await ensureTrialIfNoSubscriptions(env, nuevoUsuario.id, email, "trial_auto_register");
    return jsonResponse({
      ok: true,
      message: "Usuario registrado correctamente",
      data: nuevoUsuario
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: err?.message || "Error interno en registro"
      },
      500
    );
  }
}
__name(handleRegister, "handleRegister");
function adminJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}
__name(adminJson, "adminJson");
function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}
__name(getBearerToken, "getBearerToken");
function startOfTodayISO() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}
__name(startOfTodayISO, "startOfTodayISO");
function sevenDaysAgoISO() {
  const dt = /* @__PURE__ */ new Date();
  dt.setUTCDate(dt.getUTCDate() - 6);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString();
}
__name(sevenDaysAgoISO, "sevenDaysAgoISO");
async function getSessionUserByBearer(env, request) {
  const token = getBearerToken(request);
  if (!token) return null;
  const sessions = await supabaseSelect(
    env,
    `sessions?token=eq.${encodeURIComponent(token)}&activo=eq.true&select=token,user_id,metodo,created_at,expires_at,activo&limit=1`
  ).catch(() => []);
  const session = Array.isArray(sessions) ? sessions[0] : null;
  let userId = null;
  if (session) {
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return null;
    }
    userId = session.user_id;
  } else {
    userId = token;
  }
  const users = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,es_admin,created_at,ultimo_login&limit=1`
  ).catch(() => []);
  const user = Array.isArray(users) ? users[0] : null;
  if (!user) return null;
  if (user.activo === false) return null;
  return user;
}
__name(getSessionUserByBearer, "getSessionUserByBearer");
async function requireAdmin(env, request) {
  const user = await getSessionUserByBearer(env, request);
  if (!user) {
    return {
      ok: false,
      response: adminJson({ ok: false, error: "No autenticado" }, 401)
    };
  }
  if (!user.es_admin) {
    return {
      ok: false,
      response: adminJson({ ok: false, error: "No autorizado" }, 403)
    };
  }
  return { ok: true, user };
}
__name(requireAdmin, "requireAdmin");
async function handleAdminMe(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  return adminJson({
    ok: true,
    user: auth.user
  });
}
__name(handleAdminMe, "handleAdminMe");
async function handleAdminResumen(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  const hoy = startOfTodayISO();
  const [
    usuariosTotalRes,
    usuariosActivosRes,
    adminsRes,
    sesionesActivasRes,
    alertasHoyRes,
    workerRunsRows,
    erroresHoyRes
  ] = await Promise.all([
    supabaseSelect(env, "users?select=id").catch(() => []),
    supabaseSelect(env, "users?activo=eq.true&select=id").catch(() => []),
    supabaseSelect(env, "users?es_admin=eq.true&select=id").catch(() => []),
    supabaseSelect(env, "sessions?activo=eq.true&select=token").catch(() => []),
    supabaseSelect(
      env,
      `notification_delivery_logs?created_at=gte.${encodeURIComponent(hoy)}&select=id`
    ).catch(() => []),
    supabaseSelect(
      env,
      "worker_runs?select=*&order=created_at.desc&limit=1"
    ).catch(() => []),
    supabaseSelect(
      env,
      `errores_sistema?created_at=gte.${encodeURIComponent(hoy)}&select=id`
    ).catch(() => [])
  ]);
  return adminJson({
    ok: true,
    resumen: {
      usuarios_total: usuariosTotalRes.length || 0,
      usuarios_activos: usuariosActivosRes.length || 0,
      admins_total: adminsRes.length || 0,
      sesiones_activas: sesionesActivasRes.length || 0,
      alertas_hoy: alertasHoyRes.length || 0,
      errores_hoy: erroresHoyRes.length || 0,
      ultima_ejecucion: workerRunsRows[0] || null
    }
  });
}
__name(handleAdminResumen, "handleAdminResumen");
async function handleAdminUsuarios(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  const rows = await supabaseSelect(
    env,
    "users?select=id,nombre,apellido,email,celular,activo,es_admin,created_at,ultimo_login&order=created_at.desc&limit=1000"
  ).catch((err) => {
    throw new Error(err?.message || "No se pudieron leer usuarios");
  });
  const total = rows?.length || 0;
  const activos = (rows || []).filter((x) => x.activo === true).length;
  const admins = (rows || []).filter((x) => x.es_admin === true).length;
  return adminJson({
    ok: true,
    total,
    activos,
    admins,
    items: rows || []
  });
}
__name(handleAdminUsuarios, "handleAdminUsuarios");
async function handleAdminSesiones(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  const rows = await supabaseSelect(
    env,
    "sessions?select=token,user_id,metodo,created_at,expires_at,activo&order=created_at.desc&limit=300"
  ).catch((err) => {
    throw new Error(err?.message || "No se pudieron leer sesiones");
  });
  const activas = (rows || []).filter((x) => x.activo === true).length;
  const vencidas = (rows || []).filter(
    (x) => x.expires_at && new Date(x.expires_at).getTime() < Date.now()
  ).length;
  const porMetodo = {};
  for (const s of rows || []) {
    const k = s.metodo || "sin_metodo";
    porMetodo[k] = (porMetodo[k] || 0) + 1;
  }
  return adminJson({
    ok: true,
    total: rows?.length || 0,
    activas,
    vencidas,
    por_metodo: Object.entries(porMetodo).map(([metodo, total]) => ({ metodo, total })).sort((a, b) => b.total - a.total),
    items: rows || []
  });
}
__name(handleAdminSesiones, "handleAdminSesiones");
async function handleAdminAlertas(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  const desde = sevenDaysAgoISO();
  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?created_at=gte.${encodeURIComponent(desde)}&select=id,user_id,channel,template_code,destination,status,provider_message_id,payload,provider_response,created_at&order=created_at.desc&limit=1000`
  ).catch((err) => {
    throw new Error(err?.message || "No se pudieron leer alertas");
  });
  const porDia = {};
  const porEstado = {};
  const porCanal = {};
  for (const row of rows || []) {
    const dia = row.created_at ? row.created_at.slice(0, 10) : "sin_fecha";
    porDia[dia] = (porDia[dia] || 0) + 1;
    const estado = row.status || "sin_status";
    porEstado[estado] = (porEstado[estado] || 0) + 1;
    const canal = row.channel || "sin_canal";
    porCanal[canal] = (porCanal[canal] || 0) + 1;
  }
  return adminJson({
    ok: true,
    ultimos_7_dias_total: rows?.length || 0,
    por_dia: Object.entries(porDia).map(([fecha, total]) => ({ fecha, total })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    por_estado: Object.entries(porEstado).map(([estado, total]) => ({ estado, total })).sort((a, b) => b.total - a.total),
    por_canal: Object.entries(porCanal).map(([canal, total]) => ({ canal, total })).sort((a, b) => b.total - a.total),
    items: rows || []
  });
}
__name(handleAdminAlertas, "handleAdminAlertas");
async function enviarMailBrevo(destinatario, nombre, asunto, html, env) {
  const API_KEY = String(
    env.BREVO_API_KEY ||
    env.SENDINBLUE_API_KEY ||
    env.BREVO_TRANSACTIONAL_API_KEY ||
    ""
  ).trim();

  const senderEmail = String(
    env.BREVO_FROM_EMAIL ||
    env.BREVO_SENDER_EMAIL ||
    env.ALERT_FROM_EMAIL ||
    env.EMAIL_FROM ||
    "apdocentepba@gmail.com"
  ).trim();

  const senderName = String(
    env.BREVO_FROM_NAME ||
    env.BREVO_SENDER_NAME ||
    env.ALERT_FROM_NAME ||
    env.EMAIL_FROM_NAME ||
    "APDocentePBA"
  ).trim() || "APDocentePBA";

  if (!API_KEY) {
    return {
      ok: false,
      status: 500,
      data: "Falta BREVO_API_KEY"
    };
  }

  if (!senderEmail) {
    return {
      ok: false,
      status: 500,
      data: "Falta email remitente"
    };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName
      },
      to: [
        {
          email: destinatario,
          name: nombre || ""
        }
      ],
      subject: asunto,
      htmlContent: html
    })
  });

  const data = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}
__name(enviarMailBrevo, "enviarMailBrevo");
function getOfferId(offer) {
  return String(
    offer.offer_id || offer.id || offer.codigo || offer.identity_key || ""
  ).trim();
}
__name(getOfferId, "getOfferId");
function normalizeOfferPayload(offer) {
  return {
    raw: offer,

    offer_id: String(
      offer.offer_id ||
      offer.idoferta ||
      offer.id ||
      offer.identity_key ||
      offer.codigo ||
      ''
    ).trim(),

    source_offer_key: offer.source_offer_key || "",

    idoferta:
      offer.idoferta ||
      offer.raw?.idoferta ||
      null,

    iddetalle:
      offer.iddetalle ||
      offer.id ||
      offer.raw?.iddetalle ||
      offer.raw?.id ||
      null,

    title:
      offer.title ||
      offer.cargo ||
      offer.materia ||
      offer.descripcioncargo ||
      offer.descripcionarea ||
      'Oferta APD',

    cargo:
      offer.cargo ||
      offer.descripcioncargo ||
      '',

    materia:
      offer.materia ||
      offer.area ||
      offer.descripcionarea ||
      '',

    nivel:
      offer.nivel ||
      offer.nivel_modalidad ||
      offer.descnivelmodalidad ||
      '',

    distrito:
      offer.distrito ||
      offer.descdistrito ||
      '',

    escuela:
      offer.escuela ||
      offer.nombreestablecimiento ||
      '',

    turno:
      offer.turno ||
      '',

    jornada:
      offer.jornada ||
      '',

    modulos:
      offer.modulos ||
      offer.hsmodulos ||
      '',

    dias_horarios:
      offer.dias_horarios ||
      [offer.lunes, offer.martes, offer.miercoles, offer.jueves, offer.viernes, offer.sabado]
        .filter(Boolean)
        .join(' ') ||
      '',

    desde:
      offer.desde ||
      offer.supl_desde_label ||
      offer.supl_desde ||
      '',

    hasta:
      offer.hasta ||
      offer.supl_hasta_label ||
      offer.supl_hasta ||
      '',

    tipo_cargo:
      offer.tipo_cargo ||
      offer.tipooferta ||
      '',

    tipo_situacion:
      [
        offer.tipooferta,
        offer.suplencia,
        offer.provisional,
        offer.revista || offer.supl_revista
      ]
        .filter(Boolean)
        .join(' / '),

    revista:
      offer.revista ||
      offer.supl_revista ||
      '',

    curso_division:
      offer.curso_division ||
      offer.cursodivision ||
      '',

    observaciones:
      offer.observaciones ||
      '',

    fecha_cierre:
      offer.fecha_cierre ||
      offer.fecha_cierre_fmt ||
      offer.finoferta_label ||
      offer.finoferta ||
      '',

    link:
      offer.link_postular ||
      offer.link ||
      '',

    total_postulantes:
      offer.total_postulantes ?? null,

    puntaje_primero:
      offer.puntaje_primero ?? null,

    listado_origen_primero:
      offer.listado_origen_primero || "",

    // ===== PID =====
    pid_match: !!offer.pid_match,
    pid_compatible: !!offer.pid_compatible,
    pid_reason: offer.pid_reason || "",
    pid_area: offer.pid_area || "",
    pid_bloque: offer.pid_bloque || "",
    pid_puntaje_total: offer.pid_puntaje_total || "",
    pid_puntaje_total_base:
      Number.isFinite(Number(offer.pid_puntaje_total_base))
        ? Number(offer.pid_puntaje_total_base)
        : null,
    pid_puntaje_total_final:
      Number.isFinite(Number(offer.pid_puntaje_total_final))
        ? Number(offer.pid_puntaje_total_final)
        : null,
    pid_residencia_bonus_aplicado: !!offer.pid_residencia_bonus_aplicado,
    pid_residencia_bonus_puntos: Number(offer.pid_residencia_bonus_puntos || 0),
    pid_distrito_residencia: offer.pid_distrito_residencia || "",
    pid_listado: offer.pid_listado || "",
    pid_anio: offer.pid_anio || ""
  };
}
__name(normalizeOfferPayload, "normalizeOfferPayload");
function escHtml(v) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escHtml, "escHtml");
function digestRow(label, value) {
  if (!value && value !== 0) return "";
  return `
    <div style="margin:2px 0;">
      <b>${escHtml(label)}:</b> ${escHtml(value)}
    </div>
  `;
}

__name(digestRow, "digestRow");
function parseMailNumber(value) {
  let raw = String(value || "").trim();
  if (!raw) return null;

  raw = raw.replace(/\s+/g, "");

  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");

  if (hasDot && hasComma) {
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");

    if (lastComma > lastDot) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    raw = raw.replace(",", ".");
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatMailNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function hasPidEvidence(payload) {
  const p = normalizeOfferPayload(payload || {});

  return !!(
    p.pid_listado ||
    p.pid_anio ||
    p.pid_area ||
    p.pid_bloque ||
    p.pid_reason ||
    p.pid_match ||
    p.pid_compatible ||
    Number.isFinite(Number(p.pid_puntaje_total_base)) ||
    Number.isFinite(Number(p.pid_puntaje_total_final))
  );
}

function stripPidFromPayload(payload) {
  const p = normalizeOfferPayload(payload || {});

  return {
    ...p,
    pid_match: false,
    pid_compatible: false,
    pid_reason: "",
    pid_area: "",
    pid_bloque: "",
    pid_puntaje_total: "",
    pid_puntaje_total_base: null,
    pid_puntaje_total_final: null,
    pid_residencia_bonus_aplicado: false,
    pid_residencia_bonus_puntos: 0,
    pid_distrito_residencia: "",
    pid_listado: "",
    pid_anio: ""
  };
}
function buildMailChanceInfo(p) {
  const payload = normalizeOfferPayload(p || {});

  if (!hasPidEvidence(payload)) {
    return null;
  }

  if (!payload?.pid_compatible) {
    return {
      title: "No compatible con tu PID",
      text: payload?.pid_reason || "La oferta coincide con tus preferencias, pero no con tu PID real.",
      toneBg: "#fff8e8",
      toneBorder: "#f0d39a",
      toneColor: "#9a6700"
    };
  }

  const puntajeBase =
    Number.isFinite(Number(payload?.pid_puntaje_total_base))
      ? Number(payload.pid_puntaje_total_base)
      : parseMailNumber(payload?.pid_puntaje_total);

  const bonusResidencia =
    payload?.pid_residencia_bonus_aplicado
      ? Number(payload?.pid_residencia_bonus_puntos || 0)
      : 0;

  const miPuntaje =
    Number.isFinite(Number(payload?.pid_puntaje_total_final))
      ? Number(payload.pid_puntaje_total_final)
      : (Number.isFinite(puntajeBase) ? puntajeBase + bonusResidencia : null);

  const primero = parseMailNumber(payload?.puntaje_primero);

  if (!Number.isFinite(miPuntaje) || !Number.isFinite(primero)) {
    if (Number(payload?.total_postulantes || 0) === 0) {
      return {
        title: "Sin competencia visible",
        text: `Por ahora no se ven postulantes cargados. Tu puntaje actual para esta oferta es ${formatMailNumber(miPuntaje)}.`,
        toneBg: "#eefbf3",
        toneBorder: "#b7ebc6",
        toneColor: "#0b7a44"
      };
    }

    return {
      title: "Compatible con tu PID",
      text: `Tu puntaje actual para esta oferta es ${formatMailNumber(miPuntaje)}. Todavía no hay referencia suficiente para estimar chances.`,
      toneBg: "#eefbf3",
      toneBorder: "#b7ebc6",
      toneColor: "#0b7a44"
    };
  }

  const diff = miPuntaje - primero;

  if (diff > 2) {
    return {
      title: "Estado actual: Muy favorable",
      text: `Tu puntaje (${formatMailNumber(miPuntaje)}) está arriba del mejor visible (${formatMailNumber(primero)}), con una diferencia de +${formatMailNumber(diff)}.`,
      toneBg: "#eefbf3",
      toneBorder: "#b7ebc6",
      toneColor: "#0b7a44"
    };
  }

  if (diff > 0) {
    return {
      title: "Estado actual: Favorable",
      text: `Tu puntaje (${formatMailNumber(miPuntaje)}) está arriba del mejor visible (${formatMailNumber(primero)}), con una diferencia de +${formatMailNumber(diff)}.`,
      toneBg: "#eefbf3",
      toneBorder: "#b7ebc6",
      toneColor: "#0b7a44"
    };
  }

  if (diff >= -1) {
    return {
      title: "Estado actual: Competida",
      text: `Tu puntaje (${formatMailNumber(miPuntaje)}) está muy cerca del mejor visible (${formatMailNumber(primero)}). Diferencia: ${formatMailNumber(diff)}.`,
      toneBg: "#f2f8ff",
      toneBorder: "#bfdcff",
      toneColor: "#1d4ed8"
    };
  }

  return {
    title: "Estado actual: Difícil",
    text: `Tu puntaje (${formatMailNumber(miPuntaje)}) hoy queda por debajo del mejor visible (${formatMailNumber(primero)}). Diferencia: ${formatMailNumber(diff)}.`,
    toneBg: "#fff8e8",
    toneBorder: "#f0d39a",
    toneColor: "#9a6700"
  };
}
function renderMailOfferCard(row) {
  const p = normalizeOfferPayload(row?.offer_payload || {});
  const chance = buildMailChanceInfo(p);

  const titulo = p.cargo || p.materia || p.title || "Oferta APD";

  const puntajeBase =
    Number.isFinite(Number(p?.pid_puntaje_total_base))
      ? Number(p.pid_puntaje_total_base)
      : parseMailNumber(p?.pid_puntaje_total);

  const puntajeFinal =
    Number.isFinite(Number(p?.pid_puntaje_total_final))
      ? Number(p.pid_puntaje_total_final)
      : (
          Number.isFinite(puntajeBase)
            ? puntajeBase + Number(p?.pid_residencia_bonus_puntos || 0)
            : null
        );

  const tipo = String(p.revista || "").trim() || (
    (
      p.desde &&
      String(p.desde).trim() &&
      String(p.desde).trim().toLowerCase() !== "sin fecha" &&
      p.hasta &&
      String(p.hasta).trim() &&
      String(p.hasta).trim().toLowerCase() !== "sin fecha"
    )
      ? "Suplencia"
      : "Provisional"
  );

  const chanceIcon =
    !chance ? "" :
    chance.title.includes("Muy favorable") ? "🟢" :
    chance.title.includes("Favorable") ? "🟢" :
    chance.title.includes("Competida") ? "🔵" :
    chance.title.includes("Sin competencia") ? "🟢" :
    "🟠";

  return `
    <tr>
      <td style="padding:0 0 18px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border:1px solid #dbe3f0;border-radius:18px;background:#ffffff;overflow:hidden;">
          <tr>
            <td style="padding:0;">

              <div style="background:linear-gradient(180deg,#f8fbff 0%,#eef5ff 100%);padding:18px 18px 14px 18px;border-bottom:1px solid #e4ecf7;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.2;font-weight:800;color:#0f3460;margin:0 0 12px 0;">
                  ${escHtml(titulo)}
                </div>

                <div style="margin:0 0 4px 0;">
                  ${p.escuela ? `<span style="display:inline-block;background:#eef4ff;color:#1f4fa3;padding:7px 11px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🏫 ${escHtml(p.escuela)}</span>` : ""}
                  ${p.distrito ? `<span style="display:inline-block;background:#eef1f4;color:#29435c;padding:7px 11px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">📍 ${escHtml(p.distrito)}</span>` : ""}
                  ${p.turno ? `<span style="display:inline-block;background:#edf9f0;color:#0b7a44;padding:7px 11px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🕒 ${escHtml(p.turno)}</span>` : ""}
                  ${p.jornada ? `<span style="display:inline-block;background:#f3f4f6;color:#374151;padding:7px 11px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🏷️ ${escHtml(p.jornada)}</span>` : ""}
                  ${p.nivel ? `<span style="display:inline-block;background:#fff5e8;color:#9a6700;padding:7px 11px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🎓 ${escHtml(p.nivel)}</span>` : ""}
                  ${tipo ? `<span style="display:inline-block;background:#f3e8ff;color:#7c3aed;padding:7px 11px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">📌 ${escHtml(tipo)}</span>` : ""}
                </div>
              </div>

              <div style="padding:16px 18px 18px 18px;">

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
                  <tr>
                    <td width="50%" style="padding:0 8px 8px 0;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;color:#6b7280;text-transform:uppercase;margin-bottom:5px;">Curso / división</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111827;">${escHtml(p.curso_division || "-")}</div>
                      </div>
                    </td>
                    <td width="50%" style="padding:0 0 8px 8px;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;color:#6b7280;text-transform:uppercase;margin-bottom:5px;">Módulos</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111827;">${escHtml(p.modulos || "-")}</div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding:0 8px 8px 0;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;color:#6b7280;text-transform:uppercase;margin-bottom:5px;">Días / horarios</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111827;line-height:1.45;">${escHtml(p.dias_horarios || "-")}</div>
                      </div>
                    </td>
                    <td width="50%" style="padding:0 0 8px 8px;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;color:#6b7280;text-transform:uppercase;margin-bottom:5px;">Vigencia</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111827;line-height:1.45;">${escHtml((p.desde || "-") + (p.hasta ? " → " + p.hasta : ""))}</div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding:0;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;color:#6b7280;text-transform:uppercase;margin-bottom:5px;">Cierre</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111827;">${escHtml(p.fecha_cierre || "-")}</div>
                      </div>
                    </td>
                  </tr>
                </table>

                ${
                  p.observaciones
                    ? `
                      <div style="margin:0 0 14px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">Observaciones</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#111827;">${escHtml(p.observaciones)}</div>
                      </div>
                    `
                    : ""
                }

                ${
                  chance
                    ? `
                      <div style="margin:0 0 14px 0;padding:14px 14px 12px 14px;background:${chance.toneBg};border:1px solid ${chance.toneBorder};border-radius:14px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;color:${chance.toneColor};margin:0 0 10px 0;">
                          ${chanceIcon} ${escHtml(chance.title)}
                        </div>

                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;">
                          <tr>
                            <td width="50%" style="padding:0 8px 8px 0;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Motivo</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;line-height:1.45;">${escHtml(p.pid_reason || (p.pid_compatible ? "Compatible con tu PID" : "No compatible con tu PID"))}</div>
                              </div>
                            </td>
                            <td width="50%" style="padding:0 0 8px 8px;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Área PID</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${escHtml(p.pid_area || "-")}</div>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td width="50%" style="padding:0 8px 8px 0;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Bloque PID</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${escHtml(p.pid_bloque || "-")}</div>
                              </div>
                            </td>
                            <td width="50%" style="padding:0 0 8px 8px;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Puntaje base</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${Number.isFinite(puntajeBase) ? formatMailNumber(puntajeBase) : "-"}</div>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td width="50%" style="padding:0 8px 8px 0;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Bonus residencia</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${p.pid_residencia_bonus_aplicado ? `+${p.pid_residencia_bonus_puntos}` : "No"}</div>
                              </div>
                            </td>
                            <td width="50%" style="padding:0 0 8px 8px;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Distrito residencia</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${escHtml(p.pid_distrito_residencia || "-")}</div>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Tu puntaje total</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${Number.isFinite(puntajeFinal) ? formatMailNumber(puntajeFinal) : "-"}</div>
                              </div>
                            </td>
                            <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                              <div style="background:rgba(255,255,255,.6);border:1px solid rgba(15,52,96,.08);border-radius:12px;padding:10px 12px;">
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Listado / año PID</div>
                                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${escHtml((p.pid_listado || "-") + " · " + (p.pid_anio || "-"))}</div>
                              </div>
                            </td>
                          </tr>
                        </table>

                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#111827;margin-top:8px;">
                          ${escHtml(chance.text)}
                        </div>
                      </div>
                    `
                    : ""
                }

                <div style="margin:0 0 14px 0;padding:14px 14px 12px 14px;background:#f7faff;border:1px solid #dbeafe;border-radius:14px;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;color:#1d4ed8;margin:0 0 10px 0;">
                    REFERENCIA DE POSTULANTES
                  </div>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="50%" style="padding:0 8px 8px 0;vertical-align:top;">
                        <div style="background:#ffffff;border:1px solid #dbeafe;border-radius:12px;padding:10px 12px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Cantidad</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${(p.total_postulantes != null && p.total_postulantes !== "") ? escHtml(String(p.total_postulantes)) : "Sin postulados visibles"}</div>
                        </div>
                      </td>
                      <td width="50%" style="padding:0 0 8px 8px;vertical-align:top;">
                        <div style="background:#ffffff;border:1px solid #dbeafe;border-radius:12px;padding:10px 12px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Puntaje más alto</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${(p.puntaje_primero != null && p.puntaje_primero !== "") ? formatMailNumber(parseMailNumber(p.puntaje_primero)) : "Sin datos"}</div>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:0;vertical-align:top;">
                        <div style="background:#ffffff;border:1px solid #dbeafe;border-radius:12px;padding:10px 12px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Listado del más alto</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111827;">${escHtml(p.listado_origen_primero || "Sin datos")}</div>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>

                <div style="margin-top:4px;">
                  ${
                    p.link
                      ? `<a href="${escHtml(p.link)}" target="_blank" style="display:inline-block;background:#1f66ff;color:#ffffff;padding:11px 16px;margin:4px 8px 0 0;text-decoration:none;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">Ir a ABC</a>`
                      : ""
                  }
                  <a href="https://alertasapd.com.ar" target="_blank" style="display:inline-block;background:#0f3460;color:#ffffff;padding:11px 16px;margin:4px 8px 0 0;text-decoration:none;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">Ir a mi panel</a>
                </div>

              </div>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}




async function syncUserOfferState(env, userId, offers) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const safeUserId = encodeURIComponent(String(userId || "").trim());
  if (!safeUserId) {
    throw new Error("syncUserOfferState: falta userId");
  }
  const existingResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_offer_state?user_id=eq.${safeUserId}&select=id,offer_id`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  );
  if (!existingResp.ok) {
    const text = await existingResp.text().catch(() => "");
    throw new Error(`No se pudo leer user_offer_state: ${existingResp.status} ${text}`);
  }
  const existing = await existingResp.json().catch(() => []);
  const existingRows = Array.isArray(existing) ? existing : [];
  const map = new Map(existingRows.map((x) => [String(x.offer_id || ""), x]));
  const activeIds = [];
  const offersList = Array.isArray(offers) ? offers : [];
  for (const offer of offersList) {
    const id = String(getOfferId(offer) || "").trim();
    if (!id) continue;
    activeIds.push(id);
    const payload = {
      user_id: userId,
      offer_id: id,
      last_seen_at: now,
      is_active: true,
      offer_payload: normalizeOfferPayload(offer)
    };
    if (!map.has(id)) {
      payload.first_seen_at = now;
    }
    const upsertResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_offer_state?on_conflict=user_id,offer_id`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(payload)
      }
    );
    if (!upsertResp.ok) {
      const text = await upsertResp.text().catch(() => "");
      throw new Error(`No se pudo upsert user_offer_state para ${id}: ${upsertResp.status} ${text}`);
    }
  }
  const uniqueActiveIds = [...new Set(activeIds)];
  const toDisable = existingRows.filter((x) => !uniqueActiveIds.includes(String(x.offer_id || ""))).map((x) => x.id).filter(Boolean);
  if (toDisable.length) {
    const disableResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_offer_state?id=in.(${toDisable.join(",")})`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          is_active: false,
          last_seen_at: now
        })
      }
    );
    if (!disableResp.ok) {
      const text = await disableResp.text().catch(() => "");
      throw new Error(`No se pudo desactivar user_offer_state: ${disableResp.status} ${text}`);
    }
  }
  return {
    ok: true,
    total_received: offersList.length,
    total_active: uniqueActiveIds.length,
    total_disabled: toDisable.length
  };
}
__name(syncUserOfferState, "syncUserOfferState");
var worker_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === "/test-mail" && request.method === "GET") {
        const r = await enviarMailBrevo(
          "martin.nicolas.podubinio@gmail.com",
          "Martin",
          "PRUEBA APDocentePBA \u{1F680}",
          "<h1>Funciona desde Worker</h1>",
          env
        );
        return new Response(JSON.stringify(r, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
      if (path === "/test-email-sweep" && request.method === "GET") {
        const r = await runEmailAlertsSweep(env, { source: "manual_test" });
        return new Response(JSON.stringify(r, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
      if (path === "/test-digest" && request.method === "GET") {
        const r = await sendPendingEmailDigests(env);
        return new Response(JSON.stringify(r, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
      if (path === `${API_URL_PREFIX2}/test-db` && request.method === "GET") {
        return json({ ok: true, version: API_VERSION });
      }
      if (path === `${API_URL_PREFIX2}/login` && request.method === "POST") {
        return await handleLogin(request, env);
      }
      if (path === `${API_URL_PREFIX2}/register` && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return await handleRegister(body, env);
      }
      if (path === `${API_URL_PREFIX2}/google-auth` && request.method === "POST") {
        return await handleGoogleAuth(request, env);
      }
      if (path === `${API_URL_PREFIX2}/planes` && request.method === "GET") {
        return await handlePlanes(env);
      }
      if (path === `${API_URL_PREFIX2}/mi-plan` && request.method === "GET") {
        return await handleMiPlan(url, env);
      }
      if (path === `${API_URL_PREFIX2}/guardar-preferencias` && request.method === "POST") {
        return await handleGuardarPreferencias(request, env);
      }
      if (path === `${API_URL_PREFIX2}/mis-alertas` && request.method === "GET") {
        return await handleMisAlertas(url, env);
      }
      if (path === "/api/sync-offers" && request.method === "POST") {
        const user = await getSessionUserByBearer(env, request);
        if (!user) {
          return jsonResponse({ ok: false, error: "No autenticado" }, 401);
        }
        const body = await request.json().catch(() => ({}));
        const offers = Array.isArray(body?.offers) ? body.offers : [];
        const syncResult = await syncUserOfferState(env, user.id, offers);
        return jsonResponse({
          ok: true,
          synced: offers.length,
          sync_result: syncResult
        });
      }
      if (path === `${API_URL_PREFIX2}/postulantes-resumen` && request.method === "GET") {
        return await handlePostulantesResumen(url);
      }
      if (path === `${API_URL_PREFIX2}/capturar-historico-apd` && request.method === "POST") {
        return await handleCapturarHistoricoAPD(request, env);
      }
      if (path === `${API_URL_PREFIX2}/historico-resumen` && request.method === "GET") {
        return await handleHistoricoResumen(url, env);
      }
      if (path === `${API_URL_PREFIX2}/provincia/backfill-status` && request.method === "GET") {
        return await handleProvinciaBackfillStatus(env);
      }
      if (path === `${API_URL_PREFIX2}/provincia/backfill-step` && request.method === "POST") {
        return await handleProvinciaBackfillStep(request, env);
      }
      if (path === `${API_URL_PREFIX2}/provincia/backfill-reset` && request.method === "POST") {
        return await handleProvinciaBackfillReset(env);
      }
      if (path === `${API_URL_PREFIX2}/provincia/backfill-kick` && request.method === "POST") {
        return await handleProvinciaBackfillKick(request, env, ctx);
      }
      if (path === `${API_URL_PREFIX2}/provincia/resumen` && request.method === "GET") {
        return await handleProvinciaResumen(url, env);
      }
      if (path === `${API_URL_PREFIX2}/provincia/insights` && request.method === "GET") {
        return await handleProvinciaInsights(url, env);
      }
      if (path === `${API_URL_PREFIX2}/mercadopago/create-checkout-link` && request.method === "POST") {
        return await handleMercadoPagoCreateCheckoutLink(request, env);
      }
      if (path === `${API_URL_PREFIX2}/subscription/enable-auto-renew` && request.method === "POST") {
  return await handleSubscriptionEnableAutoRenew(request, env);
}

if (path === `${API_URL_PREFIX2}/subscription/cancel` && request.method === "POST") {
  return await handleSubscriptionCancelAutoRenew(request, env);
}
      if (path === `${API_URL_PREFIX2}/mercadopago/webhook` && request.method === "POST") {
        return await handleMercadoPagoWebhook(request, env);
      }
      if (path === `${API_URL_PREFIX2}/whatsapp/health` && request.method === "GET") {
        return await handleWhatsAppHealth(env);
      }
      if (path === `${API_URL_PREFIX2}/whatsapp/test-send` && request.method === "POST") {
        return await handleWhatsAppTestSend(request, env);
      }
      if (path === `${API_URL_PREFIX2}/importar-catalogo-cargos` && request.method === "GET") {
        return await handleImportarCatalogoCargos(url, env);
      }
      if (path === `${API_URL_PREFIX2}/admin/me` && request.method === "GET") {
        return await handleAdminMe(request, env);
      }
      if (path === `${API_URL_PREFIX2}/admin/resumen` && request.method === "GET") {
        return await handleAdminResumen(request, env);
      }
      if (path === `${API_URL_PREFIX2}/admin/usuarios` && request.method === "GET") {
        return await handleAdminUsuarios(request, env);
      }
      if (path === `${API_URL_PREFIX2}/admin/sesiones` && request.method === "GET") {
        return await handleAdminSesiones(request, env);
      }
      if (path === `${API_URL_PREFIX2}/admin/alertas` && request.method === "GET") {
        return await handleAdminAlertas(request, env);
      }
      return json({ ok: false, error: "Ruta no encontrada" }, 404);
    } catch (err) {
      return json({ ok: false, error: err?.message || "Error interno" }, 500);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runProvinciaBackfillStep(env, { source: "cron", force: false }).catch((err) => {
        console.error("PROVINCIA BACKFILL CRON STEP ERROR:", err);
      })
    );
    ctx.waitUntil(runWhatsAppAlertsSweep(env, { source: "cron" }));
    ctx.waitUntil(runEmailAlertsSweep(env, { source: "cron" }));
    ctx.waitUntil(sendPendingEmailDigests(env));
  }
};
async function handleLogin(request, env) {
  const body = await request.json();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!email || !password) {
    return json({ ok: false, message: "Faltan datos" }, 400);
  }
  const user = await findUserByEmail(env, email);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 401);
  }
  if (user.activo === false) {
    return json({ ok: false, message: "Usuario inactivo" }, 403);
  }
  const okPassword = await passwordMatches(user.password_hash, password);
  if (!okPassword) {
    return json({ ok: false, message: "Password incorrecto" }, 401);
  }
  await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_login");
  await touchUltimoLogin(env, user.id);
  return json({
    ok: true,
    token: String(user.id),
    user: {
      id: user.id,
      nombre: user.nombre || "",
      apellido: user.apellido || "",
      email: user.email || ""
    }
  });
}
__name(handleLogin, "handleLogin");
async function handleGoogleAuth(request, env) {
  const body = await request.json();
  const credential = String(body?.credential || "").trim();
  if (!credential) {
    return json({ ok: false, message: "Falta credential de Google" }, 400);
  }
  const googleUser = await verifyGoogleCredential(credential, env.GOOGLE_CLIENT_ID);
  let user = await findUserByGoogleSub(env, googleUser.sub);
  let mode = "login";
  if (!user) {
    user = await findUserByEmail(env, googleUser.email);
    if (user) {
      const patch = {};
      if (!user.google_sub) patch.google_sub = googleUser.sub;
      if (!user.nombre && googleUser.nombre) patch.nombre = googleUser.nombre;
      if (!user.apellido && googleUser.apellido) patch.apellido = googleUser.apellido;
      if (user.activo === false) patch.activo = true;
      if (Object.keys(patch).length > 0) {
        await supabasePatch(
          env,
          "users",
          `id=eq.${encodeURIComponent(user.id)}`,
          patch
        );
        user = { ...user, ...patch };
      }
    } else {
      mode = "register";
      user = await createUserFromGoogle(env, googleUser);
      if (!user?.id) {
        return json({ ok: false, message: "No se pudo crear el usuario con Google" }, 500);
      }
    }
  }
  if (user.activo === false) {
    return json({ ok: false, message: "Usuario inactivo" }, 403);
  }
  await ensureTrialIfNoSubscriptions(env, user.id, googleUser.email, "trial_auto_google");
  await touchUltimoLogin(env, user.id);
  return json({
    ok: true,
    mode,
    token: String(user.id),
    user: {
      id: user.id,
      nombre: user.nombre || "",
      apellido: user.apellido || "",
      email: user.email || ""
    }
  });
}
__name(handleGoogleAuth, "handleGoogleAuth");
async function handlePlanes(env) {
  let rows = [];
  try {
    rows = await supabaseSelect(
      env,
      "subscription_plans?is_active=eq.true&order=sort_order.asc&select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags"
    );
  } catch {
    rows = defaultPlansCatalog();
  }
  return json({
    ok: true,
    planes: (Array.isArray(rows) ? rows : []).map(normalizePlanOut)
  });
}
__name(handlePlanes, "handlePlanes");
async function handleMiPlan(url, env) {
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }
  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }
  const resolved = await resolverPlanUsuario(env, userId);
  return json({
    ok: true,
    user_id: userId,
    plan: resolved.plan,
    subscription: resolved.subscription
  });
}
__name(handleMiPlan, "handleMiPlan");
async function sendInitialAlertsDigestIfNeeded(env, user, preferencias, options = {}) {
  if (!user?.id || !user?.email) {
    return { ok: false, skipped: true, reason: "missing_user_or_email" };
  }

  if (!preferencias?.alertas_activas || !preferencias?.alertas_email) {
    return { ok: true, skipped: true, reason: "email_alerts_disabled" };
  }

  const existing = await supabaseSelect(
    env,
    `notification_delivery_logs?user_id=eq.${encodeURIComponent(user.id)}&channel=eq.email&template_code=eq.apd_initial_digest&select=id&limit=1`
  ).catch(() => []);

  if (Array.isArray(existing) && existing.length > 0) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  const alertData = await construirAlertasParaUsuario(env, user.id).catch(err => ({
    ok: false,
    message: err?.message || "No se pudieron construir alertas"
  }));

  if (!alertData?.ok) {
    await supabaseInsert(env, "notification_delivery_logs", {
      user_id: user.id,
      channel: "email",
      template_code: "apd_initial_digest",
      destination: user.email,
      status: "failed_build",
      provider_message_id: null,
      payload: {
        source: options.source || "first_preferences_save"
      },
      provider_response: {
        message: alertData?.message || "No se pudieron construir alertas iniciales"
      }
    }).catch(() => null);

    return { ok: false, skipped: true, reason: "build_failed" };
  }

  const items = Array.isArray(alertData?.resultados)
    ? alertData.resultados
    : Array.isArray(alertData?.alertas)
      ? alertData.alertas
      : [];

  if (!items.length) {
    await supabaseInsert(env, "notification_delivery_logs", {
      user_id: user.id,
      channel: "email",
      template_code: "apd_initial_digest",
      destination: user.email,
      status: "skipped_no_alerts",
      provider_message_id: null,
      payload: {
        source: options.source || "first_preferences_save"
      },
      provider_response: {
        message: "No había alertas compatibles al momento del primer guardado"
      }
    }).catch(() => null);

    return { ok: true, skipped: true, reason: "no_alerts" };
  }

  const MAX_VISIBLE = 10;
  const alerts = await enrichAlertsForRichChannels(env, user, items, MAX_VISIBLE);

  const html = buildDigestHtml(alerts, user, {
    total_alerts: items.length,
    max_visible: MAX_VISIBLE,
    panel_url: "https://alertasapd.com.ar"
  });

  const asunto =
    items.length > MAX_VISIBLE
      ? `APDocentePBA: ${MAX_VISIBLE} de ${items.length} alertas iniciales para vos`
      : `APDocentePBA: ${items.length} alerta${items.length === 1 ? "" : "s"} inicial${items.length === 1 ? "" : "es"} para vos`;

  const send = await enviarMailBrevo(
    user.email,
    user.nombre || "",
    asunto,
    html,
    env
  );

  await supabaseInsert(env, "notification_delivery_logs", {
    user_id: user.id,
    channel: "email",
    template_code: "apd_initial_digest",
    destination: user.email,
    status: send?.ok ? "sent_initial" : "failed_initial",
    provider_message_id: null,
    payload: {
      source: options.source || "first_preferences_save",
      total_alerts: items.length
    },
    provider_response: send || null
  }).catch(() => null);

  return {
    ok: !!send?.ok,
    skipped: false,
    total_alerts: items.length
  };
}
__name(sendInitialAlertsDigestIfNeeded, "sendInitialAlertsDigestIfNeeded");
async function handleGuardarPreferencias(request, env) {
  const body = await request.json();
  const userId = String(body?.user_id || "").trim();
  const preferencias = body?.preferencias || {};

  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }

  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }

  const prevPrefs = await obtenerPreferenciasUsuario(env, userId).catch(() => null);

  let resolved = await resolverPlanUsuario(env, userId);
  if (!isPlanActivo(resolved)) {
    await ensureTrialIfNoSubscriptions(env, userId, user.email, "trial_auto_preferences");
    resolved = await resolverPlanUsuario(env, userId);
  }

  if (!isPlanActivo(resolved)) {
    return json(
      {
        ok: false,
        message: "Tu plan está vencido. Suscribite para seguir usando el servicio.",
        plan: resolved.plan,
        subscription: resolved.subscription
      },
      403
    );
  }

  const limpias = sanitizarPreferenciasEntrada(preferencias, resolved.plan);
  const ajustesPlan = limpias._plan_ajuste || {
    distritos_recortados: 0,
    cargos_recortados: 0
  };

  const rows = await supabaseUpsertReturning(
    env,
    "user_preferences",
    [
      {
        user_id: userId,
        distrito_principal: limpias.distrito_principal,
        otros_distritos: limpias.otros_distritos,
        cargos: limpias.cargos,
        materias: limpias.materias,
        niveles: limpias.niveles,
        turnos: limpias.turnos,
        alertas_activas: limpias.alertas_activas,
        alertas_email: limpias.alertas_email,
        alertas_telegram: limpias.alertas_telegram,
        alertas_whatsapp: limpias.alertas_whatsapp,
        updated_at: new Date().toISOString()
      }
    ],
    "user_id"
  );

  const savedPrefs = Array.isArray(rows) ? rows[0] : rows;

  const firstMeaningfulSave =
    !prevPrefs ||
    (
      !prevPrefs.distrito_principal &&
      (!Array.isArray(prevPrefs.otros_distritos) || prevPrefs.otros_distritos.length === 0) &&
      (!Array.isArray(prevPrefs.cargos) || prevPrefs.cargos.length === 0) &&
      (!Array.isArray(prevPrefs.materias) || prevPrefs.materias.length === 0) &&
      (!Array.isArray(prevPrefs.niveles) || prevPrefs.niveles.length === 0) &&
      (!Array.isArray(prevPrefs.turnos) || prevPrefs.turnos.length === 0)
    );

  let initialEmail = null;

  if (firstMeaningfulSave && limpias.alertas_activas && limpias.alertas_email) {
    initialEmail = await sendInitialAlertsDigestIfNeeded(env, user, savedPrefs, {
      source: "first_preferences_save"
    }).catch((err) => ({
      ok: false,
      skipped: true,
      reason: "send_failed",
      message: err?.message || "No se pudo enviar el digest inicial"
    }));
  }

  return json({
    ok: true,
    message:
      ajustesPlan.distritos_recortados || ajustesPlan.cargos_recortados
        ? `Preferencias guardadas. Se ajustaron filtros al limite de tu plan (${resolved.plan?.max_distritos || 0} distrito(s) y ${resolved.plan?.max_cargos || 0} cargo(s) o materia(s)).`
        : "Preferencias guardadas",
    preferencias: savedPrefs,
    plan: resolved.plan,
    subscription: resolved.subscription,
    initial_email: initialEmail
  });
}
__name(handleGuardarPreferencias, "handleGuardarPreferencias");
async function handleMisAlertas(url, env) {
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }
  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }
  let resolved = await resolverPlanUsuario(env, userId);
  if (!isPlanActivo(resolved)) {
    await ensureTrialIfNoSubscriptions(env, userId, user.email, "trial_auto_mis_alertas");
    resolved = await resolverPlanUsuario(env, userId);
  }
  if (!isPlanActivo(resolved)) {
    return json({
      ok: true,
      items: [],
      message: "Tu plan est\xE1 vencido. Activ\xE1 una suscripci\xF3n para volver a ver alertas.",
      plan: resolved.plan,
      subscription: resolved.subscription
    });
  }
  const data = await construirAlertasParaUsuario(env, userId);
  if (!data.ok) {
    return json(data, 400);
  }
  return json({
    ...data,
    plan: resolved.plan,
    subscription: resolved.subscription
  });
}
__name(handleMisAlertas, "handleMisAlertas");
async function handlePostulantesResumen(url) {
  const ofertaId = String(url.searchParams.get("oferta") || "").trim();
  const detalleId = String(url.searchParams.get("detalle") || "").trim();
  if (!ofertaId && !detalleId) {
    return json({ ok: false, message: "Falta oferta o detalle" }, 400);
  }
  const resumen = await obtenerResumenPostulantesABC(ofertaId, detalleId);
  return json({
    ok: true,
    oferta: ofertaId || null,
    detalle: detalleId || null,
    abc_postulantes_url: buildAbcPostulantesUrl(ofertaId, detalleId),
    ...resumen
  });
}
__name(handlePostulantesResumen, "handlePostulantesResumen");
async function handleCapturarHistoricoAPD(request, env) {
  const body = await request.json();
  const userId = String(body?.user_id || "").trim();
  const includePostulantes = body?.include_postulantes === true;
  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }
  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }
  const prefs = await obtenerPreferenciasUsuario(env, userId);
  if (!prefs) {
    return json({ ok: false, message: "Primero guarda tus preferencias." }, 400);
  }
  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const distritos = distritosPrefsAPD(prefsCanon);
  if (!distritos.length) {
    return json({ ok: false, message: "Configura al menos un distrito." }, 400);
  }
  const { ofertas, debugDistritos } = await traerOfertasAPDPorDistritos(prefsCanon);
  const capturable = ofertas.filter(ofertaEsVisibleParaHistoricoUsuario);
  const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
  const rowsOfertas = [];
  const rowsPostulantes = [];
  let erroresPostulantes = 0;
  for (let i = 0; i < capturable.length; i += 5) {
    const chunk = capturable.slice(i, i + 5);
    const results = await Promise.all(
      chunk.map(
        (oferta, offset) => buildHistoricoCaptureRows(
          oferta,
          capturedAt,
          includePostulantes && i + offset < HISTORICO_POSTULANTES_LIMIT
        )
      )
    );
    for (const result of results) {
      if (result.ofertaRow) rowsOfertas.push(result.ofertaRow);
      if (result.postRow) rowsPostulantes.push(result.postRow);
      if (result.errorPostulantes) erroresPostulantes += 1;
    }
  }
  for (let i = 0; i < rowsOfertas.length; i += HISTORICO_INSERT_BATCH) {
    await supabaseInsertMany(
      env,
      "apd_ofertas_historial",
      rowsOfertas.slice(i, i + HISTORICO_INSERT_BATCH)
    );
  }
  for (let i = 0; i < rowsPostulantes.length; i += HISTORICO_INSERT_BATCH) {
    await supabaseInsertMany(
      env,
      "apd_postulantes_historial",
      rowsPostulantes.slice(i, i + HISTORICO_INSERT_BATCH)
    );
  }
  return json({
    ok: true,
    message: "Historico del usuario actualizado",
    captured_at: capturedAt,
    distritos,
    total_fuente: ofertas.length,
    total_insertadas: rowsOfertas.length,
    total_postulantes_insertados: rowsPostulantes.length,
    errores_postulantes: erroresPostulantes,
    include_postulantes: includePostulantes,
    debug_distritos: debugDistritos
  });
}
__name(handleCapturarHistoricoAPD, "handleCapturarHistoricoAPD");
async function handleHistoricoResumen(url, env) {
  const userId = String(url.searchParams.get("user_id") || "").trim();
  const days = clampInt(url.searchParams.get("days"), 7, 120, HISTORICO_DAYS_DEFAULT);
  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }
  const prefs = await obtenerPreferenciasUsuario(env, userId);
  if (!prefs || !prefs.alertas_activas) {
    return json(emptyHistoricoPayload(days, "Activa alertas y guarda tus preferencias."));
  }
  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const distritos = distritosPrefsAPD(prefsCanon);
  if (!distritos.length) {
    return json(emptyHistoricoPayload(days, "Configura al menos un distrito."));
  }
  const globalRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_global_snapshots", distritos, days, 8e3);
  const localRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_historial", distritos, days, 8e3);
  const rawRows = globalRows.length ? globalRows : localRows;
  if (!rawRows.length) {
    return json(emptyHistoricoPayload(days, "Todavia no hay historico suficiente."));
  }
  const matchedRows = rawRows.filter(
    (row) => coincideOfertaConPreferencias(historicoRowToOferta(row), prefsCanon).match
  );
  if (!matchedRows.length) {
    return json(emptyHistoricoPayload(days, "Todavia no hay historico compatible con tus filtros."));
  }
  return json(buildHistoricoResumenPayload(matchedRows, days));
}
__name(handleHistoricoResumen, "handleHistoricoResumen");
async function handleProvinciaBackfillStatus(env) {
  const state = await obtenerScanState(env);
  const staleRunning = isStaleProvinciaBackfill(state);
  const catalogRows = await obtenerDistritosProvincia(env);
  const districtName = catalogRows[state.district_index]?.apd_nombre || catalogRows[state.district_index]?.nombre || null;
  const totalDistricts = catalogRows.length;
  const lastError = state?.notes?.last_error || (staleRunning ? "El proceso provincial quedo trabado en segundo plano. Podes relanzarlo desde el mismo punto." : null);
  return json({
    ok: true,
    scope: PROVINCIA_SCOPE,
    status: staleRunning ? "error" : state.status || "idle",
    district_index: state.district_index || 0,
    district_name: districtName,
    next_page: state.next_page || 0,
    pages_processed: state.pages_processed || 0,
    districts_completed: state.districts_completed || 0,
    offers_processed: Number(state.offers_processed || 0),
    last_batch_count: Number(state.last_batch_count || 0),
    total_districts: totalDistricts,
    progress_pct: totalDistricts ? Math.round((state.districts_completed || 0) / totalDistricts * 1e3) / 10 : 0,
    started_at: state.started_at || null,
    finished_at: state.finished_at || null,
    last_run_at: state.last_run_at || null,
    updated_at: state.updated_at || null,
    last_error: lastError,
    retryable: staleRunning || state?.notes?.retryable === true,
    stale_running: staleRunning,
    failed_page: Number(state?.notes?.failed_page || 0)
  });
}
__name(handleProvinciaBackfillStatus, "handleProvinciaBackfillStatus");
async function handleProvinciaBackfillKick(request, env, ctx) {
  const state = await obtenerScanState(env);
  const staleRunning = isStaleProvinciaBackfill(state);
  const force = staleRunning || state.status === "error";
  if (state.status === "running" && !staleRunning) {
    return json({
      ok: true,
      skipped: true,
      reason: "already_running",
      message: "El backfill provincial ya se esta procesando."
    });
  }
  ctx.waitUntil(
    runProvinciaBackfillStep(env, {
      source: staleRunning ? "manual_recover_stale" : "manual_fire_and_forget",
      force
    }).catch((err) => {
      console.error("PROVINCIA BACKFILL KICK STEP ERROR:", err);
    })
  );
  return json({
    ok: true,
    forced: force,
    stale_recovered: staleRunning,
    message: staleRunning ? "Se relanzo un lote provincial desde el punto que habia quedado trabado." : state.status === "error" ? "Se relanzo un lote provincial desde el ultimo punto con error." : "Lote provincial lanzado en segundo plano"
  });
}
__name(handleProvinciaBackfillKick, "handleProvinciaBackfillKick");
async function handleProvinciaBackfillReset(env) {
  await saveScanState(env, {
    scope: PROVINCIA_SCOPE,
    status: "idle",
    mode: "backfill",
    district_index: 0,
    district_name: null,
    next_page: 0,
    pages_processed: 0,
    districts_completed: 0,
    offers_processed: 0,
    last_batch_count: 0,
    total_districts: 0,
    started_at: null,
    finished_at: null,
    last_run_at: null,
    notes: {}
  });
  return json({ ok: true, message: "Cursor provincial reiniciado" });
}
__name(handleProvinciaBackfillReset, "handleProvinciaBackfillReset");
async function handleProvinciaBackfillStep(request, env) {
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  const result = await runProvinciaBackfillStep(env, { source: "manual", force });
  return json({ ok: true, ...result });
}
__name(handleProvinciaBackfillStep, "handleProvinciaBackfillStep");
async function handleProvinciaResumen(url, env) {
  const days = clampInt(url.searchParams.get("days"), 7, 120, PROVINCIA_DAYS_DEFAULT);
  const rows = await fetchProvinciaCurrentRows(env, days);
  const state = await obtenerScanState(env);
  return json(buildProvinciaResumenPayload(rows, days, state));
}
__name(handleProvinciaResumen, "handleProvinciaResumen");
async function handleProvinciaInsights(url, env) {
  const days = clampInt(url.searchParams.get("days"), 7, 120, PROVINCIA_DAYS_DEFAULT);
  const rows = await fetchProvinciaCurrentRows(env, days);
  const payload = buildProvinciaResumenPayload(rows, days, null);
  return json({
    ok: true,
    days,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    items: payload.banner_items || []
  });
}
__name(handleProvinciaInsights, "handleProvinciaInsights");
async function handleMercadoPagoCreateCheckoutLink(request, env) {
  const body = await request.json();
  const userId = String(body?.user_id || "").trim();
  const planCode = String(body?.plan_code || "").trim().toUpperCase();
  if (!userId || !planCode) {
    return json({ ok: false, message: "Faltan user_id o plan_code" }, 400);
  }
  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }
  const plan = await obtenerPlanPorCode(env, planCode);
  if (!plan) {
    return json({ ok: false, message: "Plan no encontrado" }, 404);
  }
  const externalReference = `${userId}:${planCode}:${Date.now()}`;
  const webhookUrl = env.MERCADOPAGO_WEBHOOK_URL || new URL(`${API_URL_PREFIX2}/mercadopago/webhook`, request.url).toString();
  const mpPreference = await createMercadoPagoCheckoutPreference(env, {
    user,
    plan,
    externalReference,
    webhookUrl
  }).catch((err) => {
    console.warn("Mercado Pago checkout fallback:", err?.message || err);
    return null;
  });
  const checkoutUrl = mpPreference?.checkout_url || (env.MERCADOPAGO_CHECKOUT_FALLBACK_URL ? `${env.MERCADOPAGO_CHECKOUT_FALLBACK_URL}?plan=${encodeURIComponent(planCode)}&ref=${encodeURIComponent(externalReference)}` : null);
  const checkoutConfigured = !!checkoutUrl;
  const sessionRows = await supabaseInsert(env, "mercadopago_checkout_sessions", {
    user_id: userId,
    plan_code: planCode,
    status: checkoutConfigured ? "ready" : "pending_config",
    provider: "mercadopago",
    checkout_url: checkoutUrl,
    external_reference: externalReference,
    provider_payload: {
      configured: checkoutConfigured,
      plan_code: planCode,
      mercadopago_plan_id: plan.mercadopago_plan_id || null,
      price_ars: plan?.price_ars != null ? Number(plan.price_ars) : null,
      provider_mode: mpPreference?.mode || "fallback",
      preference_id: mpPreference?.preference_id || null,
      sandbox_init_point: mpPreference?.sandbox_init_point || null
    }
  });
  const session = Array.isArray(sessionRows) ? sessionRows[0] : sessionRows;
  return json({
    ok: true,
    configured: checkoutConfigured,
    provider_mode: mpPreference?.mode || "fallback",
    message: checkoutConfigured ? mpPreference?.mode === "mercadopago_preference" ? "Checkout real de Mercado Pago preparado" : "Checkout preparado" : "Se registro la sesion, pero todavia falta configurar el checkout real de Mercado Pago.",
    session_id: session?.id || null,
    checkout_url: checkoutUrl,
    sandbox_init_point: mpPreference?.sandbox_init_point || null,
    preference_id: mpPreference?.preference_id || null,
    external_reference: externalReference,
    plan: normalizePlanOut(plan)
  });
}

__name(handleMercadoPagoCreateCheckoutLink, "handleMercadoPagoCreateCheckoutLink");
function arParseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function arFormatDate(value) {
  const d = arParseDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);
}

function arAddDaysIso(baseIso, days) {
  const base = arParseDate(baseIso) || new Date();
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function arRecurringStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return "inactive";
  if (raw === "authorized" || raw === "active") return "active";
  if (raw === "pending") return "pending_setup";
  if (raw === "paused") return "paused";
  if (raw === "cancelled" || raw === "canceled") return "canceled";
  return raw;
}

async function arSupabasePatchById(env, table, id, payload) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "No se pudo actualizar en Supabase");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function arMercadoPagoRequest(env, path, init = {}) {
  const token = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");

  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(data?.message || data?.cause?.[0]?.description || `Mercado Pago error ${res.status}`);
  }

  return data;
}

async function arGetCurrentPaidSubscription(env, userId) {
  const rows = await supabaseSelect(
    env,
    `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc&limit=20`
  ).catch(() => []);

  const items = Array.isArray(rows) ? rows : [];
  const now = Date.now();

  const current = items.find((row) => {
    const planCode = String(row?.plan_code || "").trim().toUpperCase();
    const status = String(row?.status || "").trim().toUpperCase();
    if (!planCode || planCode === "TRIAL_7D") return false;
    if (status === "CANCELLED" || status === "CANCELED") return false;

    const end = arParseDate(row?.current_period_ends_at)?.getTime() || 0;
    return !end || now <= end;
  });

  return current || null;
}
function arMercadoPagoDate(value) {
  const base = arParseDate(value) || new Date(Date.now() + 5 * 60 * 1000);

  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  const hh = String(base.getHours()).padStart(2, "0");
  const mi = String(base.getMinutes()).padStart(2, "0");
  const ss = String(base.getSeconds()).padStart(2, "0");

  const offsetMin = -base.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offH = String(Math.floor(abs / 60)).padStart(2, "0");
  const offM = String(abs % 60).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000${sign}${offH}:${offM}`;
}

async function handleSubscriptionEnableAutoRenew(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();

  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }

  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }

  const current = await arGetCurrentPaidSubscription(env, userId);
  if (!current) {
    return json({ ok: false, message: "Necesitás un plan pago activo para activar renovación automática." }, 409);
  }

  if (String(current?.mercadopago_preapproval_id || "").trim()) {
    return json({ ok: false, message: "La renovación automática ya está activa o en proceso de configuración." }, 409);
  }

  const plan = await obtenerPlanPorCode(env, current.plan_code);
  if (!plan || !Number(plan?.price_ars)) {
    return json({ ok: false, message: "No encontramos el plan actual o su precio." }, 409);
  }

 
  const rawStartDate = current.current_period_ends_at || arAddDaysIso(new Date().toISOString(), 30);
const startDate = arMercadoPagoDate(rawStartDate);
  const externalReference = `AUTORENEW:${userId}:${String(current.plan_code).trim().toUpperCase()}:${Date.now()}`;
  const backUrl = String(env.MERCADOPAGO_SUCCESS_URL || "https://apdocentepba-hub.github.io/apdocentepba-v2/").trim();

  const mp = await arMercadoPagoRequest(env, "/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `APDocentePBA · Renovación automática ${plan?.nombre || current.plan_code}`,
      external_reference: externalReference,
      payer_email: String(user?.email || "").trim().toLowerCase(),
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        start_date: startDate,
        transaction_amount: Number(plan.price_ars),
        currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS"
      },
      back_url: backUrl,
      status: "pending"
    })
  });

  if (current?.id && mp?.id) {
    await arSupabasePatchById(env, "user_subscriptions", current.id, {
      mercadopago_preapproval_id: mp.id,
      external_reference: externalReference
    });
  }

  return json({
    ok: true,
    checkout_url: mp?.init_point || null,
    preapproval_id: mp?.id || null,
    recurring_enabled: true,
    auto_renew_status: arRecurringStatus(mp?.status || "pending"),
    message: `Se abrió Mercado Pago para activar la renovación automática. El próximo ciclo se intentará cobrar desde el ${arFormatDate(startDate)} solo si completás la configuración del débito automático.`
  });
}

async function handleSubscriptionCancelAutoRenew(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();

  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }

  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }

  const current = await arGetCurrentPaidSubscription(env, userId);
  if (!current || !String(current?.mercadopago_preapproval_id || "").trim()) {
    return json({ ok: false, message: "No tenés renovación automática activa para desactivar." }, 409);
  }

  await arMercadoPagoRequest(env, `/preapproval/${encodeURIComponent(current.mercadopago_preapproval_id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" })
  });

  await arSupabasePatchById(env, "user_subscriptions", current.id, {
    mercadopago_preapproval_id: null
  });

  return json({
    ok: true,
    recurring_enabled: false,
    renewal_policy: "manual_renewal",
    message: current?.current_period_ends_at
      ? `La renovación automática quedó desactivada. Conservás el acceso hasta el ${arFormatDate(current.current_period_ends_at)} y después el plan vence sin cobrarte de nuevo.`
      : "La renovación automática quedó desactivada. No se harán nuevos cobros automáticos."
  });
}
async function handleMercadoPagoWebhook(request, env) {
  const raw = await request.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw_text: raw };
  }
  const topic = String(payload?.type || payload?.topic || payload?.action || "").trim() || null;
  const action = String(payload?.action || "").trim() || null;
  const resourceId = String(payload?.data?.id || payload?.id || "").trim() || null;
  await supabaseInsert(env, "mercadopago_webhook_events", {
    topic,
    action,
    resource_id: resourceId,
    payload,
    received_at: (/* @__PURE__ */ new Date()).toISOString()
  }).catch((err) => {
    console.warn("No se pudo guardar el webhook de Mercado Pago:", err?.message || err);
  });
  const sync = await syncMercadoPagoWebhook(env, { topic, action, resourceId, payload }).catch((err) => {
    console.warn("No se pudo sincronizar el pago de Mercado Pago:", err?.message || err);
    return {
      processed: false,
      reason: "sync_error",
      message: err?.message || "Error sincronizando Mercado Pago"
    };
  });
  return json({ ok: true, sync });
}
__name(handleMercadoPagoWebhook, "handleMercadoPagoWebhook");
async function syncMercadoPagoWebhook(env, event) {
  const topic = String(event?.topic || event?.action || "").trim().toLowerCase();
  const resourceId = String(event?.resourceId || "").trim();
  const accessToken = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!accessToken) {
    return { processed: false, reason: "missing_access_token" };
  }
  if (!resourceId) {
    return { processed: false, reason: "missing_resource_id" };
  }
  if (!topic.includes("payment")) {
    return { processed: false, reason: "unsupported_topic", topic };
  }
  const payment = await fetchMercadoPagoPayment(env, resourceId);
  return await applyMercadoPagoPayment(env, payment);
}
__name(syncMercadoPagoWebhook, "syncMercadoPagoWebhook");
async function fetchMercadoPagoPayment(env, paymentId) {
  const accessToken = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { raw_text: rawText };
  }
  if (!res.ok) {
    throw new Error(data?.message || "Mercado Pago no devolvio el pago");
  }
  return data;
}
__name(fetchMercadoPagoPayment, "fetchMercadoPagoPayment");
async function applyMercadoPagoPayment(env, payment) {
  const externalReference = String(payment?.external_reference || "").trim();
  if (!externalReference) {
    return { processed: false, reason: "missing_external_reference" };
  }
  const parsedRef = parseMercadoPagoExternalReference(externalReference);
  const session = await findCheckoutSessionByExternalReference(env, externalReference);
  const userId = String(session?.user_id || parsedRef.user_id || "").trim();
  const planCode = String(session?.plan_code || parsedRef.plan_code || "").trim().toUpperCase();
  if (!userId || !planCode) {
    return { processed: false, reason: "missing_user_or_plan", external_reference: externalReference };
  }
  const paymentStatus = String(payment?.status || "").trim().toUpperCase();
  const subscriptionStatus = mapMercadoPagoSubscriptionStatus(paymentStatus);
  const sessionStatus = mapMercadoPagoCheckoutStatus(paymentStatus);
  const paymentDate = payment?.date_approved || payment?.date_last_updated || payment?.date_created || (/* @__PURE__ */ new Date()).toISOString();
  const currentPeriodEndsAt = subscriptionStatus === "ACTIVE" || subscriptionStatus === "AUTHORIZED" ? addDaysIso(paymentDate, clampInt(env.MERCADOPAGO_SUBSCRIPTION_PERIOD_DAYS, 1, 365, 30)) : null;
  if (session) {
    await supabasePatch(
      env,
      "mercadopago_checkout_sessions",
      `id=eq.${encodeURIComponent(session.id)}`,
      {
        status: sessionStatus,
        provider_payload: {
          ...typeof session.provider_payload === "object" && session.provider_payload ? session.provider_payload : {},
          payment_id: payment?.id || null,
          payment_status: payment?.status || null,
          payment_status_detail: payment?.status_detail || null,
          payment_type_id: payment?.payment_type_id || null,
          payer_email: payment?.payer?.email || null,
          processed_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ).catch((err) => {
      console.warn("No se pudo actualizar la sesion de checkout:", err?.message || err);
    });
  }
  const existingSubscription = await findSubscriptionByExternalReference(env, externalReference);
  const subscriptionPayload = {
    user_id: userId,
    plan_code: planCode,
    status: subscriptionStatus,
    source: "mercadopago_checkout",
    started_at: paymentDate,
    trial_ends_at: null,
    current_period_ends_at: currentPeriodEndsAt,
    mercadopago_preapproval_id: null,
    mercadopago_payer_email: payment?.payer?.email || null,
    external_reference: externalReference,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (existingSubscription?.id) {
    await supabasePatch(
      env,
      "user_subscriptions",
      `id=eq.${encodeURIComponent(existingSubscription.id)}`,
      subscriptionPayload
    );
  } else {
    await supabaseInsert(env, "user_subscriptions", subscriptionPayload);
  }
  return {
    processed: true,
    external_reference: externalReference,
    payment_id: payment?.id || null,
    payment_status: paymentStatus,
    subscription_status: subscriptionStatus,
    user_id: userId,
    plan_code: planCode
  };
}
__name(applyMercadoPagoPayment, "applyMercadoPagoPayment");
async function findCheckoutSessionByExternalReference(env, externalReference) {
  const rows = await supabaseSelect(
    env,
    `mercadopago_checkout_sessions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,user_id,plan_code,status,provider_payload&order=created_at.desc&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}
__name(findCheckoutSessionByExternalReference, "findCheckoutSessionByExternalReference");
async function findSubscriptionByExternalReference(env, externalReference) {
  const rows = await supabaseSelect(
    env,
    `user_subscriptions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,status,external_reference&order=created_at.desc&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}
__name(findSubscriptionByExternalReference, "findSubscriptionByExternalReference");
function parseMercadoPagoExternalReference(value) {
  const raw = String(value || "").trim();
  if (!raw) return { user_id: "", plan_code: "" };
  const [userId = "", planCode = ""] = raw.split(":");
  return {
    user_id: String(userId || "").trim(),
    plan_code: String(planCode || "").trim().toUpperCase()
  };
}
__name(parseMercadoPagoExternalReference, "parseMercadoPagoExternalReference");
function mapMercadoPagoSubscriptionStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  if (key === "APPROVED") return "ACTIVE";
  if (key === "AUTHORIZED") return "AUTHORIZED";
  if (key === "PENDING" || key === "IN_PROCESS" || key === "PENDING_CONTINGENCY") return "PENDING";
  if (key === "IN_MEDIATION") return "PAUSED";
  if (key === "REFUNDED" || key === "CHARGED_BACK" || key === "CANCELLED" || key === "REJECTED") return "CANCELLED";
  return key || "PENDING";
}
__name(mapMercadoPagoSubscriptionStatus, "mapMercadoPagoSubscriptionStatus");
function mapMercadoPagoCheckoutStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  if (key === "APPROVED") return "approved";
  if (key === "AUTHORIZED") return "authorized";
  if (key === "PENDING" || key === "IN_PROCESS" || key === "PENDING_CONTINGENCY") return "pending";
  if (key === "REJECTED" || key === "CANCELLED") return "rejected";
  if (key === "REFUNDED" || key === "CHARGED_BACK") return "refunded";
  return key.toLowerCase() || "pending";
}
__name(mapMercadoPagoCheckoutStatus, "mapMercadoPagoCheckoutStatus");
function addDaysIso(baseIso, days) {
  const baseDate = parseFechaFlexible(baseIso) || /* @__PURE__ */ new Date();
  const next = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1e3);
  return next.toISOString();
}
__name(addDaysIso, "addDaysIso");
function isPlanActivo(resolved) {
  const sub = resolved?.subscription;
  const plan = resolved?.plan;
  if (!plan) return false;
  const planCode = String(plan.code || sub?.plan_code || "").trim().toUpperCase();
  const status = String(sub?.status || "").trim().toUpperCase();
  if (planCode === "INSIGNE") return true;
  if (planCode === "TRIAL_7D") {
    if (!sub?.trial_ends_at) return false;
    const end = new Date(sub.trial_ends_at).getTime();
    return Number.isFinite(end) && Date.now() <= end;
  }
  if (status === "ACTIVE" || status === "AUTHORIZED") {
    if (!sub?.current_period_ends_at) return true;
    const end = new Date(sub.current_period_ends_at).getTime();
    return Number.isFinite(end) && Date.now() <= end;
  }
  return false;
}
__name(isPlanActivo, "isPlanActivo");
async function handleWhatsAppHealth(env) {
  const templateName = String(env.WHATSAPP_TEMPLATE_ALERTA || "hello_world").trim();
  const templateLang = String(env.WHATSAPP_TEMPLATE_LANG || "en_US").trim();
  const configured = !!env.WHATSAPP_PHONE_NUMBER_ID && !!env.WHATSAPP_ACCESS_TOKEN && !!env.WHATSAPP_TEMPLATE_ALERTA;
  return json({
    ok: true,
    configured,
    graph_version: env.WHATSAPP_GRAPH_VERSION || "v23.0",
    phone_number_id_ready: !!env.WHATSAPP_PHONE_NUMBER_ID,
    access_token_ready: !!env.WHATSAPP_ACCESS_TOKEN,
    template_ready: !!env.WHATSAPP_TEMPLATE_ALERTA,
    template_name: templateName,
    template_lang: templateLang,
    template_supports_alert_dispatch: !isHelloWorldTemplate(templateName),
    note: configured ? isHelloWorldTemplate(templateName) ? "WhatsApp listo para pruebas controladas. Para alertas reales conviene una plantilla propia." : "WhatsApp listo para pruebas controladas y despachos programados." : "Todavia faltan variables para habilitar envios reales por WhatsApp."
  });
}
__name(handleWhatsAppHealth, "handleWhatsAppHealth");
async function handleWhatsAppTestSend(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }
  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado" }, 404);
  }
  const configured = !!env.WHATSAPP_PHONE_NUMBER_ID && !!env.WHATSAPP_ACCESS_TOKEN && !!env.WHATSAPP_TEMPLATE_ALERTA;
  if (!configured) {
    return json({ ok: false, message: "WhatsApp todavia no esta configurado en el worker." }, 400);
  }
  const destinations = whatsappTestDestinations(body?.phone || user?.celular || "");
  if (!destinations.length) {
    return json({
      ok: false,
      message: "No hay un celular valido para la prueba. Guarda un movil en formato internacional o local."
    }, 400);
  }
  const templateName = String(env.WHATSAPP_TEMPLATE_ALERTA || "hello_world").trim();
  const templateLang = String(env.WHATSAPP_TEMPLATE_LANG || "en_US").trim();
  const bodyParameters = parseWhatsAppBodyParameters(env.WHATSAPP_TEMPLATE_BODY_PARAMS_JSON);
  let destination = destinations[0];
  let payload = null;
  let response = null;
  let data = null;
  for (const candidate of destinations) {
    destination = candidate;
    payload = buildWhatsAppTemplatePayload(candidate, templateName, templateLang, bodyParameters);
    const result = await sendWhatsAppTemplate(env, payload);
    response = result.response;
    data = result.data;
    if (response.ok || !isMetaAllowedListError(data)) {
      break;
    }
  }
  const providerMessageId = data?.messages?.[0]?.id || null;
  await supabaseInsert(env, "notification_delivery_logs", {
    user_id: user.id,
    channel: "whatsapp",
    template_code: templateName,
    destination,
    status: response.ok ? "sent_test" : "failed_test",
    provider_message_id: providerMessageId,
    payload,
    provider_response: data
  }).catch((err) => {
    console.warn("No se pudo registrar el log de WhatsApp:", err?.message || err);
  });
  if (!response.ok) {
    const providerMessage = data?.error?.message || data?.message || "Meta no acepto la prueba de WhatsApp.";
    return json({ ok: false, message: providerMessage, provider_response: data }, 400);
  }
  return json({
    ok: true,
    message: "Prueba de WhatsApp enviada",
    destination,
    template_name: templateName,
    provider_message_id: providerMessageId,
    provider_response: data
  });
}
__name(handleWhatsAppTestSend, "handleWhatsAppTestSend");
async function createMercadoPagoCheckoutPreference(env, context) {
  const accessToken = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  const amount = Number(context?.plan?.price_ars);
  if (!accessToken) {
    throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El plan no tiene price_ars valido para crear un checkout real");
  }
  const payload = {
    items: [
      {
        id: String(context?.plan?.code || "PLAN").trim().toUpperCase(),
        title: String(context?.plan?.nombre || "Suscripcion APDocentePBA").trim(),
        description: String(context?.plan?.descripcion || "").trim() || void 0,
        quantity: 1,
        currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS",
        unit_price: amount
      }
    ],
    payer: {
      email: String(context?.user?.email || "").trim().toLowerCase() || void 0,
      name: String(context?.user?.nombre || "").trim() || void 0,
      surname: String(context?.user?.apellido || "").trim() || void 0
    },
    external_reference: context.externalReference,
    notification_url: context.webhookUrl,
    statement_descriptor: String(env.MERCADOPAGO_STATEMENT_DESCRIPTOR || "APDOCENTEPBA").slice(0, 13)
  };
  const successUrl = String(env.MERCADOPAGO_SUCCESS_URL || "").trim();
  const pendingUrl = String(env.MERCADOPAGO_PENDING_URL || "").trim();
  const failureUrl = String(env.MERCADOPAGO_FAILURE_URL || "").trim();
  if (successUrl || pendingUrl || failureUrl) {
    payload.back_urls = {};
    if (successUrl) payload.back_urls.success = successUrl;
    if (pendingUrl) payload.back_urls.pending = pendingUrl;
    if (failureUrl) payload.back_urls.failure = failureUrl;
  }
  if (successUrl) {
    payload.auto_return = "approved";
  }
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { raw_text: rawText };
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.cause?.[0]?.description || "Mercado Pago no pudo crear la preferencia");
  }
  return {
    mode: "mercadopago_preference",
    preference_id: data?.id || null,
    checkout_url: data?.init_point || null,
    sandbox_init_point: data?.sandbox_init_point || null,
    raw: data
  };
}
__name(createMercadoPagoCheckoutPreference, "createMercadoPagoCheckoutPreference");
function normalizeWhatsappDestination(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  if (digits.startsWith("9") && digits.length >= 11) return `54${digits}`;
  if (digits.startsWith("15") && digits.length > 8) digits = digits.slice(2);
  return `549${digits}`;
}
__name(normalizeWhatsappDestination, "normalizeWhatsappDestination");
function whatsappTestDestinations(value) {
  const primary = normalizeWhatsappDestination(value);
  if (!primary) return [];
  const variants = unique([
    primary,
    whatsappAllowedListVariant(primary)
  ]);
  return variants.filter(Boolean);
}
__name(whatsappTestDestinations, "whatsappTestDestinations");
function whatsappAllowedListVariant(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return `54${digits.slice(3)}`;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  return "";
}
__name(whatsappAllowedListVariant, "whatsappAllowedListVariant");
function isHelloWorldTemplate(templateName) {
  return String(templateName || "").trim().toLowerCase() === "hello_world";
}
__name(isHelloWorldTemplate, "isHelloWorldTemplate");
function buildWhatsAppTemplatePayload(destination, templateName, templateLang, bodyParameters = []) {
  const payload = {
    messaging_product: "whatsapp",
    to: destination,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang }
    }
  };
  if (Array.isArray(bodyParameters) && bodyParameters.length) {
    payload.template.components = [
      {
        type: "body",
        parameters: bodyParameters
      }
    ];
  }
  return payload;
}
__name(buildWhatsAppTemplatePayload, "buildWhatsAppTemplatePayload");
async function sendWhatsAppTemplate(env, payload) {
  const response = await fetch(
    `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { raw_text: rawText };
  }
  return { response, data };
}
__name(sendWhatsAppTemplate, "sendWhatsAppTemplate");
function isMetaAllowedListError(data) {
  const message = String(data?.error?.message || data?.message || "").toLowerCase();
  const code = Number(data?.error?.error_subcode || data?.error?.code || 0);
  return code === 131030 || message.includes("allowed list");
}
__name(isMetaAllowedListError, "isMetaAllowedListError");
async function getRecentSentEmailAlertKeysForUser(env, userId) {
  const limit = 200;

  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?user_id=eq.${encodeURIComponent(userId)}&channel=eq.email&select=payload,status,created_at,template_code&order=created_at.desc&limit=${limit}`
  ).catch(() => []);

  const keys = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (!status.startsWith("sent")) continue;

    const singleKey = String(row?.payload?.alert_key || "").trim();
    if (singleKey) keys.add(singleKey);

    const manyKeys = Array.isArray(row?.payload?.alert_keys)
      ? row.payload.alert_keys
      : [];

    for (const key of manyKeys) {
      const clean = String(key || "").trim();
      if (clean) keys.add(clean);
    }
  }

  return keys;
}
__name(getRecentSentEmailAlertKeysForUser, "getRecentSentEmailAlertKeysForUser");

async function loadPendingEmailAlertKeysForUser(env, userId) {
  const rows = await supabaseSelect(
    env,
    `pending_notifications?user_id=eq.${encodeURIComponent(userId)}&channel=eq.email&status=eq.pending&select=alert_key&order=created_at.desc&limit=200`
  ).catch(() => []);

  const keys = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.alert_key || "").trim();
    if (key) keys.add(key);
  }

  return keys;
}
__name(loadPendingEmailAlertKeysForUser, "loadPendingEmailAlertKeysForUser");

async function hasPendingEmailNotifications(env, userId = "") {
  const filters = [
    "channel=eq.email",
    "status=eq.pending",
    "select=id",
    "limit=1"
  ];

  const safeUserId = String(userId || "").trim();
  if (safeUserId) {
    filters.unshift(`user_id=eq.${encodeURIComponent(safeUserId)}`);
  }

  const rows = await supabaseSelect(
    env,
    `pending_notifications?${filters.join("&")}`
  ).catch(() => []);

  return Array.isArray(rows) && rows.length > 0;
}
__name(hasPendingEmailNotifications, "hasPendingEmailNotifications");

function buildEmailAlertKey(userId, alertItem) {
  const key = String(
    alertItem?.source_offer_key || alertItem?.iddetalle || alertItem?.idoferta || alertItem?.codigo || JSON.stringify(alertItem)
  ).trim();
  return key ? `${userId}:${key}` : "";
}
async function enriquecerAlertaParaCanales(env, alertItem) {
  const merged = normalizeOfferPayload(alertItem || {});

  const ofertaId = String(merged.idoferta || "").trim();
  const detalleId = String(merged.iddetalle || "").trim();

  if (ofertaId || detalleId) {
    try {
      const resumen = await obtenerResumenPostulantesABC(ofertaId, detalleId);
      merged.total_postulantes = resumen.total_postulantes ?? merged.total_postulantes ?? null;
      merged.puntaje_primero = resumen.puntaje_primero ?? merged.puntaje_primero ?? null;
      merged.listado_origen_primero = resumen.listado_origen_primero || merged.listado_origen_primero || "";
    } catch (_) {
      merged.total_postulantes = merged.total_postulantes ?? null;
      merged.puntaje_primero = merged.puntaje_primero ?? null;
      merged.listado_origen_primero = merged.listado_origen_primero || "";
    }
  }

  return merged;
}

async function enriquecerAlertasVisiblesParaCanales(env, items, maxVisible = 10) {
  const source = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(maxVisible || 10));
  const visible = source.slice(0, limit);

  const enriched = await Promise.all(
    visible.map(item => enriquecerAlertaParaCanales(env, item))
  );

  return {
    total: source.length,
    shown: enriched.length,
    hidden: Math.max(0, source.length - enriched.length),
    items: enriched
  };
}

function buildChannelAlertTextBlock(payload, options = {}) {
  const o = normalizeOfferPayload(payload || {});
  const showPid = options?.show_pid === true;
  const index = Number(options?.index || 0);

  const title = [
    String(o.cargo || "").trim(),
    String(o.materia || o.area || "").trim()
  ]
    .filter(Boolean)
    .filter((value, idx, arr) => arr.indexOf(value) === idx)
    .join(" · ") || "Oferta APD";

  const lines = [];
  lines.push(`${index ? `${index}) ` : ""}${title}`);

  if (o.distrito) lines.push(`📍 ${o.distrito}`);
  if (o.escuela) lines.push(`🏫 ${o.escuela}`);
  if (o.turno) lines.push(`🕒 ${o.turno}`);
  if (o.nivel) lines.push(`🎓 ${o.nivel}`);
  if (o.jornada) lines.push(`🏷️ ${o.jornada}`);
  if (o.modulos) lines.push(`📦 Módulos: ${o.modulos}`);
  if (o.dias_horarios) lines.push(`🗓️ Horario: ${o.dias_horarios}`);
  if (o.fecha_cierre) lines.push(`⏰ Cierre: ${o.fecha_cierre}`);

  if (
    o.total_postulantes != null ||
    o.puntaje_primero != null ||
    o.listado_origen_primero
  ) {
    lines.push(
      `👥 Postulados: ${
        o.total_postulantes != null && o.total_postulantes !== ""
          ? String(o.total_postulantes)
          : "Sin datos"
      }`
    );
    lines.push(
      `🥇 Puntaje más alto: ${
        o.puntaje_primero != null && o.puntaje_primero !== ""
          ? formatMailNumber(parseMailNumber(o.puntaje_primero))
          : "Sin datos"
      }`
    );
    lines.push(
      `📄 Listado del más alto: ${
        o.listado_origen_primero
          ? o.listado_origen_primero
          : "Sin datos"
      }`
    );
  }

  if (showPid) {
    const puntajeFinal = Number.isFinite(Number(o.pid_puntaje_total_final))
      ? Number(o.pid_puntaje_total_final)
      : null;

    const puntajeBase = Number.isFinite(Number(o.pid_puntaje_total_base))
      ? Number(o.pid_puntaje_total_base)
      : parseMailNumber(o.pid_puntaje_total);

    if (o.pid_reason) lines.push(`🧾 PID: ${o.pid_reason}`);
    if (o.pid_area) lines.push(`📚 Área PID: ${o.pid_area}`);
    if (o.pid_bloque) lines.push(`🧩 Bloque PID: ${o.pid_bloque}`);
    if (Number.isFinite(puntajeBase)) {
      lines.push(`🎯 Puntaje PID base: ${formatMailNumber(puntajeBase)}`);
    }
    if (o.pid_residencia_bonus_aplicado) {
      lines.push(`🏠 Bonus residencia: +${Number(o.pid_residencia_bonus_puntos || 0)}`);
    }
    if (Number.isFinite(puntajeFinal)) {
      lines.push(`✅ Puntaje PID final: ${formatMailNumber(puntajeFinal)}`);
    }
    if (o.pid_listado || o.pid_anio) {
      lines.push(`📌 PID: ${o.pid_listado || "-"} · ${o.pid_anio || "-"}`);
    }
  }

  if (o.link) lines.push(`🔗 ${o.link}`);

  return lines.filter(Boolean).join("\n");
}
async function enrichAlertForRichChannels(env, user, alertItem, resolvedPlan = null) {
  const resolved =
    resolvedPlan ||
    await resolverPlanUsuario(env, user?.id || "").catch(() => null);

  const planCode = String(
    resolved?.plan?.code ||
    resolved?.subscription?.plan_code ||
    ""
  ).trim().toUpperCase();

  let enriched = normalizeOfferPayload(
    alertItem?.offer_payload || alertItem || {}
  );

  const ofertaId = String(enriched.idoferta || "").trim();
  const detalleId = String(enriched.iddetalle || "").trim();

  if (ofertaId || detalleId) {
    try {
      const resumen = await obtenerResumenPostulantesABC(ofertaId, detalleId);

      enriched.total_postulantes =
        resumen.total_postulantes ?? enriched.total_postulantes ?? null;

      enriched.puntaje_primero =
        resumen.puntaje_primero ?? enriched.puntaje_primero ?? null;

      enriched.listado_origen_primero =
        resumen.listado_origen_primero ||
        enriched.listado_origen_primero ||
        "";
    } catch (_) {
      enriched.total_postulantes = enriched.total_postulantes ?? null;
      enriched.puntaje_primero = enriched.puntaje_primero ?? null;
      enriched.listado_origen_primero =
        enriched.listado_origen_primero || "";
    }
  }

  if (planCode !== "INSIGNE") {
    enriched = stripPidFromPayload(enriched);
  }

  return enriched;
}

async function enrichAlertsForRichChannels(env, user, alerts, limit = 10) {
  const items = Array.isArray(alerts) ? alerts.slice(0, limit) : [];
  if (!items.length) return [];

  const resolved = await resolverPlanUsuario(env, user?.id || "").catch(() => null);

  const enriched = await Promise.all(
    items.map(async (item) => {
      const offerPayload = await enrichAlertForRichChannels(env, user, item, resolved);
      return { offer_payload: offerPayload };
    })
  );

  return enriched;
}
__name(buildEmailAlertKey, "buildEmailAlertKey");
async function sendEmailAlertForUser(env, user, alertItem, options = {}) {
  const alertKey = buildEmailAlertKey(user?.id, alertItem);

  if (!user?.email) {
    const payload = {
      alert_key: alertKey || null,
      source: options.source || "cron",
      alert: {}
    };

    await supabaseInsert(env, "notification_delivery_logs", {
      user_id: user?.id || null,
      channel: "email",
      template_code: "apd_email_alert",
      destination: null,
      status: "failed_enqueue",
      provider_message_id: null,
      payload,
      provider_response: { message: "Usuario sin email válido" }
    }).catch(() => null);

    return { ok: false, reason: "missing_email", alert_key: alertKey };
  }

  try {
    const canonicalAlert = normalizeOfferPayload(
      alertItem?.offer_payload || alertItem || {}
    );

    const payload = {
      alert_key: alertKey || null,
      source: options.source || "cron",
      alert: canonicalAlert
    };

    await supabaseInsert(env, "pending_notifications", {
      user_id: user.id,
      channel: "email",
      kind: "apd_alert",
      alert_key: alertKey,
      payload,
      status: "pending"
    });

    await supabaseInsert(env, "notification_delivery_logs", {
      user_id: user.id,
      channel: "email",
      template_code: "apd_email_alert",
      destination: user.email,
      status: "queued",
      provider_message_id: null,
      payload,
      provider_response: { message: "Alerta encolada para envío consolidado" }
    }).catch(() => null);

    return { ok: true, queued: true, alert_key: alertKey };
  } catch (err) {
    const msg = String(err?.message || "");

    if (
      msg.includes("23505") ||
      msg.toLowerCase().includes("duplicate key") ||
      msg.toLowerCase().includes("unique_alert_user") ||
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("unique")
    ) {
      await supabaseInsert(env, "notification_delivery_logs", {
        user_id: user.id,
        channel: "email",
        template_code: "apd_email_alert",
        destination: user.email,
        status: "skipped_duplicate",
        provider_message_id: null,
        payload: {
          alert_key: alertKey || null,
          source: options.source || "cron",
          alert: {}
        },
        provider_response: {
          message: "Alerta duplicada ignorada por constraint unique_alert_user"
        }
      }).catch(() => null);

      return { ok: true, skipped: true, reason: "duplicate", alert_key: alertKey };
    }

    await supabaseInsert(env, "notification_delivery_logs", {
      user_id: user.id,
      channel: "email",
      template_code: "apd_email_alert",
      destination: user.email,
      status: "failed_enqueue",
      provider_message_id: null,
      payload: {
        alert_key: alertKey || null,
        source: options.source || "cron",
        alert: {}
      },
      provider_response: { message: msg || "Error al encolar alerta" }
    }).catch(() => null);

    return { ok: false, reason: "enqueue_error", alert_key: alertKey };
  }
}
__name(sendEmailAlertForUser, "sendEmailAlertForUser");
async function runEmailAlertsSweep(env, options = {}) {
  const prefRows = await supabaseSelect(
    env,
    `user_preferences?alertas_activas=is.true&alertas_email=is.true&select=user_id&order=user_id.asc`
  ).catch(() => []);

  const total = Array.isArray(prefRows) ? prefRows.length : 0;
  const MAX_DIGEST_EMAILS_PER_RUN = 4;
  const MAX_VISIBLE_ALERTS_IN_EMAIL = 10;

  if (!total) {
    return {
      ok: true,
      processed_users: 0,
      send_attempts: 0,
      sent_count: 0,
      notified_alerts_count: 0,
      skipped_count: 0,
      failed_count: 0,
      total_users: 0,
      limit_per_run: MAX_DIGEST_EMAILS_PER_RUN,
      stopped_early: false,
      failed_samples: [],
      message: "No hay usuarios con alertas por email activas"
    };
  }

  const rowsToProcess = options?.target_user_id
    ? prefRows.filter(r => String(r?.user_id || "").trim() === String(options.target_user_id).trim())
    : prefRows;

  let processedUsers = 0;
  let attemptedDigests = 0;
  let sentDigests = 0;
  let notifiedAlertsCount = 0;
  let skippedAlerts = 0;
  let failedDigests = 0;
  const failed_samples = [];

  for (const row of rowsToProcess) {
    if (attemptedDigests >= MAX_DIGEST_EMAILS_PER_RUN) break;

    const userId = String(row?.user_id || "").trim();
    if (!userId) continue;

    processedUsers += 1;

    const user = await obtenerUsuario(env, userId).catch(() => null);
    if (!user?.activo) continue;
    if (!String(user?.email || "").trim()) continue;

    const alertData = await construirAlertasParaUsuario(env, userId).catch(() => null);
    if (!alertData?.ok) continue;

    const items = Array.isArray(alertData?.resultados)
      ? alertData.resultados
      : Array.isArray(alertData?.alertas)
        ? alertData.alertas
        : [];

    if (!items.length) continue;

    const sentKeys = await getRecentSentEmailAlertKeysForUser(env, userId);

    const pendingAlerts = [];
    for (const alertItem of items) {
      const alertKey = buildEmailAlertKey(userId, alertItem);

      if (alertKey && sentKeys.has(alertKey)) {
        skippedAlerts += 1;
        continue;
      }

      pendingAlerts.push({
        item: alertItem,
        alert_key: alertKey
      });
    }

    if (!pendingAlerts.length) continue;

    const totalNewAlerts = pendingAlerts.length;

    const visibleAlerts = await enrichAlertsForRichChannels(
      env,
      user,
      pendingAlerts.slice(0, MAX_VISIBLE_ALERTS_IN_EMAIL).map(entry => entry.item),
      MAX_VISIBLE_ALERTS_IN_EMAIL
    );

    const shownCount = visibleAlerts.length;

    const subject =
      totalNewAlerts > shownCount
        ? `APDocentePBA: ${shownCount} de ${totalNewAlerts} alertas nuevas`
        : `APDocentePBA: ${totalNewAlerts} alerta${totalNewAlerts === 1 ? "" : "s"} nueva${totalNewAlerts === 1 ? "" : "s"}`;

    const html = buildDigestHtml(visibleAlerts, user, {
      total_alerts: totalNewAlerts,
      max_visible: MAX_VISIBLE_ALERTS_IN_EMAIL,
      panel_url: "https://alertasapd.com.ar"
    });

    attemptedDigests += 1;

    const send = await enviarMailBrevo(
      user.email,
      user.nombre || "",
      subject,
      html,
      env
    );

    const payload = {
      source: options.source || "cron",
      total_alerts: totalNewAlerts,
      shown_alerts: shownCount,
      alert_keys: pendingAlerts
        .map(x => String(x.alert_key || "").trim())
        .filter(Boolean),
      visible_alert_keys: pendingAlerts
        .slice(0, MAX_VISIBLE_ALERTS_IN_EMAIL)
        .map(x => String(x.alert_key || "").trim())
        .filter(Boolean)
    };

    await supabaseInsert(env, "notification_delivery_logs", {
      user_id: user.id,
      channel: "email",
      template_code: "apd_email_alert_digest",
      destination: user.email,
      status: send?.ok ? "sent_alert_digest" : "failed_alert_digest",
      provider_message_id: null,
      payload,
      provider_response: send || null
    }).catch(() => null);

    if (send?.ok) {
      sentDigests += 1;
      notifiedAlertsCount += totalNewAlerts;

      for (const entry of pendingAlerts) {
        if (entry.alert_key) sentKeys.add(entry.alert_key);
      }
    } else {
      failedDigests += 1;

      if (failed_samples.length < 5) {
        failed_samples.push({
          user_id: userId,
          destination: user.email || null,
          total_alerts: totalNewAlerts,
          shown_alerts: shownCount,
          reason: "digest_send_failed",
          provider_response: send || null
        });
      }
    }
  }

  return {
    ok: true,
    processed_users: processedUsers,
    send_attempts: attemptedDigests,
    sent_count: sentDigests,
    notified_alerts_count: notifiedAlertsCount,
    skipped_count: skippedAlerts,
    failed_count: failedDigests,
    total_users: total,
    limit_per_run: MAX_DIGEST_EMAILS_PER_RUN,
    stopped_early: attemptedDigests >= MAX_DIGEST_EMAILS_PER_RUN,
    failed_samples
  };
}
async function runEmailAlertsQueueSweep(env, options = {}) {
  const MAX_USERS_PER_RUN = clampInt(
    options?.max_users || env.EMAIL_QUEUE_SWEEP_MAX_USERS,
    1,
    2,
    1
  );

  const MAX_ALERTS_PER_USER = clampInt(
    options?.max_alerts_per_user || env.EMAIL_QUEUE_ALERTS_PER_USER,
    1,
    50,
    50
  );

  const prefRows = await supabaseSelect(
    env,
    `user_preferences?alertas_activas=is.true&alertas_email=is.true&select=user_id&order=user_id.asc`
  ).catch(() => []);

  const allUserIds = unique(
    (Array.isArray(prefRows) ? prefRows : [])
      .map(row => String(row?.user_id || "").trim())
      .filter(Boolean)
  );

  if (!allUserIds.length) {
    return {
      ok: true,
      mode: "queue_sweep",
      total_users: 0,
      users_selected: 0,
      processed_users: 0,
      enqueued: 0,
      skipped: 0,
      failed: 0,
      failed_samples: []
    };
  }

  let userIdsToProcess = allUserIds;

  const targetUserId = String(options?.target_user_id || "").trim();
  if (targetUserId) {
    userIdsToProcess = allUserIds.filter(id => id === targetUserId);
  } else {
    const kv = getChannelStateStore(env);
    let startIndex = 0;

    if (kv) {
      startIndex = clampInt(
        await kv.get("email:queue:cursor"),
        0,
        Math.max(allUserIds.length - 1, 0),
        0
      );
    }

    const selected = [];
    for (let i = 0; i < Math.min(MAX_USERS_PER_RUN, allUserIds.length); i += 1) {
      selected.push(allUserIds[(startIndex + i) % allUserIds.length]);
    }
    userIdsToProcess = selected;

    if (kv) {
      const nextIndex = (startIndex + userIdsToProcess.length) % allUserIds.length;
      await kv.put("email:queue:cursor", String(nextIndex)).catch(() => null);
    }
  }

  let processedUsers = 0;
  let enqueued = 0;
  let skipped = 0;
  let failed = 0;
  const failed_samples = [];

  for (const userId of userIdsToProcess) {
    const user = await obtenerUsuario(env, userId).catch(() => null);
    if (!user?.id || !user?.activo || !String(user?.email || "").trim()) continue;

    const alertData = await construirAlertasParaUsuario(env, userId).catch(err => ({
      ok: false,
      message: err?.message || "No se pudieron construir alertas"
    }));

    if (!alertData?.ok) {
      failed += 1;
      if (failed_samples.length < 5) {
        failed_samples.push({
          user_id: userId,
          reason: "build_failed",
          message: alertData?.message || "No se pudieron construir alertas"
        });
      }
      continue;
    }

    const items = Array.isArray(alertData?.resultados)
      ? alertData.resultados
      : Array.isArray(alertData?.alertas)
        ? alertData.alertas
        : [];

    processedUsers += 1;

    if (!items.length) continue;

    const sentKeys = await getRecentSentEmailAlertKeysForUser(env, userId);
    const pendingKeys = await loadPendingEmailAlertKeysForUser(env, userId);

    const rowsToInsert = [];

    for (const alertItem of items) {
      if (rowsToInsert.length >= MAX_ALERTS_PER_USER) break;

      const alertKey = buildEmailAlertKey(userId, alertItem);

      if (alertKey && (sentKeys.has(alertKey) || pendingKeys.has(alertKey))) {
        skipped += 1;
        continue;
      }

      const canonicalAlert = normalizeOfferPayload(
        alertItem?.offer_payload || alertItem || {}
      );

      rowsToInsert.push({
        user_id: user.id,
        channel: "email",
        kind: "apd_alert",
        alert_key: alertKey || null,
        payload: {
          alert_key: alertKey || null,
          source: options.source || "cron_queue",
          alert: canonicalAlert
        },
        status: "pending"
      });

      if (alertKey) pendingKeys.add(alertKey);
    }

    if (!rowsToInsert.length) continue;

    try {
      for (let i = 0; i < rowsToInsert.length; i += 50) {
        await supabaseInsertMany(
          env,
          "pending_notifications",
          rowsToInsert.slice(i, i + 50)
        );
      }

      enqueued += rowsToInsert.length;
    } catch (err) {
      failed += 1;
      if (failed_samples.length < 5) {
        failed_samples.push({
          user_id: userId,
          reason: "bulk_enqueue_failed",
          message: err?.message || "No se pudieron encolar alertas"
        });
      }
    }
  }

  return {
    ok: true,
    mode: "queue_sweep",
    total_users: allUserIds.length,
    users_selected: userIdsToProcess.length,
    processed_users: processedUsers,
    enqueued,
    skipped,
    failed,
    failed_samples
  };
}
__name(runEmailAlertsQueueSweep, "runEmailAlertsQueueSweep");

__name(runEmailAlertsSweep, "runEmailAlertsSweep");
function parseWhatsAppBodyParameters(raw) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((item) => ({ type: "text", text: String(item ?? "").trim() })).filter((item) => item.text);
  } catch {
    return [];
  }
}
__name(parseWhatsAppBodyParameters, "parseWhatsAppBodyParameters");
async function runWhatsAppAlertsSweep(env, options = {}) {
  return {
    ok: true,
    skipped: true,
    reason: "query_mode_only",
    source: options.source || "manual"
  };
}
__name(runWhatsAppAlertsSweep, "runWhatsAppAlertsSweep");
async function loadRecentSentWhatsAppAlertKeys(env, userId) {
  const limit = clampInt(
    env.WHATSAPP_ALERT_LOG_LOOKBACK,
    20,
    1e3,
    WHATSAPP_ALERT_LOG_LOOKBACK
  );
  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?user_id=eq.${encodeURIComponent(userId)}&channel=eq.whatsapp&select=payload,status,created_at&order=created_at.desc&limit=${limit}`
  ).catch(() => []);
  const keys = /* @__PURE__ */ new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (!status.startsWith("sent_")) continue;
    const key = String(row?.payload?.alert_key || "").trim();
    if (key) keys.add(key);
  }
  return keys;
}
__name(loadRecentSentWhatsAppAlertKeys, "loadRecentSentWhatsAppAlertKeys");
function buildWhatsAppAlertKey(userId, alertItem) {
  const sourceKey = String(
    alertItem?.source_offer_key || alertItem?.iddetalle || alertItem?.idoferta || ""
  ).trim();
  return sourceKey ? `${String(userId || "").trim()}:${sourceKey}` : "";
}
__name(buildWhatsAppAlertKey, "buildWhatsAppAlertKey");
function buildWhatsAppAlertBodyParameters(alertItem) {
  const values = [
    alertItem?.cargo || alertItem?.area || "Oferta APD",
    alertItem?.distrito || "-",
    alertItem?.escuela || "Sin escuela",
    alertItem?.finoferta_label || formatearFechaAbc(alertItem?.finoferta || "", "datetime") || "-"
  ];
  return values.map((value) => ({
    type: "text",
    text: String(value || "").trim() || "-"
  }));
}
__name(buildWhatsAppAlertBodyParameters, "buildWhatsAppAlertBodyParameters");
async function sendWhatsAppAlertForUser(env, user, alertItem, options = {}) {
  const templateName = String(options.templateName || env.WHATSAPP_TEMPLATE_ALERTA || "").trim();
  const templateLang = String(options.templateLang || env.WHATSAPP_TEMPLATE_LANG || "en_US").trim();
  const alertKey = buildWhatsAppAlertKey(user?.id, alertItem);
  const destinations = whatsappTestDestinations(user?.celular || "");
  const logBase = {
    user_id: user?.id || null,
    channel: "whatsapp",
    template_code: templateName,
    destination: destinations[0] || null,
    provider_message_id: null,
    payload: {
      alert_key: alertKey || null,
      source: options.source || "cron",
      alert: {
        source_offer_key: alertItem?.source_offer_key || null,
        iddetalle: alertItem?.iddetalle || null,
        idoferta: alertItem?.idoferta || null,
        distrito: alertItem?.distrito || "",
        cargo: alertItem?.cargo || "",
        escuela: alertItem?.escuela || "",
        finoferta_label: alertItem?.finoferta_label || ""
      }
    }
  };
  if (!destinations.length || !templateName) {
    await supabaseInsert(env, "notification_delivery_logs", {
      ...logBase,
      status: "failed_alert",
      provider_response: { message: "No hay destino o plantilla valida para despachar la alerta" }
    }).catch(() => null);
    return { ok: false, reason: "missing_destination_or_template", alert_key: alertKey };
  }
  const bodyParameters = buildWhatsAppAlertBodyParameters(alertItem);
  let destination = destinations[0];
  let payload = null;
  let response = null;
  let data = null;
  for (const candidate of destinations) {
    destination = candidate;
    payload = buildWhatsAppTemplatePayload(candidate, templateName, templateLang, bodyParameters);
    const result = await sendWhatsAppTemplate(env, payload);
    response = result.response;
    data = result.data;
    if (response.ok || !isMetaAllowedListError(data)) {
      break;
    }
  }
  await supabaseInsert(env, "notification_delivery_logs", {
    ...logBase,
    destination,
    status: response?.ok ? "sent_alert" : "failed_alert",
    provider_message_id: data?.messages?.[0]?.id || null,
    payload: {
      ...logBase.payload,
      request: payload
    },
    provider_response: data
  }).catch(() => null);
  return {
    ok: !!response?.ok,
    alert_key: alertKey,
    destination,
    provider_response: data
  };
}
__name(sendWhatsAppAlertForUser, "sendWhatsAppAlertForUser");
async function handleImportarCatalogoCargos(url, env) {
  const totalPaginas = 232;
  const desde = clampInt(url.searchParams.get("desde"), 1, totalPaginas, 1);
  const hasta = clampInt(url.searchParams.get("hasta"), desde, totalPaginas, Math.min(desde + 9, totalPaginas));
  let totalInsertados = 0;
  const debug = [];
  for (let pagina = desde; pagina <= hasta; pagina += 1) {
    const paginaUrl = `https://servicios.abc.gov.ar/servaddo/cargos.areas/?page=${pagina}`;
    const res = await fetch(paginaUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`ABC pagina ${pagina} respondio ${res.status}: ${txt.slice(0, 300)}`);
    }
    const html = await res.text();
    const items = parsearCargosDesdeHTML(html);
    debug.push({ pagina, encontrados: items.length });
    if (!items.length) {
      await sleep(100);
      continue;
    }
    for (let i = 0; i < items.length; i += 100) {
      await supabaseUpsert(env, "catalogo_cargos_areas", items.slice(i, i + 100), "nombre_norm");
    }
    totalInsertados += items.length;
    await sleep(100);
  }
  return json({
    ok: true,
    rango: { desde, hasta },
    total_insertados: totalInsertados,
    debug
  });
}
__name(handleImportarCatalogoCargos, "handleImportarCatalogoCargos");
async function runProvinciaBackfillStep(env, options = {}) {
  const state = await obtenerScanState(env);
  const staleRunning = isStaleProvinciaBackfill(state);
  if (state.status === "running" && options.force !== true && !staleRunning) {
    return { ok: true, skipped: true, reason: "already_running" };
  }
  const catalogRows = await obtenerDistritosProvincia(env);
  const distritos = unique(
    catalogRows.map((row) => norm(row.apd_nombre || row.nombre || "")).filter(Boolean)
  );
  if (!distritos.length) {
    throw new Error("No hay catalogo de distritos para el backfill provincial");
  }
  let districtIndex = clampInt(state.district_index, 0, Math.max(distritos.length - 1, 0), 0);
  let nextPage = clampInt(state.next_page, 0, 999999, 0);
  let pagesProcessed = Number(state.pages_processed || 0);
  let districtsCompleted = Number(state.districts_completed || 0);
  let offersProcessed = Number(state.offers_processed || 0);
  const startedAt = state.started_at || (/* @__PURE__ */ new Date()).toISOString();
  const districtName = distritos[districtIndex];
  await saveScanState(env, {
    ...state,
    scope: PROVINCIA_SCOPE,
    status: "running",
    district_index: districtIndex,
    district_name: districtName,
    next_page: nextPage,
    total_districts: distritos.length,
    started_at: startedAt,
    finished_at: null,
    last_run_at: (/* @__PURE__ */ new Date()).toISOString(),
    notes: {
      ...state.notes || {},
      retryable: false,
      last_error: null,
      failed_page: 0
    }
  });
  try {
    const batchInfo = await fetchAPDDistrictBatch(
      districtName,
      nextPage,
      PROVINCIA_STEP_PAGES,
      PROVINCIA_CAPTURE_ROWS_PER_PAGE
    );
    const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
    const rows = batchInfo.docs.map((doc) => buildGlobalSnapshotRow(doc, capturedAt));
    const currentMap = await loadCurrentRowsMap(env, rows.map((row) => row.source_offer_key));
    const currentRows = rows.map((row) => buildGlobalCurrentRow(row, currentMap.get(row.source_offer_key), capturedAt));
    if (rows.length) {
      for (let i = 0; i < rows.length; i += HISTORICO_INSERT_BATCH) {
        await supabaseInsertMany(
          env,
          "apd_ofertas_global_snapshots",
          rows.slice(i, i + HISTORICO_INSERT_BATCH)
        );
      }
      for (let i = 0; i < currentRows.length; i += HISTORICO_INSERT_BATCH) {
        await supabaseUpsert(
          env,
          "apd_ofertas_global_current",
          currentRows.slice(i, i + HISTORICO_INSERT_BATCH),
          "source_offer_key"
        );
      }
    }
    pagesProcessed += batchInfo.pagesRead;
    offersProcessed += rows.length;
    if (batchInfo.hasMore) {
      nextPage += batchInfo.pagesRead;
    } else {
      districtIndex += 1;
      districtsCompleted += 1;
      nextPage = 0;
    }
    const finished = districtIndex >= distritos.length;
    await saveScanState(env, {
      ...state,
      scope: PROVINCIA_SCOPE,
      status: finished ? "finished" : "idle",
      district_index: finished ? distritos.length : districtIndex,
      district_name: finished ? null : distritos[districtIndex] || null,
      next_page: nextPage,
      pages_processed: pagesProcessed,
      districts_completed: districtsCompleted,
      offers_processed: offersProcessed,
      last_batch_count: rows.length,
      total_districts: distritos.length,
      started_at: startedAt,
      finished_at: finished ? (/* @__PURE__ */ new Date()).toISOString() : null,
      last_run_at: (/* @__PURE__ */ new Date()).toISOString(),
      notes: {
        ...state.notes || {},
        retryable: false,
        last_error: null,
        failed_page: 0,
        initial_backfill_completed: finished
      }
    });
    return {
      ok: true,
      finished,
      district_name: districtName,
      next_district_name: finished ? null : distritos[districtIndex] || null,
      next_page: nextPage,
      pages_processed: pagesProcessed,
      districts_completed: districtsCompleted,
      offers_processed: offersProcessed,
      last_batch_count: rows.length,
      total_districts: distritos.length
    };
  } catch (err) {
    await saveScanState(env, {
      ...state,
      scope: PROVINCIA_SCOPE,
      status: "error",
      district_index: districtIndex,
      district_name: districtName,
      next_page: nextPage,
      pages_processed: pagesProcessed,
      districts_completed: districtsCompleted,
      offers_processed: offersProcessed,
      last_batch_count: 0,
      total_districts: distritos.length,
      started_at: startedAt,
      finished_at: null,
      last_run_at: (/* @__PURE__ */ new Date()).toISOString(),
      notes: {
        ...state.notes || {},
        retryable: false,
        last_error: err?.message || "Error en backfill provincial",
        failed_page: nextPage
      }
    });
    throw err;
  }
}
__name(runProvinciaBackfillStep, "runProvinciaBackfillStep");
async function fetchHistoricoRowsByDistritos(env, table, distritos, days, limit = 8e3) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
  const filters = distritos.map((item) => `distrito.eq.${encodeURIComponent(item)}`).join(",");
  const rows = await supabaseSelect(
    env,
    `${table}?captured_at=gte.${encodeURIComponent(sinceIso)}&select=iddetalle,idoferta,source_offer_key,estado,distrito,escuela,cargo,area,nivel_modalidad,turno,jornada,hsmodulos,cursodivision,finoferta,total_postulantes,puntaje_primero,listado_origen_primero,captured_at&or=(${filters})&order=captured_at.desc&limit=${limit}`
  ).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
__name(fetchHistoricoRowsByDistritos, "fetchHistoricoRowsByDistritos");
function buildHistoricoResumenPayload(rows, days) {
  const groupedRows = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = historicoRowKey(row);
    if (!key) continue;
    if (!groupedRows.has(key)) groupedRows.set(key, []);
    groupedRows.get(key).push(row);
  }
  const latestRows = [];
  const firstSeenRows = [];
  const cambios = [];
  for (const series of groupedRows.values()) {
    series.sort(sortHistoricoDesc);
    const latest = series[0];
    const previous = series[1] || null;
    const first = series[series.length - 1];
    latestRows.push(latest);
    firstSeenRows.push(first);
    if (previous && estadoHistoricoKey(latest) !== estadoHistoricoKey(previous)) {
      cambios.push({
        iddetalle: latest.iddetalle || null,
        idoferta: latest.idoferta || null,
        distrito: latest.distrito || "",
        cargo: latest.cargo || "",
        area: latest.area || "",
        escuela: latest.escuela || "",
        turno: mapTurnoAPD(latest.turno || ""),
        finoferta: latest.finoferta || "",
        estado_anterior: estadoHistoricoLabel(previous),
        estado_actual: estadoHistoricoLabel(latest),
        captured_at: latest.captured_at || null
      });
    }
  }
  latestRows.sort(sortHistoricoDesc);
  cambios.sort(sortHistoricoDesc);
  const activeRows = latestRows.filter(ofertaHistoricaActiva);
  const nowTs = Date.now();
  const nuevas7d = firstSeenRows.filter((row) => {
    const ts = parseFechaFlexible(row.captured_at)?.getTime() || 0;
    return ts >= nowTs - 7 * 24 * 60 * 60 * 1e3;
  }).length;
  const cierran72h = activeRows.filter((row) => {
    const fin = parseFechaFlexible(row.finoferta)?.getTime() || 0;
    return fin && fin >= nowTs && fin <= nowTs + 72 * 60 * 60 * 1e3;
  }).length;
  return {
    ok: true,
    empty: false,
    ventana_dias: days,
    ultima_captura: latestRows[0]?.captured_at || null,
    capturas_filtradas: rows.length,
    ofertas_unicas: latestRows.length,
    activas_estimadas: activeRows.length,
    designadas_estimadas: latestRows.filter((row) => estadoHistoricoKey(row) === "DESIGNADA").length,
    anuladas_estimadas: latestRows.filter((row) => estadoHistoricoKey(row) === "ANULADA").length,
    desiertas_estimadas: latestRows.filter((row) => estadoHistoricoKey(row) === "DESIERTA").length,
    nuevas_7d: nuevas7d,
    cierran_72h: cierran72h,
    cambios_estado_recientes: cambios.length,
    promedio_postulantes: promedioNumerico(latestRows.map((row) => row.total_postulantes), 1),
    promedio_puntaje_primero: promedioNumerico(latestRows.map((row) => row.puntaje_primero), 2),
    top_distritos: topCountItems(latestRows.map((row) => row.distrito), 4),
    top_cargos: topCountItems(latestRows.map(tituloHistoricoRow), 5),
    top_turnos: topCountItems(activeRows.map((row) => mapTurnoAPD(row.turno || "")), 4),
    top_escuelas: topCountItems(latestRows.map((row) => row.escuela), 5),
    ultimos_cambios: cambios.slice(0, 6),
    ultimas_ofertas: latestRows.slice(0, 6).map((row) => ({
      iddetalle: row.iddetalle || null,
      idoferta: row.idoferta || null,
      distrito: row.distrito || "",
      cargo: row.cargo || "",
      area: row.area || "",
      escuela: row.escuela || "",
      turno: mapTurnoAPD(row.turno || ""),
      finoferta: row.finoferta || "",
      estado: estadoHistoricoLabel(row),
      total_postulantes: row.total_postulantes != null ? Number(row.total_postulantes) : null,
      puntaje_primero: row.puntaje_primero != null ? Number(row.puntaje_primero) : null,
      captured_at: row.captured_at || null
    }))
  };
}
__name(buildHistoricoResumenPayload, "buildHistoricoResumenPayload");
function emptyHistoricoPayload(days, message) {
  return {
    ok: true,
    empty: true,
    message,
    ventana_dias: days,
    ultima_captura: null,
    capturas_filtradas: 0,
    ofertas_unicas: 0,
    activas_estimadas: 0,
    designadas_estimadas: 0,
    anuladas_estimadas: 0,
    desiertas_estimadas: 0,
    nuevas_7d: 0,
    cierran_72h: 0,
    cambios_estado_recientes: 0,
    promedio_postulantes: null,
    promedio_puntaje_primero: null,
    top_distritos: [],
    top_cargos: [],
    top_turnos: [],
    top_escuelas: [],
    ultimos_cambios: [],
    ultimas_ofertas: []
  };
}
__name(emptyHistoricoPayload, "emptyHistoricoPayload");
async function fetchProvinciaCurrentRows(env, days) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
  const rows = await supabaseSelect(
    env,
    `apd_ofertas_global_current?last_seen_at=gte.${encodeURIComponent(sinceIso)}&select=source_offer_key,idoferta,iddetalle,estado,distrito,escuela,cargo,area,nivel_modalidad,turno,jornada,hsmodulos,cursodivision,supl_desde,supl_hasta,finoferta,ult_movimiento,first_seen_at,last_seen_at,last_state_change_at,times_seen,state_changes&order=last_seen_at.desc&limit=${PROVINCIA_SUMMARY_LIMIT}`
  ).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
__name(fetchProvinciaCurrentRows, "fetchProvinciaCurrentRows");
function buildProvinciaResumenPayload(rows, days, state) {
  const activeRows = rows.filter(ofertaHistoricaActiva);
  const closedRows = rows.filter((row) => !ofertaHistoricaActiva(row));
  const nowTs = Date.now();
  const districtsWithActivity = unique(activeRows.map((row) => row.distrito).filter(Boolean)).length;
  const coverageHint = buildProvinciaCoverageHint(state, districtsWithActivity, activeRows);
  return {
    ok: true,
    empty: rows.length === 0,
    ventana_dias: days,
    total_ofertas: rows.length,
    activas_estimadas: activeRows.length,
    cerradas_estimadas: closedRows.length,
    districts_with_activity: districtsWithActivity,
    coverage_hint: coverageHint,
    nuevas_7d: rows.filter((row) => {
      const ts = parseFechaFlexible(row.first_seen_at)?.getTime() || 0;
      return ts >= nowTs - 7 * 24 * 60 * 60 * 1e3;
    }).length,
    top_distritos: topCountItems(activeRows.map((row) => row.distrito), 8),
    top_cargos: topCountItems(activeRows.map(tituloHistoricoRow), 8),
    top_turnos: topCountItems(activeRows.map((row) => mapTurnoAPD(row.turno || "")), 5),
    top_escuelas: topCountItems(activeRows.map((row) => row.escuela), 6),
    state_breakdown: {
      activas: activeRows.length,
      designadas: rows.filter((row) => estadoHistoricoKey(row) === "DESIGNADA").length,
      anuladas: rows.filter((row) => estadoHistoricoKey(row) === "ANULADA").length,
      desiertas: rows.filter((row) => estadoHistoricoKey(row) === "DESIERTA").length,
      cerradas: rows.filter((row) => estadoHistoricoKey(row) === "CERRADA").length
    },
    leaders: {
      matematica: findSubjectLeader(activeRows, ["MATEMATICA"]),
      ingles: findSubjectLeader(activeRows, ["INGLES"])
    },
    latest_rows: rows.slice(0, 8).map((row) => ({
      distrito: row.distrito || "",
      cargo: row.cargo || "",
      area: row.area || "",
      escuela: row.escuela || "",
      estado: estadoHistoricoLabel(row),
      turno: mapTurnoAPD(row.turno || ""),
      last_seen_at: row.last_seen_at || null
    })),
    banner_items: buildProvincialInsightCards(rows, activeRows, closedRows, state),
    scan_state: state ? {
      status: state.status || "idle",
      district_index: state.district_index || 0,
      districts_completed: state.districts_completed || 0,
      total_districts: state.total_districts || 0,
      offers_processed: Number(state.offers_processed || 0),
      last_run_at: state.last_run_at || null
    } : null
  };
}
__name(buildProvinciaResumenPayload, "buildProvinciaResumenPayload");
function buildProvincialInsightCards(rows, activeRows, closedRows, state) {
  const items = [];
  const seenTexts = /* @__PURE__ */ new Set();
  const rankedDistricts = topCountItems(activeRows.map((row) => row.distrito), 5);
  const rankedCargos = topCountItems(activeRows.map(tituloHistoricoRow), 4);
  const rankedTurnos = topCountItems(activeRows.map((row) => mapTurnoAPD(row.turno || "")), 3);
  const rankedSchools = topCountItems(activeRows.map((row) => row.escuela), 3);
  const matem = findSubjectLeader(activeRows, ["MATEMATICA"]);
  const ingles = findSubjectLeader(activeRows, ["INGLES"]);
  function pushCard(title, text, tone) {
    const cleanText = String(text || "").trim();
    if (!cleanText || seenTexts.has(cleanText)) return;
    seenTexts.add(cleanText);
    items.push({ title, text: cleanText, tone });
  }
  __name(pushCard, "pushCard");
  if (rankedDistricts[0]) {
    pushCard(
      "Distrito con mas movimiento",
      `${rankedDistricts[0].label} lidera el corte provincial con ${rankedDistricts[0].value} ofertas activas.`,
      "blue"
    );
  }
  if (rankedDistricts[1]) {
    pushCard(
      "Segundo foco distrital",
      `${rankedDistricts[1].label} ya aparece como otro foco fuerte con ${rankedDistricts[1].value} publicaciones activas.`,
      "green"
    );
  }
  if (rankedDistricts[2]) {
    pushCard(
      "Tercer distrito en radar",
      `${rankedDistricts[2].label} tambien empieza a asomar en el historico provincial reciente.`,
      "neutral"
    );
  }
  if (matem) {
    pushCard(
      "Radar de Matematica",
      `Matematica se mueve mas en ${matem.label} con ${matem.value} publicaciones activas.`,
      "green"
    );
  }
  if (ingles) {
    pushCard(
      "Radar de Ingles",
      `Ingles aparece con mas fuerza en ${ingles.label} dentro del historial provincial disponible.`,
      "blue"
    );
  }
  if (rankedCargos[0]) {
    pushCard(
      "Cargo o area dominante",
      `${rankedCargos[0].label} es lo mas repetido dentro de las ofertas activas actuales.`,
      "neutral"
    );
  }
  if (rankedSchools[0]) {
    pushCard(
      "Escuela que mas aparece",
      `${rankedSchools[0].label} es la institucion mas repetida en el radar activo de este corte.`,
      "blue"
    );
  }
  if (rankedTurnos[0]) {
    pushCard(
      "Turno dominante",
      `${rankedTurnos[0].label} es el turno con mas actividad dentro del radar provincial.`,
      "blue"
    );
  }
  if (closedRows.length) {
    pushCard(
      "Cierres observados",
      `${closedRows.length} ofertas ya no estan activas en el ultimo estado conocido.`,
      "red"
    );
  }
  if (rankedDistricts.length <= 1) {
    const partialDistricts = Math.max(0, Number(state?.districts_completed || 0));
    const totalDistricts = Math.max(0, Number(state?.total_districts || 0));
    if (rankedDistricts[0] && totalDistricts && partialDistricts < totalDistricts) {
      pushCard(
        "Cobertura del backfill",
        `Por ahora el radar visible esta muy dominado por ${rankedDistricts[0].label} porque el backfill provincial todavia sigue recorriendo otros distritos.`,
        "neutral"
      );
    }
  }
  if (!items.length) {
    pushCard(
      "Radar provincial",
      "Todavia no hay suficiente historial provincial para construir insights serios.",
      "neutral"
    );
  }
  return items.slice(0, 8);
}
__name(buildProvincialInsightCards, "buildProvincialInsightCards");
function findSubjectLeader(rows, keywords) {
  const subset = rows.filter((row) => {
    const title = norm(`${row.cargo || ""} ${row.area || ""}`);
    return keywords.some((keyword) => title.includes(norm(keyword)));
  });
  return topCountItems(subset.map((row) => row.distrito), 1)[0] || null;
}
__name(findSubjectLeader, "findSubjectLeader");
function buildProvinciaCoverageHint(state, districtsWithActivity, activeRows) {
  const rankedDistricts = topCountItems(activeRows.map((row) => row.distrito), 2);
  const topDistrict = rankedDistricts[0]?.label || null;
  const completed = Number(state?.districts_completed || 0);
  const total = Number(state?.total_districts || 0);
  if (districtsWithActivity <= 1 && topDistrict && total && completed < total) {
    return `Hoy el radar visible esta muy concentrado en ${topDistrict} porque el backfill provincial todavia no termino de cubrir el resto de los distritos.`;
  }
  if (districtsWithActivity >= 3) {
    return `El radar ya tiene actividad visible en ${districtsWithActivity} distritos, asi que la rotacion va a mostrar comparaciones mas variadas.`;
  }
  return null;
}
__name(buildProvinciaCoverageHint, "buildProvinciaCoverageHint");
async function obtenerScanState(env) {
  const rows = await supabaseSelect(
    env,
    `apd_global_scan_state?scope=eq.${encodeURIComponent(PROVINCIA_SCOPE)}&select=*`
  ).catch(() => []);
  return rows?.[0] || {
    scope: PROVINCIA_SCOPE,
    status: "idle",
    mode: "backfill",
    district_index: 0,
    next_page: 0,
    pages_processed: 0,
    districts_completed: 0,
    offers_processed: 0,
    last_batch_count: 0,
    total_districts: 0
  };
}
__name(obtenerScanState, "obtenerScanState");
async function saveScanState(env, state) {
  await supabaseUpsert(
    env,
    "apd_global_scan_state",
    [
      {
        scope: PROVINCIA_SCOPE,
        status: state.status || "idle",
        mode: state.mode || "backfill",
        district_index: Number(state.district_index || 0),
        district_name: state.district_name || null,
        next_page: Number(state.next_page || 0),
        pages_processed: Number(state.pages_processed || 0),
        districts_completed: Number(state.districts_completed || 0),
        offers_processed: Number(state.offers_processed || 0),
        last_batch_count: Number(state.last_batch_count || 0),
        total_districts: Number(state.total_districts || 0),
        started_at: state.started_at || null,
        finished_at: state.finished_at || null,
        last_run_at: state.last_run_at || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        notes: state.notes || {}
      }
    ],
    "scope"
  );
}
__name(saveScanState, "saveScanState");
function isStaleProvinciaBackfill(state) {
  if (String(state?.status || "").trim().toLowerCase() !== "running") return false;
  const ts = parseFechaFlexible(state?.updated_at || state?.last_run_at)?.getTime() || 0;
  if (!ts) return false;
  return Date.now() - ts > PROVINCIA_RUNNING_STALE_MS;
}
__name(isStaleProvinciaBackfill, "isStaleProvinciaBackfill");
async function obtenerDistritosProvincia(env) {
  const rows = await supabaseSelect(
    env,
    "catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc"
  );
  return Array.isArray(rows) ? rows : [];
}
__name(obtenerDistritosProvincia, "obtenerDistritosProvincia");
async function fetchAPDDistrictBatch(distritoAPD, startPage, pagesToRead, rowsPerPage) {
  const docs = [];
  let pagesRead = 0;
  let hasMore = false;
  for (let offset = 0; offset < pagesToRead; offset += 1) {
    const pageIndex = startPage + offset;
    const start = pageIndex * rowsPerPage;
    const q = `descdistrito:"${escaparSolr(distritoAPD)}"`;
    const url = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${rowsPerPage}&start=${start}&wt=json&sort=ult_movimiento%20desc`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`APD respondio ${res.status}: ${txt}`);
    }
    const data = await res.json();
    const pageDocs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    const filtered = pageDocs.filter((doc) => norm(doc?.descdistrito || "") === norm(distritoAPD));
    docs.push(...filtered);
    pagesRead += 1;
    if (pageDocs.length < rowsPerPage) {
      hasMore = false;
      break;
    }
    hasMore = true;
  }
  return { docs, pagesRead, hasMore };
}
__name(fetchAPDDistrictBatch, "fetchAPDDistrictBatch");
function buildGlobalSnapshotRow(oferta, capturedAt) {
  return {
    source_offer_key: buildSourceOfferKeyFromOferta(oferta),
    idoferta: oferta.idoferta || null,
    iddetalle: oferta.iddetalle || oferta.id || null,
    estado: oferta.estado || "",
    distrito: norm(oferta.descdistrito || ""),
    escuela: oferta.escuela || oferta.nombreestablecimiento || "",
    cargo: oferta.descripcioncargo || oferta.cargo || "",
    area: oferta.descripcionarea || "",
    nivel_modalidad: oferta.descnivelmodalidad || "",
    turno: mapTurnoAPD(oferta.turno || ""),
    jornada: oferta.jornada || "",
    hsmodulos: oferta.hsmodulos || oferta.modulos || "",
    cursodivision: normalizarCursoDivisionServidor(oferta.cursodivision || ""),
    supl_desde: oferta.supl_desde || "",
    supl_hasta: oferta.supl_hasta || "",
    finoferta: oferta.finoferta || "",
    ult_movimiento: oferta.ult_movimiento || "",
    raw: oferta,
    captured_at: capturedAt
  };
}
__name(buildGlobalSnapshotRow, "buildGlobalSnapshotRow");
async function loadCurrentRowsMap(env, keys) {
  const map = /* @__PURE__ */ new Map();
  const uniqueKeys = unique(keys).filter(Boolean);
  for (let i = 0; i < uniqueKeys.length; i += 70) {
    const slice = uniqueKeys.slice(i, i + 70);
    const filters = slice.map((key) => `source_offer_key.eq.${encodeURIComponent(key)}`).join(",");
    const rows = await supabaseSelect(
      env,
      `apd_ofertas_global_current?select=source_offer_key,estado,first_seen_at,last_seen_at,last_state_change_at,times_seen,state_changes&or=(${filters})`
    ).catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      map.set(row.source_offer_key, row);
    }
  }
  return map;
}
__name(loadCurrentRowsMap, "loadCurrentRowsMap");
function buildGlobalCurrentRow(snapshotRow, prevRow, capturedAt) {
  const prevState = prevRow ? estadoHistoricoKey(prevRow.estado) : estadoHistoricoKey(snapshotRow.estado);
  const nextState = estadoHistoricoKey(snapshotRow.estado);
  const stateChanged = !!prevRow && prevState !== nextState;
  return {
    source_offer_key: snapshotRow.source_offer_key,
    idoferta: snapshotRow.idoferta,
    iddetalle: snapshotRow.iddetalle,
    estado: snapshotRow.estado,
    distrito: snapshotRow.distrito,
    escuela: snapshotRow.escuela,
    cargo: snapshotRow.cargo,
    area: snapshotRow.area,
    nivel_modalidad: snapshotRow.nivel_modalidad,
    turno: snapshotRow.turno,
    jornada: snapshotRow.jornada,
    hsmodulos: snapshotRow.hsmodulos,
    cursodivision: snapshotRow.cursodivision,
    supl_desde: snapshotRow.supl_desde,
    supl_hasta: snapshotRow.supl_hasta,
    finoferta: snapshotRow.finoferta,
    ult_movimiento: snapshotRow.ult_movimiento,
    first_seen_at: prevRow?.first_seen_at || capturedAt,
    last_seen_at: capturedAt,
    last_state_change_at: stateChanged ? capturedAt : prevRow?.last_state_change_at || prevRow?.last_seen_at || capturedAt,
    times_seen: prevRow ? Number(prevRow.times_seen || 0) + 1 : 1,
    state_changes: prevRow ? Number(prevRow.state_changes || 0) + (stateChanged ? 1 : 0) : 0,
    raw: snapshotRow.raw,
    updated_at: capturedAt
  };
}
__name(buildGlobalCurrentRow, "buildGlobalCurrentRow");
async function buildHistoricoCaptureRows(oferta, capturedAt, includePostulantes) {
  const item = buildAlertItem(oferta, { detalle: {} });
  let resumen = {
    total_postulantes: null,
    puntaje_primero: null,
    listado_origen_primero: ""
  };
  let postRow = null;
  let errorPostulantes = false;
  if (includePostulantes && (item.idoferta || item.iddetalle)) {
    try {
      resumen = await obtenerResumenPostulantesABC(item.idoferta, item.iddetalle);
      postRow = {
        idoferta: item.idoferta || null,
        iddetalle: item.iddetalle || null,
        source_offer_key: buildSourceOfferKeyFromOferta(oferta),
        total_postulantes: resumen.total_postulantes ?? null,
        puntaje_primero: resumen.puntaje_primero ?? null,
        listado_origen_primero: resumen.listado_origen_primero || "",
        raw: {
          distrito: item.distrito || "",
          cargo: item.cargo || "",
          area: item.area || "",
          escuela: item.escuela || ""
        },
        captured_at: capturedAt
      };
    } catch {
      errorPostulantes = true;
    }
  }
  return {
    ofertaRow: {
      idoferta: item.idoferta || null,
      iddetalle: item.iddetalle || null,
      source_offer_key: buildSourceOfferKeyFromOferta(oferta),
      estado: oferta.estado || "",
      distrito: item.distrito || "",
      escuela: item.escuela || "",
      cargo: item.cargo || "",
      area: item.area || "",
      nivel_modalidad: item.nivel_modalidad || "",
      turno: item.turno || "",
      jornada: item.jornada || "",
      hsmodulos: item.hsmodulos || "",
      cursodivision: item.cursodivision || "",
      supl_desde: item.supl_desde || "",
      supl_hasta: item.supl_hasta || "",
      finoferta: item.finoferta || "",
      total_postulantes: resumen.total_postulantes ?? null,
      puntaje_primero: resumen.puntaje_primero ?? null,
      listado_origen_primero: resumen.listado_origen_primero || "",
      raw: oferta,
      captured_at: capturedAt
    },
    postRow,
    errorPostulantes
  };
}
__name(buildHistoricoCaptureRows, "buildHistoricoCaptureRows");
async function construirAlertasParaUsuario(env, userId) {
  const user = await obtenerUsuario(env, userId);
  if (!user) return { ok: false, message: "Usuario no encontrado" };
  if (!user.activo) return { ok: false, message: "Usuario inactivo" };

  const prefs = await obtenerPreferenciasUsuario(env, userId);
  if (!prefs || !prefs.alertas_activas) {
    return {
      ok: true,
      user,
      preferencias_originales: prefs,
      preferencias_canonizadas: prefs,
      total_fuente: 0,
      total: 0,
      descartadas_total: 0,
      descartadas_preview: [],
      debug_distritos: [],
      resultados: [],
      pid: {
        found: false,
        listado: "",
        anio: "",
        total_rows: 0,
        distritos_solicitados: []
      }
    };
  }

  const resolvedPlan = await resolverPlanUsuario(env, userId).catch(() => null);
  const planCode = String(
    resolvedPlan?.plan?.code ||
    resolvedPlan?.subscription?.plan_code ||
    ""
  ).trim().toUpperCase();

  const pidEnabled = planCode === "INSIGNE";

  const catalogos = await cargarCatalogos(env);
  const districtIndex = buildDistrictIndex(catalogos);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const { ofertas, debugDistritos } = await traerOfertasAPDPorDistritos(prefsCanon);

  const ultimaPid = pidEnabled
    ? await obtenerUltimaPidGuardada(userId).catch(() => null)
    : null;

  const pidRows = pidEnabled ? normalizePidRows(ultimaPid) : [];
  const pidDistricts = pidEnabled
    ? extractPidRequestedDistricts(ultimaPid, districtIndex)
    : [];

  const pidMeta =
    pidEnabled && ultimaPid
      ? {
          listado: String(ultimaPid?.listado || "").trim(),
          anio: String(ultimaPid?.anio || "").trim()
        }
      : null;

  const resultados = [];
  const descartadas = [];
  const vistos = new Set();

  for (const oferta of ofertas) {
    if (!ofertaEsVisibleParaAlerta(oferta)) {
      descartadas.push({
        iddetalle: oferta.iddetalle || oferta.id || null,
        motivo: "oferta_no_usable"
      });
      continue;
    }

    const estado = String(
      oferta?.estado ||
      oferta?.estado_oferta ||
      oferta?.estado_actual ||
      ""
    ).trim().toUpperCase();

    if ([
      "CERRADA",
      "FINALIZADA",
      "FINALIZADO",
      "VENCIDA",
      "VENCIDO",
      "ANULADA",
      "ANULADO",
      "DESIERTA",
      "DESIERTO",
      "DESIGNADA",
      "DESIGNADO",
      "NO VIGENTE"
    ].includes(estado)) {
      descartadas.push({
        iddetalle: oferta.iddetalle || oferta.id || null,
        motivo: "estado_no_vigente",
        estado
      });
      continue;
    }

    const cierre = parseFechaFlexible(
      oferta?.finoferta ||
      oferta?.fecha_cierre ||
      oferta?.fecha_cierre_raw ||
      oferta?.cierre ||
      ""
    );

    if (cierre && cierre.getTime() < Date.now()) {
      descartadas.push({
        iddetalle: oferta.iddetalle || oferta.id || null,
        motivo: "fecha_vencida",
        cierre: oferta?.finoferta || oferta?.fecha_cierre || oferta?.cierre || null
      });
      continue;
    }

    const clave = [
      buildSourceOfferKeyFromOferta(oferta),
      String(oferta?.cargo || "").trim().toUpperCase(),
      String(oferta?.escuela || "").trim().toUpperCase(),
      String(oferta?.cursodivision || oferta?.curso_division || "").trim().toUpperCase(),
      String(oferta?.turno || "").trim().toUpperCase()
    ].join("|");

    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const evaluacion = coincideOfertaConPreferenciasAPD(oferta, prefsCanon);

    const pidCheck = pidEnabled
      ? evaluatePidCompatibility(oferta, ultimaPid, pidRows, districtIndex)
      : null;

    const item = buildAlertItem(
      oferta,
      evaluacion,
      pidEnabled
        ? {
            ...pidCheck,
            meta: pidMeta
          }
        : null
    );

    if (evaluacion.match) {
      resultados.push(item);
    } else {
      descartadas.push({ ...item, motivo: "no_coincide_preferencias" });
    }
  }

  resultados.sort((a, b) => {
    const ta = parseFechaFlexible(a.finoferta)?.getTime() || 0;
    const tb = parseFechaFlexible(b.finoferta)?.getTime() || 0;
    return tb - ta;
  });

  return {
    ok: true,
    user,
    preferencias_originales: prefs,
    preferencias_canonizadas: prefsCanon,
    pid: pidEnabled
      ? (
          ultimaPid
            ? {
                found: true,
                listado: pidMeta?.listado || "",
                anio: pidMeta?.anio || "",
                total_rows: pidRows.length,
                distritos_solicitados: pidDistricts
              }
            : {
                found: false,
                listado: "",
                anio: "",
                total_rows: 0,
                distritos_solicitados: []
              }
        )
      : {
          found: false,
          listado: "",
          anio: "",
          total_rows: 0,
          distritos_solicitados: []
        },
    total_fuente: ofertas.length,
    total: resultados.length,
    descartadas_total: descartadas.length,
    descartadas_preview: descartadas.slice(0, 20),
    debug_distritos: debugDistritos,
    resultados
  };
}
const PID_STORAGE_WEBAPP =
  "https://script.google.com/macros/s/AKfycbxN1cKD8SWvYpFe0xZ-NZuDe0362NVbaTZuCVRq1EgnsB2ykFZYQd3EZnQxGLFpogs2Yg/exec";

async function postPidStorageFromMainWorker(payload) {
  const res = await fetch(PID_STORAGE_WEBAPP, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
      "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
      "User-Agent": "Mozilla/5.0 APDocentePBA PID Match"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let parsed = null;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`PID storage devolvió JSON inválido: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(parsed?.error || parsed?.message || `PID storage HTTP ${res.status}`);
  }

  return parsed;
}



function normalizePidAreaKey(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9/.-]/g, "")
    .trim();
}



function findPidMatchForOferta(oferta, pidRows) {
  const areaOferta = String(
    oferta?.descripcionarea ||
    oferta?.area ||
    oferta?.materia ||
    ""
  ).trim();

  const areaKey = normalizePidAreaKey(areaOferta);
  if (!areaKey || !Array.isArray(pidRows) || !pidRows.length) return null;

  let hit = pidRows.find(r => r.area_key === areaKey);
  if (hit) return hit;

  hit = pidRows.find(r => areaKey.includes(r.area_key) || r.area_key.includes(areaKey));
  if (hit) return hit;

  return null;
}
__name(construirAlertasParaUsuario, "construirAlertasParaUsuario");
function formatearDiasHorariosOferta(oferta) {
  const directo = String(
    oferta?.dias_horarios || oferta?.diashorarios || oferta?.horario || ""
  ).trim();
  if (directo) return directo;
  const dias = [
    ["Lunes", oferta?.lunes],
    ["Martes", oferta?.martes],
    ["Mi\xE9rcoles", oferta?.miercoles],
    ["Jueves", oferta?.jueves],
    ["Viernes", oferta?.viernes],
    ["S\xE1bado", oferta?.sabado]
  ].map(([dia, valor]) => [dia, String(valor || "").trim()]).filter(([, valor]) => !!valor);
  if (!dias.length) return "";
  const valoresUnicos = [...new Set(dias.map(([, valor]) => valor))];
  if (valoresUnicos.length === 1) {
    const mismoHorario = valoresUnicos[0];
    const nombres = dias.map(([dia]) => dia);
    const esLunAVie = nombres.length === 5 && nombres.join("|") === "Lunes|Martes|Mi\xE9rcoles|Jueves|Viernes";
    if (esLunAVie) {
      return `Lunes a Viernes: ${mismoHorario}`;
    }
    return `${nombres.join(", ")}: ${mismoHorario}`;
  }
  return dias.map(([dia, valor]) => `${dia}: ${valor}`).join(" \xB7 ");
}
__name(formatearDiasHorariosOferta, "formatearDiasHorariosOferta");
function resolverTipoRevistaOferta(oferta) {
  const revistaRaw = norm(
    oferta?.supl_revista || oferta?.revista || oferta?.situacion_revista || ""
  );
  if (revistaRaw === "S" || revistaRaw.includes("SUPLENCIA") || revistaRaw.includes("SUPL")) {
    return {
      codigo: "S",
      label: "Suplencia"
    };
  }
  if (revistaRaw === "P" || revistaRaw.includes("PROVISIONAL") || revistaRaw.includes("PROVIS")) {
    return {
      codigo: "P",
      label: "Provisional"
    };
  }
  const desde = String(oferta?.supl_desde || "").trim();
  const hasta = String(oferta?.supl_hasta || "").trim();
  const desdeReal = !!desde && !desde.includes("9999");
  const hastaReal = !!hasta && !hasta.includes("9999");
  return {
    codigo: "",
    label: desdeReal && hastaReal ? "Suplencia" : "Provisional"
  };
}
__name(resolverTipoRevistaOferta, "resolverTipoRevistaOferta");
const PID_DISTRICT_ALIAS_MAP = {
  "LA COSTA": "PARTIDO DE LA COSTA",
  "PARTIDO DE LA COSTA": "PARTIDO DE LA COSTA",
  "GENERAL SAN MARTIN": "GENERAL SAN MARTIN",
  "G SAN MARTIN": "GENERAL SAN MARTIN",
  "GRAL SAN MARTIN": "GENERAL SAN MARTIN",
  "SAN MARTIN": "GENERAL SAN MARTIN",
  "AVELLANEDA": "AVELLANEDA"
};



async function obtenerUltimaPidGuardada(userId) {
  const docenteId = String(userId || "").trim();
  if (!docenteId) return null;

  const data = await postPidStorageFromMainWorker({
    action: "obtener_ultima_pid_consulta",
    docente_id: docenteId
  }).catch(() => null);

  if (!data?.ok || !data?.found || !data?.result) return null;
  return data;
}

function normalizeDistrictForPid(value) {
  let v = norm(value || "");
  if (!v) return "";

  v = v.replace(/\(\d+\)/g, "").replace(/\s+/g, " ").trim();

  if (PID_DISTRICT_ALIAS_MAP[v]) return PID_DISTRICT_ALIAS_MAP[v];

  if (v.includes("PARTIDO DE LA COSTA")) return "PARTIDO DE LA COSTA";
  if (v.includes("LA COSTA")) return "PARTIDO DE LA COSTA";
  if (v.includes("GENERAL SAN MARTIN")) return "GENERAL SAN MARTIN";
  if (v.includes("G SAN MARTIN")) return "GENERAL SAN MARTIN";
  if (v.includes("GRAL SAN MARTIN")) return "GENERAL SAN MARTIN";
  if (v === "SAN MARTIN") return "GENERAL SAN MARTIN";
  if (v.includes("AVELLANEDA")) return "AVELLANEDA";

  return v;
}



function normalizePidAreaCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  if (/^\/?[A-Z0-9]{1,6}$/.test(raw)) {
    return raw;
  }

  const m = raw.match(/\((\/?[A-Z0-9]{1,6})\)/);
  return m ? m[1] : "";
}

function normalizePidAreaLabel(value) {
  return norm(String(value || "").replace(/\(\s*\/?[A-Z0-9]{1,6}\s*\)/g, " "));
}

function extractOfertaAreaIdentity(oferta) {
  const candidates = [
    oferta?.descripcionarea,
    oferta?.area,
    oferta?.materia,
    oferta?.descripcioncargo,
    oferta?.cargo,
    oferta?.raw?.descripcionarea,
    oferta?.raw?.area,
    oferta?.raw?.materia,
    oferta?.raw?.descripcioncargo,
    oferta?.raw?.cargo
  ];

  for (const value of candidates) {
    const code = normalizePidAreaCode(value);
    const label = normalizePidAreaLabel(value);

    if (code || label) {
      return { code, label };
    }
  }

  return { code: "", label: "" };
}

function categoriasPidBloque(value) {
  const t = norm(value);
  const out = new Set();
  if (!t) return out;

  if (t.includes("INICIAL")) out.add("INICIAL");
  if (t.includes("PRIMARIA") || t.includes("PRIMARIO")) out.add("PRIMARIO");
  if (t.includes("SECUNDARIA") || t.includes("SECUNDARIO")) out.add("SECUNDARIO");
  if (t.includes("SUPERIOR") || t.includes("FORMACION DOCENTE") || t.includes("DOCENTE")) out.add("SUPERIOR");
  if (t.includes("ESPECIAL")) out.add("EDUCACION ESPECIAL");
  if (t.includes("ADULTOS") || t.includes("CENS") || t.includes("JOVENES")) out.add("ADULTOS");
  if (t.includes("FISICA")) out.add("EDUCACION FISICA");
  if (t.includes("PSICOLOGIA") || t.includes("COMUNITARIA")) out.add("PSICOLOGIA");
  if (t.includes("ARTISTICA") || t.includes("ARTE")) out.add("EDUCACION ARTISTICA");
  if (t.includes("TECNICO") || t.includes("FORMACION PROFESIONAL")) out.add("TECNICO PROFESIONAL");

  return out;
}

function categoriasOfertaParaPid(oferta) {
  const texto = [
    oferta?.descnivelmodalidad,
    oferta?.nivel,
    oferta?.modalidad,
    oferta?.nivel_modalidad,
    oferta?.raw?.descnivelmodalidad,
    oferta?.raw?.nivel,
    oferta?.raw?.modalidad,
    oferta?.raw?.nivel_modalidad
  ].filter(Boolean).join(" ");

  return categoriasNivel(texto);
}

function setsIntersect(a, b) {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

function parsePidPuntaje(value) {
  let raw = String(value || "").trim();
  if (!raw) return null;

  raw = raw.replace(/\s+/g, "");

  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");

  if (hasDot && hasComma) {
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");

    if (lastComma > lastDot) {
      // 1.234,56
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56
      raw = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    // 38,10
    raw = raw.replace(",", ".");
  } else {
    // 38.10 -> queda como decimal
    // 1234 -> queda igual
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizePidRows(pidData) {
  const rows = Array.isArray(pidData?.result?.table_rows)
    ? pidData.result.table_rows
    : [];

  return rows
    .map(row => ({
      bloque: String(row?.bloque || "").trim(),
      area: String(row?.area || "").trim(),
      area_code: normalizePidAreaCode(row?.area || ""),
      area_label: normalizePidAreaLabel(row?.area || ""),
      puntaje_total: String(row?.puntaje_total || "").trim(),
      puntaje_total_num: parsePidPuntaje(row?.puntaje_total || "")
    }))
    .filter(row => row.bloque && (row.area_code || row.area_label));
}

function isPidAreaCompatible(ofertaIdentity, pidRow) {
  if (ofertaIdentity.code && pidRow.area_code) {
    return ofertaIdentity.code === pidRow.area_code;
  }

  if (ofertaIdentity.label && pidRow.area_label) {
    return ofertaIdentity.label === pidRow.area_label;
  }

  return false;
}

function isPidBlockCompatibleWithOferta(oferta, pidRow) {
  const catsOferta = categoriasOfertaParaPid(oferta);
  const catsPid = categoriasPidBloque(pidRow?.bloque || "");

  if (!catsOferta.size || !catsPid.size) return false;

  return setsIntersect(catsOferta, catsPid);
}
function normalizeDistrictText(value) {
  return norm(value || "")
    .replace(/\(\d+\)/g, " ")
    .replace(/[.,;:/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addDistrictVariant(set, value) {
  const v = normalizeDistrictText(value);
  if (v) set.add(v);
}

function buildDistrictVariants(officialName) {
  const set = new Set();
  const base = normalizeDistrictText(officialName);
  if (!base) return set;

  addDistrictVariant(set, base);

  // variantes genéricas
  addDistrictVariant(set, base.replace(/^PARTIDO DE /, ""));
  addDistrictVariant(set, base.replace(/^GRAL /, "GENERAL "));
  addDistrictVariant(set, base.replace(/^GENERAL /, "GRAL "));
  addDistrictVariant(set, base.replace(/^GENERAL /, "G "));
  addDistrictVariant(set, base.replace(/^PARTIDO DE LA /, "LA "));
  addDistrictVariant(set, base.replace(/^PARTIDO DE /, ""));
  addDistrictVariant(set, base.replace(/\bDOCTOR\b/g, "DR"));
  addDistrictVariant(set, base.replace(/\bDR\b/g, "DOCTOR"));

  return set;
}

function extractCatalogDistrictNames(catalogos) {
  const raw =
    catalogos?.distritos ||
    catalogos?.catalogo_distritos ||
    catalogos?.districts ||
    [];

  return raw
    .map(item =>
      String(
        item?.descdistrito ||
        item?.nombre ||
        item?.label ||
        item?.name ||
        item?.distrito ||
        ""
      ).trim()
    )
    .filter(Boolean);
}

function buildDistrictIndex(catalogos) {
  const names = extractCatalogDistrictNames(catalogos);
  const index = new Map();

  for (const official of names) {
    const variants = buildDistrictVariants(official);
    for (const variant of variants) {
      if (!index.has(variant)) {
        index.set(variant, official);
      }
    }
  }

  return index;
}

function resolveDistrictAgainstCatalog(value, districtIndex) {
  const normalized = normalizeDistrictText(value);
  if (!normalized) return "";

  if (districtIndex?.has(normalized)) {
    return districtIndex.get(normalized);
  }

  // intento extra: remover prefijos comunes y reintentar
  const fallbacks = [
    normalized.replace(/^PARTIDO DE /, ""),
    normalized.replace(/^GENERAL /, "GRAL "),
    normalized.replace(/^GRAL /, "GENERAL "),
    normalized.replace(/^GENERAL /, "G "),
    normalized.replace(/^PARTIDO DE LA /, "LA ")
  ].map(normalizeDistrictText);

  for (const fb of fallbacks) {
    if (fb && districtIndex?.has(fb)) {
      return districtIndex.get(fb);
    }
  }

  return normalized;
}

function extractPidRequestedDistricts(pidData, districtIndex) {
  const raw = String(
    pidData?.result?.distritos_solicitados ||
    pidData?.distritos_solicitados ||
    ""
  ).trim();

  if (!raw) return [];

  return unique(
    raw
      .split(/[;,|]/)
      .map(part => resolveDistrictAgainstCatalog(part, districtIndex))
      .filter(Boolean)
  );
}

function resolveOfertaDistrict(oferta, districtIndex) {
  return resolveDistrictAgainstCatalog(
    oferta?.descdistrito ||
    oferta?.distrito ||
    oferta?.raw?.descdistrito ||
    oferta?.raw?.distrito ||
    "",
    districtIndex
  );
}
function evaluatePidCompatibility(oferta, pidData, pidRows, districtIndex) {
  if (!pidData) {
    return {
      compatible: false,
      reason: "Sin PID guardada",
      district_ok: false,
      area_ok: false,
      bloque_ok: false,
      match: null,
      pid_distritos: []
    };
  }
  function getResidenciaBonus(oferta, pidData, districtIndex) {
  const ofertaDistrict = resolveOfertaDistrict(oferta, districtIndex);
  const residenciaDistrict = resolveDistrictAgainstCatalog(
    pidData?.result?.distrito_residencia ||
    pidData?.distrito_residencia ||
    "",
    districtIndex
  );

  if (!ofertaDistrict || !residenciaDistrict) {
    return {
      aplica: false,
      puntos: 0,
      distrito_residencia: residenciaDistrict || ""
    };
  }

  if (ofertaDistrict === residenciaDistrict) {
    return {
      aplica: true,
      puntos: 5,
      distrito_residencia: residenciaDistrict
    };
  }

  return {
    aplica: false,
    puntos: 0,
    distrito_residencia: residenciaDistrict
  };
}

  const offerDistrict = resolveOfertaDistrict(oferta, districtIndex);
  const pidDistricts = extractPidRequestedDistricts(pidData, districtIndex);

  if (offerDistrict && pidDistricts.length && !pidDistricts.includes(offerDistrict)) {
    return {
      compatible: false,
      reason: `No estás inscripto en ${offerDistrict}`,
      district_ok: false,
      area_ok: false,
      bloque_ok: false,
      match: null,
      pid_distritos: pidDistricts
    };
  }

  const ofertaIdentity = extractOfertaAreaIdentity(oferta);
  if (!ofertaIdentity.code && !ofertaIdentity.label) {
    return {
      compatible: false,
      reason: "La oferta no trae un ítem comparable con PID",
      district_ok: true,
      area_ok: false,
      bloque_ok: false,
      match: null,
      pid_distritos: pidDistricts
    };
  }

  const sameAreaRows = pidRows.filter(row => isPidAreaCompatible(ofertaIdentity, row));
  if (!sameAreaRows.length) {
    return {
      compatible: false,
      reason: "No tenés ese ítem en tu PID",
      district_ok: true,
      area_ok: false,
      bloque_ok: false,
      match: null,
      pid_distritos: pidDistricts
    };
  }

  const sameBlockRows = sameAreaRows.filter(row => isPidBlockCompatibleWithOferta(oferta, row));
  if (!sameBlockRows.length) {
    return {
      compatible: false,
      reason: "Tenés ese ítem, pero en otra rama o nivel",
      district_ok: true,
      area_ok: true,
      bloque_ok: false,
      match: null,
      pid_distritos: pidDistricts
    };
  }

 const best = sameBlockRows
  .slice()
  .sort((a, b) => (b.puntaje_total_num || -Infinity) - (a.puntaje_total_num || -Infinity))[0];

const residencia = getResidenciaBonus(oferta, pidData, districtIndex);
const puntajeBase = Number.isFinite(best?.puntaje_total_num) ? best.puntaje_total_num : null;
const puntajeFinal = Number.isFinite(puntajeBase)
  ? puntajeBase + residencia.puntos
  : null;

return {
  compatible: true,
  reason: residencia.aplica
    ? "Compatible con tu PID + bonus por distrito de residencia"
    : "Compatible con tu PID",
  district_ok: true,
  area_ok: true,
  bloque_ok: true,
  match: {
    ...best,
    puntaje_total_base_num: puntajeBase,
    puntaje_total_final_num: puntajeFinal,
    residencia_bonus_aplicado: residencia.aplica,
    residencia_bonus_puntos: residencia.puntos,
    distrito_residencia: residencia.distrito_residencia
  },
  pid_distritos: pidDistricts
};
}
function buildAlertItem(oferta, evaluacion, pidInfo = null) {
  const suplDesde = oferta.supl_desde || "";
  const suplHasta = oferta.supl_hasta || "";
  const finOferta = oferta.finoferta || "";

  const cargo = oferta.descripcioncargo || oferta.cargo || "";
  const materia = oferta.descripcionarea || oferta.area || "";
  const nivel = oferta.descnivelmodalidad || oferta.nivel || oferta.nivel_modalidad || "";
  const modulos = oferta.hsmodulos || oferta.modulos || "";

  const diasHorarios = formatearDiasHorariosOferta(oferta);
  const tipoRevista = resolverTipoRevistaOferta(oferta);

  const desdeLabel = formatearFechaAbc(suplDesde, "date") || suplDesde;
  const hastaLabel = formatearFechaAbc(suplHasta, "date") || suplHasta;
  const cierreLabel = formatearFechaAbc(finOferta, "datetime") || finOferta;

  const abcUrl = buildAbcPostulantesUrl(
    oferta.idoferta || "",
    oferta.iddetalle || oferta.id || ""
  );

  const pidMatch = pidInfo?.match || null;
  const pidMeta = pidInfo?.meta || null;

  return {
    source_offer_key: buildSourceOfferKeyFromOferta(oferta),
    iddetalle: oferta.iddetalle || oferta.id || null,
    idoferta: oferta.idoferta || null,

    distrito: norm(oferta.descdistrito || ""),
    cargo,
    materia,
    area: materia,

    turno: mapTurnoAPD(oferta.turno || ""),
    nivel_modalidad: nivel,
    nivel,
    modalidad: nivel,

    escuela: oferta.escuela || oferta.nombreestablecimiento || "",
    cursodivision: normalizarCursoDivisionServidor(oferta.cursodivision || ""),
    curso_division: normalizarCursoDivisionServidor(
      oferta.cursodivision || oferta.curso_division || ""
    ),

    jornada: oferta.jornada || "",
    hsmodulos: modulos,
    modulos,

    supl_desde: suplDesde,
    supl_hasta: suplHasta,
    desde: desdeLabel,
    hasta: hastaLabel,

    revista: tipoRevista.label,
    situacion_revista: tipoRevista.label,
    revista_codigo: tipoRevista.codigo,

    finoferta: finOferta,
    finoferta_label: cierreLabel,
    fecha_cierre: cierreLabel,
    cierre: cierreLabel,

    dias_horarios: diasHorarios,
    horario: diasHorarios,

    observaciones: oferta.observaciones || "",
    detalle_match: evaluacion.detalle,

    abc_postulantes_url: abcUrl,
    abc_url: abcUrl,
    link: oferta.link_postular || oferta.link || abcUrl,

    pid_match: !!pidInfo?.compatible,
pid_compatible: !!pidInfo?.compatible,
pid_reason: pidInfo?.reason || "",
pid_district_ok: !!pidInfo?.district_ok,
pid_area_ok: !!pidInfo?.area_ok,
pid_bloque_ok: !!pidInfo?.bloque_ok,
pid_distritos_solicitados: Array.isArray(pidInfo?.pid_distritos) ? pidInfo.pid_distritos : [],
pid_area: pidMatch?.area || "",
pid_bloque: pidMatch?.bloque || "",
pid_puntaje_total: pidMatch?.puntaje_total || "",
pid_puntaje_total_base: Number.isFinite(pidMatch?.puntaje_total_base_num) ? pidMatch.puntaje_total_base_num : null,
pid_puntaje_total_final: Number.isFinite(pidMatch?.puntaje_total_final_num) ? pidMatch.puntaje_total_final_num : null,
pid_residencia_bonus_aplicado: !!pidMatch?.residencia_bonus_aplicado,
pid_residencia_bonus_puntos: Number(pidMatch?.residencia_bonus_puntos || 0),
pid_distrito_residencia: pidMatch?.distrito_residencia || "",
pid_listado: pidMeta?.listado || "",
pid_anio: pidMeta?.anio || "",

    raw: oferta
  };
}
__name(buildAlertItem, "buildAlertItem");
async function obtenerResumenPostulantesABC(ofertaId, detalleId) {
  const ofertaSafe = sanitizeSolrNumber(ofertaId);
  const detalleSafe = sanitizeSolrNumber(detalleId);
  const filters = [];
  const queryParts = [];
  if (ofertaSafe) {
    filters.push(`idoferta:${ofertaSafe}`);
    queryParts.push(`idoferta:${ofertaSafe}`);
  }
  if (detalleSafe) {
    filters.push(`iddetalle:${detalleSafe}`);
    queryParts.push(`iddetalle:${detalleSafe}`);
  }
  if (!queryParts.length) {
    return { total_postulantes: 0, puntaje_primero: null, listado_origen_primero: "" };
  }
  const qs = new URLSearchParams();
  qs.set("q", queryParts.join(" OR "));
  filters.forEach((fq) => qs.append("fq", fq));
  qs.set("rows", "1");
  qs.set("wt", "json");
  qs.set("sort", "estadopostulacion asc, orden asc, puntaje desc");
  const res = await fetch(
    `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.postulante/select?${qs.toString()}`
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ABC postulantes respondio ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const total = Number(data?.response?.numFound || 0);
  const first = data?.response?.docs?.[0] || null;
  return {
    total_postulantes: total,
    puntaje_primero: first?.puntaje != null ? Number(first.puntaje) : null,
    listado_origen_primero: first?.listadoorigen || ""
  };
}
__name(obtenerResumenPostulantesABC, "obtenerResumenPostulantesABC");
function buildAbcPostulantesUrl(ofertaId, detalleId) {
  const params = new URLSearchParams();
  const ofertaSafe = sanitizeSolrNumber(ofertaId);
  const detalleSafe = sanitizeSolrNumber(detalleId);
  if (ofertaSafe) params.set("oferta", ofertaSafe);
  if (detalleSafe) params.set("detalle", detalleSafe);
  return `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?${params.toString()}`;
}
__name(buildAbcPostulantesUrl, "buildAbcPostulantesUrl");
async function obtenerPlanPorCode(env, planCode) {
  const candidates = uniqueUpper([planCode, canonicalPlanCode(planCode)]);
  for (const code of candidates) {
    const rows = await supabaseSelect(
      env,
      `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags&limit=1`
    ).catch(() => []);
    if (rows?.[0]) return rows[0];
  }
  return defaultPlansCatalog().find(
    (plan) => canonicalPlanCode(plan.code) === canonicalPlanCode(planCode)
  ) || null;
}
__name(obtenerPlanPorCode, "obtenerPlanPorCode");
async function findUserByEmail(env, email) {
  const rows = await supabaseSelect(
    env,
    `users?email=ilike.${encodeURIComponent(email)}&select=id,nombre,apellido,email,password_hash,google_sub,activo&limit=1`
  );
  return rows?.[0] || null;
}
__name(findUserByEmail, "findUserByEmail");
async function findUserByGoogleSub(env, sub) {
  const rows = await supabaseSelect(
    env,
    `users?google_sub=eq.${encodeURIComponent(sub)}&select=id,nombre,apellido,email,password_hash,google_sub,activo&limit=1`
  );
  return rows?.[0] || null;
}
__name(findUserByGoogleSub, "findUserByGoogleSub");
async function createUserFromGoogle(env, googleUser) {
  const row = await supabaseInsertReturning(env, "users", {
    nombre: googleUser.nombre || "Docente",
    apellido: googleUser.apellido || "-",
    email: googleUser.email,
    google_sub: googleUser.sub,
    activo: true
  });
  return Array.isArray(row) ? row[0] : row;
}
__name(createUserFromGoogle, "createUserFromGoogle");
async function obtenerUsuario(env, userId) {
  const rows = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo,celular,ultimo_login&limit=1`
  );
  return rows?.[0] || null;
}
__name(obtenerUsuario, "obtenerUsuario");
async function touchUltimoLogin(env, userId) {
  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(userId)}`, {
    ultimo_login: (/* @__PURE__ */ new Date()).toISOString()
  });
}
__name(touchUltimoLogin, "touchUltimoLogin");
async function verifyGoogleCredential(idToken, expectedAud) {
  if (!expectedAud) throw new Error("Falta GOOGLE_CLIENT_ID en Cloudflare");
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google no valido el token: ${txt}`);
  }
  const data = await res.json();
  if (String(data.aud || "") !== String(expectedAud)) {
    throw new Error("Google Client ID no coincide");
  }
  if (!(data.email_verified === true || data.email_verified === "true")) {
    throw new Error("El email de Google no esta verificado");
  }
  const split = splitGoogleName(data.name || "");
  return {
    sub: String(data.sub || ""),
    email: String(data.email || "").trim().toLowerCase(),
    nombre: String(data.given_name || split.nombre || "").trim() || "Docente",
    apellido: String(data.family_name || split.apellido || "").trim() || "-"
  };
}
__name(verifyGoogleCredential, "verifyGoogleCredential");
function splitGoogleName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const nombre = parts.shift() || "Docente";
  const apellido = parts.join(" ") || "-";
  return { nombre, apellido };
}
__name(splitGoogleName, "splitGoogleName");
async function passwordMatches(storedPassword, plainPassword) {
  const stored = String(storedPassword || "");
  const plain = String(plainPassword || "");
  if (!stored || !plain) return false;
  if (stored === plain) return true;
  const hashed = await sha256Hex(plain);
  return stored === hashed;
}
__name(passwordMatches, "passwordMatches");
async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function supabaseSelect(env, query) {
  const res = await supabaseFetchWithRetry(env, `${env.SUPABASE_URL}/rest/v1/${query}`, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const txt = await res.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    throw new Error(`Respuesta invalida de Supabase: ${txt}`);
  }
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}
__name(supabaseSelect, "supabaseSelect");
async function supabaseInsertMany(env, tabla, rows) {
  if (!rows.length) return;
  const res = await supabaseFetchWithRetry(env, `${env.SUPABASE_URL}/rest/v1/${tabla}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase insert many error: ${txt}`);
  }
}
__name(supabaseInsertMany, "supabaseInsertMany");
async function supabaseUpsert(env, tabla, rows, conflict) {
  if (!rows.length) return;
  const res = await supabaseFetchWithRetry(
    env,
    `${env.SUPABASE_URL}/rest/v1/${tabla}?on_conflict=${encodeURIComponent(conflict)}`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(rows)
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase upsert error: ${txt}`);
  }
}
__name(supabaseUpsert, "supabaseUpsert");
async function supabaseUpsertReturning(env, tabla, rows, conflict) {
  const res = await supabaseFetchWithRetry(
    env,
    `${env.SUPABASE_URL}/rest/v1/${tabla}?on_conflict=${encodeURIComponent(conflict)}`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(rows)
    }
  );
  const txt = await res.text();
  const data = txt ? safeJson(txt) : null;
  if (!res.ok) throw new Error(`Supabase upsert returning error: ${JSON.stringify(data)}`);
  return data;
}
__name(supabaseUpsertReturning, "supabaseUpsertReturning");
async function supabasePatch(env, tabla, filtro, row) {
  const res = await supabaseFetchWithRetry(env, `${env.SUPABASE_URL}/rest/v1/${tabla}?${filtro}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(row)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase patch error: ${txt}`);
  }
}
__name(supabasePatch, "supabasePatch");
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
__name(safeJson, "safeJson");
async function supabaseFetchWithRetry(env, url, init) {
  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (res.ok || !shouldRetrySupabaseStatus(res.status)) {
        return res;
      }
      const body = await res.text();
      lastError = new Error(`Supabase ${res.status}: ${body}`);
      if (attempt >= maxAttempts) {
        throw lastError;
      }
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !shouldRetrySupabaseErrorMessage(err?.message || "")) {
        throw err;
      }
    }
    await sleep(250 * attempt);
  }
  throw lastError || new Error("Supabase fetch failed");
}
__name(supabaseFetchWithRetry, "supabaseFetchWithRetry");
function shouldRetrySupabaseStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(Number(status));
}
__name(shouldRetrySupabaseStatus, "shouldRetrySupabaseStatus");
function shouldRetrySupabaseErrorMessage(message) {
  const text = String(message || "").toUpperCase();
  return text.includes("SUPABASE 429") || text.includes("SUPABASE 500") || text.includes("SUPABASE 502") || text.includes("SUPABASE 503") || text.includes("SUPABASE 504") || text.includes("BAD GATEWAY") || text.includes("TIMEOUT") || text.includes("ECONNRESET") || text.includes("FETCH") || text.includes("NETWORK");
}
__name(shouldRetrySupabaseErrorMessage, "shouldRetrySupabaseErrorMessage");
async function obtenerPreferenciasUsuario(env, userId) {
  const rows = await supabaseSelect(
    env,
    `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`
  ).catch(() => []);
  const row = rows?.[0];
  return row ? adaptarPreferenciasRow(row) : null;
}
__name(obtenerPreferenciasUsuario, "obtenerPreferenciasUsuario");
async function cargarCatalogos(env) {
  const [distritos, cargos] = await Promise.all([
    supabaseSelect(
      env,
      "catalogo_distritos?select=codigo,nombre,nombre_norm,apd_nombre,apd_nombre_norm"
    ).catch(() => []),
    supabaseSelect(
      env,
      "catalogo_cargos_areas?select=codigo,nombre,nombre_norm,apd_nombre,apd_nombre_norm"
    ).catch(() => [])
  ]);
  return {
    distritos: Array.isArray(distritos) ? distritos : [],
    cargos: Array.isArray(cargos) ? cargos : []
  };
}
__name(cargarCatalogos, "cargarCatalogos");
function canonicalPlanCode(code) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return "PLUS";
  if (key === "PRO") return "PREMIUM";
  return key;
}
__name(canonicalPlanCode, "canonicalPlanCode");
function getPlanPreset(code) {
  const key = canonicalPlanCode(code);
  const presets = {
    TRIAL_7D: {
      code: "TRIAL_7D",
      nombre: "Prueba gratis 7 d\xEDas",
      descripcion: "Probá APDocentePBA durante 7 días con 1 distrito, hasta 2 materias/cargos, email incluido y Telegram por consulta incluido.",
      price_ars: 0,
      trial_days: 7,
      max_distritos: 1,
      max_distritos_normales: 1,
      max_distritos_emergencia: 0,
      max_cargos: 2,
      is_active: true,
      public_visible: true,
      sort_order: 1,
      mercadopago_plan_id: null,
      feature_flags: {
        email: true,
        whatsapp: false,
        telegram: true,
        telegram_coming_soon: false,
        whatsapp_coming_soon: false,
        provincia: false,
        insights_plus: false
      }
    },
    PLUS: {
      code: "PLUS",
      nombre: "Plan Plus",
      descripcion: "Más alcance sin irte de presupuesto: 2 distritos, hasta 4 materias/cargos, email incluido y Telegram por consulta incluido.",
      price_ars: 2990,
      trial_days: 0,
      max_distritos: 2,
      max_distritos_normales: 2,
      max_distritos_emergencia: 0,
      max_cargos: 4,
      is_active: true,
      public_visible: true,
      sort_order: 2,
      mercadopago_plan_id: null,
      feature_flags: {
        email: true,
        whatsapp: false,
        telegram: true,
        telegram_coming_soon: false,
        whatsapp_coming_soon: false,
        provincia: true,
        insights_plus: false
      }
    },
    PREMIUM: {
      code: "PREMIUM",
      nombre: "Plan Pro",
      descripcion: "Cobertura fuerte para multiplicar oportunidades: 3 distritos, hasta 6 materias/cargos, email incluido y Telegram por consulta incluido.",
      price_ars: 4990,
      trial_days: 0,
      max_distritos: 3,
      max_distritos_normales: 3,
      max_distritos_emergencia: 0,
      max_cargos: 6,
      is_active: true,
      public_visible: true,
      sort_order: 3,
      mercadopago_plan_id: null,
      feature_flags: {
        email: true,
        whatsapp: false,
        telegram: true,
        telegram_coming_soon: false,
        whatsapp_coming_soon: false,
        provincia: true,
        insights_plus: true
      }
    },
    INSIGNE: {
      code: "INSIGNE",
      nombre: "Plan Insigne",
      descripcion: "Cobertura máxima: 3 distritos principales + 2 de emergencia/chusmeo, hasta 10 materias/cargos, email incluido, Telegram por consulta incluido, WhatsApp por consulta incluido y match PID automático.",
      price_ars: 7990,
      trial_days: 0,
      max_distritos: 5,
      max_distritos_normales: 3,
      max_distritos_emergencia: 2,
      max_cargos: 10,
      is_active: true,
      public_visible: true,
      sort_order: 4,
      mercadopago_plan_id: null,
      feature_flags: {
        email: true,
        whatsapp: true,
        telegram: true,
        telegram_coming_soon: false,
        whatsapp_coming_soon: false,
        provincia: true,
        insights_plus: true,
        emergency_districts: true
      }
    }
  };
  return presets[key] || presets.PLUS;
}
__name(getPlanPreset, "getPlanPreset");
function buildPlanDistrictSlots(plan) {
  const normales = clampPlanLimit(plan?.max_distritos_normales, 1, 5, 1);
  const emergencia = clampPlanLimit(plan?.max_distritos_emergencia, 0, 2, 0);
  const slots = [
    {
      index: 1,
      key: "distrito_principal",
      kind: "principal",
      label: "Distrito principal"
    }
  ];
  for (let i = 2; i <= normales; i++) {
    slots.push({
      index: i,
      key: `otros_distritos_${i - 1}`,
      kind: "normal",
      label: `Distrito adicional ${i - 1}`
    });
  }
  for (let i = 1; i <= emergencia; i++) {
    const idx = normales + i;
    slots.push({
      index: idx,
      key: `otros_distritos_${idx - 1}`,
      kind: "emergencia",
      label: `Distrito de emergencia ${i}`
    });
  }
  return slots;
}
__name(buildPlanDistrictSlots, "buildPlanDistrictSlots");
function buildPlanCargoSlots(maxCargos) {
  const total = clampPlanLimit(maxCargos, 1, 10, 2);
  const slots = [];
  for (let i = 1; i <= total; i++) {
    slots.push({
      index: i,
      key: `cargo_${i}`,
      label: `Cargo o materia ${i}`
    });
  }
  return slots;
}
__name(buildPlanCargoSlots, "buildPlanCargoSlots");
async function resolverPlanUsuario(env, userId) {
  const catalogo = await cargarPlanesCatalogo(env);
  const planMap = new Map(
    catalogo.map((plan) => {
      const normalized = normalizePlanOut(plan);
      return [canonicalPlanCode(normalized.code), normalized];
    })
  );
  let suscripciones = [];
  try {
    suscripciones = await supabaseSelect(
      env,
      `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id`
    );
  } catch {
    suscripciones = [];
  }
  const vigente = elegirSuscripcionVigente(suscripciones);
  if (vigente) {
    const planCode = canonicalPlanCode(vigente.plan_code || "PLUS");
    return {
      plan: planMap.get(planCode) || normalizePlanOut(planPorCode(planCode)),
      subscription: normalizeSubscriptionOut({
        ...vigente,
        plan_code: planCode
      })
    };
  }
  const trialPlan = planMap.get("TRIAL_7D") || normalizePlanOut(planPorCode("TRIAL_7D"));
  return {
    plan: trialPlan,
    subscription: {
      id: null,
      user_id: userId,
      plan_code: "TRIAL_7D",
      status: "available",
      source: "catalogo_default",
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      trial_ends_at: null,
      current_period_ends_at: null,
      mercadopago_preapproval_id: null
    }
  };
}
__name(resolverPlanUsuario, "resolverPlanUsuario");
function elegirSuscripcionVigente(rows) {
  const permitidos = /* @__PURE__ */ new Set(["ACTIVE", "TRIALING", "AUTHORIZED", "PENDING", "PAUSED", "BETA"]);
  const nowTs = Date.now();
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toUpperCase();
    if (!permitidos.has(status)) continue;
    const trialEndsTs = parseFechaFlexible(row?.trial_ends_at)?.getTime() || 0;
    const currentEndsTs = parseFechaFlexible(row?.current_period_ends_at)?.getTime() || 0;
    if (status === "TRIALING" && trialEndsTs && trialEndsTs < nowTs) continue;
    if (!["TRIALING", "BETA"].includes(status) && currentEndsTs && currentEndsTs < nowTs) continue;
    return row;
  }
  return null;
}
__name(elegirSuscripcionVigente, "elegirSuscripcionVigente");
async function cargarPlanesCatalogo(env) {
  try {
    const rows = await supabaseSelect(
      env,
      "subscription_plans?select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,is_active,public_visible,sort_order,mercadopago_plan_id,feature_flags"
    );
    if (Array.isArray(rows) && rows.length) return rows;
  } catch {
  }
  return defaultPlansCatalog();
}
__name(cargarPlanesCatalogo, "cargarPlanesCatalogo");
function defaultPlansCatalog() {
  return ["TRIAL_7D", "PLUS", "PREMIUM", "INSIGNE"].map((code) => {
    const preset = getPlanPreset(code);
    return {
      ...preset,
      code: preset.code,
      is_active: true,
      public_visible: true,
      mercadopago_plan_id: null
    };
  });
}
__name(defaultPlansCatalog, "defaultPlansCatalog");
function planPorCode(code) {
  const key = canonicalPlanCode(code);
  return defaultPlansCatalog().find((plan) => canonicalPlanCode(plan.code) === key) || defaultPlansCatalog().find((plan) => plan.code === "PLUS") || defaultPlansCatalog()[0];
}
__name(planPorCode, "planPorCode");
function normalizePlanOut(plan) {
  const originalCode = String(plan?.code || "PLUS").trim().toUpperCase();
  const internalCode = canonicalPlanCode(originalCode);
  const preset = getPlanPreset(internalCode);
  const rawFlags = typeof plan?.feature_flags === "object" && plan?.feature_flags ? plan.feature_flags : {};
  const featureFlags = {
    ...rawFlags,
    ...preset.feature_flags || {}
  };
  const maxDistritosNormales = clampPlanLimit(
    preset.max_distritos_normales ?? plan?.max_distritos_normales ?? plan?.max_distritos_base ?? plan?.max_distritos,
    1,
    5,
    1
  );
  const maxDistritosEmergencia = clampPlanLimit(
    preset.max_distritos_emergencia ?? plan?.max_distritos_emergencia,
    0,
    2,
    0
  );
  const maxDistritosTotal = clampPlanLimit(
    preset.max_distritos ?? plan?.max_distritos_total ?? plan?.max_distritos ?? maxDistritosNormales + maxDistritosEmergencia,
    1,
    10,
    maxDistritosNormales + maxDistritosEmergencia || 1
  );
  const maxCargosTotal = clampPlanLimit(
    preset.max_cargos ?? plan?.max_cargos_total ?? plan?.max_cargos,
    1,
    10,
    2
  );
  const normalized = {
    code: internalCode,
    nombre: String(preset.nombre || plan?.nombre || "Plan").trim(),
    descripcion: String(preset.descripcion || plan?.descripcion || "").trim(),
    price_ars: plan?.price_ars != null ? Number(plan.price_ars) : preset?.price_ars != null ? Number(preset.price_ars) : null,
    trial_days: clampPlanLimit(plan?.trial_days ?? preset.trial_days, 0, 365, 0),
    max_distritos: maxDistritosTotal,
    max_distritos_total: maxDistritosTotal,
    max_distritos_normales: maxDistritosNormales,
    max_distritos_emergencia: maxDistritosEmergencia,
    max_cargos: maxCargosTotal,
    max_cargos_total: maxCargosTotal,
    public_visible: plan?.public_visible != null ? !!plan.public_visible : !!preset.public_visible,
    mercadopago_plan_id: plan?.mercadopago_plan_id || preset.mercadopago_plan_id || null,
    feature_flags: featureFlags
  };
  return {
    ...normalized,
    display_code: internalCode === "PREMIUM" ? "PRO" : internalCode,
    display_name: normalized.nombre,
    district_slots: buildPlanDistrictSlots(normalized),
    cargo_slots: buildPlanCargoSlots(maxCargosTotal),
    features: buildPlanFeatures(normalized)
  };
}
__name(normalizePlanOut, "normalizePlanOut");
function buildPlanFeatures(plan) {
  const flags = typeof plan?.feature_flags === "object" && plan?.feature_flags ? plan.feature_flags : {};
  const normales = clampPlanLimit(plan?.max_distritos_normales, 1, 5, 1);
  const emergencia = clampPlanLimit(plan?.max_distritos_emergencia, 0, 2, 0);
  const totalDistritos = clampPlanLimit(
    plan?.max_distritos_total ?? plan?.max_distritos,
    1,
    10,
    normales + emergencia || 1
  );
  const totalCargos = clampPlanLimit(
    plan?.max_cargos_total ?? plan?.max_cargos,
    1,
    10,
    2
  );
  const items = [];
  if (emergencia > 0) {
    items.push(`${normales} distritos principales + ${emergencia} de emergencia`);
  } else {
    items.push(`${totalDistritos} distrito${totalDistritos === 1 ? "" : "s"}`);
  }
  items.push(`${totalCargos} materias/cargos`);
  items.push("Alertas por email");
  items.push(flags.telegram ? "Telegram por consulta" : "Telegram no incluido");
  items.push(flags.whatsapp ? "WhatsApp por consulta" : "WhatsApp solo en Insigne");
  items.push("Turno, nivel y modalidad");
  if (plan?.trial_days) {
    items.push(`${plan.trial_days} d\xEDas de prueba`);
  }
  return items;
}
__name(buildPlanFeatures, "buildPlanFeatures");
function normalizeSubscriptionOut(row) {
  return {
    id: row?.id || null,
    user_id: row?.user_id || null,
    plan_code: String(row?.plan_code || "PLUS").trim().toUpperCase(),
    status: String(row?.status || "active").trim().toLowerCase(),
    source: row?.source || null,
    started_at: row?.started_at || null,
    trial_ends_at: row?.trial_ends_at || null,
    current_period_ends_at: row?.current_period_ends_at || null,
    mercadopago_preapproval_id: row?.mercadopago_preapproval_id || null
  };
}
__name(normalizeSubscriptionOut, "normalizeSubscriptionOut");
function sanitizarPreferenciasEntrada(raw, plan) {
  const distritos = uniqueUpper([
    raw?.distrito_principal,
    ...Array.isArray(raw?.otros_distritos) ? raw.otros_distritos : []
  ]);

  const cargos = uniqueUpper([
    ...Array.isArray(raw?.cargos) ? raw.cargos : [],
    ...Array.isArray(raw?.materias) ? raw.materias : []
  ]);

  const niveles = uniqueUpper(
    (Array.isArray(raw?.niveles) ? raw.niveles : []).map(canonicalizarNivelPreferencia)
  );

  const turnos = uniqueUpper(
    (Array.isArray(raw?.turnos) ? raw.turnos : [])
      .map(canonicalizarTurnoPreferencia)
      .filter(Boolean)
  ).slice(0, 1);

  const maxDistritos = clampPlanLimit(
    plan?.max_distritos_total ?? plan?.max_distritos,
    1,
    10,
    5
  );

  const maxCargos = clampPlanLimit(
    plan?.max_cargos_total ?? plan?.max_cargos,
    1,
    10,
    5
  );

  const distritosAjustados = distritos.slice(0, maxDistritos);
  const cargosAjustados = cargos.slice(0, maxCargos);

  const distritosRecortados = Math.max(0, distritos.length - distritosAjustados.length);
  const cargosRecortados = Math.max(0, cargos.length - cargosAjustados.length);

  return {
    distrito_principal: distritosAjustados[0] || null,
    otros_distritos: distritosAjustados.slice(1),
    cargos: cargosAjustados,
    materias: [],
    niveles,
    turnos,
    alertas_activas: !!raw?.alertas_activas,
    alertas_email: !!raw?.alertas_email,
    alertas_telegram: !!raw?.alertas_telegram,
    alertas_whatsapp: !!raw?.alertas_whatsapp && !!(plan?.feature_flags?.whatsapp),
    _plan_ajuste: {
      distritos_recortados: distritosRecortados,
      cargos_recortados: cargosRecortados,
      max_distritos: maxDistritos,
      max_cargos: maxCargos
    }
  };
}
__name(sanitizarPreferenciasEntrada, "sanitizarPreferenciasEntrada");
function canonicalizarNivelPreferencia(value) {
  const s = norm(value);
  if (!s) return "";
  if (s.includes("SUPERIOR") || s.includes("FORMACION DOCENTE") || s.includes("DOCENTE")) return "SUPERIOR";
  if (s.includes("INICIAL")) return "INICIAL";
  if (s.includes("PRIMARIA") || s.includes("PRIMARIO")) return "PRIMARIO";
  if (s.includes("SECUNDARIA") || s.includes("SECUNDARIO")) return "SECUNDARIO";
  if (s.includes("ESPECIAL")) return "EDUCACION ESPECIAL";
  if (s.includes("JOVENES") || s.includes("ADULTOS") || s.includes("CENS")) return "ADULTOS";
  if (s.includes("FISICA")) return "EDUCACION FISICA";
  if (s.includes("PSICOLOGIA") || s.includes("COMUNITARIA")) return "PSICOLOGIA";
  if (s.includes("ARTISTICA") || s.includes("ARTE")) return "EDUCACION ARTISTICA";
  if (s.includes("TECNICO")) return "TECNICO PROFESIONAL";
  return s;
}
__name(canonicalizarNivelPreferencia, "canonicalizarNivelPreferencia");
function canonicalizarTurnoPreferencia(value) {
  const x = norm(value);
  if (!x) return "";
  if (x === "M" || x === "MANANA") return "M";
  if (x === "T" || x === "TARDE") return "T";
  if (x === "V" || x === "VESPERTINO") return "V";
  if (x === "N" || x === "NOCHE") return "N";
  if (x === "A" || x === "ALTERNADO") return "ALTERNADO";
  return x;
}
__name(canonicalizarTurnoPreferencia, "canonicalizarTurnoPreferencia");
function uniqueUpper(items) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const value = String(item || "").trim().toUpperCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
__name(uniqueUpper, "uniqueUpper");
function clampPlanLimit(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
__name(clampPlanLimit, "clampPlanLimit");
function parsearCargosDesdeHTML(html) {
  const limpio = String(html || "").replace(/<[^>]+>/g, "\n");
  const lineas = limpio.split("\n").map((item) => item.trim()).filter((item) => item.length > 10 && item.includes(","));
  const items = [];
  const vistos = /* @__PURE__ */ new Set();
  for (const linea of lineas) {
    const partes = linea.split(",");
    if (partes.length < 2) continue;
    const codigo = String(partes[0] || "").replace("*", "").trim();
    const nombre = String(partes[1] || "").trim();
    if (!nombre) continue;
    const nombreNorm = norm(nombre);
    if (!nombreNorm || vistos.has(nombreNorm)) continue;
    vistos.add(nombreNorm);
    items.push({ codigo: codigo || null, nombre, nombre_norm: nombreNorm, apd_nombre: nombre, apd_nombre_norm: nombreNorm, fuente: "abc" });
  }
  return items;
}
__name(parsearCargosDesdeHTML, "parsearCargosDesdeHTML");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
__name(clampInt, "clampInt");
function buscarEnCatalogo(lista, valor) {
  const v = norm(valor);
  if (!v) return null;
  const exacto = lista.find((item) => norm(item.nombre_norm || item.nombre || "") === v || norm(item.apd_nombre_norm || item.apd_nombre || "") === v);
  if (exacto) return exacto;
  return lista.find((item) => {
    const n1 = norm(item.nombre_norm || item.nombre || "");
    const n2 = norm(item.apd_nombre_norm || item.apd_nombre || "");
    return n1 === v || n2 === v || v.includes(n1) || n1.includes(v) || v.includes(n2) || n2.includes(v);
  }) || null;
}
__name(buscarEnCatalogo, "buscarEnCatalogo");
function canonizarListaDistritos(lista, catalogo) {
  const humanos = [];
  const apd = [];
  for (const item of lista || []) {
    const hit = buscarEnCatalogo(catalogo, item);
    if (hit) {
      humanos.push(norm(hit.nombre || item));
      apd.push(norm(hit.apd_nombre || hit.nombre || item));
    } else {
      const value = norm(item);
      if (value) {
        humanos.push(value);
        apd.push(value);
      }
    }
  }
  return { humanos: unique(humanos), apd: unique(apd) };
}
__name(canonizarListaDistritos, "canonizarListaDistritos");
function canonizarListaCargosOMaterias(lista, catalogo) {
  const humanos = [];
  const apd = [];
  for (const item of lista || []) {
    const hit = buscarEnCatalogo(catalogo, item);
    if (hit) {
      humanos.push(norm(hit.nombre || item));
      apd.push(norm(hit.apd_nombre || hit.nombre || item));
    } else {
      const value = norm(item);
      if (value) {
        humanos.push(value);
        apd.push(value);
      }
    }
  }
  return { humanos: unique(humanos), apd: unique(apd) };
}
__name(canonizarListaCargosOMaterias, "canonizarListaCargosOMaterias");
function canonizarPreferenciasConCatalogo(prefs, catalogos) {
  const principal = canonizarListaDistritos([prefs.distrito_principal || ""], catalogos.distritos);
  const otros = canonizarListaDistritos(prefs.otros_distritos || [], catalogos.distritos);
  const cargosCanon = canonizarListaCargosOMaterias(prefs.cargos || [], catalogos.cargos);
  const materiasCanon = canonizarListaCargosOMaterias(prefs.materias || [], catalogos.cargos);
  return { ...prefs, distrito_principal: principal.humanos[0] || norm(prefs.distrito_principal || ""), distrito_principal_apd: principal.apd[0] || norm(prefs.distrito_principal || ""), otros_distritos: otros.humanos, otros_distritos_apd: otros.apd, cargos: cargosCanon.humanos, cargos_apd: cargosCanon.apd, materias: materiasCanon.humanos, materias_apd: materiasCanon.apd };
}
__name(canonizarPreferenciasConCatalogo, "canonizarPreferenciasConCatalogo");
async function traerOfertasAPDPorDistritos(prefs) {
  const distritos = distritosPrefsAPD(prefs);
  const cargos = cargosMateriasPrefsAPD(prefs);
  const todas = [];
  const vistos = new Set();
  const debugDistritos = [];

  for (const distritoAPD of distritos) {
    let docsDistrito = [];

    if (Array.isArray(cargos) && cargos.length) {
      for (const cargo of cargos) {
        const info = await traerOfertasAPDDeUnDistritoYCargo(distritoAPD, cargo);

        debugDistritos.push({
          distrito_apd: distritoAPD,
          cargo_query: cargo,
          query_usada: info.query,
          total_apd_bruto: info.totalBruto,
          total_apd_filtrado: info.totalFiltrado
        });

        for (const doc of info.docs || []) {
          const clave = buildSourceOfferKeyFromOferta(doc);
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          docsDistrito.push(doc);
        }
      }
    } else {
      const info = await traerOfertasAPDDeUnDistrito(distritoAPD);

      debugDistritos.push({
        distrito_apd: distritoAPD,
        query_usada: info.query,
        total_apd_bruto: info.totalBruto,
        total_apd_filtrado: info.totalFiltrado
      });

      for (const doc of info.docs || []) {
        const clave = buildSourceOfferKeyFromOferta(doc);
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        docsDistrito.push(doc);
      }
    }

    todas.push(...docsDistrito);
  }

  return { ofertas: todas, debugDistritos };
}
__name(traerOfertasAPDPorDistritos, "traerOfertasAPDPorDistritos");
async function traerOfertasAPDDeUnDistrito(distritoAPD) {
  const distritoNorm = norm(distritoAPD);
  const docsTotales = [];
  for (let i = 0; i < USER_CAPTURE_MAX_PAGES; i += 1) {
    const start = i * USER_CAPTURE_ROWS_PER_PAGE;
    const q = `descdistrito:"${escaparSolr(distritoAPD)}"`;
    const consultaUrl = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${USER_CAPTURE_ROWS_PER_PAGE}&start=${start}&wt=json&sort=ult_movimiento%20desc`;
    const res = await fetch(consultaUrl);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`APD respondio ${res.status}: ${txt}`);
    }
    const data = await res.json();
    const docs = data?.response?.docs || [];
    if (!docs.length) break;
    docsTotales.push(...docs);
    if (docs.length < USER_CAPTURE_ROWS_PER_PAGE) break;
  }
  const docsFiltrados = docsTotales.filter((doc) => norm(doc?.descdistrito || "") === distritoNorm);
  return { docs: docsFiltrados, query: `descdistrito:"${distritoAPD}"`, totalBruto: docsTotales.length, totalFiltrado: docsFiltrados.length };
}
__name(traerOfertasAPDDeUnDistrito, "traerOfertasAPDDeUnDistrito");
async function traerOfertasAPDDeUnDistritoYCargo(distritoAPD, cargoMateria) {
  const distritoNorm = norm(distritoAPD);
  const cargoNorm = norm(cargoMateria);
  const docsTotales = [];
  for (let i = 0; i < USER_CAPTURE_MAX_PAGES; i += 1) {
    const start = i * USER_CAPTURE_ROWS_PER_PAGE;
    const q = [
      `descdistrito:"${escaparSolr(distritoAPD)}"`,
      `(` + [
        `descripcioncargo:"${escaparSolr(cargoMateria)}"`,
        `descripcionarea:"${escaparSolr(cargoMateria)}"`,
        `cargo:"${escaparSolr(cargoMateria)}"`
      ].join(" OR ") + `)`
    ].join(" AND ");
    const consultaUrl = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${USER_CAPTURE_ROWS_PER_PAGE}&start=${start}&wt=json&sort=ult_movimiento%20desc`;
    const res = await fetch(consultaUrl);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`APD respondio ${res.status}: ${txt}`);
    }
    const data = await res.json();
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    if (!docs.length) break;
    const docsFiltrados = docs.filter((doc) => {
      const distritoOk = norm(doc?.descdistrito || "") === distritoNorm;
      const textoCargo = norm([
        doc?.descripcioncargo,
        doc?.descripcionarea,
        doc?.cargo,
        doc?.materia,
        doc?.asignatura
      ].filter(Boolean).join(" "));
      const cargoOk = textoCargo.includes(cargoNorm) || cargoNorm.includes(textoCargo);
      return distritoOk && cargoOk;
    });
    docsTotales.push(...docsFiltrados);
    if (docs.length < USER_CAPTURE_ROWS_PER_PAGE) break;
  }
  return {
    docs: docsTotales,
    query: `descdistrito:"${distritoAPD}" AND cargo:"${cargoMateria}"`,
    totalBruto: docsTotales.length,
    totalFiltrado: docsTotales.length
  };
}
__name(traerOfertasAPDDeUnDistritoYCargo, "traerOfertasAPDDeUnDistritoYCargo");
function buildSourceOfferKeyFromOferta(oferta) {
  const detalle = sanitizeSolrNumber(oferta?.iddetalle || oferta?.id || "");
  if (detalle) return `D_${detalle}`;
  const ofertaId = sanitizeSolrNumber(oferta?.idoferta || "");
  if (ofertaId) return `O_${ofertaId}`;
  return [norm(oferta?.descdistrito || ""), norm(oferta?.escuela || oferta?.nombreestablecimiento || ""), norm(oferta?.descripcioncargo || oferta?.cargo || ""), norm(oferta?.descripcionarea || ""), sanitizeKeyText(oferta?.finoferta || "")].filter(Boolean).join("_").slice(0, 220);
}
__name(buildSourceOfferKeyFromOferta, "buildSourceOfferKeyFromOferta");
function sanitizeKeyText(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(sanitizeKeyText, "sanitizeKeyText");
function escaparSolr(text) {
  return String(text || "").replace(/(["\\])/g, "\\$1");
}
__name(escaparSolr, "escaparSolr");
function ofertaEsVisibleParaAlerta(oferta) {
  const estado = norm(oferta?.estado || "");
  const fin = parseFechaFlexible(oferta?.finoferta)?.getTime() || 0;
  const ahora = Date.now();
  if (estado.includes("ANULADA")) return false;
  if (estado.includes("DESIGNADA")) return false;
  if (fin && fin < ahora - 48 * 60 * 60 * 1e3) return false;
  return true;
}
__name(ofertaEsVisibleParaAlerta, "ofertaEsVisibleParaAlerta");
function ofertaEsVisibleParaHistoricoUsuario(oferta) {
  const fin = parseFechaFlexible(oferta?.finoferta)?.getTime() || 0;
  const ahora = Date.now();
  if (fin && fin < ahora - 180 * 24 * 60 * 60 * 1e3) return false;
  return true;
}
__name(ofertaEsVisibleParaHistoricoUsuario, "ofertaEsVisibleParaHistoricoUsuario");
function norm(value) {
  return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s/().,-]/gu, " ").replace(/\s+/g, " ").trim();
}
__name(norm, "norm");
function arrNorm(value) {
  if (Array.isArray(value)) return value.map((item) => norm(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => norm(item)).filter(Boolean);
  return [];
}
__name(arrNorm, "arrNorm");
function unique(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}
__name(unique, "unique");
function adaptarPreferenciasRow(row) {
  return { user_id: row.user_id || "", distrito_principal: norm(row.distrito_principal || ""), otros_distritos: unique(arrNorm(row.otros_distritos)), cargos: unique(arrNorm(row.cargos)), materias: unique(arrNorm(row.materias)), niveles: unique(arrNorm(row.niveles)), turnos: unique(arrNorm(row.turnos)), alertas_activas: !!row.alertas_activas, alertas_email: !!row.alertas_email, alertas_telegram: !!row.alertas_telegram, alertas_whatsapp: !!row.alertas_whatsapp };
}
__name(adaptarPreferenciasRow, "adaptarPreferenciasRow");
function distritosPrefsAPD(prefs) {
  return unique([norm(prefs?.distrito_principal_apd || prefs?.distrito_principal || ""), ...prefs?.otros_distritos_apd || []].filter(Boolean));
}
__name(distritosPrefsAPD, "distritosPrefsAPD");
function cargosMateriasPrefsAPD(prefs) {
  return unique([...prefs?.cargos_apd || [], ...prefs?.materias_apd || []]);
}
__name(cargosMateriasPrefsAPD, "cargosMateriasPrefsAPD");
function turnosPrefs(prefs) {
  return unique((prefs?.turnos || []).map((item) => {
    const x = norm(item);
    if (!x) return "";
    if (x === "CUALQUIERA" || x === "CUALQUIER TURNO") return "";
    if (x === "M" || x === "MANANA") return "MANANA";
    if (x === "T" || x === "TARDE") return "TARDE";
    if (x === "V" || x === "VESPERTINO") return "VESPERTINO";
    if (x === "N" || x === "NOCHE") return "NOCHE";
    if (x === "A" || x === "ALTERNADO") return "ALTERNADO";
    return x;
  }).filter(Boolean));
}
__name(turnosPrefs, "turnosPrefs");
function categoriasNivel(texto) {
  const t = norm(texto);
  const out = /* @__PURE__ */ new Set();
  if (!t) return out;
  if (t.includes("INICIAL")) out.add("INICIAL");
  if (t.includes("PRIMARIA") || t.includes("PRIMARIO")) out.add("PRIMARIO");
  if (t.includes("SECUNDARIA") || t.includes("SECUNDARIO")) out.add("SECUNDARIO");
  if (t.includes("SUPERIOR")) out.add("SUPERIOR");
  if (t.includes("FORMACION DOCENTE")) out.add("SUPERIOR");
  if (t.includes("DOCENTE")) out.add("SUPERIOR");
  if (t.includes("ESPECIAL")) out.add("EDUCACION ESPECIAL");
  if (t.includes("JOVENES") || t.includes("ADULTOS") || t.includes("CENS")) out.add("ADULTOS");
  if (t.includes("FISICA")) out.add("EDUCACION FISICA");
  if (t.includes("PSICOLOGIA") || t.includes("COMUNITARIA")) out.add("PSICOLOGIA");
  if (t.includes("ARTISTICA") || t.includes("ARTE")) out.add("EDUCACION ARTISTICA");
  if (t.includes("TECNICO")) out.add("TECNICO PROFESIONAL");
  return out;
}
__name(categoriasNivel, "categoriasNivel");
function matchDistritos(oferta, prefs) {
  const prefsD = distritosPrefsAPD(prefs);
  if (!prefsD.length) return { ok: true, motivo: "Sin filtro de distrito" };
  const distritoOferta = norm(oferta?.descdistrito || oferta?.distrito || "");
  if (!distritoOferta) return { ok: false, motivo: "La oferta no trae distrito" };
  const ok = prefsD.includes(distritoOferta);
  return { ok, motivo: ok ? `Distrito compatible: ${distritoOferta}` : `Distrito no compatible: ${distritoOferta}` };
}
__name(matchDistritos, "matchDistritos");
function matchCargosMaterias(oferta, prefs) {
  const prefsCM = cargosMateriasPrefsAPD(prefs);
  if (!prefsCM.length) return { ok: true, motivo: "Sin filtro de cargo o materia" };
  const textoOferta = norm([oferta?.descripcioncargo, oferta?.cargo, oferta?.descripcionarea, oferta?.materia, oferta?.asignatura, oferta?.descripcionmateria].filter(Boolean).join(" "));
  if (!textoOferta) return { ok: false, motivo: "La oferta no trae cargo o materia" };
  const ok = prefsCM.some((pref) => {
    const p = norm(pref);
    return textoOferta.includes(p) || p.includes(textoOferta) || textoOferta.split(" ").some((token) => token === p);
  });
  return { ok, motivo: ok ? "Cargo o materia compatible" : "Cargo o materia no compatible" };
}
__name(matchCargosMaterias, "matchCargosMaterias");
function matchTurno(oferta, prefs) {
  const prefsT = turnosPrefs(prefs);
  if (!prefsT.length) return { ok: true, motivo: "Sin filtro de turno" };
  const turnoOferta = norm(oferta?.turno || oferta?.descturno || "");
  if (!turnoOferta) return { ok: false, motivo: "La oferta no trae turno" };
  const ok = prefsT.includes(turnoOferta);
  return { ok, motivo: ok ? `Turno compatible: ${turnoOferta}` : `Turno no compatible: ${turnoOferta}` };
}
__name(matchTurno, "matchTurno");
function matchNivelModalidad(oferta, prefs) {
  const prefsN = prefs?.niveles || [];
  if (!prefsN.length) return { ok: true, motivo: "Sin filtro de nivel o modalidad" };
  const textoOferta = norm([oferta?.descnivelmodalidad, oferta?.nivel, oferta?.modalidad, oferta?.nivel_modalidad].filter(Boolean).join(" "));
  if (!textoOferta) return { ok: false, motivo: "La oferta no trae nivel o modalidad" };
  const catsOferta = categoriasNivel(textoOferta);
  const catsPrefs = /* @__PURE__ */ new Set();
  for (const pref of prefsN) {
    for (const cat of categoriasNivel(pref)) catsPrefs.add(cat);
  }
  if (!catsPrefs.size) return { ok: true, motivo: "Preferencia no reconocida" };
  let ok = false;
  for (const cat of catsPrefs) {
    if (catsOferta.has(cat)) {
      ok = true;
      break;
    }
  }
  return { ok, motivo: ok ? "Nivel o modalidad compatible" : "Nivel o modalidad no compatible" };
}
__name(matchNivelModalidad, "matchNivelModalidad");
function coincideOfertaConPreferencias(oferta, prefs) {
  const distrito = matchDistritos(oferta, prefs);
  if (!distrito.ok) return { match: false, detalle: { distrito } };
  const cargosMaterias = matchCargosMaterias(oferta, prefs);
  if (!cargosMaterias.ok) return { match: false, detalle: { distrito, cargosMaterias } };
  const turno = matchTurno(oferta, prefs);
  if (!turno.ok) return { match: false, detalle: { distrito, cargosMaterias, turno } };
  const nivelModalidad = matchNivelModalidad(oferta, prefs);
  if (!nivelModalidad.ok) return { match: false, detalle: { distrito, cargosMaterias, turno, nivelModalidad } };
  return { match: true, detalle: { distrito, cargosMaterias, turno, nivelModalidad } };
}
__name(coincideOfertaConPreferencias, "coincideOfertaConPreferencias");
function mapTurnoAPD(turno) {
  const x = norm(turno);
  if (x === "M" || x === "MANANA") return "MANANA";
  if (x === "T" || x === "TARDE") return "TARDE";
  if (x === "V" || x === "VESPERTINO") return "VESPERTINO";
  if (x === "N" || x === "NOCHE") return "NOCHE";
  if (x === "MT") return "MANANA";
  if (x === "TT") return "TARDE";
  if (x === "A" || x === "ALTERNADO") return "ALTERNADO";
  return x;
}
__name(mapTurnoAPD, "mapTurnoAPD");
function coincideOfertaConPreferenciasAPD(oferta, prefs) {
  return coincideOfertaConPreferencias({ descdistrito: oferta.descdistrito, descripcioncargo: oferta.descripcioncargo, cargo: oferta.cargo, descripcionarea: oferta.descripcionarea, materia: oferta.materia, asignatura: oferta.asignatura, descripcionmateria: oferta.descripcionmateria, turno: mapTurnoAPD(oferta.turno), descnivelmodalidad: oferta.descnivelmodalidad }, prefs);
}
__name(coincideOfertaConPreferenciasAPD, "coincideOfertaConPreferenciasAPD");
function historicoRowToOferta(row) {
  return { descdistrito: row?.distrito || "", descripcioncargo: row?.cargo || "", descripcionarea: row?.area || "", turno: row?.turno || "", descnivelmodalidad: row?.nivel_modalidad || "" };
}
__name(historicoRowToOferta, "historicoRowToOferta");
function historicoRowKey(row) {
  const sourceKey = String(row?.source_offer_key || "").trim();
  if (sourceKey) return sourceKey;
  const detalle = String(row?.iddetalle || "").trim();
  if (detalle) return detalle;
  return [row?.idoferta || "", row?.distrito || "", row?.escuela || "", row?.cargo || "", row?.area || "", row?.finoferta || ""].map((value) => norm(value)).join("|");
}
__name(historicoRowKey, "historicoRowKey");
function estadoHistoricoKey(value) {
  const raw = typeof value === "string" ? value : value?.estado;
  const estado = norm(raw || "");
  if (!estado) return "SIN ESTADO";
  if (estado.includes("ANUL")) return "ANULADA";
  if (estado.includes("DESIER")) return "DESIERTA";
  if (estado.includes("DESIGN")) return "DESIGNADA";
  if (estado.includes("FINAL")) return "FINALIZADA";
  if (estado.includes("CERR")) return "CERRADA";
  if (estado.includes("ACT") || estado.includes("ABIERT") || estado.includes("VIGENT")) return "ACTIVA";
  return estado;
}
__name(estadoHistoricoKey, "estadoHistoricoKey");
function estadoHistoricoLabel(value) {
  switch (estadoHistoricoKey(value)) {
    case "ACTIVA":
      return "Activa";
    case "DESIGNADA":
      return "Designada";
    case "ANULADA":
      return "Anulada";
    case "DESIERTA":
      return "Desierta";
    case "CERRADA":
      return "Cerrada";
    case "FINALIZADA":
      return "Finalizada";
    default:
      return String(value?.estado || value || "").trim() || "Sin estado";
  }
}
__name(estadoHistoricoLabel, "estadoHistoricoLabel");
function ofertaHistoricaActiva(row) {
  const estadoKey = estadoHistoricoKey(row);
  const fin = parseFechaFlexible(row?.finoferta)?.getTime() || 0;
  const ahora = Date.now();
  if (estadoKey === "ANULADA" || estadoKey === "DESIGNADA" || estadoKey === "DESIERTA" || estadoKey === "CERRADA" || estadoKey === "FINALIZADA") return false;
  if (fin && fin < ahora - 48 * 60 * 60 * 1e3) return false;
  return true;
}
__name(ofertaHistoricaActiva, "ofertaHistoricaActiva");
function tituloHistoricoRow(row) {
  return unique([row?.cargo || "", row?.area || ""].filter(Boolean)).join(" \xB7 ") || "Oferta APD";
}
__name(tituloHistoricoRow, "tituloHistoricoRow");
function topCountItems(values, limit = 5) {
  const counts = /* @__PURE__ */ new Map();
  for (const raw of Array.isArray(values) ? values : []) {
    const label = String(raw || "").trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, limit).map(([label, value]) => ({ label, value }));
}
__name(topCountItems, "topCountItems");
function promedioNumerico(values, digits = 1) {
  const nums = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  const avg = nums.reduce((acc, n) => acc + n, 0) / nums.length;
  const factor = 10 ** digits;
  return Math.round(avg * factor) / factor;
}
__name(promedioNumerico, "promedioNumerico");
function sortHistoricoDesc(a, b) {
  const ta = parseFechaFlexible(a?.captured_at || a?.last_seen_at)?.getTime() || 0;
  const tb = parseFechaFlexible(b?.captured_at || b?.last_seen_at)?.getTime() || 0;
  return tb - ta;
}
__name(sortHistoricoDesc, "sortHistoricoDesc");
function parseFechaFlexible(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/);
  if (iso) {
    const [, yyyy, mm, dd, hh = "0", mi = "0", ss = "0"] = iso;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
__name(parseFechaFlexible, "parseFechaFlexible");
function parsePartesFechaAbc(raw) {
  const value = String(raw || "").trim();
  if (!value || value.includes("9999")) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/);
  if (iso) {
    const [, yyyy, mm, dd, hh = "00", mi = "00", ss = "00"] = iso;
    return { yyyy, mm, dd, hh, mi, ss, hasTime: iso[4] != null };
  }
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = dmy;
    return { yyyy, mm: String(mm).padStart(2, "0"), dd: String(dd).padStart(2, "0"), hh: String(hh).padStart(2, "0"), mi: String(mi).padStart(2, "0"), ss: String(ss).padStart(2, "0"), hasTime: dmy[4] != null };
  }
  return null;
}

__name(parsePartesFechaAbc, "parsePartesFechaAbc");
function formatearFechaAbc(raw, mode = "auto") {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes("9999")) return "Sin fecha";
  const parts = parsePartesFechaAbc(value);
  if (!parts) return value;
  const dateStr = `${parts.dd}/${parts.mm}/${parts.yyyy}`;
  const hasRealTime = parts.hasTime && !(parts.hh === "00" && parts.mi === "00" && parts.ss === "00");
  if (mode === "date") return dateStr;
  if (mode === "datetime") return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr;
  return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr;
}
__name(formatearFechaAbc, "formatearFechaAbc");
function normalizarCursoDivisionServidor(value) {
  let s = String(value || "").trim();
  if (!s) return "";
  s = s.replace(/Â°/g, "\xB0").replace(/º/g, "\xB0").replace(/Ş/g, "\xB0").replace(/�/g, "\xB0");
  s = s.replace(/(\d)\s*°\s*(\d)\s*°?/g, "$1\xB0$2\xB0");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
__name(normalizarCursoDivisionServidor, "normalizarCursoDivisionServidor");
function sanitizeSolrNumber(value) {
  return String(value || "").replace(/[^\d]/g, "");
}
__name(sanitizeSolrNumber, "sanitizeSolrNumber");
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders() });
}
__name(json, "json");


async function sendPendingEmailDigests(env, options = {}) {
  const maxRows = clampInt(
    options?.max_rows || env.EMAIL_DIGEST_PENDING_LIMIT,
    1,
    500,
    200
  );

  const targetUserId = String(options?.target_user_id || "").trim();
  const MAX_VISIBLE_ALERTS_IN_EMAIL = 10;

  const pendingQuery =
    `pending_notifications?channel=eq.email&status=eq.pending` +
    `&select=id,user_id,kind,alert_key,payload,created_at` +
    `${targetUserId ? `&user_id=eq.${encodeURIComponent(targetUserId)}` : ""}` +
    `&order=created_at.desc&limit=${maxRows}`;

  const pendingRows = await supabaseSelect(
    env,
    pendingQuery
  ).catch(() => []);

  const grouped = new Map();

  for (const row of Array.isArray(pendingRows) ? pendingRows : []) {
    const userId = String(row?.user_id || "").trim();
    if (!userId) continue;
    if (!grouped.has(userId)) grouped.set(userId, []);
    grouped.get(userId).push(row);
  }

  let processedUsers = 0;
  let sent = 0;
  let failed = 0;
  const pending_rows = Array.isArray(pendingRows) ? pendingRows.length : 0;

  if (!pending_rows) {
    return {
      ok: true,
      mode: "pending_notifications",
      processed_users: 0,
      sent: 0,
      failed: 0,
      pending_rows: 0,
      target_user_id: targetUserId || null
    };
  }

  for (const [userId, rows] of grouped.entries()) {
    const user = await obtenerUsuario(env, userId).catch(() => null);
    if (!user?.id || !user?.email || user?.activo === false) continue;

    const resolved = await resolverPlanUsuario(env, user.id).catch(() => null);
    if (!resolved || !isPlanActivo(resolved)) continue;

    const prefsRows = await supabaseSelect(
      env,
      `user_preferences?user_id=eq.${encodeURIComponent(user.id)}&select=alertas_activas,alertas_email`
    ).catch(() => []);

    const prefs = Array.isArray(prefsRows) ? prefsRows[0] : null;
    if (!prefs?.alertas_activas || !prefs?.alertas_email) continue;

    processedUsers += 1;

    const rawAlerts = rows.map(row => row?.payload?.alert || row?.payload || {});
    const alerts = await enrichAlertsForRichChannels(
      env,
      user,
      rawAlerts,
      MAX_VISIBLE_ALERTS_IN_EMAIL
    );

    if (!alerts.length) continue;

    const totalAlerts = rows.length;
    const shownCount = alerts.length;

    const asunto =
      totalAlerts > shownCount
        ? `APDocentePBA: ${shownCount} de ${totalAlerts} alertas nuevas`
        : `APDocentePBA: ${totalAlerts} nueva${totalAlerts === 1 ? "" : "s"} alerta${totalAlerts === 1 ? "" : "s"} para vos`;

    const html = buildDigestHtml(alerts, user, {
      total_alerts: totalAlerts,
      max_visible: MAX_VISIBLE_ALERTS_IN_EMAIL,
      panel_url: "https://alertasapd.com.ar"
    });

    const send = await enviarMailBrevo(
      user.email,
      user.nombre || "",
      asunto,
      html,
      env
    );

    const rowIds = rows.map(item => item.id).filter(Boolean);
    const rowIdsQuery = rowIds.join(",");

    if (send?.ok) {
      sent += 1;

      await supabaseInsert(env, "notification_delivery_logs", {
        user_id: user.id,
        channel: "email",
        template_code: "apd_email_digest",
        destination: user.email,
        status: "sent_digest",
        provider_message_id: null,
        payload: {
          total_alerts: totalAlerts,
          alert_keys: rows.map(item => item.alert_key).filter(Boolean)
        },
        provider_response: send || null
      }).catch(() => null);

      if (rowIds.length) {
        await fetch(
          `${env.SUPABASE_URL}/rest/v1/pending_notifications?id=in.(${rowIdsQuery})`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              Prefer: "return=minimal"
            },
            body: JSON.stringify({
              status: "sent",
              sent_at: new Date().toISOString()
            })
          }
        ).catch(() => null);
      }
    } else {
      failed += 1;

      await supabaseInsert(env, "notification_delivery_logs", {
        user_id: user.id,
        channel: "email",
        template_code: "apd_email_digest",
        destination: user.email,
        status: "failed_digest",
        provider_message_id: null,
        payload: {
          total_alerts: totalAlerts,
          alert_keys: rows.map(item => item.alert_key).filter(Boolean)
        },
        provider_response: send || null
      }).catch(() => null);

      if (rowIds.length) {
        await fetch(
          `${env.SUPABASE_URL}/rest/v1/pending_notifications?id=in.(${rowIdsQuery})`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              Prefer: "return=minimal"
            },
            body: JSON.stringify({
              status: "failed"
            })
          }
        ).catch(() => null);
      }
    }
  }

  return {
    ok: true,
    mode: "pending_notifications",
    processed_users: processedUsers,
    sent,
    failed,
    pending_rows,
    target_user_id: targetUserId || null
  };
}
__name(sendPendingEmailDigests, "sendPendingEmailDigests");
function buildDigestHtml(alerts, user, options = {}) {
  const panelUrl = String(options?.panel_url || "https://alertasapd.com.ar").trim();

  const normalizedAlerts = (Array.isArray(alerts) ? alerts : []).map(item => ({
    offer_payload: normalizeOfferPayload(item?.offer_payload || item || {})
  }));

  const totalAlerts = Math.max(
    Number(options?.total_alerts || 0),
    normalizedAlerts.length
  );

  const maxVisible = Math.max(
    1,
    Number(options?.max_visible || normalizedAlerts.length || 1)
  );

  const visibleAlerts = normalizedAlerts.slice(0, maxVisible);
  const showingCount = visibleAlerts.length;
  const remainingCount = Math.max(0, totalAlerts - showingCount);

  const title =
    totalAlerts > showingCount
      ? `${showingCount} de ${totalAlerts} alertas nuevas`
      : `${totalAlerts} alerta${totalAlerts === 1 ? "" : "s"} nueva${totalAlerts === 1 ? "" : "s"}`;

  const intro =
    String(options?.intro_text || "").trim() ||
    `Hola ${escHtml(user?.nombre || "")}, estas son las alertas nuevas compatibles con tus preferencias.`;

  const items = visibleAlerts.map(renderMailOfferCard).join("");

  const moreNote = remainingCount > 0
    ? `
      <div style="margin-top:14px;padding:12px 14px;background:#fff8e8;border:1px solid #f2d38b;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#6b4e00;">
        Mostramos las ${showingCount} más nuevas. Tenés ${remainingCount} alerta${remainingCount === 1 ? "" : "s"} más para revisar en el panel.
      </div>
    `
    : "";

  return `
    <div style="background:#f0f2f7;padding:20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">

            <table role="presentation" width="700" cellpadding="0" cellspacing="0" border="0" style="width:700px;max-width:700px;">
              <tr>
                <td style="background:linear-gradient(135deg,#0f3460 0%,#1a4f8a 100%);color:#ffffff;padding:22px;border-radius:16px 16px 0 0;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;line-height:1.2;">
                    APDocentePBA
                  </div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;opacity:.9;margin-top:4px;">
                    Alertas de Actos Públicos Digitales
                  </div>
                </td>
              </tr>

              <tr>
                <td style="background:#ffffff;padding:18px 18px 20px 18px;border:1px solid #dbe3f0;border-top:none;border-radius:0 0 16px 16px;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700;line-height:1.25;color:#0f3460;margin:0 0 10px 0;">
                    ${escHtml(title)}
                  </div>

                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#374151;margin:0 0 16px 0;">
                    ${intro}
                  </div>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${
                      items || `
                        <tr>
                          <td style="padding:16px;border:1px dashed #cbd5e1;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#475569;">
                            No hay alertas para mostrar en este envío.
                          </td>
                        </tr>
                      `
                    }
                  </table>

                  ${moreNote}

                  <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
                    <a href="${panelUrl}" target="_blank" style="display:inline-block;background:#0f3460;color:#ffffff;padding:10px 14px;margin:5px;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">
                      Si querés mirar todas las alertas, ingresá al panel
                    </a>
                  </div>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </div>
  `;
}
__name(buildDigestHtml, "buildDigestHtml");

// worker_hotfix.js
var API_URL_PREFIX3 = "/api";
var LEGACY_GAS_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
var HOTFIX_VERSION = "2026-04-13-hotfix-final-2-alertas";
var ALERT_ROWS_PER_PAGE = 150;
var ALERT_MAX_PAGES = 6;
function corsHeaders2() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
__name(corsHeaders2, "corsHeaders");
function json2(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders2() });
}
__name(json2, "json");
function normalizeEmail2(v) {
  return String(v || "").trim().toLowerCase();
}
__name(normalizeEmail2, "normalizeEmail");
function normalizeText2(v) {
  return String(v || "").trim();
}
__name(normalizeText2, "normalizeText");
function norm2(v) {
  return String(v || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s/().,-]/gu, " ").replace(/\s+/g, " ").trim();
}
__name(norm2, "norm");
function unique2(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}
__name(unique2, "unique");
function sanitizeSolrNumber2(value) {
  return String(value || "").replace(/[^\d]/g, "");
}
__name(sanitizeSolrNumber2, "sanitizeSolrNumber");
function mapTurnoAPD2(turno) {
  const x = norm2(turno);
  if (x === "M" || x === "MANANA") return "MANANA";
  if (x === "T" || x === "TARDE") return "TARDE";
  if (x === "V" || x === "VESPERTINO") return "VESPERTINO";
  if (x === "N" || x === "NOCHE") return "NOCHE";
  if (x === "A" || x === "ALTERNADO") return "ALTERNADO";
  return x;
}
__name(mapTurnoAPD2, "mapTurnoAPD");
function canonicalizarNivelPreferencia2(value) {
  const s = norm2(value);
  if (!s) return "";
  if (s.includes("SUPERIOR") || s.includes("FORMACION DOCENTE") || s.includes("DOCENTE")) return "SUPERIOR";
  if (s.includes("INICIAL")) return "INICIAL";
  if (s.includes("PRIMARIA") || s.includes("PRIMARIO")) return "PRIMARIO";
  if (s.includes("SECUNDARIA") || s.includes("SECUNDARIO")) return "SECUNDARIO";
  if (s.includes("ESPECIAL")) return "EDUCACION ESPECIAL";
  if (s.includes("JOVENES") || s.includes("ADULTOS") || s.includes("CENS")) return "ADULTOS";
  if (s.includes("FISICA")) return "EDUCACION FISICA";
  if (s.includes("PSICOLOGIA") || s.includes("COMUNITARIA")) return "PSICOLOGIA";
  if (s.includes("ARTISTICA") || s.includes("ARTE")) return "EDUCACION ARTISTICA";
  if (s.includes("TECNICO")) return "TECNICO PROFESIONAL";
  return s;
}
__name(canonicalizarNivelPreferencia2, "canonicalizarNivelPreferencia");
function nivelOfertaKeys(texto) {
  const t = norm2(texto);
  const out = /* @__PURE__ */ new Set();
  if (!t) return out;
  if (t.includes("INICIAL")) out.add("INICIAL");
  if (t.includes("PRIMARIA") || t.includes("PRIMARIO")) out.add("PRIMARIO");
  if (t.includes("SECUNDARIA") || t.includes("SECUNDARIO")) out.add("SECUNDARIO");
  if (t.includes("SUPERIOR") || t.includes("FORMACION DOCENTE") || t.includes("DOCENTE")) out.add("SUPERIOR");
  if (t.includes("ESPECIAL")) out.add("EDUCACION ESPECIAL");
  if (t.includes("JOVENES") || t.includes("ADULTOS") || t.includes("CENS")) out.add("ADULTOS");
  if (t.includes("FISICA")) out.add("EDUCACION FISICA");
  if (t.includes("PSICOLOGIA") || t.includes("COMUNITARIA")) out.add("PSICOLOGIA");
  if (t.includes("ARTISTICA") || t.includes("ARTE")) out.add("EDUCACION ARTISTICA");
  if (t.includes("TECNICO")) out.add("TECNICO PROFESIONAL");
  return out;
}
__name(nivelOfertaKeys, "nivelOfertaKeys");
function parseFechaFlexible2(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/);
  if (iso) {
    const [, yyyy, mm, dd, hh = "0", mi = "0", ss = "0"] = iso;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
__name(parseFechaFlexible2, "parseFechaFlexible");
function parsePartesFechaAbc2(raw) {
  const value = String(raw || "").trim();
  if (!value || value.includes("9999")) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/);
  if (iso) {
    const [, yyyy, mm, dd, hh = "00", mi = "00", ss = "00"] = iso;
    return { yyyy, mm, dd, hh, mi, ss, hasTime: iso[4] != null };
  }
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = dmy;
    return {
      yyyy,
      mm: String(mm).padStart(2, "0"),
      dd: String(dd).padStart(2, "0"),
      hh: String(hh).padStart(2, "0"),
      mi: String(mi).padStart(2, "0"),
      ss: String(ss).padStart(2, "0"),
      hasTime: dmy[4] != null
    };
  }
  return null;
}
__name(parsePartesFechaAbc2, "parsePartesFechaAbc");
function formatearFechaAbc2(raw, mode = "auto") {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes("9999")) return "Sin fecha";
  const parts = parsePartesFechaAbc2(value);
  if (!parts) return value;
  const dateStr = `${parts.dd}/${parts.mm}/${parts.yyyy}`;
  const hasRealTime = parts.hasTime && !(parts.hh === "00" && parts.mi === "00" && parts.ss === "00");
  if (mode === "date") return dateStr;
  if (mode === "datetime") return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr;
  return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr;
}
__name(formatearFechaAbc2, "formatearFechaAbc");
function buildSourceOfferKeyFromOferta2(oferta) {
  const detalle = sanitizeSolrNumber2(oferta?.iddetalle || oferta?.id || "");
  if (detalle) return `D_${detalle}`;
  const ofertaId = sanitizeSolrNumber2(oferta?.idoferta || "");
  if (ofertaId) return `O_${ofertaId}`;
  return [norm2(oferta?.descdistrito || ""), norm2(oferta?.escuela || oferta?.nombreestablecimiento || ""), norm2(oferta?.descripcioncargo || oferta?.cargo || ""), norm2(oferta?.descripcionarea || "")].filter(Boolean).join("_").slice(0, 220);
}
__name(buildSourceOfferKeyFromOferta2, "buildSourceOfferKeyFromOferta");
function buildAbcPostulantesUrl2(ofertaId, detalleId) {
  const params = new URLSearchParams();
  const ofertaSafe = sanitizeSolrNumber2(ofertaId);
  const detalleSafe = sanitizeSolrNumber2(detalleId);
  if (ofertaSafe) params.set("oferta", ofertaSafe);
  if (detalleSafe) params.set("detalle", detalleSafe);
  return `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?${params.toString()}`;
}
__name(buildAbcPostulantesUrl2, "buildAbcPostulantesUrl");
async function sha256Hex2(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex2, "sha256Hex");
async function passwordMatches2(storedPassword, plainPassword) {
  const stored = String(storedPassword || "");
  const plain = String(plainPassword || "");
  if (!stored || !plain) return false;
  if (stored === plain) return true;
  const hashed = await sha256Hex2(plain);
  return stored === hashed;
}
__name(passwordMatches2, "passwordMatches");
async function supabaseRequest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...init.headers || {} }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}
__name(supabaseRequest, "supabaseRequest");
async function supabaseSelect2(env, query) {
  return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}
__name(supabaseSelect2, "supabaseSelect");
async function supabaseInsertReturning2(env, table, data) {
  const rows = await supabaseRequest(env, table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
  return Array.isArray(rows) ? rows[0] : rows;
}
__name(supabaseInsertReturning2, "supabaseInsertReturning");
async function supabasePatch2(env, table, filter, data) {
  return await supabaseRequest(env, `${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
}
__name(supabasePatch2, "supabasePatch");
async function findUserByEmail2(env, email) {
  const rows = await supabaseSelect2(env, `users?email=ilike.${encodeURIComponent(email)}&select=id,nombre,apellido,email,celular,password_hash,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
__name(findUserByEmail2, "findUserByEmail");
async function getUserById(env, userId) {
  const rows = await supabaseSelect2(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,ultimo_login&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
__name(getUserById, "getUserById");
async function ensureTrialIfNoSubscriptions2(env, userId, email, source = "trial_auto_hotfix") {
  const existing = await supabaseSelect2(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`).catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) return { ok: true, created: false };
  await supabaseInsertReturning2(env, "user_subscriptions", { user_id: userId, plan_code: "TRIAL_7D", status: "ACTIVE", source, started_at: (/* @__PURE__ */ new Date()).toISOString(), trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString(), current_period_ends_at: null, mercadopago_preapproval_id: null, mercadopago_payer_email: email || null, external_reference: `${userId}:TRIAL_7D:${Date.now()}` }).catch(() => null);
  return { ok: true, created: true };
}
__name(ensureTrialIfNoSubscriptions2, "ensureTrialIfNoSubscriptions");
async function touchUltimoLogin2(env, userId) {
  await supabasePatch2(env, "users", `id=eq.${encodeURIComponent(userId)}`, { ultimo_login: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => null);
}
__name(touchUltimoLogin2, "touchUltimoLogin");
async function verifyGoogleCredential2(idToken, expectedAud) {
  if (!expectedAud) throw new Error("Falta GOOGLE_CLIENT_ID en Cloudflare");
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Google no devolvio una respuesta valida");
  }
  if (!res.ok) throw new Error(data?.error_description || data?.error || "Google no valido el token");
  if (String(data.aud || "") !== String(expectedAud)) throw new Error("Google Client ID no coincide");
  if (!(data.email_verified === true || data.email_verified === "true")) throw new Error("El email de Google no esta verificado");
  const parts = String(data.name || "").trim().split(/\s+/).filter(Boolean);
  const nombre = String(data.given_name || parts.shift() || "Docente").trim() || "Docente";
  const apellido = String(data.family_name || parts.join(" ") || "-").trim() || "-";
  return { sub: String(data.sub || ""), email: normalizeEmail2(data.email || ""), nombre, apellido };
}
__name(verifyGoogleCredential2, "verifyGoogleCredential");
async function ensureLocalUser(env, payload) {
  const email = normalizeEmail2(payload?.email || "");
  if (!email) throw new Error("Falta email");
  const existing = await findUserByEmail2(env, email);
  if (existing?.id) {
    const patch = {};
    if (!existing.nombre && payload?.nombre) patch.nombre = normalizeText2(payload.nombre);
    if (!existing.apellido && payload?.apellido) patch.apellido = normalizeText2(payload.apellido);
    if (!existing.celular && payload?.celular) patch.celular = normalizeText2(payload.celular);
    if (existing.activo === false) patch.activo = true;
    if (!existing.password_hash && payload?.password) patch.password_hash = String(payload.password);
    if (Object.keys(patch).length) {
      const patched = await supabasePatch2(env, "users", `id=eq.${encodeURIComponent(existing.id)}`, patch).catch(() => null);
      return Array.isArray(patched) ? patched[0] || { ...existing, ...patch } : { ...existing, ...patch };
    }
    return existing;
  }
  return await supabaseInsertReturning2(env, "users", { nombre: normalizeText2(payload?.nombre || "Docente"), apellido: normalizeText2(payload?.apellido || "-") || "-", email, celular: normalizeText2(payload?.celular || ""), password_hash: payload?.password ? String(payload.password) : null, activo: true });
}
__name(ensureLocalUser, "ensureLocalUser");
async function tryLegacyPasswordLogin(email, password) {
  const payloads = [{ action: "login_password", email, password }, { action: "login", email, password }];
  for (const payload of payloads) {
    try {
      const res = await fetch(LEGACY_GAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (data?.ok || data?.success) return { ok: true, data };
    } catch {
    }
  }
  return { ok: false };
}
__name(tryLegacyPasswordLogin, "tryLegacyPasswordLogin");
async function handleLoginHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail2(body?.email);
  const password = String(body?.password || "");
  if (!email || !password) return json2({ ok: false, message: "Faltan datos" }, 400);
  let user = await findUserByEmail2(env, email);
  if (user?.id && user.activo === false) return json2({ ok: false, message: "Usuario inactivo" }, 403);
  if (user?.id) {
    const okPassword = await passwordMatches2(user.password_hash, password);
    if (okPassword) {
      await ensureTrialIfNoSubscriptions2(env, user.id, user.email, "trial_auto_login_hotfix");
      await touchUltimoLogin2(env, user.id);
      return json2({ ok: true, token: String(user.id), user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
    }
  }
  const legacy = await tryLegacyPasswordLogin(email, password);
  if (legacy.ok) {
    const legacyUser = legacy.data?.user || legacy.data?.data || {};
    user = await ensureLocalUser(env, { email, password, nombre: legacyUser?.nombre || legacyUser?.name || "", apellido: legacyUser?.apellido || legacyUser?.last_name || "", celular: legacyUser?.celular || legacyUser?.phone || "" });
    if (!user?.id) return json2({ ok: false, message: "No se pudo migrar la cuenta existente" }, 500);
    await ensureTrialIfNoSubscriptions2(env, user.id, user.email, "trial_auto_login_legacy");
    await touchUltimoLogin2(env, user.id);
    return json2({ ok: true, migrated_legacy: true, token: String(user.id), user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
  }
  if (user?.id) return json2({ ok: false, message: "Password incorrecto" }, 401);
  return json2({ ok: false, message: "Usuario no encontrado o credenciales incorrectas" }, 401);
}
__name(handleLoginHotfix, "handleLoginHotfix");
async function handleGoogleAuthHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const credential = String(body?.credential || "").trim();
  if (!credential) return json2({ ok: false, message: "Falta credential de Google" }, 400);
  const googleUser = await verifyGoogleCredential2(credential, env.GOOGLE_CLIENT_ID);
  const user = await ensureLocalUser(env, googleUser);
  if (!user?.id) return json2({ ok: false, message: "No se pudo crear o vincular el usuario con Google" }, 500);
  await ensureTrialIfNoSubscriptions2(env, user.id, user.email, "trial_auto_google_hotfix");
  await touchUltimoLogin2(env, user.id);
  return json2({ ok: true, mode: "login", token: String(user.id), user: { id: user.id, nombre: user.nombre || googleUser.nombre || "", apellido: user.apellido || googleUser.apellido || "", email: user.email || googleUser.email || "" } });
}
__name(handleGoogleAuthHotfix, "handleGoogleAuthHotfix");
function adaptarPreferenciasRow2(row) {
  const arrNorm2 = /* @__PURE__ */ __name((value) => {
    if (Array.isArray(value)) return value.map((item) => norm2(item)).filter(Boolean);
    if (typeof value === "string" && value.trim()) return value.split(",").map((item) => norm2(item)).filter(Boolean);
    return [];
  }, "arrNorm");
  return { user_id: row.user_id || "", distrito_principal: norm2(row.distrito_principal || ""), otros_distritos: unique2(arrNorm2(row.otros_distritos)), cargos: unique2(arrNorm2(row.cargos)), materias: unique2(arrNorm2(row.materias)), niveles: unique2(arrNorm2(row.niveles)), turnos: unique2(arrNorm2(row.turnos)), alertas_activas: !!row.alertas_activas, alertas_email: !!row.alertas_email, alertas_telegram: !!row.alertas_telegram, alertas_whatsapp: !!row.alertas_whatsapp };
}
__name(adaptarPreferenciasRow2, "adaptarPreferenciasRow");
async function getUserPrefs(env, userId) {
  const rows = await supabaseSelect2(env, `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`).catch(() => []);
  return rows?.[0] ? adaptarPreferenciasRow2(rows[0]) : null;
}
__name(getUserPrefs, "getUserPrefs");
async function getCatalogDistricts(env) {
  const rows = await supabaseSelect2(env, "catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
__name(getCatalogDistricts, "getCatalogDistricts");
function resolveDistrictsForQuery(prefs, catalog) {
  const raw = [prefs?.distrito_principal || "", ...Array.isArray(prefs?.otros_distritos) ? prefs.otros_distritos : []].map(norm2).filter(Boolean);
  const out = [];
  for (const item of raw) {
    const hit = (catalog || []).find((row) => {
      const a = norm2(row?.nombre || "");
      const b = norm2(row?.apd_nombre || "");
      return a === item || b === item || item.includes(a) || a.includes(item) || item.includes(b) || b.includes(item);
    });
    out.push(norm2(hit?.apd_nombre || hit?.nombre || item));
  }
  return unique2(out);
}
__name(resolveDistrictsForQuery, "resolveDistrictsForQuery");
function matchesCargo(oferta, prefs) {
  const filtros = unique2([...prefs?.cargos || [], ...prefs?.materias || []].map(norm2).filter(Boolean));
  if (!filtros.length) return true;
  const textoOferta = norm2([oferta?.descripcioncargo, oferta?.cargo, oferta?.descripcionarea, oferta?.materia, oferta?.asignatura].filter(Boolean).join(" "));
  if (!textoOferta) return false;
  return filtros.some((item) => textoOferta.includes(item) || item.includes(textoOferta));
}
__name(matchesCargo, "matchesCargo");
function matchesTurno(oferta, prefs) {
  const turnos = unique2((prefs?.turnos || []).map((item) => mapTurnoAPD2(item)).filter(Boolean));
  if (!turnos.length) return true;
  return turnos.includes(mapTurnoAPD2(oferta?.turno || ""));
}
__name(matchesTurno, "matchesTurno");
function matchesNivel(oferta, prefs) {
  const niveles = unique2((prefs?.niveles || []).map(canonicalizarNivelPreferencia2).filter(Boolean));
  if (!niveles.length) return true;
  const ofertaKeys = nivelOfertaKeys(oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "");
  return niveles.some((item) => ofertaKeys.has(item));
}
__name(matchesNivel, "matchesNivel");
function ofertaVigente(oferta) {
  const estado = norm2(oferta?.estado || "");
  if (["ANULADA", "DESIGNADA", "DESIERTA", "CERRADA", "FINALIZADA", "NO VIGENTE"].includes(estado)) return false;
  const cierre = parseFechaFlexible2(oferta?.finoferta || oferta?.fecha_cierre || "");
  if (cierre && cierre.getTime() < Date.now()) return false;
  return true;
}
__name(ofertaVigente, "ofertaVigente");
function adaptOffer(oferta) {
  const cargo = oferta?.descripcioncargo || oferta?.cargo || "";
  const area = oferta?.descripcionarea || oferta?.area || oferta?.materia || "";
  const finoferta = oferta?.finoferta || "";
  return { source_offer_key: buildSourceOfferKeyFromOferta2(oferta), iddetalle: oferta?.iddetalle || oferta?.id || null, idoferta: oferta?.idoferta || null, distrito: norm2(oferta?.descdistrito || oferta?.distrito || ""), cargo, materia: area, area, turno: mapTurnoAPD2(oferta?.turno || ""), nivel_modalidad: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", nivel: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", modalidad: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", escuela: oferta?.escuela || oferta?.nombreestablecimiento || "", cursodivision: oferta?.cursodivision || oferta?.curso_division || "", curso_division: oferta?.cursodivision || oferta?.curso_division || "", jornada: oferta?.jornada || "", hsmodulos: oferta?.hsmodulos || oferta?.modulos || "", modulos: oferta?.hsmodulos || oferta?.modulos || "", supl_desde: oferta?.supl_desde || "", supl_hasta: oferta?.supl_hasta || "", desde: formatearFechaAbc2(oferta?.supl_desde || "", "date"), hasta: formatearFechaAbc2(oferta?.supl_hasta || "", "date"), revista: oferta?.revista || oferta?.supl_revista || "", situacion_revista: oferta?.revista || oferta?.supl_revista || "", revista_codigo: "", finoferta, finoferta_label: formatearFechaAbc2(finoferta, "datetime") || finoferta, fecha_cierre: formatearFechaAbc2(finoferta, "datetime") || finoferta, cierre: formatearFechaAbc2(finoferta, "datetime") || finoferta, dias_horarios: String(oferta?.dias_horarios || oferta?.diashorarios || oferta?.horario || "").trim(), horario: String(oferta?.dias_horarios || oferta?.diashorarios || oferta?.horario || "").trim(), observaciones: oferta?.observaciones || "", abc_postulantes_url: buildAbcPostulantesUrl2(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), abc_url: buildAbcPostulantesUrl2(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), link: buildAbcPostulantesUrl2(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), estado: oferta?.estado || "", raw: oferta };
}
__name(adaptOffer, "adaptOffer");
async function fetchOffersForDistrict(distritoAPD) {
  const docs = [];
  for (let i = 0; i < ALERT_MAX_PAGES; i += 1) {
    const start = i * ALERT_ROWS_PER_PAGE;
    const q = `descdistrito:"${String(distritoAPD || "").replace(/(["\\])/g, "\\$1")}"`;
    const url = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${ALERT_ROWS_PER_PAGE}&start=${start}&wt=json&sort=ult_movimiento%20desc`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`APD respondio ${res.status}: ${text}`);
    }
    const data = await res.json().catch(() => ({}));
    const pageDocs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    if (!pageDocs.length) break;
    docs.push(...pageDocs.filter((doc) => norm2(doc?.descdistrito || "") === norm2(distritoAPD)));
    if (pageDocs.length < ALERT_ROWS_PER_PAGE) break;
  }
  return docs;
}
__name(fetchOffersForDistrict, "fetchOffersForDistrict");
async function buildAlertResultsFallback(env, userId) {
  const user = await getUserById(env, userId);
  if (!user) return { ok: false, message: "Usuario no encontrado" };
  const prefs = await getUserPrefs(env, userId);
  if (!prefs || !prefs.alertas_activas) return { ok: true, user, total_fuente: 0, total: 0, descartadas_total: 0, descartadas_preview: [], debug_distritos: [], resultados: [] };
  const catalog = await getCatalogDistricts(env);
  const distritos = resolveDistrictsForQuery(prefs, catalog);
  if (!distritos.length) return { ok: true, user, total_fuente: 0, total: 0, descartadas_total: 0, descartadas_preview: [], debug_distritos: [], resultados: [] };
  const debug = [];
  const allDocs = [];
  const seenDocs = /* @__PURE__ */ new Set();
  for (const distrito of distritos) {
    const docs = await fetchOffersForDistrict(distrito).catch(() => []);
    debug.push({ distrito_apd: distrito, query_usada: `descdistrito:"${distrito}"`, total_apd_bruto: docs.length, total_apd_filtrado: docs.length });
    for (const doc of docs) {
      const key = buildSourceOfferKeyFromOferta2(doc);
      if (!key || seenDocs.has(key)) continue;
      seenDocs.add(key);
      allDocs.push(doc);
    }
  }
  const descartadas = [];
  const resultados = [];
  const seenAlerts = /* @__PURE__ */ new Set();
  for (const oferta of allDocs) {
    if (!ofertaVigente(oferta)) {
      descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "oferta_no_vigente" });
      continue;
    }
    if (!matchesCargo(oferta, prefs)) {
      descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "cargo_no_compatible" });
      continue;
    }
    if (!matchesTurno(oferta, prefs)) {
      descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "turno_no_compatible" });
      continue;
    }
    if (!matchesNivel(oferta, prefs)) {
      descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "nivel_no_compatible" });
      continue;
    }
    const item = adaptOffer(oferta);
    const key = `${item.source_offer_key}|${item.escuela}|${item.turno}`;
    if (seenAlerts.has(key)) continue;
    seenAlerts.add(key);
    resultados.push(item);
  }
  resultados.sort((a, b) => (parseFechaFlexible2(b?.finoferta)?.getTime() || 0) - (parseFechaFlexible2(a?.finoferta)?.getTime() || 0));
  return { ok: true, user, preferencias_originales: prefs, preferencias_canonizadas: prefs, total_fuente: allDocs.length, total: resultados.length, descartadas_total: descartadas.length, descartadas_preview: descartadas.slice(0, 20), debug_distritos: debug, resultados };
}
__name(buildAlertResultsFallback, "buildAlertResultsFallback");
async function delegateJson(originalWorker, request, env, ctx) {
  const response = await originalWorker.fetch(request, env, ctx);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data, text };
}
__name(delegateJson, "delegateJson");
function getChannelStateStore(env) {
  return env.EMAIL_SWEEP_STATE || env.CHANNEL_STATE || null;
}
__name(getChannelStateStore, "getChannelStateStore");
function telegramStateKey(userId) {
  return `telegram:user:${String(userId || "").trim().toUpperCase()}`;
}
__name(telegramStateKey, "telegramStateKey");
function telegramChatStateKey(chatId) {
  return `telegram:chat:${String(chatId || "").trim()}`;
}
__name(telegramChatStateKey, "telegramChatStateKey");
function whatsappStateKey(userId) {
  return `whatsapp:user:${String(userId || "").trim().toUpperCase()}`;
}
__name(whatsappStateKey, "whatsappStateKey");
async function getTelegramState(env, userId) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const raw = await kv.get(telegramStateKey(userId));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
__name(getTelegramState, "getTelegramState");
async function saveTelegramState(env, userId, patch) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const current = await getTelegramState(env, userId) || {};
  const next = { ...current, ...patch, user_id: String(userId || "").trim().toUpperCase(), updated_at: new Date().toISOString() };
  await kv.put(telegramStateKey(userId), JSON.stringify(next));
  if (next.connected && next.chat_id) {
    await kv.put(telegramChatStateKey(next.chat_id), next.user_id);
  }
  return next;
}
__name(saveTelegramState, "saveTelegramState");
async function getTelegramUserIdByChat(env, chatId) {
  const kv = getChannelStateStore(env);
  if (!kv || !chatId) return "";
  return String(await kv.get(telegramChatStateKey(chatId)) || "").trim().toUpperCase();
}
__name(getTelegramUserIdByChat, "getTelegramUserIdByChat");
async function getWhatsAppState(env, userId) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const raw = await kv.get(whatsappStateKey(userId));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
__name(getWhatsAppState, "getWhatsAppState");
async function saveWhatsAppState(env, userId, patch) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const current = await getWhatsAppState(env, userId) || {};
  const next = { ...current, ...patch, user_id: String(userId || "").trim().toUpperCase(), updated_at: new Date().toISOString() };
  await kv.put(whatsappStateKey(userId), JSON.stringify(next));
  return next;
}
__name(saveWhatsAppState, "saveWhatsAppState");
function maskChatId(chatId) {
  const raw = String(chatId || "").trim();
  if (!raw) return "";
  if (raw.length <= 4) return raw;
  return `${"•".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}
__name(maskChatId, "maskChatId");
function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
__name(maskPhone, "maskPhone");
function buildTelegramBotLink(env, userId) {
  const username = String(env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@+/, "");
  const normalizedUserId = String(userId || "").trim();
  if (!username || !normalizedUserId) return "";
  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(normalizedUserId)}`;
}
__name(buildTelegramBotLink, "buildTelegramBotLink");
async function sendTelegramText(env, chatId, text) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.description || `Telegram HTTP ${res.status}`);
  return data;
}
__name(sendTelegramText, "sendTelegramText");
function requireTelegramWebhookSecret(request, env) {
  const configured = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!configured) return;
  const provided = String(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "").trim();
  if (!provided || provided !== configured) {
    const err = new Error("Webhook Telegram no autorizado");
    err.status = 401;
    throw err;
  }
}
__name(requireTelegramWebhookSecret, "requireTelegramWebhookSecret");
function telegramUpdateDedupeKey(updateId) {
  return `telegram:update:${String(updateId || "").trim()}`;
}
__name(telegramUpdateDedupeKey, "telegramUpdateDedupeKey");
function whatsappMessageDedupeKey(messageId) {
  return `whatsapp:message:${String(messageId || "").trim()}`;
}
__name(whatsappMessageDedupeKey, "whatsappMessageDedupeKey");
async function wasInboundEventProcessed(env, key) {
  const kv = getChannelStateStore(env);
  if (!kv || !key) return false;
  return !!await kv.get(key);
}
__name(wasInboundEventProcessed, "wasInboundEventProcessed");
async function markInboundEventProcessed(env, key, ttlSeconds) {
  const kv = getChannelStateStore(env);
  if (!kv || !key) return;
  await kv.put(key, new Date().toISOString(), { expirationTtl: ttlSeconds });
}
__name(markInboundEventProcessed, "markInboundEventProcessed");

async function resolveTelegramEntitlement(env, userId) {
  const resolved = await resolverPlanUsuario(env, userId);
  return {
    plan_code: String(resolved?.plan?.code || resolved?.subscription?.plan_code || "TRIAL_7D").trim().toUpperCase(),
    plan_name: String(resolved?.plan?.nombre || resolved?.plan?.display_name || resolved?.plan?.code || "TRIAL_7D").trim(),
    allowed: true,
    source: "query_mode_all_plans",
    flags: resolved?.plan?.feature_flags || {}
  };
}
__name(resolveTelegramEntitlement, "resolveTelegramEntitlement");
async function resolveWhatsAppEntitlement(env, userId) {
  const resolved = await resolverPlanUsuario(env, userId);
  const planCode = String(resolved?.plan?.code || resolved?.subscription?.plan_code || "TRIAL_7D").trim().toUpperCase();
  const flags = resolved?.plan?.feature_flags || {};
  return {
    plan_code: planCode,
    plan_name: String(resolved?.plan?.nombre || resolved?.plan?.display_name || resolved?.plan?.code || "TRIAL_7D").trim(),
    allowed: !!(flags?.whatsapp || planCode === "INSIGNE"),
    flags
  };
}
__name(resolveWhatsAppEntitlement, "resolveWhatsAppEntitlement");
function extractTelegramCommand(text) {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "empty", payload: "" };
  if (/^\/start(?:@\w+)?/i.test(raw)) {
    return { kind: "start", payload: raw.replace(/^\/start(?:@\w+)?\s*/i, "").trim() };
  }
  const normalized = norm(raw);
  if (normalized.includes("ALERTA")) return { kind: "alertas", payload: "" };
  return { kind: "other", payload: raw };
}
function buildRichTextAlertLines(payload, index) {
  const p = normalizeOfferPayload(payload || {});
  const title =
    [String(p.cargo || "").trim(), String(p.materia || "").trim()]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(" · ") || "Oferta APD";

  const lines = [
    `${index + 1}) ${title}`,
    `📍 ${String(p.distrito || "-").trim() || "-"}`,
    `🏫 ${String(p.escuela || "Sin escuela").trim() || "Sin escuela"}`,
    `🕒 ${String(p.turno || "-").trim() || "-"}`,
    `🎓 ${String(p.nivel || "-").trim() || "-"}`,
    `⏰ ${String(p.fecha_cierre || p.finoferta_label || "-").trim() || "-"}`
  ];

  if (p.total_postulantes != null && p.total_postulantes !== "") {
    lines.push(`👥 Postulados: ${String(p.total_postulantes)}`);
  }

  if (p.puntaje_primero != null && p.puntaje_primero !== "") {
    lines.push(`🥇 Puntaje más alto: ${String(p.puntaje_primero)}`);
  }

  if (p.listado_origen_primero) {
    lines.push(`📄 Listado del más alto: ${String(p.listado_origen_primero)}`);
  }

  if (hasPidEvidence(p)) {
    const chance = buildMailChanceInfo(p);

    if (chance?.title) {
      lines.push(`🎯 ${chance.title}`);
    }

    if (p.pid_reason) {
      lines.push(`🧩 ${String(p.pid_reason)}`);
    }

    if (p.pid_area || p.pid_bloque) {
      lines.push(
        `📚 PID: ${String(p.pid_area || "-")} · ${String(p.pid_bloque || "-")}`
      );
    }

    if (Number.isFinite(Number(p.pid_puntaje_total_final))) {
      lines.push(`🧮 Tu puntaje PID: ${formatMailNumber(Number(p.pid_puntaje_total_final))}`);
    }
  }

  if (p.link) {
    lines.push(`🔗 ${String(p.link)}`);
  }

  return lines;
}
__name(extractTelegramCommand, "extractTelegramCommand");
function buildTelegramQueryDigest(alerts) {
  const all = Array.isArray(alerts) ? alerts : [];
  const visible = all.slice(0, TELEGRAM_QUERY_ALERTS_LIMIT);
  const hidden = Math.max(0, all.length - visible.length);

  const lines = [`🔔 APDocentePBA encontró ${all.length} alerta(s) compatibles`, ""];

  visible.forEach((item, idx) => {
    const payload = item?.offer_payload || item || {};
    lines.push(...buildRichTextAlertLines(payload, idx));
    lines.push("");
  });

  if (hidden > 0) {
    lines.push(`+ ${hidden} más en el panel`, "");
  }

  lines.push("🌐 https://alertasapd.com.ar");
  lines.push("Escribí ALERTAS para refrescar.");

  return lines.filter(Boolean).join("\n");
}
__name(buildTelegramQueryDigest, "buildTelegramQueryDigest");
function buildWhatsAppQueryDigest(alerts) {
  const all = Array.isArray(alerts) ? alerts : [];
  const visible = all.slice(0, WHATSAPP_QUERY_ALERTS_LIMIT);
  const hidden = Math.max(0, all.length - visible.length);

  const lines = [`🔔 APDocentePBA encontró ${all.length} alerta(s) compatibles`, ""];

  visible.forEach((item, idx) => {
    const payload = item?.offer_payload || item || {};
    lines.push(...buildRichTextAlertLines(payload, idx));
    lines.push("");
  });

  if (hidden > 0) {
    lines.push(`+ ${hidden} más en el panel`, "");
  }

  lines.push("🌐 https://alertasapd.com.ar");
  lines.push("Escribí ALERTAS para refrescar.");

  return lines.filter(Boolean).join("\n");
}
__name(buildWhatsAppQueryDigest, "buildWhatsAppQueryDigest");
async function sendWhatsAppText(env, destination, text) {
  const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: destination, type: "text", text: { body: String(text || "").slice(0, 4096), preview_url: false } })
  });
  const rawText = await response.text();
  let data = null;
  try { data = rawText ? JSON.parse(rawText) : null; } catch { data = { raw_text: rawText }; }
  return { response, data };
}
__name(sendWhatsAppText, "sendWhatsAppText");
async function findUserByWhatsAppNumber(env, waId) {
  const digits = String(waId || "").replace(/\D/g, "");
  if (!digits) return null;
  const tail = digits.slice(-8);
  const rows = await supabaseSelect(env, `users?activo=eq.true&celular=not.is.null&celular=ilike.${encodeURIComponent(`*${tail}*`)}&select=id,nombre,apellido,email,celular,activo&limit=20`).catch(() => []);
  const candidates = Array.isArray(rows) ? rows : [];
  return candidates.find((row) => {
    const variants = whatsappTestDestinations(row?.celular || "");
    return variants.includes(digits) || variants.includes(whatsappAllowedListVariant(digits));
  }) || null;
}
__name(findUserByWhatsAppNumber, "findUserByWhatsAppNumber");
async function handleTelegramStatus(request, env) {
  const url = new URL(request.url);
  const authUser = await getSessionUserByBearer(env, request);
  const requestedUserId = String(url.searchParams.get("user_id") || "").trim();

  let user = authUser;
  if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId);

  if (!user?.id) {
    return json2({ ok: false, error: "No autenticado" }, 401);
  }

  if (authUser?.id && requestedUserId && requestedUserId !== authUser.id && !authUser.es_admin) {
    return json2({ ok: false, error: "No autorizado" }, 403);
  }

  const prefs = await obtenerPreferenciasUsuario(env, user.id).catch(() => null);
  const state = await getTelegramState(env, user.id) || {
    user_id: user.id,
    connected: false,
    alerts_enabled: false,
    alerts_requested: false
  };
  const entitlement = await resolveTelegramEntitlement(env, user.id);

  // FUENTE CANÓNICA: la preferencia guardada en cuenta
  const alertsRequested = !!prefs?.alertas_telegram;

  const connected = !!state.connected && !!String(state.chat_id || "").trim();
  const alertsEnabled = !!(entitlement.allowed && alertsRequested && connected);

  return json2({
    ok: true,
    connected,
    alerts_requested: alertsRequested,
    alerts_enabled: alertsEnabled,
    allowed_by_plan: !!entitlement.allowed,
    channel_mode: "query_only",
    channel_policy: entitlement.source,
    plan_code: entitlement.plan_code,
    plan_name: entitlement.plan_name,
    chat_id_masked: state.chat_id ? maskChatId(state.chat_id) : "",
    username: String(state.username || "").trim(),
    first_name: String(state.first_name || "").trim(),
    connected_at: String(state.connected_at || "").trim() || null,
    bot_username: String(env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@+/, ""),
    bot_link: buildTelegramBotLink(env, user.id)
  });
}
__name(handleTelegramStatus, "handleTelegramStatus");
async function handleTelegramWebhook(request, env) {
  requireTelegramWebhookSecret(request, env);

  const update = await request.json().catch(() => ({}));
  const updateId = update?.update_id != null ? String(update.update_id).trim() : "";

  if (updateId) {
    const dedupeKey = telegramUpdateDedupeKey(updateId);
    if (await wasInboundEventProcessed(env, dedupeKey)) {
      return json2({ ok: true, duplicate: true, update_id: updateId });
    }
    await markInboundEventProcessed(env, dedupeKey, TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS).catch(() => null);
  }

  const message = update?.message || {};
  const chatId = String(message?.chat?.id || "").trim();
  const chatType = String(message?.chat?.type || "private").trim();

  if (!chatId || (chatType && chatType !== "private")) {
    return json2({ ok: true, ignored: true, reason: "invalid_chat" });
  }

  const command = extractTelegramCommand(message?.text || "");

  if (command.kind === "start") {
    const userId = String(command.payload || "").trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      await sendTelegramText(env, chatId, "No pude vincular tu cuenta. Entrá desde el panel y tocá el botón de conectar Telegram.").catch(() => null);
      return json2({ ok: true, ignored: true, reason: "invalid_start_payload" });
    }

    const entitlement = await resolveTelegramEntitlement(env, userId);
    const prev = await getTelegramState(env, userId) || {};

    const next = await saveTelegramState(env, userId, {
      connected: true,
      chat_id: chatId,
      username: String(message?.from?.username || "").trim(),
      first_name: String(message?.from?.first_name || "").trim(),
      connected_at: prev.connected_at || new Date().toISOString(),
      alerts_requested: typeof prev.alerts_requested === "boolean" ? prev.alerts_requested : true,
      alerts_enabled: entitlement.allowed ? (typeof prev.alerts_requested === "boolean" ? prev.alerts_requested : true) : false,
      last_inbound_at: new Date().toISOString()
    });

    await sendTelegramText(
      env,
      chatId,
      "✅ APDocentePBA conectó este chat con tu cuenta.\n\nEscribí ALERTAS cuando quieras consultar tus ofertas compatibles."
    ).catch(() => null);

    return json2({ ok: true, connected: true, user_id: userId, state: next });
  }

  const linkedUserId = await getTelegramUserIdByChat(env, chatId);
  if (!linkedUserId) {
    await sendTelegramText(env, chatId, "Todavía no vinculaste este chat con tu cuenta. Entrá al panel y usá el botón de conectar Telegram.").catch(() => null);
    return json2({ ok: true, ignored: true, reason: "chat_not_linked" });
  }

  const user = await obtenerUsuario(env, linkedUserId);
  if (!user?.id) {
    return json2({ ok: true, ignored: true, reason: "user_not_found" });
  }

  const entitlement = await resolveTelegramEntitlement(env, user.id);

  const state = await saveTelegramState(env, user.id, {
    connected: true,
    chat_id: chatId,
    username: String(message?.from?.username || "").trim(),
    first_name: String(message?.from?.first_name || "").trim(),
    last_inbound_at: new Date().toISOString()
  });

  const prefs = await obtenerPreferenciasUsuario(env, user.id).catch(() => null);

  if (command.kind === "alertas") {
    if (!prefs?.alertas_activas || !state?.alerts_enabled) {
      await sendTelegramText(env, chatId, "Telegram todavía no está activo en tus preferencias. Entrá al panel, activalo y después escribí ALERTAS.").catch(() => null);
      return json2({ ok: true, delivered: false, reason: "telegram_not_enabled" });
    }

    const data = await construirAlertasParaUsuario(env, user.id).catch(() => null);
    const rawAlerts = Array.isArray(data?.resultados) ? data.resultados : [];

    const alerts = await enrichAlertsForRichChannels(
      env,
      user,
      rawAlerts,
      TELEGRAM_QUERY_ALERTS_LIMIT
    );

    const reply = alerts.length
      ? buildTelegramQueryDigest(alerts)
      : "No encontré alertas compatibles en este momento.\n\n🌐 https://alertasapd.com.ar";

    await sendTelegramText(env, chatId, reply).catch(() => null);

    return json2({
      ok: true,
      delivered: true,
      total_alerts: rawAlerts.length,
      plan_code: entitlement.plan_code,
      channel_mode: "query_only"
    });
  }

  await sendTelegramText(
    env,
    chatId,
    "Hola. Escribí ALERTAS y te devuelvo tus ofertas compatibles ahora mismo.\n\n🌐 https://alertasapd.com.ar"
  ).catch(() => null);

  return json2({ ok: true, delivered: true, help: true, channel_mode: "query_only" });
}
__name(handleTelegramWebhook, "handleTelegramWebhook");
async function handleGuardarPreferenciasChannelsAware(request, env, ctx) {
  const rawText = await request.text();

  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }

  const delegatedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: rawText
  });

  const delegated = await delegateJson(worker_default, delegatedRequest, env, ctx);

  if (!delegated.response.ok || !delegated.data?.ok) {
    return json2(
      delegated.data || { ok: false, message: "No se pudieron guardar las preferencias" },
      delegated.response.status || 500
    );
  }

  const userId = String(payload?.user_id || "").trim();
  let telegramStatus = null;
  let whatsappStatus = null;

  if (userId) {
    const savedPrefs = await obtenerPreferenciasUsuario(env, userId).catch(() => null);

    const requestedTelegram = !!savedPrefs?.alertas_telegram;
    const requestedWhatsApp = !!savedPrefs?.alertas_whatsapp;

    const tgEntitlement = await resolveTelegramEntitlement(env, userId);
    const currentTgState = await getTelegramState(env, userId) || {};

    const nextTgState = await saveTelegramState(env, userId, {
      alerts_requested: requestedTelegram,
      alerts_enabled: tgEntitlement.allowed
        ? (requestedTelegram && !!currentTgState.connected)
        : false,
      connected: !!currentTgState.connected,
      chat_id: currentTgState.chat_id || "",
      username: currentTgState.username || "",
      first_name: currentTgState.first_name || "",
      connected_at: currentTgState.connected_at || null
    });

    telegramStatus = {
      ok: true,
      connected: !!nextTgState?.connected,
      alerts_requested: !!nextTgState?.alerts_requested,
      alerts_enabled: !!nextTgState?.alerts_enabled,
      allowed_by_plan: !!tgEntitlement.allowed,
      channel_mode: "query_only",
      plan_code: tgEntitlement.plan_code,
      plan_name: tgEntitlement.plan_name,
      bot_username: String(env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@+/, ""),
      bot_link: buildTelegramBotLink(env, userId),
      chat_id_masked: nextTgState?.chat_id ? maskChatId(nextTgState.chat_id) : ""
    };

    const waEntitlement = await resolveWhatsAppEntitlement(env, userId);
    const waState = await getWhatsAppState(env, userId) || {};
    const currentUser = await obtenerUsuario(env, userId).catch(() => null);

    whatsappStatus = {
      ok: true,
      connected: !!waState.connected,
      alerts_requested: requestedWhatsApp,
      alerts_enabled: !!(waEntitlement.allowed && requestedWhatsApp && !!waState.connected),
      allowed_by_plan: !!waEntitlement.allowed,
      channel_mode: "query_only",
      plan_code: waEntitlement.plan_code,
      plan_name: waEntitlement.plan_name,
      phone_masked: maskPhone(currentUser?.celular || waState?.phone || ""),
      connect_hint: String(env.WHATSAPP_BOT_NUMBER || "").trim()
        ? `Guardá tu celular en el panel y escribí a ${String(env.WHATSAPP_BOT_NUMBER || "").trim()} por WhatsApp para consultar alertas.`
        : "Guardá tu celular en el panel y escribile al número del bot por WhatsApp para consultar alertas."
    };
  }

  let message = delegated.data?.message || "Preferencias guardadas";

  if (telegramStatus && telegramStatus.alerts_requested && !telegramStatus.connected) {
    message = `${message}. Telegram quedó pedido en tu cuenta, pero todavía falta vincular el bot.`;
  }

  if (whatsappStatus && whatsappStatus.alerts_requested && !whatsappStatus.connected && whatsappStatus.allowed_by_plan) {
    message = `${message}. WhatsApp quedó pedido en tu cuenta, pero todavía falta vincular el canal.`;
  }

  return json2(
    {
      ...(typeof delegated.data === "object" && delegated.data
        ? delegated.data
        : { ok: true }),
      message,
      telegram_status: telegramStatus,
      whatsapp_status: whatsappStatus
    },
    delegated.response.status || 200
  );
}
__name(handleGuardarPreferenciasChannelsAware, "handleGuardarPreferenciasChannelsAware");
async function handleWhatsAppStatus(request, env) {
  const url = new URL(request.url);
  const authUser = await getSessionUserByBearer(env, request);
  const requestedUserId = String(url.searchParams.get("user_id") || "").trim();

  let user = authUser;
  if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId);

  if (!user?.id) {
    return json2({ ok: false, error: "No autenticado" }, 401);
  }

  if (authUser?.id && requestedUserId && requestedUserId !== authUser.id && !authUser.es_admin) {
    return json2({ ok: false, error: "No autorizado" }, 403);
  }

  const entitlement = await resolveWhatsAppEntitlement(env, user.id);
  const prefs = await obtenerPreferenciasUsuario(env, user.id).catch(() => null);
  const state = await getWhatsAppState(env, user.id) || {};

  const botNumber = String(env.WHATSAPP_BOT_NUMBER || "").trim();
  const alertsRequested = !!prefs?.alertas_whatsapp;
  const connected = !!state.connected;
  const alertsEnabled = !!(entitlement.allowed && alertsRequested && connected);

  return json2({
    ok: true,
    connected,
    alerts_requested: alertsRequested,
    alerts_enabled: alertsEnabled,
    allowed_by_plan: !!entitlement.allowed,
    channel_mode: "query_only",
    plan_code: entitlement.plan_code,
    plan_name: entitlement.plan_name,
    phone_masked: maskPhone(user?.celular || state?.phone || ""),
    connect_hint: botNumber
      ? `Guardá tu celular en el panel y escribí a ${botNumber} por WhatsApp para consultar alertas.`
      : "Guardá tu celular en el panel y escribile al número del bot por WhatsApp para consultar alertas."
  });
}
__name(handleWhatsAppStatus, "handleWhatsAppStatus");
async function handleWhatsAppWebhookVerify(request, env) {
  const url = new URL(request.url);
  const mode = String(url.searchParams.get("hub.mode") || "").trim();
  const token = String(url.searchParams.get("hub.verify_token") || "").trim();
  const challenge = String(url.searchParams.get("hub.challenge") || "").trim();

  if (
    mode === "subscribe" &&
    token &&
    env.WHATSAPP_VERIFY_TOKEN &&
    token === String(env.WHATSAPP_VERIFY_TOKEN).trim()
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("forbidden", { status: 403 });
}
__name(handleWhatsAppWebhookVerify, "handleWhatsAppWebhookVerify");
async function handleWhatsAppWebhook(request, env) {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    return json2({ ok: true, skipped: true, reason: "missing_config" });
  }

  const body = await request.json().catch(() => ({}));
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value?.messages) ? value.messages : [];

      for (const message of messages) {
        const messageId = String(message?.id || "").trim();

        if (messageId) {
          const dedupeKey = whatsappMessageDedupeKey(messageId);
          if (await wasInboundEventProcessed(env, dedupeKey)) continue;
          await markInboundEventProcessed(env, dedupeKey, WHATSAPP_MESSAGE_DEDUPE_TTL_SECONDS).catch(() => null);
        }

        const from = String(message?.from || "").trim();
        if (!from) continue;

        const user = await findUserByWhatsAppNumber(env, from);

        if (!user?.id) {
          await sendWhatsAppText(env, from, "No encontré una cuenta de APDocentePBA asociada a este número. Guardá tu celular en el panel y probá de nuevo.").catch(() => null);
          continue;
        }

        const entitlement = await resolveWhatsAppEntitlement(env, user.id);

        if (!entitlement.allowed) {
          await sendWhatsAppText(env, from, "WhatsApp queda reservado para el plan Insigne. En tu plan actual seguís teniendo email y Telegram.").catch(() => null);
          continue;
        }

        const prefs = await obtenerPreferenciasUsuario(env, user.id).catch(() => null);

        await saveWhatsAppState(env, user.id, {
          connected: true,
          phone: from,
          phone_masked: maskPhone(from),
          last_inbound_at: new Date().toISOString()
        }).catch(() => null);

        const inboundText = norm(
          message?.text?.body ||
          message?.button?.text ||
          message?.interactive?.button_reply?.title ||
          ""
        );

        if (!prefs?.alertas_activas || !prefs?.alertas_whatsapp) {
          await sendWhatsAppText(env, from, "Tu canal de WhatsApp todavía no está activo en preferencias. Entrá al panel, activalo y después escribí ALERTAS.").catch(() => null);
          continue;
        }

        if (inboundText.includes("ALERTA")) {
          const data = await construirAlertasParaUsuario(env, user.id).catch(() => null);
          const rawAlerts = Array.isArray(data?.resultados) ? data.resultados : [];

          const alerts = await enrichAlertsForRichChannels(
            env,
            user,
            rawAlerts,
            WHATSAPP_QUERY_ALERTS_LIMIT
          );

          const reply = alerts.length
            ? buildWhatsAppQueryDigest(alerts)
            : "No encontré alertas compatibles en este momento.\n\n🌐 https://alertasapd.com.ar";

          await sendWhatsAppText(env, from, reply).catch(() => null);
          continue;
        }

        await sendWhatsAppText(
          env,
          from,
          "Hola. Escribí ALERTAS y te devuelvo tus ofertas compatibles ahora mismo.\n\n🌐 https://alertasapd.com.ar"
        ).catch(() => null);
      }
    }
  }

  return json2({ ok: true, channel_mode: "query_only" });
}
__name(handleWhatsAppWebhook, "handleWhatsAppWebhook");
function safeProvinciaBackfillStatus(message = null) {
  return { ok: true, scope: "PROVINCIA_FULL", status: "idle", district_index: 0, district_name: null, next_page: 0, pages_processed: 0, districts_completed: 0, offers_processed: 0, last_batch_count: 0, total_districts: 0, progress_pct: 0, started_at: null, finished_at: null, last_run_at: null, updated_at: null, last_error: message || null, retryable: false, stale_running: false, failed_page: 0 };
}
__name(safeProvinciaBackfillStatus, "safeProvinciaBackfillStatus");
function safeProvinciaResumen(message = null) {
  return { ok: true, empty: true, ventana_dias: 30, total_ofertas: 0, activas_estimadas: 0, cerradas_estimadas: 0, districts_with_activity: 0, coverage_hint: null, nuevas_7d: 0, top_distritos: [], top_cargos: [], top_turnos: [], top_escuelas: [], state_breakdown: { activas: 0, designadas: 0, anuladas: 0, desiertas: 0, cerradas: 0 }, leaders: { matematica: null, ingles: null }, latest_rows: [], banner_items: [{ title: "Radar provincial", text: message || "Todavia no hay suficiente historial provincial para construir insights serios." }], scan_state: null };
}
__name(safeProvinciaResumen, "safeProvinciaResumen");
var worker_hotfix_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders2() });
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === `${API_URL_PREFIX3}/version` && request.method === "GET") return json2({ ok: true, version: HOTFIX_VERSION, worker_version: env.WORKER_URL || "ancient-wildflower-cd37" });
    if (path === `${API_URL_PREFIX3}/telegram/status` && request.method === "GET") {
      try {
        return await handleTelegramStatus(request, env);
      } catch (err) {
        return json2({ ok: false, error: err?.message || "No se pudo leer Telegram" }, Number(err?.status || 500) || 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/telegram/webhook` && request.method === "POST") {
      try {
        return await handleTelegramWebhook(request, env);
      } catch (err) {
        return json2({ ok: false, error: err?.message || "No se pudo procesar Telegram" }, Number(err?.status || 500) || 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/whatsapp/status` && request.method === "GET") {
      try {
        return await handleWhatsAppStatus(request, env);
      } catch (err) {
        return json2({ ok: false, error: err?.message || "No se pudo leer WhatsApp" }, Number(err?.status || 500) || 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/whatsapp/webhook` && request.method === "GET") {
      return await handleWhatsAppWebhookVerify(request, env);
    }
    if (path === `${API_URL_PREFIX3}/whatsapp/webhook` && request.method === "POST") {
      try {
        return await handleWhatsAppWebhook(request, env);
      } catch (err) {
        return json2({ ok: false, error: err?.message || "No se pudo procesar WhatsApp" }, Number(err?.status || 500) || 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/guardar-preferencias` && request.method === "POST") {
      try {
        return await handleGuardarPreferenciasChannelsAware(request, env, ctx);
      } catch (err) {
        return json2({ ok: false, message: err?.message || "No se pudieron guardar las preferencias" }, Number(err?.status || 500) || 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/login` && request.method === "POST") {
      try {
        return await handleLoginHotfix(request, env);
      } catch (err) {
        return json2({ ok: false, message: err?.message || "No se pudo iniciar sesion" }, 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/google-auth` && request.method === "POST") {
      try {
        return await handleGoogleAuthHotfix(request, env);
      } catch (err) {
        return json2({ ok: false, message: err?.message || "No se pudo ingresar con Google" }, 400);
      }
    }
    if (path === `${API_URL_PREFIX3}/mis-alertas` && request.method === "GET") {
      try {
        return await handleMisAlertas(url, env);
      } catch (err) {
        return json2({ ok: false, message: err?.message || "No se pudieron cargar las alertas" }, 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/provincia/backfill-status` && request.method === "GET") {
      try {
        const delegated = await delegateJson(worker_default, request, env, ctx);
        if (delegated.response.ok && delegated.data?.ok) return json2(delegated.data, delegated.response.status);
        return json2(safeProvinciaBackfillStatus(delegated.data?.error || delegated.data?.message || "No se pudo leer el backfill provincial"));
      } catch (err) {
        return json2(safeProvinciaBackfillStatus(err?.message || "No se pudo leer el backfill provincial"));
      }
    }
    if (path === `${API_URL_PREFIX3}/provincia/resumen` && request.method === "GET") {
      try {
        const delegated = await delegateJson(worker_default, request, env, ctx);
        if (delegated.response.ok && delegated.data?.ok) return json2(delegated.data, delegated.response.status);
        return json2(safeProvinciaResumen(delegated.data?.error || delegated.data?.message || "No se pudo leer el radar provincial"));
      } catch (err) {
        return json2(safeProvinciaResumen(err?.message || "No se pudo leer el radar provincial"));
      }
    }
    if (path === `${API_URL_PREFIX3}/provincia/insights` && request.method === "GET") {
      try {
        const delegated = await delegateJson(worker_default, request, env, ctx);
        if (delegated.response.ok && delegated.data?.ok) return json2(delegated.data, delegated.response.status);
        return json2({ ok: true, days: 30, generated_at: (/* @__PURE__ */ new Date()).toISOString(), items: [] });
      } catch {
        return json2({ ok: true, days: 30, generated_at: (/* @__PURE__ */ new Date()).toISOString(), items: [] });
      }
    }
    if (path.startsWith("/api/profile/") || path.startsWith("/api/listados/") || path.startsWith("/api/eligibility/")) {
      const routed = await handleProfileListadosRoute(request, env);
      if (routed) return routed;
    }
   if (path === "/test-email-sweep" && request.method === "GET") {
  try {
    const targetUserId = String(url.searchParams.get("user_id") || "").trim();
    const pendingExists = await hasPendingEmailNotifications(env, targetUserId);

    if (pendingExists) {
      const digest = await sendPendingEmailDigests(env, {
        target_user_id: targetUserId || null
      });

      return json2({
        ok: true,
        mode: "digest_only",
        digest
      });
    }

    const queue = await runEmailAlertsQueueSweep(env, {
      source: "manual_test",
      target_user_id: targetUserId || null
    });

    return json2({
      ok: true,
      mode: "queue_only",
      queue_sweep: queue
    });
  } catch (err) {
    return json2({
      ok: false,
      error: err?.message || "No se pudo ejecutar el barrido de cola de email"
    }, 500);
  }
}
    return await worker_default.fetch(request, env, ctx);
  },
  async scheduled(_controller, env, ctx) {
  ctx.waitUntil(
    runProvinciaBackfillStep(env, { source: "cron", force: false }).catch(err => {
      console.error("PROVINCIA BACKFILL CRON STEP ERROR:", err);
    })
  );

  ctx.waitUntil((async () => {
    try {
      const pendingExists = await hasPendingEmailNotifications(env);

      if (pendingExists) {
        await sendPendingEmailDigests(env);
      } else {
        await runEmailAlertsQueueSweep(env, { source: "cron" });
      }
    } catch (err) {
      console.error("EMAIL PIPELINE CRON ERROR:", err);
    }
  })());
}
};
export {
  worker_hotfix_default as default
};
//# sourceMappingURL=worker_hotfix.js.map

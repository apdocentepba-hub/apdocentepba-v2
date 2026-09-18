var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker-live/worker_hotfix.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var PANEL_URL = "https://alertasapd.com.ar";
var API_URL_PREFIX = "/api";
var PD_ABC_SYNC_SOURCE = "abc_public";
function pdCorsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
__name(pdCorsHeaders, "pdCorsHeaders");
__name2(pdCorsHeaders, "pdCorsHeaders");
function pdJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: pdCorsHeaders() });
}
__name(pdJson, "pdJson");
__name2(pdJson, "pdJson");
function pdNorm(v) {
  return String(v || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
__name(pdNorm, "pdNorm");
__name2(pdNorm, "pdNorm");
function pdTokens(v) {
  const stop = /* @__PURE__ */ new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "EN", "A"]);
  return [...new Set(
    pdNorm(v).split(" ").map((x) => x.trim()).filter((x) => x.length > 1 && !stop.has(x))
  )];
}
__name(pdTokens, "pdTokens");
__name2(pdTokens, "pdTokens");
function pdGetBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? String(auth.slice(7) || "").trim() : "";
}
__name(pdGetBearerToken, "pdGetBearerToken");
__name2(pdGetBearerToken, "pdGetBearerToken");
function pdGetAuthedUserId(request, body = null, url = null) {
  const bearer = pdGetBearerToken(request);
  const hinted = String(body?.user_id || url?.searchParams?.get("user_id") || "").trim();
  if (bearer && hinted && bearer !== hinted) {
    throw new Error("La sesi\xF3n no coincide con el user_id enviado");
  }
  return bearer || hinted;
}
__name(pdGetAuthedUserId, "pdGetAuthedUserId");
__name2(pdGetAuthedUserId, "pdGetAuthedUserId");
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
__name2(pdSupabaseRequest, "pdSupabaseRequest");
async function pdSupabaseSelect(env, query) {
  return await pdSupabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}
__name(pdSupabaseSelect, "pdSupabaseSelect");
__name2(pdSupabaseSelect, "pdSupabaseSelect");
async function pdSupabaseInsertReturning(env, table, data) {
  const rows = await pdSupabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}
__name(pdSupabaseInsertReturning, "pdSupabaseInsertReturning");
__name2(pdSupabaseInsertReturning, "pdSupabaseInsertReturning");
async function pdSupabaseUpsert(env, table, rows, conflict) {
  return await pdSupabaseRequest(env, `${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}
__name(pdSupabaseUpsert, "pdSupabaseUpsert");
__name2(pdSupabaseUpsert, "pdSupabaseUpsert");
async function pdGetUserById(env, userId) {
  const rows = await pdSupabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
__name(pdGetUserById, "pdGetUserById");
__name2(pdGetUserById, "pdGetUserById");
function pdNormalizeDni(raw) {
  return String(raw || "").replace(/\D/g, "");
}
__name(pdNormalizeDni, "pdNormalizeDni");
__name2(pdNormalizeDni, "pdNormalizeDni");
async function pdSha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(pdSha256Hex, "pdSha256Hex");
__name2(pdSha256Hex, "pdSha256Hex");
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
__name2(pdNormalizeListadoType, "pdNormalizeListadoType");
function pdParsePuntaje(raw) {
  const text = String(raw || "").trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(/,/g, ".") : text;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
__name(pdParsePuntaje, "pdParsePuntaje");
__name2(pdParsePuntaje, "pdParsePuntaje");
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
__name2(pdNormalizeListadoRow, "pdNormalizeListadoRow");
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
__name2(pdParseListadoText, "pdParseListadoText");
function pdSafeOfferId(offer) {
  return String(offer?.offer_id || offer?.source_offer_key || offer?.idoferta || offer?.iddetalle || offer?.id || "").trim();
}
__name(pdSafeOfferId, "pdSafeOfferId");
__name2(pdSafeOfferId, "pdSafeOfferId");
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
__name2(pdNormalizeOfferText, "pdNormalizeOfferText");
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
__name2(pdComputeEligibilityForOffer, "pdComputeEligibilityForOffer");
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
__name2(pdFetchAbcListadoPublic, "pdFetchAbcListadoPublic");
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
__name2(pdBuildListadoSummary, "pdBuildListadoSummary");
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
__name2(pdMapAbcDocToListadoRow, "pdMapAbcDocToListadoRow");
async function pdDeleteUserAutoSyncedListados(env, userId) {
  await pdSupabaseRequest(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&fuente=eq.${encodeURIComponent(PD_ABC_SYNC_SOURCE)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
}
__name(pdDeleteUserAutoSyncedListados, "pdDeleteUserAutoSyncedListados");
__name2(pdDeleteUserAutoSyncedListados, "pdDeleteUserAutoSyncedListados");
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
__name2(pdUpdateIdentityProfileSync, "pdUpdateIdentityProfileSync");
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
__name2(handleProfileMe, "handleProfileMe");
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
__name2(handleSaveDni, "handleSaveDni");
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
__name2(handleMisListados, "handleMisListados");
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
__name2(handleImportManual, "handleImportManual");
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
__name2(handleImportPaste, "handleImportPaste");
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
__name2(handleSyncPublicAbc, "handleSyncPublicAbc");
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
__name2(handleDeleteListado, "handleDeleteListado");
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
__name2(fetchStoredOffers, "fetchStoredOffers");
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
__name2(handleEligibilityRecompute, "handleEligibilityRecompute");
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
__name2(handleEligibilityList, "handleEligibilityList");
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
__name2(handleProfileListadosRoute, "handleProfileListadosRoute");
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
__name2(supabaseInsert, "supabaseInsert");
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
__name2(supabaseInsertReturning, "supabaseInsertReturning");
function isSupabaseDuplicateError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("23505") || msg.includes("duplicate key") || msg.includes("duplicate") || msg.includes("unique") || msg.includes("notification_delivery_logs_dedupe_key_uidx");
}
__name(isSupabaseDuplicateError, "isSupabaseDuplicateError");
__name2(isSupabaseDuplicateError, "isSupabaseDuplicateError");
async function supabasePatchById(env, table, id, patch) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(patch)
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Supabase PATCH ${res.status}`);
  }
  return true;
}
__name(supabasePatchById, "supabasePatchById");
__name2(supabasePatchById, "supabasePatchById");
async function reserveEmailDigestDeliveryLog(env, { user, destination, payload, dedupeKey }) {
  if (!dedupeKey) {
    return {
      ok: true,
      reserved: false,
      duplicate: false,
      id: null,
      dedupe_key: ""
    };
  }
  try {
    const inserted = await supabaseInsertReturning(env, "notification_delivery_logs", {
      user_id: user.id,
      channel: "email",
      template_code: "apd_email_alert_digest",
      destination,
      status: "sending_alert_digest",
      provider_message_id: null,
      dedupe_key: dedupeKey,
      payload: {
        ...payload,
        dedupe_key: dedupeKey,
        reservation_status: "reserved_before_brevo_send"
      },
      provider_response: {
        message: "Reservado antes de enviar por Brevo para evitar doble env\xEDo concurrente"
      }
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return {
      ok: true,
      reserved: true,
      duplicate: false,
      id: row?.id || null,
      dedupe_key: dedupeKey
    };
  } catch (err) {
    if (isSupabaseDuplicateError(err)) {
      return {
        ok: false,
        reserved: false,
        duplicate: true,
        id: null,
        dedupe_key: dedupeKey,
        error: err?.message || String(err || "duplicate")
      };
    }
    return {
      ok: false,
      reserved: false,
      duplicate: false,
      id: null,
      dedupe_key: dedupeKey,
      error: err?.message || String(err || "reserve_failed")
    };
  }
}
__name(reserveEmailDigestDeliveryLog, "reserveEmailDigestDeliveryLog");
__name2(reserveEmailDigestDeliveryLog, "reserveEmailDigestDeliveryLog");
function extractBrevoMessageId(send) {
  const direct = String(send?.messageId || send?.message_id || "").trim();
  if (direct) return direct;
  let data = send?.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (_) { return null; }
  }
  const nested = String(data?.messageId || data?.message_id || "").trim();
  return nested || null;
}
__name(extractBrevoMessageId, "extractBrevoMessageId");
__name2(extractBrevoMessageId, "extractBrevoMessageId");
async function finishEmailDigestDeliveryLog(env, reservation, send) {
  if (!reservation?.id) return false;
  await supabasePatchById(env, "notification_delivery_logs", reservation.id, {
    status: send?.ok ? "sent_alert_digest" : "failed_alert_digest",
    provider_message_id: extractBrevoMessageId(send),
    provider_response: send || null
  });
  return true;
}
__name(finishEmailDigestDeliveryLog, "finishEmailDigestDeliveryLog");
__name2(finishEmailDigestDeliveryLog, "finishEmailDigestDeliveryLog");
var API_VERSION = "2026-03-27";
var API_URL_PREFIX2 = "/api";
var HISTORICO_DAYS_DEFAULT = 30;
var HISTORICO_INSERT_BATCH = 150;
var HISTORICO_POSTULANTES_LIMIT = 8;
var PROVINCIA_SCOPE = "PROVINCIA_FULL";
var PROVINCIA_CAPTURE_ROWS_PER_PAGE = 150;
var PROVINCIA_STEP_PAGES = 4;
var PROVINCIA_SUMMARY_LIMIT = 2e4;
var PROVINCIA_DAYS_DEFAULT = 30;
var PROVINCIA_RUNNING_STALE_MS = 10 * 60 * 1e3;
var WHATSAPP_ALERT_SWEEP_MAX_USERS = 20;
var WHATSAPP_ALERTS_PER_USER_MAX = 3;
var WHATSAPP_ALERT_LOG_LOOKBACK = 200;
var TELEGRAM_QUERY_ALERTS_LIMIT = 50;
var TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS = 60 * 60 * 6;
var WHATSAPP_MESSAGE_DEDUPE_TTL_SECONDS = 60 * 60 * 6;
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
__name(jsonResponse, "jsonResponse");
__name2(jsonResponse, "jsonResponse");
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
__name(corsHeaders, "corsHeaders");
__name2(corsHeaders, "corsHeaders");
function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}
__name(normalizeEmail, "normalizeEmail");
__name2(normalizeEmail, "normalizeEmail");
function normalizeText(v) {
  return String(v || "").trim();
}
__name(normalizeText, "normalizeText");
__name2(normalizeText, "normalizeText");
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
__name2(ensureTrialIfNoSubscriptions, "ensureTrialIfNoSubscriptions");
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
      password_hash: await accountHashPasswordV1(password),
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
__name2(handleRegister, "handleRegister");
function adminJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
    }
  });
}
__name(adminJson, "adminJson");
__name2(adminJson, "adminJson");
function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}
__name(getBearerToken, "getBearerToken");
__name2(getBearerToken, "getBearerToken");
function startOfTodayISO() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}
__name(startOfTodayISO, "startOfTodayISO");
__name2(startOfTodayISO, "startOfTodayISO");
function sevenDaysAgoISO() {
  const dt = /* @__PURE__ */ new Date();
  dt.setUTCDate(dt.getUTCDate() - 6);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString();
}
__name(sevenDaysAgoISO, "sevenDaysAgoISO");
__name2(sevenDaysAgoISO, "sevenDaysAgoISO");
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
    return null;
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
__name2(getSessionUserByBearer, "getSessionUserByBearer");
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
__name2(requireAdmin, "requireAdmin");
async function handleAdminMe(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  return adminJson({
    ok: true,
    user: auth.user
  });
}
__name(handleAdminMe, "handleAdminMe");
__name2(handleAdminMe, "handleAdminMe");
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
__name2(handleAdminResumen, "handleAdminResumen");
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
__name2(handleAdminUsuarios, "handleAdminUsuarios");
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
__name2(handleAdminSesiones, "handleAdminSesiones");
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
__name2(handleAdminAlertas, "handleAdminAlertas");
async function enviarMailBrevo(destinatario, nombre, asunto, html, env) {
  const API_KEY = String(
    env.BREVO_API_KEY || env.SENDINBLUE_API_KEY || env.BREVO_TRANSACTIONAL_API_KEY || ""
  ).trim();
  const senderEmail = String(
    env.BREVO_FROM_EMAIL || env.BREVO_SENDER_EMAIL || env.ALERT_FROM_EMAIL || env.EMAIL_FROM || "apdocentepba@gmail.com"
  ).trim();
  const senderName = String(
    env.BREVO_FROM_NAME || env.BREVO_SENDER_NAME || env.ALERT_FROM_NAME || env.EMAIL_FROM_NAME || "APDocentePBA"
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
__name2(enviarMailBrevo, "enviarMailBrevo");
function canonicalOfferIdentity(offer) {
  const detailRaw = String(offer?.iddetalle || offer?.raw?.iddetalle || "").trim();
  if (detailRaw) return `D_${detailRaw.replace(/^D_/i, "")}`;
  const sourceKey = String(offer?.source_offer_key || offer?.raw?.source_offer_key || "").trim();
  if (/^[DO]_/i.test(sourceKey)) return sourceKey.charAt(0).toUpperCase() + sourceKey.slice(1);
  const explicitOfferId = String(offer?.offer_id || "").trim();
  if (/^[DO]_/i.test(explicitOfferId)) return explicitOfferId.charAt(0).toUpperCase() + explicitOfferId.slice(1);
  const ofertaRaw = String(offer?.idoferta || offer?.raw?.idoferta || "").trim();
  if (ofertaRaw) return `O_${ofertaRaw.replace(/^O_/i, "")}`;
  if (sourceKey) return sourceKey;
  return String(explicitOfferId || offer?.id || offer?.codigo || offer?.identity_key || "").trim();
}
__name(canonicalOfferIdentity, "canonicalOfferIdentity");
__name2(canonicalOfferIdentity, "canonicalOfferIdentity");
function getOfferId(offer) {
  return canonicalOfferIdentity(offer);
}
__name(getOfferId, "getOfferId");
__name2(getOfferId, "getOfferId");
function normalizeOfferPayload(offer) {
  return {
    raw: offer,
    offer_id: canonicalOfferIdentity(offer),
    source_offer_key: canonicalOfferIdentity(offer),
    idoferta: offer.idoferta || offer.raw?.idoferta || null,
    iddetalle: offer.iddetalle || offer.id || offer.raw?.iddetalle || offer.raw?.id || null,
    title: offer.title || offer.cargo || offer.materia || offer.descripcioncargo || offer.descripcionarea || "Oferta APD",
    cargo: offer.cargo || offer.descripcioncargo || "",
    materia: offer.materia || offer.area || offer.descripcionarea || "",
    nivel: offer.nivel || offer.nivel_modalidad || offer.descnivelmodalidad || "",
    distrito: offer.distrito || offer.descdistrito || "",
    escuela: offer.escuela || offer.nombreestablecimiento || "",
    turno: offer.turno || "",
    jornada: offer.jornada || "",
    modulos: offer.modulos || offer.hsmodulos || "",
    dias_horarios: offer.dias_horarios || [offer.lunes, offer.martes, offer.miercoles, offer.jueves, offer.viernes, offer.sabado].filter(Boolean).join(" ") || "",
    desde: offer.desde || offer.supl_desde_label || offer.supl_desde || "",
    hasta: offer.hasta || offer.supl_hasta_label || offer.supl_hasta || "",
    tipo_cargo: offer.tipo_cargo || offer.tipooferta || "",
    tipo_situacion: [
      offer.tipooferta,
      offer.suplencia,
      offer.provisional,
      offer.revista || offer.supl_revista
    ].filter(Boolean).join(" / "),
    revista: offer.revista || offer.supl_revista || "",
    estado: offer.estado || offer.estado_raw || "",
    curso_division: offer.curso_division || offer.cursodivision || "",
    observaciones: offer.observaciones || "",
    fecha_cierre: offer.fecha_cierre || offer.fecha_cierre_fmt || offer.finoferta_label || offer.finoferta || "",
    link: offer.link_postular || offer.link || "",
    total_postulantes: offer.total_postulantes ?? null,
    puntaje_primero: offer.puntaje_primero ?? null,
    listado_origen_primero: offer.listado_origen_primero || "",
    // ===== PID =====
    pid_match: !!offer.pid_match,
    pid_compatible: !!offer.pid_compatible,
    pid_reason: offer.pid_reason || "",
    pid_area: offer.pid_area || "",
    pid_bloque: offer.pid_bloque || "",
    pid_puntaje_total: offer.pid_puntaje_total || "",
    pid_puntaje_total_base: Number.isFinite(Number(offer.pid_puntaje_total_base)) ? Number(offer.pid_puntaje_total_base) : null,
    pid_puntaje_total_final: Number.isFinite(Number(offer.pid_puntaje_total_final)) ? Number(offer.pid_puntaje_total_final) : null,
    pid_residencia_bonus_aplicado: !!offer.pid_residencia_bonus_aplicado,
    pid_residencia_bonus_puntos: Number(offer.pid_residencia_bonus_puntos || 0),
    pid_distrito_residencia: offer.pid_distrito_residencia || "",
    pid_listado: offer.pid_listado || "",
    pid_anio: offer.pid_anio || ""
  };
}
__name(normalizeOfferPayload, "normalizeOfferPayload");
__name2(normalizeOfferPayload, "normalizeOfferPayload");
function escHtml(v) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escHtml, "escHtml");
__name2(escHtml, "escHtml");
function digestRow(label, value) {
  if (!value && value !== 0) return "";
  return `
    <div style="margin:2px 0;">
      <b>${escHtml(label)}:</b> ${escHtml(value)}
    </div>
  `;
}
__name(digestRow, "digestRow");
__name2(digestRow, "digestRow");
function emailSchoolChip(row) {
  const p = normalizeOfferPayload(row?.offer_payload || row || {});
  const raw = p?.raw || row?.raw || {};
  const escuela = String(
    p.escuela || p.nombreestablecimiento || p.codigo_escuela || p.codigoescuela || p.establecimiento || raw.escuela || raw.nombreestablecimiento || raw.codigo_escuela || raw.codigoescuela || raw.establecimiento || ""
  ).trim();
  if (!escuela) return "";
  return `
    <span style="
      display:inline-block;
      background:#eaf2ff;
      color:#0f3460;
      border-radius:999px;
      padding:6px 10px;
      margin:4px 6px 4px 0;
      font-family:Arial,Helvetica,sans-serif;
      font-size:12px;
      font-weight:800;
      line-height:1.2;
      white-space:nowrap;
    ">\u{1F3EB} ${escHtml(escuela)}</span>
  `;
}
__name(emailSchoolChip, "emailSchoolChip");
__name2(emailSchoolChip, "emailSchoolChip");
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
__name(parseMailNumber, "parseMailNumber");
function formatMailNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
__name(formatMailNumber, "formatMailNumber");
function hasPidEvidence(payload) {
  const p = normalizeOfferPayload(payload || {});
  return !!(p.pid_listado || p.pid_anio || p.pid_area || p.pid_bloque || p.pid_reason || p.pid_match || p.pid_compatible || Number.isFinite(Number(p.pid_puntaje_total_base)) || Number.isFinite(Number(p.pid_puntaje_total_final)));
}
__name(hasPidEvidence, "hasPidEvidence");
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
__name(stripPidFromPayload, "stripPidFromPayload");
function getPlanCodeValue(value) {
  if (typeof value === "string") {
    return String(value || "").trim().toUpperCase();
  }
  return String(
    value?.plan_code || value?.planCode || value?.code || value?.plan?.code || value?.subscription?.plan_code || ""
  ).trim().toUpperCase();
}
__name(getPlanCodeValue, "getPlanCodeValue");
__name2(getPlanCodeValue, "getPlanCodeValue");
function canShowPidForPlan(value) {
  return getPlanCodeValue(value) === "INSIGNE";
}
__name(canShowPidForPlan, "canShowPidForPlan");
__name2(canShowPidForPlan, "canShowPidForPlan");
function applyPidVisibilityToPayload(payload, planOrEntitlement) {
  const normalized = normalizeOfferPayload(payload || {});
  if (canShowPidForPlan(planOrEntitlement)) {
    return normalized;
  }
  return stripPidFromPayload(normalized);
}
__name(applyPidVisibilityToPayload, "applyPidVisibilityToPayload");
__name2(applyPidVisibilityToPayload, "applyPidVisibilityToPayload");
function applyPidVisibilityToAlerts(alerts, planOrEntitlement) {
  return (Array.isArray(alerts) ? alerts : []).map((item) => ({
    ...item,
    offer_payload: applyPidVisibilityToPayload(
      item?.offer_payload || item || {},
      planOrEntitlement
    )
  }));
}
__name(applyPidVisibilityToAlerts, "applyPidVisibilityToAlerts");
__name2(applyPidVisibilityToAlerts, "applyPidVisibilityToAlerts");
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
  const puntajeBase = Number.isFinite(Number(payload?.pid_puntaje_total_base)) ? Number(payload.pid_puntaje_total_base) : parseMailNumber(payload?.pid_puntaje_total);
  const bonusResidencia = payload?.pid_residencia_bonus_aplicado ? Number(payload?.pid_residencia_bonus_puntos || 0) : 0;
  const miPuntaje = Number.isFinite(Number(payload?.pid_puntaje_total_final)) ? Number(payload.pid_puntaje_total_final) : Number.isFinite(puntajeBase) ? puntajeBase + bonusResidencia : null;
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
      text: `Tu puntaje actual para esta oferta es ${formatMailNumber(miPuntaje)}. Todav\xEDa no hay referencia suficiente para estimar chances.`,
      toneBg: "#eefbf3",
      toneBorder: "#b7ebc6",
      toneColor: "#0b7a44"
    };
  }
  const diff = miPuntaje - primero;
  if (diff > 2) {
    return {
      title: "Estado actual: Muy favorable",
      text: `Tu puntaje (${formatMailNumber(miPuntaje)}) est\xE1 arriba del mejor visible (${formatMailNumber(primero)}), con una diferencia de +${formatMailNumber(diff)}.`,
      toneBg: "#eefbf3",
      toneBorder: "#b7ebc6",
      toneColor: "#0b7a44"
    };
  }
  if (diff > 0) {
    return {
      title: "Estado actual: Favorable",
      text: `Tu puntaje (${formatMailNumber(miPuntaje)}) est\xE1 arriba del mejor visible (${formatMailNumber(primero)}), con una diferencia de +${formatMailNumber(diff)}.`,
      toneBg: "#eefbf3",
      toneBorder: "#b7ebc6",
      toneColor: "#0b7a44"
    };
  }
  if (diff >= -1) {
    return {
      title: "Estado actual: Competida",
      text: `Tu puntaje (${formatMailNumber(miPuntaje)}) est\xE1 muy cerca del mejor visible (${formatMailNumber(primero)}). Diferencia: ${formatMailNumber(diff)}.`,
      toneBg: "#f2f8ff",
      toneBorder: "#bfdcff",
      toneColor: "#1d4ed8"
    };
  }
  return {
    title: "Estado actual: Dif\xEDcil",
    text: `Tu puntaje (${formatMailNumber(miPuntaje)}) hoy queda por debajo del mejor visible (${formatMailNumber(primero)}). Diferencia: ${formatMailNumber(diff)}.`,
    toneBg: "#fff8e8",
    toneBorder: "#f0d39a",
    toneColor: "#9a6700"
  };
}
__name(buildMailChanceInfo, "buildMailChanceInfo");
function renderMailOfferCard(row) {
  const raw = row?.offer_payload || row || {};
  const p = normalizeOfferPayload(raw);
  const chance = buildMailChanceInfo(p);
  const titulo = p.cargo || p.materia || p.title || "Oferta APD";
  const rawOferta = p?.raw || raw?.raw || {};
  const escuela = String(
    p.escuela || p.nombreestablecimiento || raw.escuela || raw.nombreestablecimiento || rawOferta.escuela || rawOferta.nombreestablecimiento || ""
  ).trim();
  const escuelaHtml = escuela ? `
      <div style="
        margin:12px 0 0 0;
        padding:10px 12px;
        background:#eef6ff;
        border:1px solid #cfe0f5;
        border-radius:10px;
        font-family:Arial,Helvetica,sans-serif;
        font-size:13px;
        line-height:1.4;
        color:#0f3460;
      ">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5d7290;font-weight:800;margin-bottom:3px;">
          Escuela
        </div>
        <div style="font-size:14px;font-weight:800;color:#0b1f3a;">
          \u{1F3EB} ${escHtml(escuela)}
        </div>
      </div>
    ` : "";
  const puntajeBase = Number.isFinite(Number(p?.pid_puntaje_total_base)) ? Number(p.pid_puntaje_total_base) : parseMailNumber(p?.pid_puntaje_total);
  const puntajeFinal = Number.isFinite(Number(p?.pid_puntaje_total_final)) ? Number(p.pid_puntaje_total_final) : Number.isFinite(puntajeBase) ? puntajeBase + Number(p?.pid_residencia_bonus_puntos || 0) : null;
  const revistaRaw = String(p.revista || "").trim().toUpperCase();
  const tipo = revistaRaw === "S" || revistaRaw.includes("SUPL") ? "SUPLENCIA" : revistaRaw === "P" || revistaRaw.includes("PROVIS") ? "PROVISIONAL" : p.desde && p.hasta ? "SUPLENCIA" : "PROVISIONAL";
  const motivoPid = String(p.pid_reason || "").trim() || (p.pid_compatible ? "Compatible con tu PID" : "No compatible con tu PID");
  function resolveMailHref(...candidates) {
    for (const value of candidates) {
      const s = String(value || "").trim();
      if (!s) continue;
      if (/^https?:\/\//i.test(s)) return s;
      if (s.startsWith("//")) return `https:${s}`;
      if (s.startsWith("/")) return `https://alertasapd.com.ar${s}`;
    }
    return "";
  }
  __name(resolveMailHref, "resolveMailHref");
  function actionBtn(label, href, variant = "primary") {
    const bg = variant === "secondary" ? "#163f7a" : "#2563eb";
    return `
      <a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" style="
        display:inline-block;
        background:${bg};
        color:#ffffff;
        text-decoration:none;
        padding:8px 14px;
        border-radius:8px;
        font-family:Arial,Helvetica,sans-serif;
        font-size:12px;
        font-weight:700;
        margin-right:8px;
        margin-top:8px;
      ">${escHtml(label)}</a>
    `;
  }
  __name(actionBtn, "actionBtn");
  const abcUrl = resolveMailHref(
    p.link,
    p.url,
    p.abc_url,
    p.link_postular,
    p.url_postular,
    p.postular_url,
    raw.link,
    raw.url,
    raw.abc_url,
    raw.link_postular,
    raw.url_postular,
    raw.postular_url
  );
  const postuladosUrl = resolveMailHref(
    p.url_postulados,
    p.link_postulados,
    p.postulantes_url,
    p.postulados_url,
    p.url_postulaciones,
    raw.url_postulados,
    raw.link_postulados,
    raw.postulantes_url,
    raw.postulados_url,
    raw.url_postulaciones
  );
  const offerKey = String(
    p.iddetalle || p.idoferta || p.apd_id || p.offer_id || p.source_offer_key || p.codigo || ""
  ).trim();
  const panelBaseUrl = String(PANEL_URL || "").trim().replace(/\/+$/, "") || "https://alertasapd.com.ar";
  const panelUrl = offerKey ? `${panelBaseUrl}/?offer=${encodeURIComponent(offerKey)}` : panelBaseUrl;
  const escuelaChip = String(
    p.escuela || p.nombreestablecimiento || raw.escuela || raw.nombreestablecimiento || raw.raw?.escuela || raw.raw?.nombreestablecimiento || ""
  ).trim();
  const chips = [
    escuelaChip ? { text: `\u{1F3EB} ${escuelaChip}`, bg: "#eaf2ff", color: "#0f3460" } : null,
    p.codigo ? { text: `\u{1F194} ${p.codigo}`, bg: "#eef2ff", color: "#1e40af" } : null,
    p.distrito ? { text: `\u{1F4CD} ${p.distrito}`, bg: "#f3f4f6", color: "#374151" } : null,
    p.turno ? { text: `\u{1F552} ${p.turno}`, bg: "#ecfdf5", color: "#166534" } : null,
    p.is ? { text: `\u{1F3F7}\uFE0F ${p.is}`, bg: "#fff7ed", color: "#9a3412" } : null,
    p.nivel || p.nivel_modalidad ? {
      text: `\u{1F393} ${p.nivel || p.nivel_modalidad}`,
      bg: "#fef3c7",
      color: "#92400e"
    } : null
  ].filter(Boolean);
  const chipsHtml = chips.map((chip) => `
    <span style="
      display:inline-block;
      margin:0 6px 6px 0;
      padding:5px 10px;
      border-radius:999px;
      background:${chip.bg};
      color:${chip.color};
      font-family:Arial,Helvetica,sans-serif;
      font-size:11px;
      line-height:1.2;
      font-weight:700;
      letter-spacing:.02em;
    ">${escHtml(chip.text)}</span>
  `).join("");
  const infoMsg = p.diferencia_puntaje_texto || (p.total_postulantes == null || p.total_postulantes === "" || Number(p.total_postulantes) === 0 ? `Por ahora no se ven postulantes cargados. Tu puntaje actual para esta oferta es ${Number.isFinite(puntajeFinal) ? formatMailNumber(puntajeFinal) : "\u2014"}.` : "Referencia calculada seg\xFAn los postulantes visibles.");
  const botonesHtml = [
    abcUrl ? actionBtn("\u{1F310} Ir a ABC", abcUrl, "primary") : "",
    postuladosUrl ? actionBtn("\u{1F465} Ir a postulados", postuladosUrl, "primary") : "",
    actionBtn("\u{1F4CB} Ir a mi panel", panelUrl, "secondary")
  ].join("");
  return `
    <tr>
      <td style="padding:0 0 20px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="
          width:100%;
          border:1px solid #d6deea;
          border-radius:18px;
          background:#f8fbff;
          overflow:hidden;
        ">
          <tr>
            <td style="padding:18px 18px 10px 18px;">
              <div style="
                font-family:Arial,Helvetica,sans-serif;
                font-size:15px;
                line-height:1.2;
                font-weight:800;
                letter-spacing:.03em;
                color:#173a74;
                text-transform:uppercase;
                margin-bottom:12px;
              ">
                ${escHtml(titulo)}
              </div>

              <div style="margin-bottom:4px;">
                ${chipsHtml}
                <span style="
                  display:inline-block;
                  margin:0 6px 6px 0;
                  padding:5px 10px;
                  border-radius:999px;
                  background:#f5f3ff;
                  color:#7c3aed;
                  font-family:Arial,Helvetica,sans-serif;
                  font-size:11px;
                  line-height:1.2;
                  font-weight:700;
                ">\u{1F4CC} ${escHtml(tipo)}</span>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 18px 18px 18px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:#5d7290;letter-spacing:.08em;margin:0 0 10px 0;">DATOS DE LA OFERTA</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" style="padding:0 6px 6px 0; vertical-align:top;">
                    ${mailInfoBox("CURSO / DIVISI\xD3N", escHtml(p.cursodivision || p.curso_division || "\u2014"))}
                  </td>
                  <td width="50%" style="padding:0 0 6px 6px; vertical-align:top;">
                    ${mailInfoBox("M\xD3DULOS", escHtml(String(p.modulos || "\u2014")))}
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:0 6px 6px 0; vertical-align:top;">
                    ${mailInfoBox("D\xCDAS / HORA.PROB", escHtml(p.dias_horarios || p.diashora || p.horario || "\u2014"))}
                  </td>
                  <td width="50%" style="padding:0 0 6px 6px; vertical-align:top;">
                    ${mailInfoBox(
    "VIGENCIA",
    escHtml(
      p.vigencia || (p.desde || p.fecha_desde || "\u2014") + " \u2014 " + (p.hasta || p.fecha_hasta || "\u2014")
    )
  )}
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">${mailInfoBox("CIERRE", escHtml(p.fecha_cierre || p.finoferta || "\u2014"))}</td>
                  <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">${mailInfoBox("ESTADO", escHtml(p.estado || "\u2014"))}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 18px 12px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="
                width:100%;
                border:1px solid ${chance?.toneBorder || "#b7e1c1"};
                border-radius:14px;
                background:${chance?.toneBg || "#eefbf0"};
              ">
                <tr>
                  <td style="padding:12px 14px 8px 14px;">
                    <div style="
                      font-family:Arial,Helvetica,sans-serif;
                      font-size:13px;
                      line-height:1.3;
                      font-weight:700;
                      color:${chance?.toneColor || "#1f7a35"};
                      margin-bottom:10px;
                    ">
                      ${escHtml(chance?.title || "Compatible con tu PID")}
                    </div>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="50%" style="padding:0 6px 6px 0; vertical-align:top;">
                          ${mailMiniBox("MOTIVO", escHtml(motivoPid))}
                        </td>
                        <td width="50%" style="padding:0 0 6px 6px; vertical-align:top;">
                          ${mailMiniBox("\xC1REA PID", escHtml(p.pid_area || p.area || p.materia || "\u2014"))}
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" style="padding:0 6px 6px 0; vertical-align:top;">
                          ${mailMiniBox("BLOQUE PID", escHtml(p.pid_bloque || p.bloque_pid || "\u2014"))}
                        </td>
                        <td width="50%" style="padding:0 0 6px 6px; vertical-align:top;">
                          ${mailMiniBox(
    "PUNTAJE BASE",
    Number.isFinite(puntajeBase) ? formatMailNumber(puntajeBase) : "\u2014"
  )}
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" style="padding:0 6px 6px 0; vertical-align:top;">
                          ${mailMiniBox(
    "BONUS RESIDENCIA",
    p.pid_residencia_bonus_aplicado ? `S\xED (+${formatMailNumber(p.pid_residencia_bonus_puntos || 0)})` : "No"
  )}
                        </td>
                        <td width="50%" style="padding:0 0 6px 6px; vertical-align:top;">
                          ${mailMiniBox("DISTRITO RESIDENCIA", escHtml(p.pid_distrito_residencia || "\u2014"))}
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" style="padding:0 6px 0 0; vertical-align:top;">
                          ${mailMiniBox(
    "TU PUNTAJE TOTAL",
    Number.isFinite(puntajeFinal) ? formatMailNumber(puntajeFinal) : "\u2014"
  )}
                        </td>
                        <td width="50%" style="padding:0 0 0 6px; vertical-align:top;">
                          ${mailMiniBox(
    "LISTADO / A\xD1O PID",
    escHtml(
      `${p.pid_listado || "\u2014"} \xB7 ${p.pid_anio || (/* @__PURE__ */ new Date()).getFullYear()}`
    )
  )}
                        </td>
                      </tr>
                    </table>

                    <div style="
                      font-family:Arial,Helvetica,sans-serif;
                      font-size:12px;
                      line-height:1.5;
                      color:#4b5563;
                      margin-top:10px;
                    ">
                      ${escHtml(infoMsg)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 18px 12px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="
                width:100%;
                border:1px solid #c8d7ff;
                border-radius:14px;
                background:#f6f9ff;
              ">
                <tr>
                  <td style="padding:12px 14px 8px 14px;">
                    <div style="
                      font-family:Arial,Helvetica,sans-serif;
                      font-size:12px;
                      line-height:1.3;
                      font-weight:800;
                      color:#2b5fb8;
                      letter-spacing:.08em;
                      text-transform:uppercase;
                      margin-bottom:10px;
                    ">
                      REFERENCIA DE POSTULANTES
                    </div>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="50%" style="padding:0 6px 6px 0; vertical-align:top;">
                          ${mailMiniBox(
    "CANTIDAD",
    p.total_postulantes != null && p.total_postulantes !== "" ? escHtml(String(p.total_postulantes)) : "Sin postulados visibles"
  )}
                        </td>
                        <td width="50%" style="padding:0 0 6px 6px; vertical-align:top;">
                          ${mailMiniBox(
    "PUNTAJE M\xC1S ALTO",
    p.puntaje_primero != null && p.puntaje_primero !== "" ? formatMailNumber(parseMailNumber(p.puntaje_primero)) : "Sin datos"
  )}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding:0;">
                          ${mailMiniBox(
    "LISTADO DEL M\xC1S ALTO",
    escHtml(p.listado_origen_primero || "Sin datos")
  )}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 18px 18px 18px;">
              ${botonesHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}
__name(renderMailOfferCard, "renderMailOfferCard");
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
__name2(syncUserOfferState, "syncUserOfferState");
function audNorm(v) {
  return String(v || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
__name(audNorm, "audNorm");
__name2(audNorm, "audNorm");
function audExtraerSiglaParentesis(txt) {
  const m = String(txt || "").match(/\(([^)]+)\)/);
  return m ? audNorm(m[1]) : "";
}
__name(audExtraerSiglaParentesis, "audExtraerSiglaParentesis");
__name2(audExtraerSiglaParentesis, "audExtraerSiglaParentesis");
function audNormalizarTurno(turno) {
  const t = audNorm(turno);
  if (!t) return "";
  if (t === "M" || t === "MANANA") return "MANANA";
  if (t === "T" || t === "TARDE") return "TARDE";
  if (t === "V" || t === "N" || t === "VESPERTINO" || t === "NOCHE" || t === "NOCTURNO") return "NOCHE";
  if (t === "ALTERNADO") return "ALTERNADO";
  return t;
}
__name(audNormalizarTurno, "audNormalizarTurno");
__name2(audNormalizarTurno, "audNormalizarTurno");
function audNormalizarOfertaAPD(doc) {
  return {
    id: String(doc?.iddetalle || doc?.idoferta || doc?.id || "").trim(),
    iddetalle_raw: doc?.iddetalle ?? null,
    idoferta_raw: doc?.idoferta ?? null,
    id_raw: doc?.id ?? null,
    ige: String(doc?.ige || doc?.IGE || "").trim(),
    codigo_visible: String(
      doc?.codigo || doc?.codigooferta || doc?.codigocargo || doc?.source_offer_key || ""
    ).trim(),
    distrito: String(doc?.descdistrito || "").trim(),
    distrito_norm: audNorm(doc?.descdistrito || ""),
    cargo: String(doc?.descripcioncargo || doc?.cargo || "").trim(),
    cargo_norm: audNorm(doc?.descripcioncargo || doc?.cargo || ""),
    cargo_sigla: audExtraerSiglaParentesis(doc?.descripcioncargo || doc?.cargo || ""),
    nivel: String(doc?.descnivelmodalidad || "").trim(),
    nivel_norm: audNorm(doc?.descnivelmodalidad || ""),
    turno: String(doc?.turno || "").trim(),
    turno_norm: audNormalizarTurno(doc?.turno || ""),
    escuela: String(doc?.nombreestablecimiento || doc?.escuela || "").trim(),
    escuela_norm: audNorm(doc?.nombreestablecimiento || doc?.escuela || ""),
    finoferta: String(doc?.finoferta || doc?.finoferta_label || "").trim(),
    estado: String(doc?.estado || "").trim(),
    estado_raw: String(doc?.estado || "").trim(),
    estado_publicacion_raw: String(doc?.estadopublicacion || doc?.estado_publicacion || "").trim(),
    publicada_raw: doc?.publicada ?? null,
    anulada_raw: doc?.anulada ?? null,
    designada_raw: doc?.designada ?? null,
    raw: doc
  };
}
__name(audNormalizarOfertaAPD, "audNormalizarOfertaAPD");
__name2(audNormalizarOfertaAPD, "audNormalizarOfertaAPD");
function audOfertaActiva(oferta) {
  const estado = audNorm(oferta?.estado || "");
  const estadoPublicacion = audNorm(oferta?.estado_publicacion_raw || "");
  const cargo = audNorm(oferta?.cargo || "");
  const nivel = audNorm(oferta?.nivel || "");
  const publicadaRaw = String(oferta?.publicada_raw ?? "").trim().toUpperCase();
  const anuladaRaw = String(oferta?.anulada_raw ?? "").trim().toUpperCase();
  const designadaRaw = String(oferta?.designada_raw ?? "").trim().toUpperCase();
  const fin = String(oferta?.finoferta || "").trim();
  const finDate = fin ? new Date(fin) : null;
  const vencida = finDate && !isNaN(finDate.getTime()) && finDate.getTime() < Date.now();
  if (vencida) return false;
  if (estado.includes("ANULAD")) return false;
  if (estado.includes("DESIGNAD")) return false;
  if (estado.includes("RENUNCIAD")) return false;
  if (estado.includes("BAJA")) return false;
  if (estado.includes("CERRAD")) return false;
  if (estado.includes("VENCID")) return false;
  if (estadoPublicacion.includes("ANULAD")) return false;
  if (estadoPublicacion.includes("DESIGNAD")) return false;
  if (estadoPublicacion.includes("RENUNCIAD")) return false;
  if (estadoPublicacion.includes("BAJA")) return false;
  if (estadoPublicacion.includes("CERRAD")) return false;
  if (estadoPublicacion.includes("VENCID")) return false;
  if (cargo.includes("ANULAD")) return false;
  if (cargo.includes("DESIGNAD")) return false;
  if (cargo.includes("RENUNCIAD")) return false;
  if (nivel.includes("ANULAD")) return false;
  if (nivel.includes("DESIGNAD")) return false;
  if (nivel.includes("RENUNCIAD")) return false;
  if (anuladaRaw === "TRUE" || anuladaRaw === "1" || anuladaRaw === "SI") return false;
  if (designadaRaw === "TRUE" || designadaRaw === "1" || designadaRaw === "SI") return false;
  if (publicadaRaw === "FALSE" || publicadaRaw === "0" || publicadaRaw === "NO") return false;
  return true;
}
__name(audOfertaActiva, "audOfertaActiva");
__name2(audOfertaActiva, "audOfertaActiva");
async function audFetchAPDPage(start = 0, rows = 100, distrito = "") {
  const base = "https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
  const url = new URL(base);
  url.searchParams.set("wt", "json");
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("start", String(start));
  url.searchParams.set("q", distrito ? `descdistrito:"${distrito}"` : "*:*");
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*"
    }
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`APD HTTP ${resp.status} ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  return {
    docs: Array.isArray(data?.response?.docs) ? data.response.docs : [],
    numFound: Number(data?.response?.numFound || 0)
  };
}
__name(audFetchAPDPage, "audFetchAPDPage");
__name2(audFetchAPDPage, "audFetchAPDPage");
async function audObtenerOfertasBaseAPD(distrito = "", maxPages = 3) {
  const rows = 100;
  let start = 0;
  let total = 0;
  let pages = 0;
  const acumuladas = [];
  do {
    const page = await audFetchAPDPage(start, rows, distrito);
    total = page.numFound;
    acumuladas.push(...page.docs);
    start += rows;
    pages += 1;
  } while (start < total && pages < maxPages);
  const map = /* @__PURE__ */ new Map();
  for (const doc of acumuladas) {
    const of = audNormalizarOfertaAPD(doc);
    if (!of.id) continue;
    if (!audOfertaActiva(of)) continue;
    if (!map.has(of.id)) map.set(of.id, of);
  }
  return [...map.values()];
}
__name(audObtenerOfertasBaseAPD, "audObtenerOfertasBaseAPD");
__name2(audObtenerOfertasBaseAPD, "audObtenerOfertasBaseAPD");
function audFiltrarPorDistrito(ofertas, distritoBuscado) {
  const d = audNorm(distritoBuscado);
  return (ofertas || []).filter((of) => of.distrito_norm === d);
}
__name(audFiltrarPorDistrito, "audFiltrarPorDistrito");
__name2(audFiltrarPorDistrito, "audFiltrarPorDistrito");
function audMatchCargo(oferta, preferenciaCargo) {
  const siglaPref = audExtraerSiglaParentesis(preferenciaCargo);
  const siglaOferta = oferta.cargo_sigla || "";
  if (!siglaPref) return false;
  if (!siglaOferta) return false;
  return siglaOferta === siglaPref;
}
__name(audMatchCargo, "audMatchCargo");
__name2(audMatchCargo, "audMatchCargo");
function audMatchNivel(oferta, preferenciaNivel) {
  const n = audNorm(preferenciaNivel);
  if (!n) return true;
  return oferta.nivel_norm.includes(n);
}
__name(audMatchNivel, "audMatchNivel");
__name2(audMatchNivel, "audMatchNivel");
function audMatchTurno(oferta, preferenciaTurno) {
  const t = audNormalizarTurno(preferenciaTurno);
  if (!t) return true;
  return oferta.turno_norm === t;
}
__name(audMatchTurno, "audMatchTurno");
__name2(audMatchTurno, "audMatchTurno");
function audEvaluarOfertaPasoAPaso(oferta, pref) {
  const base = {
    id: oferta.id,
    iddetalle_raw: oferta.iddetalle_raw,
    idoferta_raw: oferta.idoferta_raw,
    id_raw: oferta.id_raw,
    ige: oferta.ige,
    codigo_visible: oferta.codigo_visible,
    estado_raw: oferta.estado_raw,
    estado_publicacion_raw: oferta.estado_publicacion_raw,
    publicada_raw: oferta.publicada_raw,
    anulada_raw: oferta.anulada_raw,
    designada_raw: oferta.designada_raw,
    distrito: oferta.distrito,
    cargo: oferta.cargo,
    cargo_sigla: oferta.cargo_sigla,
    escuela: oferta.escuela,
    nivel: oferta.nivel,
    turno: oferta.turno,
    finoferta: oferta.finoferta
  };
  const distritoOk = !pref.distrito || oferta.distrito_norm === audNorm(pref.distrito);
  if (!distritoOk) {
    return {
      ...base,
      paso_fallado: "distrito",
      pasaFinal: false
    };
  }
  const cargoOk = audMatchCargo(oferta, pref.cargo);
  if (!cargoOk) {
    return {
      ...base,
      paso_fallado: "cargo",
      pasaFinal: false
    };
  }
  const nivelOk = audMatchNivel(oferta, pref.nivel);
  if (!nivelOk) {
    return {
      ...base,
      paso_fallado: "nivel",
      pasaFinal: false
    };
  }
  const turnoOk = audMatchTurno(oferta, pref.turno);
  if (!turnoOk) {
    return {
      ...base,
      paso_fallado: "turno",
      pasaFinal: false
    };
  }
  return {
    ...base,
    paso_fallado: "",
    pasaFinal: true
  };
}
__name(audEvaluarOfertaPasoAPaso, "audEvaluarOfertaPasoAPaso");
__name2(audEvaluarOfertaPasoAPaso, "audEvaluarOfertaPasoAPaso");
function audResumenDistrito(items, totalBase, distrito) {
  return {
    distrito,
    total_base: totalBase,
    total_resultado: items.length,
    cargos_unicos: [...new Set(items.map((x) => x.cargo).filter(Boolean))].sort(),
    niveles_unicos: [...new Set(items.map((x) => x.nivel).filter(Boolean))].sort(),
    turnos_unicos: [...new Set(items.map((x) => x.turno).filter(Boolean))].sort(),
    ids_unicos: [...new Set(items.map((x) => x.id).filter(Boolean))].length
  };
}
__name(audResumenDistrito, "audResumenDistrito");
__name2(audResumenDistrito, "audResumenDistrito");
function audResumenComparacion(evaluadas) {
  return {
    total_evaluadas: evaluadas.length,
    pasan_final: evaluadas.filter((x) => x.pasaFinal).length,
    descartadas_distrito: evaluadas.filter((x) => x.paso_fallado === "distrito").length,
    descartadas_cargo: evaluadas.filter((x) => x.paso_fallado === "cargo").length,
    descartadas_nivel: evaluadas.filter((x) => x.paso_fallado === "nivel").length,
    descartadas_turno: evaluadas.filter((x) => x.paso_fallado === "turno").length
  };
}
__name(audResumenComparacion, "audResumenComparacion");
__name2(audResumenComparacion, "audResumenComparacion");
async function handleAdminAuditoriaDistrito(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const distrito = String(url.searchParams.get("distrito") || "").trim();
  if (!distrito) {
    return adminJson({ ok: false, error: "Falta distrito" }, 400);
  }
  const ofertasBase = await audObtenerOfertasBaseAPD(distrito);
  const items = audFiltrarPorDistrito(ofertasBase, distrito);
  return adminJson({
    ok: true,
    resumen: audResumenDistrito(items, ofertasBase.length, distrito),
    items: items.map((x) => ({
      id: x.id,
      distrito: x.distrito,
      cargo: x.cargo,
      nivel: x.nivel,
      turno: x.turno,
      finoferta: x.finoferta
    }))
  });
}
__name(handleAdminAuditoriaDistrito, "handleAdminAuditoriaDistrito");
__name2(handleAdminAuditoriaDistrito, "handleAdminAuditoriaDistrito");
async function handleAdminCompararFiltro(request, env) {
  try {
    const auth = await requireAdmin(env, request);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const distrito = String(url.searchParams.get("distrito") || "").trim();
    const cargo = String(url.searchParams.get("cargo") || "").trim();
    const nivel = String(url.searchParams.get("nivel") || "SECUNDARIA").trim();
    const turno = String(url.searchParams.get("turno") || "M").trim();
    if (!distrito) {
      return adminJson({ ok: false, error: "Falta distrito" }, 400);
    }
    const fakeUrl = new URL(request.url);
    fakeUrl.searchParams.set("distrito", distrito);
    if (cargo) fakeUrl.searchParams.set("cargo", cargo);
    fakeUrl.searchParams.set("nivel", nivel);
    fakeUrl.searchParams.set("turno", turno);
    const fakeRequest = new Request(fakeUrl.toString(), {
      method: "GET",
      headers: request.headers
    });
    const masivoResp = await handleAdminCompararMasivo(fakeRequest, env);
    const masivoJson = await masivoResp.json();
    if (!masivoJson.ok) {
      return adminJson(masivoJson, masivoResp.status || 500);
    }
    const item = Array.isArray(masivoJson.items) && masivoJson.items.length ? masivoJson.items[0] : null;
    if (!item) {
      return adminJson({
        ok: true,
        pref: { distrito, cargo, nivel, turno },
        resumen_universo: {
          distrito,
          total_base: 0,
          total_resultado: 0,
          cargos_unicos: [],
          niveles_unicos: [],
          turnos_unicos: [],
          ids_unicos: 0
        },
        resumen_comparacion: {
          total_evaluadas: 0,
          pasan_final: 0,
          descartadas_distrito: 0,
          descartadas_cargo: 0,
          descartadas_nivel: 0,
          descartadas_turno: 0
        },
        final: [],
        descartadas: []
      });
    }
    return adminJson({
      ok: true,
      pref: { distrito, cargo, nivel, turno },
      resumen_universo: {
        distrito: item.distrito,
        total_base: item.total_evaluadas,
        total_resultado: item.total_evaluadas,
        cargos_unicos: [],
        niveles_unicos: [],
        turnos_unicos: [],
        ids_unicos: 0
      },
      resumen_comparacion: {
        total_evaluadas: item.total_evaluadas,
        pasan_final: item.pasan_final,
        descartadas_distrito: item.descartadas_distrito,
        descartadas_cargo: item.descartadas_cargo,
        descartadas_nivel: item.descartadas_nivel,
        descartadas_turno: item.descartadas_turno
      },
      final: (item.ids_finales || []).map((id, i) => ({
        id,
        cargo: (item.cargos_finales || [])[i] || "",
        escuela: (item.escuelas_finales || [])[i] || ""
      })),
      descartadas: []
    });
  } catch (err) {
    return adminJson({
      ok: false,
      error: err?.message || String(err),
      stack: String(err?.stack || "")
    }, 500);
  }
}
__name(handleAdminCompararFiltro, "handleAdminCompararFiltro");
__name2(handleAdminCompararFiltro, "handleAdminCompararFiltro");
async function handleAdminVerificarCaso(request, env) {
  try {
    const auth = await requireAdmin(env, request);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const distrito = String(url.searchParams.get("distrito") || "").trim();
    const cargo = String(url.searchParams.get("cargo") || "").trim();
    const nivel = String(url.searchParams.get("nivel") || "SECUNDARIA").trim();
    const turno = String(url.searchParams.get("turno") || "M").trim();
    const maxPages = Number(url.searchParams.get("maxPages") || 3);
    if (!distrito) {
      return adminJson({ ok: false, error: "Falta distrito" }, 400);
    }
    if (!cargo) {
      return adminJson({ ok: false, error: "Falta cargo" }, 400);
    }
    const ofertasBase = await audObtenerOfertasBaseAPD(distrito, maxPages);
    const universo = audFiltrarPorDistrito(ofertasBase, distrito);
    const pref = { distrito, cargo, nivel, turno };
    const evaluadas = universo.map((of) => audEvaluarOfertaPasoAPaso(of, pref));
    const final = evaluadas.filter((x) => x.pasaFinal);
    const descartadas = evaluadas.filter((x) => !x.pasaFinal);
    return adminJson({
      ok: true,
      pref,
      resumen_universo: audResumenDistrito(universo, ofertasBase.length, distrito),
      resumen_comparacion: audResumenComparacion(evaluadas),
      final,
      descartadas
    });
  } catch (err) {
    return adminJson({
      ok: false,
      error: err?.message || String(err),
      stack: String(err?.stack || "")
    }, 500);
  }
}
__name(handleAdminVerificarCaso, "handleAdminVerificarCaso");
function dbg2Norm(v) {
  return String(v || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\/()\-]+/gu, " ").replace(/\s+/g, " ").trim();
}
__name(dbg2Norm, "dbg2Norm");
function dbg2ExtraerSiglaParentesis(txt) {
  const m = String(txt || "").match(/\(([^)]+)\)/);
  return m ? dbg2Norm(m[1]) : "";
}
__name(dbg2ExtraerSiglaParentesis, "dbg2ExtraerSiglaParentesis");
function dbg2NormalizarTurno(turno) {
  const t = dbg2Norm(turno);
  if (!t) return "";
  if (t === "M" || t === "MANANA") return "M";
  if (t === "T" || t === "TARDE") return "T";
  if (t === "N" || t === "V" || t === "NOCTURNO" || t === "NOCHE" || t === "VESPERTINO") return "N";
  if (t === "MT") return "MT";
  if (t === "A" || t === "ALTERNADO") return "A";
  return t;
}
__name(dbg2NormalizarTurno, "dbg2NormalizarTurno");
function dbg2NormalizarOferta(doc) {
  return {
    id: String(doc?.iddetalle || doc?.idoferta || doc?.id || "").trim(),
    distrito: String(doc?.descdistrito || "").trim(),
    distrito_norm: dbg2Norm(doc?.descdistrito || ""),
    cargo: String(doc?.descripcioncargo || doc?.cargo || "").trim(),
    cargo_sigla: dbg2ExtraerSiglaParentesis(doc?.descripcioncargo || doc?.cargo || ""),
    nivel: String(doc?.descnivelmodalidad || "").trim(),
    nivel_norm: dbg2Norm(doc?.descnivelmodalidad || ""),
    turno: String(doc?.turno || "").trim(),
    turno_norm: dbg2NormalizarTurno(doc?.turno || ""),
    escuela: String(doc?.nombreestablecimiento || doc?.escuela || "").trim(),
    finoferta: String(doc?.finoferta || doc?.finoferta_label || "").trim(),
    estado_raw: String(doc?.estado || "").trim(),
    raw: doc
  };
}
__name(dbg2NormalizarOferta, "dbg2NormalizarOferta");
function dbg2OfertaActiva(oferta) {
  const estado = dbg2Norm(oferta?.estado_raw || "");
  const fin = String(oferta?.finoferta || "").trim();
  const finDate = fin ? new Date(fin) : null;
  const vencida = finDate && !isNaN(finDate.getTime()) && finDate.getTime() < Date.now();
  if (vencida) return false;
  if (estado.includes("ANULAD")) return false;
  if (estado.includes("DESIGNAD")) return false;
  if (estado.includes("RENUNCIAD")) return false;
  if (estado.includes("CERRAD")) return false;
  if (estado.includes("VENCID")) return false;
  return true;
}
__name(dbg2OfertaActiva, "dbg2OfertaActiva");
async function dbg2FetchPage(distrito, start = 0, rows = 100) {
  const base = "https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
  const url = new URL(base);
  url.searchParams.set("wt", "json");
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("start", String(start));
  url.searchParams.set("q", `descdistrito:"${distrito}"`);
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" }
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`APD HTTP ${resp.status} ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  return {
    docs: Array.isArray(data?.response?.docs) ? data.response.docs : [],
    numFound: Number(data?.response?.numFound || 0)
  };
}
__name(dbg2FetchPage, "dbg2FetchPage");
async function dbg2ObtenerBaseDistrito(distrito, maxPages = 4) {
  const rows = 100;
  let start = 0;
  let total = 0;
  let pages = 0;
  const acumuladas = [];
  do {
    const page = await dbg2FetchPage(distrito, start, rows);
    total = page.numFound;
    acumuladas.push(...page.docs);
    start += rows;
    pages += 1;
  } while (start < total && pages < maxPages);
  const map = /* @__PURE__ */ new Map();
  for (const doc of acumuladas) {
    const of = dbg2NormalizarOferta(doc);
    if (!of.id) continue;
    if (!dbg2OfertaActiva(of)) continue;
    if (!map.has(of.id)) map.set(of.id, of);
  }
  return [...map.values()];
}
__name(dbg2ObtenerBaseDistrito, "dbg2ObtenerBaseDistrito");
function dbg2MatchCargo(oferta, cargoPreferencia) {
  const siglaPref = dbg2ExtraerSiglaParentesis(cargoPreferencia);
  const siglaOferta = oferta.cargo_sigla || "";
  if (!siglaPref) return false;
  if (!siglaOferta) return false;
  return siglaOferta === siglaPref;
}
__name(dbg2MatchCargo, "dbg2MatchCargo");
function dbg2MatchNivel(oferta, nivelPreferencia) {
  const n = dbg2Norm(nivelPreferencia);
  if (!n) return true;
  return oferta.nivel_norm.includes(n);
}
__name(dbg2MatchNivel, "dbg2MatchNivel");
function dbg2MatchTurno(oferta, turnoPreferencia) {
  const t = dbg2NormalizarTurno(turnoPreferencia);
  if (!t) return true;
  return oferta.turno_norm === t;
}
__name(dbg2MatchTurno, "dbg2MatchTurno");
async function handleAdminVerificarCasoV2(request, env) {
  try {
    const auth = await requireAdmin(env, request);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const distrito = String(url.searchParams.get("distrito") || "").trim();
    const cargo = String(url.searchParams.get("cargo") || "").trim();
    const nivel = String(url.searchParams.get("nivel") || "SECUNDARIA").trim();
    const turno = String(url.searchParams.get("turno") || "M").trim();
    const maxPages = Number(url.searchParams.get("maxPages") || 4);
    if (!distrito) return adminJson({ ok: false, error: "Falta distrito" }, 400);
    if (!cargo) return adminJson({ ok: false, error: "Falta cargo" }, 400);
    const universo = await dbg2ObtenerBaseDistrito(distrito, maxPages);
    const evaluadas = universo.map((oferta) => {
      const base = {
        id: oferta.id,
        distrito: oferta.distrito,
        cargo: oferta.cargo,
        cargo_sigla: oferta.cargo_sigla,
        nivel: oferta.nivel,
        turno: oferta.turno,
        estado: oferta.estado_raw,
        escuela: oferta.escuela,
        finoferta: oferta.finoferta
      };
      if (!dbg2MatchCargo(oferta, cargo)) {
        return { ...base, paso_fallado: "cargo", pasaFinal: false };
      }
      if (!dbg2MatchNivel(oferta, nivel)) {
        return { ...base, paso_fallado: "nivel", pasaFinal: false };
      }
      if (!dbg2MatchTurno(oferta, turno)) {
        return { ...base, paso_fallado: "turno", pasaFinal: false };
      }
      return { ...base, paso_fallado: "", pasaFinal: true };
    });
    const final = evaluadas.filter((x) => x.pasaFinal);
    const descartadas = evaluadas.filter((x) => !x.pasaFinal);
    return adminJson({
      ok: true,
      pref: { distrito, cargo, nivel, turno, maxPages },
      resumen_universo: {
        distrito,
        total_base: universo.length,
        cargos_unicos: [...new Set(universo.map((x) => x.cargo).filter(Boolean))].length,
        niveles_unicos: [...new Set(universo.map((x) => x.nivel).filter(Boolean))].length,
        turnos_unicos: [...new Set(universo.map((x) => x.turno).filter(Boolean))].length
      },
      resumen_comparacion: {
        total_evaluadas: evaluadas.length,
        pasan_final: final.length,
        descartadas_cargo: descartadas.filter((x) => x.paso_fallado === "cargo").length,
        descartadas_nivel: descartadas.filter((x) => x.paso_fallado === "nivel").length,
        descartadas_turno: descartadas.filter((x) => x.paso_fallado === "turno").length
      },
      final,
      descartadas
    });
  } catch (err) {
    return adminJson({
      ok: false,
      error: err?.message || String(err),
      stack: String(err?.stack || "")
    }, 500);
  }
}
__name(handleAdminVerificarCasoV2, "handleAdminVerificarCasoV2");
var worker_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === "/test-mail" && request.method === "GET") {
        return await handleTestMail(env);
      }
      if (path === "/test-email-sweep" && request.method === "GET") {
        return await handleTestEmailSweep(env);
      }
      if (path === "/test-digest" && request.method === "GET") {
        return await handleTestDigest(request, env);
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
      if (path === "/api/admin/auditoria-distrito" && request.method === "GET") {
        return await handleAdminAuditoriaDistrito(request, env);
      }
      if (path === "/api/admin/comparar-filtro" && request.method === "GET") {
        return await handleAdminCompararFiltro(request, env);
      }
      if (path === "/api/admin/comparar-masivo" && request.method === "GET") {
        return await handleAdminCompararMasivo(request, env);
      }
      if (path === "/api/admin/verificar-caso" && request.method === "GET") {
        return await handleAdminVerificarCaso(request, env);
      }
      if (path === "/api/admin/verificar-caso-v2" && request.method === "GET") {
        return await handleAdminVerificarCasoV2(request, env);
      }
      return json({ ok: false, error: "Ruta no encontrada" }, 404);
    } catch (err) {
      return json({ ok: false, error: err?.message || "Error interno" }, 500);
    }
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
  const verifiedPassword = await accountVerifyPasswordV1(user.password_hash, password);
  if (!verifiedPassword.ok) {
    return json({ ok: false, message: "Password incorrecto" }, 401);
  }
  if (verifiedPassword.needsUpgrade) {
    await supabasePatch(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { password_hash: await accountHashPasswordV1(password) }).catch(() => null);
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
__name2(handleLogin, "handleLogin");
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
__name2(handleGoogleAuth, "handleGoogleAuth");
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
  const planes = (Array.isArray(rows) ? rows : []).map((plan) => normalizePlanOut(plan)).map((plan) => applyFounderPricing(plan));
  return json({
    ok: true,
    founder_price_policy: {
      active: FOUNDER_PRICE_POLICY.active,
      label: FOUNDER_PRICE_POLICY.label
    },
    planes
  });
}
__name(handlePlanes, "handlePlanes");
__name2(handlePlanes, "handlePlanes");
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
__name2(handleMiPlan, "handleMiPlan");
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
  const alertData = await construirAlertasParaUsuario(env, user.id).catch((err) => ({
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
  const items = Array.isArray(alertData?.resultados) ? alertData.resultados : Array.isArray(alertData?.alertas) ? alertData.alertas : [];
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
        message: "No hab\xEDa alertas compatibles al momento del primer guardado"
      }
    }).catch(() => null);
    return { ok: true, skipped: true, reason: "no_alerts" };
  }
  const MAX_VISIBLE = 5;
  const alerts = await enrichAlertsForRichChannels(env, user, items, MAX_VISIBLE);
  const resolvedPlanForInitialEmail = await resolverPlanUsuario(env, user.id).catch(() => null);
  const initialEmailPlanCode = getPlanCodeValue(resolvedPlanForInitialEmail) || "TRIAL_7D";
  const initialEmailCanShowPid = canShowPidForPlan(initialEmailPlanCode);
  const alertsForRender = applyPidVisibilityToAlerts(
    alerts,
    initialEmailPlanCode
  );
  const html = buildDigestHtml(alertsForRender, user, {
    total_alerts: items.length,
    max_visible: MAX_VISIBLE,
    panel_url: "https://alertasapd.com.ar"
  });
  const asunto = items.length > MAX_VISIBLE ? `APDocentePBA: ${MAX_VISIBLE} de ${items.length} alertas iniciales para vos` : `APDocentePBA: ${items.length} alerta${items.length === 1 ? "" : "s"} inicial${items.length === 1 ? "" : "es"} para vos`;
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
    provider_message_id: extractBrevoMessageId(send),
    payload: {
      source: options.source || "first_preferences_save",
      total_alerts: items.length,
      plan_code: initialEmailPlanCode,
      pid_visible: initialEmailCanShowPid
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
__name2(sendInitialAlertsDigestIfNeeded, "sendInitialAlertsDigestIfNeeded");
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
        message: "Tu plan est\xE1 vencido. Suscribite para seguir usando el servicio.",
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
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ],
    "user_id"
  );
  const savedPrefs = Array.isArray(rows) ? rows[0] : rows;
  const firstMeaningfulSave = !prevPrefs || !prevPrefs.distrito_principal && (!Array.isArray(prevPrefs.otros_distritos) || prevPrefs.otros_distritos.length === 0) && (!Array.isArray(prevPrefs.cargos) || prevPrefs.cargos.length === 0) && (!Array.isArray(prevPrefs.materias) || prevPrefs.materias.length === 0) && (!Array.isArray(prevPrefs.niveles) || prevPrefs.niveles.length === 0) && (!Array.isArray(prevPrefs.turnos) || prevPrefs.turnos.length === 0);
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
    message: ajustesPlan.distritos_recortados || ajustesPlan.cargos_recortados ? `Preferencias guardadas. Se ajustaron filtros al limite de tu plan (${resolved.plan?.max_distritos || 0} distrito(s) y ${resolved.plan?.max_cargos || 0} cargo(s) o materia(s)).` : "Preferencias guardadas",
    preferencias: savedPrefs,
    plan: resolved.plan,
    subscription: resolved.subscription,
    initial_email: initialEmail
  });
}
__name(handleGuardarPreferencias, "handleGuardarPreferencias");
__name2(handleGuardarPreferencias, "handleGuardarPreferencias");
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
__name2(handleMisAlertas, "handleMisAlertas");
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
__name2(handlePostulantesResumen, "handlePostulantesResumen");
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
__name2(handleCapturarHistoricoAPD, "handleCapturarHistoricoAPD");
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
__name2(handleHistoricoResumen, "handleHistoricoResumen");
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
__name2(handleProvinciaBackfillStatus, "handleProvinciaBackfillStatus");
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
__name2(handleProvinciaBackfillKick, "handleProvinciaBackfillKick");
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
__name2(handleProvinciaBackfillReset, "handleProvinciaBackfillReset");
async function handleProvinciaBackfillStep(request, env) {
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  const result = await runProvinciaBackfillStep(env, { source: "manual", force });
  return json({ ok: true, ...result });
}
__name(handleProvinciaBackfillStep, "handleProvinciaBackfillStep");
__name2(handleProvinciaBackfillStep, "handleProvinciaBackfillStep");
async function handleProvinciaResumen(url, env) {
  const days = clampInt(url.searchParams.get("days"), 7, 120, PROVINCIA_DAYS_DEFAULT);
  const rows = await fetchProvinciaCurrentRows(env, days);
  const state = await obtenerScanState(env);
  return json(buildProvinciaResumenPayload(rows, days, state));
}
__name(handleProvinciaResumen, "handleProvinciaResumen");
__name2(handleProvinciaResumen, "handleProvinciaResumen");
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
__name2(handleProvinciaInsights, "handleProvinciaInsights");
async function handleMercadoPagoCreateCheckoutLink(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  const planCode = canonicalPlanCode(body?.plan_code || "");
  if (!userId || !planCode) {
    return json({
      ok: false,
      message: "Faltan user_id o plan_code"
    }, 400);
  }
  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return json({
      ok: false,
      message: "Usuario no encontrado"
    }, 404);
  }
  const planRaw = await obtenerPlanPorCode(env, planCode);
  if (!planRaw) {
    return json({
      ok: false,
      message: "Plan no encontrado"
    }, 404);
  }
  const plan = applyFounderPricing(planRaw);
  const price = Number(plan?.price_ars || 0);
  if (!Number.isFinite(price) || price <= 0) {
    return json({
      ok: false,
      message: "El plan no tiene un precio v\xE1lido para Mercado Pago.",
      plan_code: planCode,
      price_ars: plan?.price_ars ?? null
    }, 400);
  }
  const externalReference = `${userId}:${planCode}:${Date.now()}`;
  const webhookUrl = env.MERCADOPAGO_WEBHOOK_URL || new URL(`${API_URL_PREFIX2}/mercadopago/webhook`, request.url).toString();
  let mpPreference = null;
  try {
    mpPreference = await createMercadoPagoCheckoutPreference(env, {
      user,
      plan,
      externalReference,
      webhookUrl
    });
  } catch (err) {
    return json({
      ok: false,
      configured: false,
      provider_mode: "mercadopago_error",
      message: err?.message || "Mercado Pago no pudo crear el checkout.",
      mercadopago_error: err?.message || String(err || ""),
      plan: normalizePlanOut(plan),
      debug: {
        plan_code: planCode,
        price_ars: price,
        has_access_token: !!String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim(),
        webhook_url: webhookUrl
      }
    }, 500);
  }
  const checkoutUrl = mpPreference?.checkout_url || null;
  const checkoutConfigured = !!checkoutUrl;
  if (!checkoutConfigured) {
    return json({
      ok: false,
      configured: false,
      provider_mode: mpPreference?.mode || "mercadopago_preference_without_url",
      message: "Mercado Pago cre\xF3 la preferencia, pero no devolvi\xF3 checkout_url.",
      preference_id: mpPreference?.preference_id || null,
      sandbox_init_point: mpPreference?.sandbox_init_point || null,
      plan: normalizePlanOut(plan)
    }, 500);
  }
  const sessionRows = await supabaseInsert(env, "mercadopago_checkout_sessions", {
    user_id: userId,
    plan_code: planCode,
    status: "ready",
    provider: "mercadopago",
    checkout_url: checkoutUrl,
    external_reference: externalReference,
    provider_payload: {
      configured: true,
      plan_code: planCode,
      mercadopago_plan_id: plan.mercadopago_plan_id || null,
      price_ars: price,
      original_price_ars: plan?.original_price_ars ?? null,
      discount_percent: plan?.discount_percent ?? null,
      pricing_label: plan?.pricing_label || null,
      provider_mode: mpPreference?.mode || "mercadopago_preference",
      preference_id: mpPreference?.preference_id || null,
      sandbox_init_point: mpPreference?.sandbox_init_point || null
    }
  });
  const session = Array.isArray(sessionRows) ? sessionRows[0] : sessionRows;
  return json({
    ok: true,
    configured: true,
    provider_mode: mpPreference?.mode || "mercadopago_preference",
    message: "Checkout real de Mercado Pago preparado",
    session_id: session?.id || null,
    checkout_url: checkoutUrl,
    sandbox_init_point: mpPreference?.sandbox_init_point || null,
    preference_id: mpPreference?.preference_id || null,
    external_reference: externalReference,
    plan: normalizePlanOut(plan)
  });
}
__name(handleMercadoPagoCreateCheckoutLink, "handleMercadoPagoCreateCheckoutLink");
__name2(handleMercadoPagoCreateCheckoutLink, "handleMercadoPagoCreateCheckoutLink");
function arParseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
__name(arParseDate, "arParseDate");
function arFormatDate(value) {
  const d = arParseDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);
}
__name(arFormatDate, "arFormatDate");
function arAddDaysIso(baseIso, days) {
  const base = arParseDate(baseIso) || /* @__PURE__ */ new Date();
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1e3).toISOString();
}
__name(arAddDaysIso, "arAddDaysIso");
function arRecurringStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return "inactive";
  if (raw === "authorized" || raw === "active") return "active";
  if (raw === "pending") return "pending_setup";
  if (raw === "paused") return "paused";
  if (raw === "cancelled" || raw === "canceled") return "canceled";
  return raw;
}
__name(arRecurringStatus, "arRecurringStatus");
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
__name(arSupabasePatchById, "arSupabasePatchById");
async function arMercadoPagoRequest(env, path, init = {}) {
  const token = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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
    throw new Error(data?.message || data?.cause?.[0]?.description || `Mercado Pago error ${res.status}`);
  }
  return data;
}
__name(arMercadoPagoRequest, "arMercadoPagoRequest");
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
__name(arGetCurrentPaidSubscription, "arGetCurrentPaidSubscription");
function arMercadoPagoDate(value) {
  const base = arParseDate(value) || new Date(Date.now() + 5 * 60 * 1e3);
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
__name(arMercadoPagoDate, "arMercadoPagoDate");
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
    return json({ ok: false, message: "Necesit\xE1s un plan pago activo para activar renovaci\xF3n autom\xE1tica." }, 409);
  }
  if (String(current?.mercadopago_preapproval_id || "").trim()) {
    return json({ ok: false, message: "La renovaci\xF3n autom\xE1tica ya est\xE1 activa o en proceso de configuraci\xF3n." }, 409);
  }
  const plan = await obtenerPlanPorCode(env, current.plan_code);
  if (!plan || !Number(plan?.price_ars)) {
    return json({ ok: false, message: "No encontramos el plan actual o su precio." }, 409);
  }
  const rawStartDate = current.current_period_ends_at || arAddDaysIso((/* @__PURE__ */ new Date()).toISOString(), 30);
  const startDate = arMercadoPagoDate(rawStartDate);
  const externalReference = `AUTORENEW:${userId}:${String(current.plan_code).trim().toUpperCase()}:${Date.now()}`;
  const backUrl = String(env.MERCADOPAGO_SUCCESS_URL || "https://apdocentepba-hub.github.io/apdocentepba-v2/").trim();
  const mp = await arMercadoPagoRequest(env, "/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `APDocentePBA \xB7 Renovaci\xF3n autom\xE1tica ${plan?.nombre || current.plan_code}`,
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
    message: `Se abri\xF3 Mercado Pago para activar la renovaci\xF3n autom\xE1tica. El pr\xF3ximo ciclo se intentar\xE1 cobrar desde el ${arFormatDate(startDate)} solo si complet\xE1s la configuraci\xF3n del d\xE9bito autom\xE1tico.`
  });
}
__name(handleSubscriptionEnableAutoRenew, "handleSubscriptionEnableAutoRenew");
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
    return json({ ok: false, message: "No ten\xE9s renovaci\xF3n autom\xE1tica activa para desactivar." }, 409);
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
    message: current?.current_period_ends_at ? `La renovaci\xF3n autom\xE1tica qued\xF3 desactivada. Conserv\xE1s el acceso hasta el ${arFormatDate(current.current_period_ends_at)} y despu\xE9s el plan vence sin cobrarte de nuevo.` : "La renovaci\xF3n autom\xE1tica qued\xF3 desactivada. No se har\xE1n nuevos cobros autom\xE1ticos."
  });
}
__name(handleSubscriptionCancelAutoRenew, "handleSubscriptionCancelAutoRenew");
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
__name2(handleMercadoPagoWebhook, "handleMercadoPagoWebhook");
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
__name2(syncMercadoPagoWebhook, "syncMercadoPagoWebhook");
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
__name2(fetchMercadoPagoPayment, "fetchMercadoPagoPayment");
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
__name2(applyMercadoPagoPayment, "applyMercadoPagoPayment");
async function findCheckoutSessionByExternalReference(env, externalReference) {
  const rows = await supabaseSelect(
    env,
    `mercadopago_checkout_sessions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,user_id,plan_code,status,provider_payload&order=created_at.desc&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}
__name(findCheckoutSessionByExternalReference, "findCheckoutSessionByExternalReference");
__name2(findCheckoutSessionByExternalReference, "findCheckoutSessionByExternalReference");
async function findSubscriptionByExternalReference(env, externalReference) {
  const rows = await supabaseSelect(
    env,
    `user_subscriptions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,status,external_reference&order=created_at.desc&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}
__name(findSubscriptionByExternalReference, "findSubscriptionByExternalReference");
__name2(findSubscriptionByExternalReference, "findSubscriptionByExternalReference");
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
__name2(parseMercadoPagoExternalReference, "parseMercadoPagoExternalReference");
function mapMercadoPagoSubscriptionStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  if (key === "APPROVED") return "ACTIVE";
  if (key === "AUTHORIZED") return "AUTHORIZED";
  if (key === "PENDING" || key === "IN_PROCESS" || key === "PENDING_CONTINGENCY") return "PENDING";
  if (key === "IN_MEDIATION") return "PAUSED";
  if (key === "REFUNDED" || key === "CHARGED_BACK" || key === "CANCELLED" || key === "REJECTED") return "CANCELLED";
  if (key === "EXPIRED") return "EXPIRED";
  return key || "PENDING";
}
__name(mapMercadoPagoSubscriptionStatus, "mapMercadoPagoSubscriptionStatus");
__name2(mapMercadoPagoSubscriptionStatus, "mapMercadoPagoSubscriptionStatus");
function mapMercadoPagoCheckoutStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  if (key === "APPROVED") return "approved";
  if (key === "AUTHORIZED") return "authorized";
  if (key === "PENDING" || key === "IN_PROCESS" || key === "PENDING_CONTINGENCY") return "pending";
  if (key === "REJECTED") return "rejected";
  if (key === "CANCELLED") return "cancelled";
  if (key === "EXPIRED") return "expired";
  if (key === "REFUNDED" || key === "CHARGED_BACK") return "refunded";
  return key.toLowerCase() || "pending";
}
__name(mapMercadoPagoCheckoutStatus, "mapMercadoPagoCheckoutStatus");
__name2(mapMercadoPagoCheckoutStatus, "mapMercadoPagoCheckoutStatus");
function addDaysIso(baseIso, days) {
  const baseDate = parseFechaFlexible(baseIso) || /* @__PURE__ */ new Date();
  const next = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1e3);
  return next.toISOString();
}
__name(addDaysIso, "addDaysIso");
__name2(addDaysIso, "addDaysIso");
function isPlanActivo(resolved) {
  const sub = resolved?.subscription || resolved || {};
  const planCode = canonicalPlanCode(
    resolved?.plan?.code || resolved?.plan?.plan_code || sub?.plan_code || ""
  );
  const status = String(sub?.status || "").trim().toUpperCase();
  if (!planCode) return false;
  if (["CANCELLED", "CANCELED", "REJECTED", "EXPIRED", "INACTIVE"].includes(status)) {
    return false;
  }
  if (planCode === "TRIAL_7D" || status === "TRIALING") {
    if (!sub?.trial_ends_at) return false;
    const end = parseFechaFlexible(sub.trial_ends_at)?.getTime();
    return Number.isFinite(end) && Date.now() <= end;
  }
  if (status === "BETA") {
    return true;
  }
  if (["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED"].includes(status)) {
    if (!sub?.current_period_ends_at) return false;
    const end = parseFechaFlexible(sub.current_period_ends_at)?.getTime();
    return Number.isFinite(end) && Date.now() <= end;
  }
  return false;
}
__name(isPlanActivo, "isPlanActivo");
__name2(isPlanActivo, "isPlanActivo");
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
__name2(handleWhatsAppHealth, "handleWhatsAppHealth");
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
__name2(handleWhatsAppTestSend, "handleWhatsAppTestSend");
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
__name2(createMercadoPagoCheckoutPreference, "createMercadoPagoCheckoutPreference");
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
__name2(normalizeWhatsappDestination, "normalizeWhatsappDestination");
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
__name2(whatsappTestDestinations, "whatsappTestDestinations");
function whatsappAllowedListVariant(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return `54${digits.slice(3)}`;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  return "";
}
__name(whatsappAllowedListVariant, "whatsappAllowedListVariant");
__name2(whatsappAllowedListVariant, "whatsappAllowedListVariant");
function isHelloWorldTemplate(templateName) {
  return String(templateName || "").trim().toLowerCase() === "hello_world";
}
__name(isHelloWorldTemplate, "isHelloWorldTemplate");
__name2(isHelloWorldTemplate, "isHelloWorldTemplate");
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
__name2(buildWhatsAppTemplatePayload, "buildWhatsAppTemplatePayload");
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
__name2(sendWhatsAppTemplate, "sendWhatsAppTemplate");
function isMetaAllowedListError(data) {
  const message = String(data?.error?.message || data?.message || "").toLowerCase();
  const code = Number(data?.error?.error_subcode || data?.error?.code || 0);
  return code === 131030 || message.includes("allowed list");
}
__name(isMetaAllowedListError, "isMetaAllowedListError");
__name2(isMetaAllowedListError, "isMetaAllowedListError");
async function getRecentSentEmailAlertKeysForUser(env, userId) {
  const limit = 200;
  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?user_id=eq.${encodeURIComponent(userId)}&channel=eq.email&select=payload,status,created_at,template_code&order=created_at.desc&limit=${limit}`
  ).catch(() => []);
  const keys = /* @__PURE__ */ new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (!status.startsWith("sent")) continue;
    const singleKey = String(row?.payload?.alert_key || "").trim();
    if (singleKey) keys.add(singleKey);
    const manyKeys = Array.isArray(row?.payload?.alert_keys) ? row.payload.alert_keys : [];
    for (const key of manyKeys) {
      const clean = String(key || "").trim();
      if (clean) keys.add(clean);
    }
  }
  return keys;
}
__name(getRecentSentEmailAlertKeysForUser, "getRecentSentEmailAlertKeysForUser");
__name2(getRecentSentEmailAlertKeysForUser, "getRecentSentEmailAlertKeysForUser");
async function loadPendingEmailAlertKeysForUser(env, userId) {
  const rows = await supabaseSelect(
    env,
    `pending_notifications?user_id=eq.${encodeURIComponent(userId)}&channel=eq.email&status=eq.pending&select=alert_key&order=created_at.desc&limit=200`
  ).catch(() => []);
  const keys = /* @__PURE__ */ new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.alert_key || "").trim();
    if (key) keys.add(key);
  }
  return keys;
}
__name(loadPendingEmailAlertKeysForUser, "loadPendingEmailAlertKeysForUser");
__name2(loadPendingEmailAlertKeysForUser, "loadPendingEmailAlertKeysForUser");
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
__name2(hasPendingEmailNotifications, "hasPendingEmailNotifications");
function buildEmailAlertKey(userId, alertItem) {
  const key = String(
    alertItem?.source_offer_key || alertItem?.iddetalle || alertItem?.idoferta || alertItem?.codigo || JSON.stringify(alertItem)
  ).trim();
  return key ? `${userId}:${key}` : "";
}
__name(buildEmailAlertKey, "buildEmailAlertKey");
async function enrichAlertForRichChannels(env, user, alertItem, resolvedPlan = null) {
  const resolved = resolvedPlan || await resolverPlanUsuario(env, user?.id || "").catch(() => null);
  const planCode = String(
    resolved?.plan?.code || resolved?.subscription?.plan_code || ""
  ).trim().toUpperCase();
  let enriched = normalizeOfferPayload(
    alertItem?.offer_payload || alertItem || {}
  );
  const ofertaId = String(enriched.idoferta || "").trim();
  const detalleId = String(enriched.iddetalle || "").trim();
  if (ofertaId || detalleId) {
    try {
      const resumen = await obtenerResumenPostulantesABC(ofertaId, detalleId);
      enriched.total_postulantes = resumen.total_postulantes ?? enriched.total_postulantes ?? null;
      enriched.puntaje_primero = resumen.puntaje_primero ?? enriched.puntaje_primero ?? null;
      enriched.listado_origen_primero = resumen.listado_origen_primero || enriched.listado_origen_primero || "";
    } catch (_) {
      enriched.total_postulantes = enriched.total_postulantes ?? null;
      enriched.puntaje_primero = enriched.puntaje_primero ?? null;
      enriched.listado_origen_primero = enriched.listado_origen_primero || "";
    }
  }
  if (planCode !== "INSIGNE") {
    enriched = stripPidFromPayload(enriched);
  }
  return enriched;
}
__name(enrichAlertForRichChannels, "enrichAlertForRichChannels");
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
__name(enrichAlertsForRichChannels, "enrichAlertsForRichChannels");
__name2(buildEmailAlertKey, "buildEmailAlertKey");
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
      provider_response: { message: "Usuario sin email v\xE1lido" }
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
      provider_response: { message: "Alerta encolada para env\xEDo consolidado" }
    }).catch(() => null);
    return { ok: true, queued: true, alert_key: alertKey };
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg.includes("23505") || msg.toLowerCase().includes("duplicate key") || msg.toLowerCase().includes("unique_alert_user") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
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
__name2(sendEmailAlertForUser, "sendEmailAlertForUser");
async function fetchPublishedOffersForEmailDistrict(distritoAPD, shared = {}) {
  const districtKey = norm(String(distritoAPD || ""));
  if (!districtKey) return [];
  if (!shared.districts) shared.districts = /* @__PURE__ */ new Map();
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
      const url = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${rowsPerPage}&start=${start}&wt=json&sort=ult_movimiento%20desc`;
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`APD publicada respondi\xF3 ${res.status}: ${errText}`);
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
__name(fetchPublishedOffersForEmailDistrict, "fetchPublishedOffersForEmailDistrict");
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
  const seenDocs = /* @__PURE__ */ new Set();
  for (const distrito of distritos) {
    const docs = await fetchPublishedOffersForEmailDistrict(distrito, shared);
    for (const doc of docs) {
      const key = buildSourceOfferKeyFromOferta2(doc) || buildSourceOfferKeyFromOferta(doc);
      if (!key || seenDocs.has(key)) continue;
      seenDocs.add(key);
      allDocs.push(doc);
    }
  }
  const pidData = await obtenerUltimaPidGuardada(userId).catch(() => null);
  const pidRows = normalizePidRows(pidData);
  const districtIndex = buildDistrictIndex(shared.catalogos);
  const pidMeta = pidData?.result ? {
    listado: pidData.result.listado || "",
    anio: pidData.result.anio || ""
  } : null;
  const resultados = [];
  const seenAlerts = /* @__PURE__ */ new Set();
  for (const oferta of allDocs) {
    const evaluacion = coincideOfertaConPreferenciasAPD(oferta, prefsCanon);
    if (!evaluacion?.match) continue;
    const pidEvalBase = evaluatePidCompatibility(
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
    item.estado = String(oferta.estado || item.estado || "").trim();
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
__name(refreshEmailUserOfferStateFromAbc, "refreshEmailUserOfferStateFromAbc");
async function markEmailAlertsAsEmailed(env, rows) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
__name(markEmailAlertsAsEmailed, "markEmailAlertsAsEmailed");
function buildEmailDigestDedupeKey({ source = "", slotKey = "", userId = "", visibleAlertKeys = [], idempotencyKey = "", now = Date.now() } = {}) {
  const sourceSafe = String(source || "").trim();
  const userSafe = String(userId || "").trim();
  const slotSafe = String(slotKey || "").trim();
  if (!userSafe) return "";
  if (slotSafe && !sourceSafe.startsWith("manual_")) {
    return ["email_digest", slotSafe, userSafe].join(":");
  }
  if (!sourceSafe.startsWith("manual_")) return "";
  const explicit = String(idempotencyKey || "").trim().slice(0, 200);
  if (explicit) return ["email_manual_digest", sourceSafe, userSafe, "request", explicit].join(":");
  const bucketMs = 5 * 60 * 1e3;
  const bucket = Math.floor(Number(now || Date.now()) / bucketMs);
  const fingerprint = [...new Set((Array.isArray(visibleAlertKeys) ? visibleAlertKeys : []).map((x) => String(x || "").trim()).filter(Boolean))].sort().join("|") || "no_alerts";
  return ["email_manual_digest", sourceSafe, userSafe, "5m", String(bucket), fingerprint].join(":");
}
__name(buildEmailDigestDedupeKey, "buildEmailDigestDedupeKey");
__name2(buildEmailDigestDedupeKey, "buildEmailDigestDedupeKey");
async function runEmailAlertsSweep(env, options = {}) {
  const source = String(options?.source || "").trim();
  const isManualRun = source.startsWith("manual_");
  const targetUserId = String(options?.target_user_id || "").trim();
  const slotKey = String(
    options?.slot_key || options?.slot_info?.slot_key || ""
  ).trim();
  const kv = getChannelStateStore(env);
  const DEFAULT_BATCH_SIZE = 2;
  const BATCH_USERS_PER_RUN = clampInt(
    options?.max_users || env.EMAIL_DIGEST_BATCH_USERS_PER_RUN || env.EMAIL_DIGEST_MAX_USERS_PER_RUN,
    1,
    200,
    DEFAULT_BATCH_SIZE
  );
  const MANUAL_SWEEP_LIMIT = clampInt(
    options?.manual_limit || env.EMAIL_MANUAL_SWEEP_LIMIT,
    1,
    50,
    5
  );
  const MAX_VISIBLE_ALERTS_IN_EMAIL = 5;
  const debugEnabled = options?.debug === true || !!String(options?.debug_user_id || "").trim();
  const debugUserId = String(
    options?.debug_user_id || targetUserId || ""
  ).trim();
  const dryRun = options?.dry_run === true;
  const useSlotCursor = !!slotKey && !!kv && !targetUserId && !isManualRun;
  const cursorKey = useSlotCursor ? `email:slot:${slotKey}:cursor_user_id` : "";
  const finishedKey = useSlotCursor ? `email:slot:${slotKey}:finished` : "";
  const cursorUserId = useSlotCursor ? String(await kv.get(cursorKey).catch(() => "") || "").trim() : "";
  if (useSlotCursor) {
    const alreadyFinished = await kv.get(finishedKey).catch(() => null);
    if (alreadyFinished) {
      return {
        ok: true,
        skipped: true,
        reason: "slot_already_finished",
        slot_key: slotKey,
        processed_users: 0,
        send_attempts: 0,
        sent_count: 0,
        notified_alerts_count: 0,
        skipped_count: 0,
        failed_count: 0,
        batch_size: BATCH_USERS_PER_RUN,
        cursor_user_id: cursorUserId || null,
        finished: true,
        debug_enabled: debugEnabled,
        debug_user_id: debugUserId || null,
        dry_run: dryRun,
        debug_users: []
      };
    }
  }
  let prefError = null;
  let prefSource = "user_preferences";
  let prefQuery = `user_preferences?alertas_activas=is.true&alertas_email=is.true&select=user_id&order=user_id.asc`;
  if (targetUserId) {
    prefQuery += `&user_id=eq.${encodeURIComponent(targetUserId)}&limit=1`;
  } else if (useSlotCursor) {
    if (cursorUserId) {
      prefQuery += `&user_id=gt.${encodeURIComponent(cursorUserId)}`;
    }
    prefQuery += `&limit=${encodeURIComponent(String(BATCH_USERS_PER_RUN))}`;
  } else {
    const manualLimit = isManualRun ? MANUAL_SWEEP_LIMIT : BATCH_USERS_PER_RUN;
    prefQuery += `&limit=${encodeURIComponent(String(manualLimit))}`;
  }
  let prefRows = await supabaseSelect(env, prefQuery).catch((err) => {
    prefError = String(err?.message || err || "");
    return [];
  });
  if ((!Array.isArray(prefRows) || prefRows.length === 0) && targetUserId) {
    prefRows = [{ user_id: targetUserId }];
    prefSource = "target_user_id_fallback";
  }
  const rowsToProcess = Array.isArray(prefRows) ? prefRows : [];
  if (!rowsToProcess.length) {
    if (useSlotCursor) {
      await kv.put(finishedKey, (/* @__PURE__ */ new Date()).toISOString(), {
        expirationTtl: 60 * 60 * 36
      }).catch(() => null);
    }
    return {
      ok: true,
      processed_users: 0,
      send_attempts: 0,
      sent_count: 0,
      notified_alerts_count: 0,
      skipped_count: 0,
      failed_count: 0,
      total_users: null,
      batch_size: BATCH_USERS_PER_RUN,
      limit_per_run: targetUserId ? 1 : isManualRun ? MANUAL_SWEEP_LIMIT : BATCH_USERS_PER_RUN,
      stopped_early: false,
      finished: useSlotCursor ? true : false,
      slot_key: slotKey || null,
      cursor_user_id: cursorUserId || null,
      failed_samples: [],
      message: targetUserId ? "No hay preferencias activas para ese usuario" : "No quedan usuarios pendientes para esta tanda",
      pref_source: prefSource,
      pref_error: prefError,
      debug_enabled: debugEnabled,
      debug_user_id: debugUserId || null,
      dry_run: dryRun,
      debug_users: targetUserId ? [
        {
          user_id: targetUserId,
          stage: "pref_lookup",
          skipped: true,
          reason: "user_not_in_email_pref_rows"
        }
      ] : []
    };
  }
  function emailAlertTime(item) {
    const p = item?.offer_payload || item || {};
    const raw = p?.raw || {};
    const candidates = [
      item?.last_seen_at,
      p?.last_seen_at,
      raw?.last_seen_at,
      p?.ult_movimiento,
      raw?.ult_movimiento,
      p?.created_at,
      raw?.created_at,
      p?.finoferta,
      raw?.finoferta,
      p?.fecha_cierre,
      raw?.fecha_cierre
    ];
    for (const value of candidates) {
      const s = String(value || "").trim();
      if (!s) continue;
      let d = null;
      try {
        d = typeof parseFechaFlexible === "function" ? parseFechaFlexible(s) : new Date(s);
      } catch {
        d = new Date(s);
      }
      const t = d instanceof Date ? d.getTime() : 0;
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  }
  __name(emailAlertTime, "emailAlertTime");
  async function loadStoredEmailAlerts(env2, userId, limit = 80) {
    const rows = await supabaseSelect(
      env2,
      `user_offer_state?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at&order=last_seen_at.desc&limit=${encodeURIComponent(String(limit))}`
    ).catch((err) => {
      console.error("EMAIL STORED ALERTS READ ERROR:", {
        user_id: userId,
        error: String(err?.message || err || "")
      });
      return [];
    });
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row?.id || null,
      offer_id: row?.offer_id || "",
      offer_payload: normalizeOfferPayload(row?.offer_payload || {}),
      last_seen_at: row?.last_seen_at || "",
      first_emailed_at: row?.first_emailed_at || null,
      last_emailed_at: row?.last_emailed_at || null
    })).filter((item) => {
      const p = item.offer_payload || {};
      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.codigo || p.cargo || p.materia || p.title);
    });
  }
  __name(loadStoredEmailAlerts, "loadStoredEmailAlerts");
  function emailCleanId(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    const m = s.match(/\d+/);
    return m ? m[0] : "";
  }
  __name(emailCleanId, "emailCleanId");
  function emailGetOfertaDetalle(payload) {
    const p = normalizeOfferPayload(payload || {});
    const raw = p?.raw || {};
    const oferta = emailCleanId(
      p.idoferta || raw.idoferta || raw.oferta || raw.id_oferta || ""
    );
    const detalle = emailCleanId(
      p.iddetalle || raw.iddetalle || raw.detalle || raw.id_detalle || p.offer_id || raw.offer_id || ""
    );
    return { oferta, detalle };
  }
  __name(emailGetOfertaDetalle, "emailGetOfertaDetalle");
  async function enrichEmailVisibleAlertsWithPostulantes(env2, alerts) {
    const source2 = Array.isArray(alerts) ? alerts : [];
    const enriched = await Promise.all(
      source2.map(async (item) => {
        const base = normalizeOfferPayload(item?.offer_payload || item || {});
        const ids = emailGetOfertaDetalle(base);
        if (!ids.oferta || !ids.detalle || typeof obtenerResumenPostulantesABC !== "function") {
          return {
            ...item,
            offer_payload: base,
            email_postulantes_enriched: false,
            email_postulantes_reason: "missing_ids_or_helper"
          };
        }
        try {
          const resumen = await Promise.race([
            obtenerResumenPostulantesABC(ids.oferta, ids.detalle),
            new Promise(
              (_, reject) => setTimeout(() => reject(new Error("timeout_postulantes_email")), 4500)
            )
          ]);
          return {
            ...item,
            offer_payload: normalizeOfferPayload({
              ...base,
              total_postulantes: resumen?.total_postulantes ?? base.total_postulantes ?? null,
              puntaje_primero: resumen?.puntaje_primero ?? base.puntaje_primero ?? null,
              listado_origen_primero: resumen?.listado_origen_primero || base.listado_origen_primero || ""
            }),
            email_postulantes_enriched: true
          };
        } catch (err) {
          console.error("EMAIL POSTULANTES ENRICH ERROR:", {
            oferta: ids.oferta || null,
            detalle: ids.detalle || null,
            error: String(err?.message || err || "")
          });
          return {
            ...item,
            offer_payload: base,
            email_postulantes_enriched: false,
            email_postulantes_reason: String(err?.message || err || "")
          };
        }
      })
    );
    return enriched;
  }
  __name(enrichEmailVisibleAlertsWithPostulantes, "enrichEmailVisibleAlertsWithPostulantes");
  const userIds = rowsToProcess.map((row) => String(row?.user_id || "").trim()).filter(Boolean);
  const usersMap = await loadUsersMapByIds(env, userIds).catch(() => /* @__PURE__ */ new Map());
  let processedUsers = 0;
  let attemptedDigests = 0;
  let sentDigests = 0;
  let notifiedAlertsCount = 0;
  let skippedAlerts = 0;
  let failedDigests = 0;
  const failed_samples = [];
  const skip_reason_counts = {};
  const skipped_user_samples = [];
  const debug_users = [];
  const pushDebug = /* @__PURE__ */ __name((entry = {}) => {
    const entryUserId = String(entry?.user_id || "").trim();
    const reason = String(entry?.reason || "").trim();
    if (entry?.skipped === true && reason) {
      skip_reason_counts[reason] = Number(skip_reason_counts[reason] || 0) + 1;
      if (skipped_user_samples.length < 10) {
        skipped_user_samples.push({
          user_id: entryUserId || null,
          stage: String(entry?.stage || "").trim() || null,
          reason,
          error: String(entry?.error || "").slice(0, 500) || null
        });
      }
    }
    if (!debugEnabled) return;
    if (debugUserId && entryUserId && entryUserId !== debugUserId) return;
    if (!debugUserId && debug_users.length >= 30) return;
    debug_users.push(entry);
  }, "pushDebug");
  let lastProcessedUserId = cursorUserId || "";
  const emailRefreshShared = { catalogos: null, districts: /* @__PURE__ */ new Map() };
  for (const row of rowsToProcess) {
    const userId = String(row?.user_id || "").trim();
    if (!userId) continue;
    lastProcessedUserId = userId;
    processedUsers += 1;
    const perUserSentKey = useSlotCursor && slotKey ? `email:slot:${slotKey}:user:${userId}:sent` : "";
    if (perUserSentKey) {
      const alreadySentForUser = await kv.get(perUserSentKey).catch(() => null);
      if (alreadySentForUser) {
        skippedAlerts += 1;
        pushDebug({
          user_id: userId,
          stage: "dedupe",
          skipped: true,
          reason: "already_sent_for_user_in_slot",
          slot_key: slotKey
        });
        continue;
      }
    }
    const user = usersMap.get(userId) || null;
    if (!user?.activo) {
      skippedAlerts += 1;
      pushDebug({
        user_id: userId,
        stage: "user_check",
        skipped: true,
        reason: "inactive_user",
        destination: user?.email || null
      });
      continue;
    }
    if (!String(user?.email || "").trim()) {
      skippedAlerts += 1;
      pushDebug({
        user_id: userId,
        stage: "user_check",
        skipped: true,
        reason: "missing_email",
        destination: null
      });
      continue;
    }
    const resolvedPlanForEmail = await resolverPlanUsuario(env, userId).catch(() => null);
    if (!resolvedPlanForEmail || !isPlanActivo(resolvedPlanForEmail)) {
      skippedAlerts += 1;
      pushDebug({
        user_id: userId,
        stage: "plan_check",
        skipped: true,
        reason: "plan_expired_or_inactive",
        destination: user.email,
        plan_code: getPlanCodeValue(resolvedPlanForEmail) || null
      });
      continue;
    }
    const emailPlanCode = getPlanCodeValue(resolvedPlanForEmail) || "TRIAL_7D";
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
    const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);
    if (!storedAlerts.length) {
      skippedAlerts += 1;
      pushDebug({
        user_id: userId,
        stage: "stored_alerts",
        skipped: true,
        reason: "no_stored_alerts",
        destination: user.email,
        total_alerts: 0
      });
      continue;
    }
    const sortedLatest = storedAlerts.slice().sort((a, b) => emailAlertTime(b) - emailAlertTime(a));
    const totalAlerts = sortedLatest.length;
    const visibleSource = sortedLatest.slice(0, MAX_VISIBLE_ALERTS_IN_EMAIL);
    const visibleAlerts = await enrichEmailVisibleAlertsWithPostulantes(
      env,
      visibleSource.map((item) => ({
        id: item?.id || null,
        offer_id: item?.offer_id || "",
        offer_payload: normalizeOfferPayload(item?.offer_payload || item || {}),
        last_seen_at: item?.last_seen_at || "",
        first_emailed_at: item?.first_emailed_at || null,
        last_emailed_at: item?.last_emailed_at || null
      }))
    );
    const visibleAlertsForRender = applyPidVisibilityToAlerts(
      visibleAlerts,
      emailPlanCode
    );
    const shownCount = visibleAlertsForRender.length;
    if (!shownCount) {
      skippedAlerts += 1;
      pushDebug({
        user_id: userId,
        stage: "stored_alerts",
        skipped: true,
        reason: "no_visible_alerts_after_normalize",
        destination: user.email,
        total_alerts: totalAlerts
      });
      continue;
    }
    const subjectSlotLabel = (() => {
      const rawSlot = String(slotKey || "").trim();
      const m = rawSlot.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{1,2})$/);
      if (m) {
        const [, yyyy, mm, dd, hh] = m;
        return `${dd}/${mm}/${yyyy} ${String(hh).padStart(2, "0")}:00`;
      }
      const parts = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(/* @__PURE__ */ new Date());
      const get = /* @__PURE__ */ __name((type) => parts.find((p) => p.type === type)?.value || "", "get");
      return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
    })();
    const subject = `Resumen APD \xB7 ${subjectSlotLabel} \xB7 ${shownCount} de ${totalAlerts}`;
    const visibleAlertKeys = visibleSource.map((item) => buildEmailAlertKey(userId, item?.offer_payload || item || {})).filter(Boolean);
    const visibleOfferIds = visibleSource.map((item) => {
      const p = normalizeOfferPayload(item?.offer_payload || item || {});
      return String(
        p.source_offer_key || p.iddetalle || p.idoferta || p.offer_id || item?.offer_id || ""
      ).trim();
    }).filter(Boolean);
    const sampleTitles = visibleAlertsForRender.map((item) => {
      const p = normalizeOfferPayload(item?.offer_payload || item || {});
      return String(
        p.cargo || p.materia || p.title || "Oferta APD"
      ).trim();
    }).filter(Boolean);
    const enrichedSamples = visibleAlertsForRender.map((item) => {
      const p = normalizeOfferPayload(item?.offer_payload || item || {});
      return {
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
        estado: p.estado || "",
        total_postulantes: p.total_postulantes,
        puntaje_primero: p.puntaje_primero,
        listado_origen_primero: p.listado_origen_primero || ""
      };
    });
    const digestDedupeKey = buildEmailDigestDedupeKey({
      source,
      slotKey,
      userId,
      visibleAlertKeys,
      idempotencyKey: String(options?.idempotency_key || "").trim()
    });
    const payload = {
      source: options.source || "cron",
      slot_key: slotKey || null,
      total_alerts: totalAlerts,
      shown_alerts: shownCount,
      visible_alert_keys: visibleAlertKeys,
      visible_offer_ids: visibleOfferIds,
      cycle_mode: "batched_cursor_user_offer_state",
      dedupe_key: digestDedupeKey || null,
      worker_version: typeof API_VERSION !== "undefined" ? API_VERSION : null,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    attemptedDigests += 1;
    if (dryRun) {
      pushDebug({
        user_id: userId,
        stage: "dry_run",
        destination: user.email,
        total_alerts: totalAlerts,
        shown_alerts: shownCount,
        subject,
        visible_alert_keys: visibleAlertKeys,
        visible_offer_ids: visibleOfferIds,
        sample_titles: sampleTitles,
        plan_code: emailPlanCode,
        pid_visible: emailCanShowPid,
        enriched_postulantes: true,
        enriched_samples: enrichedSamples,
        send_ok: null,
        send_status: null,
        dry_run: true,
        source: "user_offer_state",
        slot_key: slotKey || null,
        dedupe_key: digestDedupeKey || null
      });
      continue;
    }
    let reservation = null;
    if (digestDedupeKey) {
      reservation = await reserveEmailDigestDeliveryLog(env, {
        user,
        destination: user.email,
        payload,
        dedupeKey: digestDedupeKey
      });
      if (reservation?.duplicate) {
        skippedAlerts += 1;
        pushDebug({
          user_id: userId,
          stage: "dedupe_db",
          skipped: true,
          reason: "already_reserved_or_sent_for_user_in_slot",
          destination: user.email,
          slot_key: slotKey || null,
          dedupe_key: digestDedupeKey
        });
        continue;
      }
      if (!reservation?.ok) {
        failedDigests += 1;
        if (failed_samples.length < 10) {
          failed_samples.push({
            user_id: userId,
            destination: user.email || null,
            total_alerts: totalAlerts,
            shown_alerts: shownCount,
            reason: "digest_reservation_failed",
            dedupe_key: digestDedupeKey,
            provider_response: reservation || null
          });
        }
        pushDebug({
          user_id: userId,
          stage: "dedupe_db",
          skipped: true,
          reason: "reservation_failed",
          destination: user.email,
          slot_key: slotKey || null,
          dedupe_key: digestDedupeKey,
          error: reservation?.error || null
        });
        continue;
      }
    }
    const html = buildDigestHtml(visibleAlertsForRender, user, {
      total_alerts: totalAlerts,
      max_visible: MAX_VISIBLE_ALERTS_IN_EMAIL,
      panel_url: "https://alertasapd.com.ar"
    });
    let send = null;
    try {
      send = await enviarMailBrevo(
        user.email,
        user.nombre || "",
        subject,
        html,
        env
      );
    } catch (err) {
      send = {
        ok: false,
        status: 0,
        data: err?.message || String(err || "Error enviando mail por Brevo")
      };
    }
    if (reservation?.id) {
      await finishEmailDigestDeliveryLog(env, reservation, send).catch((err) => {
        pushDebug({
          user_id: userId,
          stage: "delivery_log_finish",
          skipped: false,
          reason: "finish_log_failed",
          destination: user.email,
          slot_key: slotKey || null,
          dedupe_key: digestDedupeKey,
          error: err?.message || String(err || "")
        });
      });
    } else {
      await supabaseInsert(env, "notification_delivery_logs", {
        user_id: user.id,
        channel: "email",
        template_code: "apd_email_alert_digest",
        destination: user.email,
        status: send?.ok ? "sent_alert_digest" : "failed_alert_digest",
        provider_message_id: extractBrevoMessageId(send),
        payload,
        provider_response: send || null
      }).catch(() => null);
    }
    pushDebug({
      user_id: userId,
      stage: "send_attempt",
      destination: user.email,
      total_alerts: totalAlerts,
      shown_alerts: shownCount,
      subject,
      visible_alert_keys: visibleAlertKeys,
      visible_offer_ids: visibleOfferIds,
      sample_titles: sampleTitles,
      plan_code: emailPlanCode,
      pid_visible: emailCanShowPid,
      enriched_postulantes: true,
      enriched_samples: enrichedSamples,
      send_ok: !!send?.ok,
      send_status: send?.status || null,
      send_data: typeof send?.data === "string" ? send.data.slice(0, 500) : send?.data || null,
      source: "user_offer_state",
      slot_key: slotKey || null,
      dedupe_key: digestDedupeKey || null,
      reservation_id: reservation?.id || null
    });
    if (send?.ok) {
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
      if (perUserSentKey) {
        await kv.put(perUserSentKey, (/* @__PURE__ */ new Date()).toISOString(), {
          expirationTtl: 60 * 60 * 36
        }).catch(() => null);
      }
    } else {
      failedDigests += 1;
      if (failed_samples.length < 10) {
        failed_samples.push({
          user_id: userId,
          destination: user.email || null,
          total_alerts: totalAlerts,
          shown_alerts: shownCount,
          reason: "digest_send_failed",
          provider_response: send || null
        });
      }
    }
  }
  let finished = false;
  if (useSlotCursor && !dryRun) {
    if (lastProcessedUserId) {
      await kv.put(cursorKey, lastProcessedUserId, {
        expirationTtl: 60 * 60 * 36
      }).catch(() => null);
    }
    if (rowsToProcess.length < BATCH_USERS_PER_RUN) {
      finished = true;
      await kv.put(finishedKey, (/* @__PURE__ */ new Date()).toISOString(), {
        expirationTtl: 60 * 60 * 36
      }).catch(() => null);
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
    total_users: null,
    batch_size: BATCH_USERS_PER_RUN,
    limit_per_run: targetUserId ? 1 : isManualRun ? MANUAL_SWEEP_LIMIT : BATCH_USERS_PER_RUN,
    stopped_early: rowsToProcess.length >= BATCH_USERS_PER_RUN,
    finished,
    slot_key: slotKey || null,
    cursor_user_id: lastProcessedUserId || null,
    failed_samples,
    skip_reason_counts,
    skipped_user_samples,
    pref_source: prefSource,
    pref_error: prefError,
    debug_enabled: debugEnabled,
    debug_user_id: debugUserId || null,
    dry_run: dryRun,
    debug_users
  };
}
__name(runEmailAlertsSweep, "runEmailAlertsSweep");
function getMostRecentArgentinaDigestSlotInfo(input = Date.now()) {
  const current = getArgentinaDigestSlotInfo(input);
  let year = Number(current.year || 0);
  let month = Number(current.month || 0);
  let day = Number(current.day || 0);
  const hour = Number(current.hour || 0);
  let slotHour = 22;
  if (hour >= 22) slotHour = 22;
  else if (hour >= 18) slotHour = 18;
  else if (hour >= 14) slotHour = 14;
  else {
    const previous = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0));
    year = previous.getUTCFullYear();
    month = previous.getUTCMonth() + 1;
    day = previous.getUTCDate();
    slotHour = 22;
  }
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return { year: yyyy, month: mm, day: dd, slot_hour: slotHour, slot_key: yyyy + "-" + mm + "-" + dd + "_" + String(slotHour).padStart(2, "0") };
}
function getArgentinaDigestSlotInfo(input = Date.now()) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const year = String(map.year || "");
  const month = String(map.month || "");
  const day = String(map.day || "");
  const hour = Number(map.hour || 0);
  const minute = Number(map.minute || 0);
  const slotHour = [14, 18, 22].includes(hour) ? hour : null;
  const slotKey = slotHour != null ? `${year}-${month}-${day}_${String(slotHour).padStart(2, "0")}` : "";
  return {
    year,
    month,
    day,
    hour,
    minute,
    slot_hour: slotHour,
    slot_key: slotKey,
    slot_date: `${year}-${month}-${day}`
  };
}
__name(getArgentinaDigestSlotInfo, "getArgentinaDigestSlotInfo");
__name2(getArgentinaDigestSlotInfo, "getArgentinaDigestSlotInfo");
function emailDigestCursorKey(slotKey) {
  return `email:digest:cursor:${String(slotKey || "").trim()}`;
}
__name(emailDigestCursorKey, "emailDigestCursorKey");
__name2(emailDigestCursorKey, "emailDigestCursorKey");
async function getEmailDigestCursor(env, slotKey) {
  const kv = getChannelStateStore(env);
  if (!kv || !slotKey) {
    return {
      slot_key: String(slotKey || "").trim(),
      offset: 0,
      finished: false
    };
  }
  const raw = await kv.get(emailDigestCursorKey(slotKey));
  if (!raw) {
    return {
      slot_key: String(slotKey || "").trim(),
      offset: 0,
      finished: false
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      slot_key: String(parsed?.slot_key || slotKey || "").trim(),
      offset: Number(parsed?.offset || 0),
      finished: !!parsed?.finished,
      updated_at: parsed?.updated_at || null
    };
  } catch {
    return {
      slot_key: String(slotKey || "").trim(),
      offset: 0,
      finished: false
    };
  }
}
__name(getEmailDigestCursor, "getEmailDigestCursor");
__name2(getEmailDigestCursor, "getEmailDigestCursor");
async function saveEmailDigestCursor(env, slotKey, patch = {}) {
  const kv = getChannelStateStore(env);
  if (!kv || !slotKey) return null;
  const current = await getEmailDigestCursor(env, slotKey);
  const next = {
    ...current,
    ...patch,
    slot_key: String(slotKey || "").trim(),
    offset: Number(patch?.offset ?? current?.offset ?? 0),
    finished: !!(patch?.finished ?? current?.finished),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await kv.put(
    emailDigestCursorKey(slotKey),
    JSON.stringify(next),
    { expirationTtl: 3 * 24 * 60 * 60 }
  );
  return next;
}
__name(saveEmailDigestCursor, "saveEmailDigestCursor");
__name2(saveEmailDigestCursor, "saveEmailDigestCursor");
async function loadUsersMapByIds(env, userIds) {
  const ids = unique(
    (Array.isArray(userIds) ? userIds : []).map((x) => String(x || "").trim()).filter(Boolean)
  );
  const out = /* @__PURE__ */ new Map();
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 40) {
    const slice = ids.slice(i, i + 40);
    const orFilter = slice.map((id) => `id.eq.${encodeURIComponent(id)}`).join(",");
    const rows = await supabaseSelect(
      env,
      `users?or=(${orFilter})&select=id,nombre,apellido,email,activo,celular,ultimo_login`
    ).catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row?.id || "").trim();
      if (id) out.set(id, row);
    }
  }
  return out;
}
__name(loadUsersMapByIds, "loadUsersMapByIds");
__name2(loadUsersMapByIds, "loadUsersMapByIds");
async function wasInitialDigestSentRecently(env, userId, nowInput, lookbackMinutes = 60) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const sinceIso = new Date(now.getTime() - lookbackMinutes * 60 * 1e3).toISOString();
  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?user_id=eq.${encodeURIComponent(userId)}&channel=eq.email&template_code=eq.apd_initial_digest&status=eq.sent_initial&created_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}
__name(wasInitialDigestSentRecently, "wasInitialDigestSentRecently");
__name2(wasInitialDigestSentRecently, "wasInitialDigestSentRecently");
async function runEmailAlertsQueueSweep(env, opts = {}) {
  const source = opts.source || "cron";
  const maxUsers = clampInt(
    opts.max_users || env.EMAIL_DIGEST_BUILD_MAX_USERS_PER_RUN,
    1,
    200,
    25
  );
  const maxAlertsPerUser = clampInt(opts.max_alerts_per_user, 1, 5, 5);
  const targetUserId = String(opts.target_user_id || "").trim();
  const nowInput = opts.now || Date.now();
  const slotInfo = opts.slot_info || getArgentinaDigestSlotInfo(nowInput);
  console.log("QUEUE SWEEP START", JSON.stringify({
    slot_key: slotInfo.slot_key || null,
    slot_hour: slotInfo.slot_hour,
    hour: slotInfo.hour,
    minute: slotInfo.minute
  }));
  if (!slotInfo.slot_hour || !slotInfo.slot_key) {
    console.log("QUEUE SWEEP SKIPPED: NOT DIGEST SLOT");
    return {
      ok: true,
      skipped: true,
      reason: "not_digest_slot",
      processed_users: 0,
      queued_digests: 0,
      skipped_users: 0,
      source
    };
  }
  let cursor = {
    slot_key: slotInfo.slot_key,
    offset: 0,
    finished: false
  };
  if (!targetUserId) {
    cursor = {
      slot_key: slotInfo.slot_key,
      offset: 0,
      finished: false
    };
  }
  let query = `user_preferences?alertas_activas=is.true&alertas_email=is.true&select=user_id&order=user_id.asc&limit=${maxUsers}`;
  if (targetUserId) {
    query += `&user_id=eq.${encodeURIComponent(targetUserId)}`;
  } else {
    query += `&offset=${Number(cursor.offset || 0)}`;
  }
  const prefRows = await supabaseSelect(env, query).catch((err) => {
    console.log("QUEUE PREFS ERROR:", err?.message || err);
    return [];
  });
  const rowsToProcess = Array.isArray(prefRows) ? prefRows : [];
  if (!rowsToProcess.length) {
    console.log("QUEUE SWEEP: NO USERS FOR CURRENT BATCH");
    return {
      ok: true,
      processed_users: 0,
      queued_digests: 0,
      skipped_users: 0,
      source,
      slot_key: slotInfo.slot_key
    };
  }
  const userIds = rowsToProcess.map((row) => String(row?.user_id || "").trim()).filter(Boolean);
  const usersMap = await loadUsersMapByIds(env, userIds);
  let processedUsers = 0;
  let queuedDigests = 0;
  let skippedUsers = 0;
  for (const row of rowsToProcess) {
    const userId = String(row?.user_id || "").trim();
    if (!userId) continue;
    processedUsers += 1;
    const user = usersMap.get(userId) || null;
    console.log("QUEUE DEBUG USER", JSON.stringify({
      user_id: userId,
      has_user: !!user?.id,
      activo: !!user?.activo,
      has_email: !!String(user?.email || "").trim()
    }));
    if (!user?.id || !user?.activo || !String(user?.email || "").trim()) {
      console.log("QUEUE SKIP: USER INVALID", JSON.stringify({
        user_id: userId,
        has_user: !!user?.id,
        activo: !!user?.activo,
        has_email: !!String(user?.email || "").trim()
      }));
      skippedUsers += 1;
      continue;
    }
    const initialRecentlySent = await wasInitialDigestSentRecently(
      env,
      userId,
      nowInput,
      60
    ).catch(() => false);
    console.log("QUEUE DEBUG INITIAL", JSON.stringify({
      user_id: userId,
      initial_recently_sent: !!initialRecentlySent
    }));
    if (initialRecentlySent) {
      console.log("QUEUE SKIP: INITIAL RECENTLY SENT", JSON.stringify({
        user_id: userId
      }));
      skippedUsers += 1;
      continue;
    }
    const alertData = await construirAlertasParaUsuario(env, userId).catch((err) => {
      console.log("QUEUE BUILD ERROR:", userId, err?.message || err);
      return { ok: false, message: err?.message || "build_failed" };
    });
    console.log("QUEUE DEBUG ALERT DATA", JSON.stringify({
      user_id: userId,
      ok: !!alertData?.ok,
      message: alertData?.message || null,
      total_fuente: Number(alertData?.total_fuente || 0),
      total_resultados: Array.isArray(alertData?.resultados) ? alertData.resultados.length : 0,
      descartadas_total: Number(alertData?.descartadas_total || 0),
      debug_distritos: Array.isArray(alertData?.debug_distritos) ? alertData.debug_distritos.slice(0, 5) : [],
      descartadas_preview: Array.isArray(alertData?.descartadas_preview) ? alertData.descartadas_preview.slice(0, 5).map((x) => ({
        iddetalle: x?.iddetalle || null,
        motivo: x?.motivo || null,
        motivo_match: x?.motivo_match || x?.motivo || null,
        distrito: x?.distrito || x?.descdistrito || null,
        cargo: x?.cargo || x?.descripcioncargo || null,
        nivel: x?.nivelmodalidad || x?.descnivelmodalidad || null,
        turno: x?.turno || null
      })) : []
    }));
    if (!alertData?.ok) {
      console.log("QUEUE SKIP: ALERT BUILD NOT OK", JSON.stringify({
        user_id: userId,
        message: alertData?.message || null
      }));
      skippedUsers += 1;
      continue;
    }
    const allItems = Array.isArray(alertData?.resultados) ? alertData.resultados : [];
    if (!allItems.length) {
      console.log("QUEUE SKIP: NO ALERTS FOR USER", JSON.stringify({
        user_id: userId
      }));
      skippedUsers += 1;
      continue;
    }
    const sortedLatest = allItems.slice().sort((a, b) => {
      const ta = parseFechaFlexible(
        a?.raw?.ult_movimiento || a?.ult_movimiento || a?.raw?.finoferta || a?.finoferta || ""
      )?.getTime() || 0;
      const tb = parseFechaFlexible(
        b?.raw?.ult_movimiento || b?.ult_movimiento || b?.raw?.finoferta || b?.finoferta || ""
      )?.getTime() || 0;
      return tb - ta;
    });
    const visibleAlerts = sortedLatest.slice(0, maxAlertsPerUser).map((item) => normalizeOfferPayload(item?.offer_payload || item || {}));
    console.log("QUEUE DEBUG VISIBLE", JSON.stringify({
      user_id: userId,
      total_alerts: sortedLatest.length,
      visible_alerts: visibleAlerts.length
    }));
    const totalAlerts = sortedLatest.length;
    if (!visibleAlerts.length) {
      console.log("QUEUE SKIP: NO VISIBLE ALERTS", JSON.stringify({
        user_id: userId,
        total_items: allItems.length
      }));
      skippedUsers += 1;
      continue;
    }
    const digestAlertKey = `DIGEST:${slotInfo.slot_key}`;
    const payload = {
      source,
      slot_key: slotInfo.slot_key,
      slot_date: slotInfo.slot_date,
      slot_hour: slotInfo.slot_hour,
      total_alerts: totalAlerts,
      shown_alerts: visibleAlerts.length,
      alerts: visibleAlerts,
      cycle_mode: "scheduled_digest"
    };
    try {
      await supabaseInsert(env, "pending_notifications", {
        user_id: user.id,
        channel: "email",
        kind: "apd_digest",
        alert_key: digestAlertKey,
        payload,
        status: "pending"
      });
      await supabaseInsert(env, "notification_delivery_logs", {
        user_id: user.id,
        channel: "email",
        template_code: "apd_email_digest_queue",
        destination: user.email,
        status: "queued_digest",
        provider_message_id: null,
        payload,
        provider_response: {
          message: `Digest encolado para slot ${slotInfo.slot_key}`
        }
      }).catch(() => null);
      queuedDigests += 1;
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("23505") || msg.toLowerCase().includes("duplicate key") || msg.toLowerCase().includes("unique_alert_user") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        skippedUsers += 1;
        continue;
      }
      console.log("QUEUE INSERT ERROR:", userId, digestAlertKey, msg);
      skippedUsers += 1;
    }
  }
  if (!targetUserId) {
  }
  console.log("QUEUE SWEEP END", JSON.stringify({
    processed_users: processedUsers,
    queued_digests: queuedDigests,
    skipped_users: skippedUsers,
    slot_key: slotInfo.slot_key
  }));
  return {
    ok: true,
    processed_users: processedUsers,
    queued_digests: queuedDigests,
    skipped_users: skippedUsers,
    source,
    slot_key: slotInfo.slot_key,
    slot_hour: slotInfo.slot_hour
  };
}
__name(runEmailAlertsQueueSweep, "runEmailAlertsQueueSweep");
__name2(runEmailAlertsQueueSweep, "runEmailAlertsQueueSweep");
__name2(runEmailAlertsSweep, "runEmailAlertsSweep");
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
__name2(parseWhatsAppBodyParameters, "parseWhatsAppBodyParameters");
async function runWhatsAppAlertsSweep(env, options = {}) {
  const source = options.source || "cron";
  const configured = !!env.WHATSAPP_PHONE_NUMBER_ID && !!env.WHATSAPP_ACCESS_TOKEN && !!env.WHATSAPP_TEMPLATE_ALERTA;
  if (!configured) {
    return { ok: true, skipped: true, reason: "not_configured", source };
  }
  const prefRows = await supabaseSelect(
    env,
    `user_preferences?alertas_activas=is.true&alertas_whatsapp=is.true&select=user_id&order=user_id.asc`
  ).catch(() => []);
  const total = Array.isArray(prefRows) ? prefRows.length : 0;
  if (!total) {
    return {
      ok: true,
      processed_users: 0,
      sent_count: 0,
      source,
      message: "Sin usuarios con WhatsApp activo"
    };
  }
  const MAX_USERS = clampInt(
    env.WHATSAPP_ALERT_SWEEP_MAX_USERS,
    1,
    100,
    WHATSAPP_ALERT_SWEEP_MAX_USERS
  );
  const rowsToProcess = options?.target_user_id ? prefRows.filter(
    (r) => String(r?.user_id || "").trim() === String(options.target_user_id).trim()
  ) : prefRows.slice(0, MAX_USERS);
  let processedUsers = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  for (const row of rowsToProcess) {
    const userId = String(row?.user_id || "").trim();
    if (!userId) continue;
    processedUsers += 1;
    try {
      const user = await obtenerUsuario(env, userId).catch(() => null);
      if (!user?.activo) {
        skippedCount++;
        continue;
      }
      if (!String(user?.celular || "").trim()) {
        skippedCount++;
        continue;
      }
      const alertData = await construirAlertasParaUsuario(env, userId).catch(() => null);
      if (!alertData?.ok) {
        skippedCount++;
        continue;
      }
      const items = Array.isArray(alertData?.resultados) ? alertData.resultados : Array.isArray(alertData?.alertas) ? alertData.alertas : [];
      if (!items.length) {
        skippedCount++;
        continue;
      }
      const alertsToSend = items.slice(0, WHATSAPP_ALERTS_PER_USER_MAX);
      for (const alertItem of alertsToSend) {
        try {
          await sendWhatsAppAlertForUser(env, user, alertItem, { source });
          sentCount++;
        } catch (err) {
          console.error("WA SEND ERROR user:", userId, err?.message);
          failedCount++;
        }
      }
    } catch (err) {
      console.error("WA SWEEP USER ERROR:", userId, err?.message);
      failedCount++;
    }
  }
  return {
    ok: true,
    source,
    processed_users: processedUsers,
    sent_count: sentCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    total_users: total
  };
}
__name(runWhatsAppAlertsSweep, "runWhatsAppAlertsSweep");
__name2(runWhatsAppAlertsSweep, "runWhatsAppAlertsSweep");
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
__name2(loadRecentSentWhatsAppAlertKeys, "loadRecentSentWhatsAppAlertKeys");
function buildWhatsAppAlertKey(userId, alertItem) {
  const sourceKey = String(
    alertItem?.source_offer_key || alertItem?.iddetalle || alertItem?.idoferta || ""
  ).trim();
  return sourceKey ? `${String(userId || "").trim()}:${sourceKey}` : "";
}
__name(buildWhatsAppAlertKey, "buildWhatsAppAlertKey");
__name2(buildWhatsAppAlertKey, "buildWhatsAppAlertKey");
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
__name2(buildWhatsAppAlertBodyParameters, "buildWhatsAppAlertBodyParameters");
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
__name2(sendWhatsAppAlertForUser, "sendWhatsAppAlertForUser");
async function handleImportarCatalogoCargos(url, env) {
  const totalPaginas = 232;
  const desde = clampInt(url.searchParams.get("desde"), 1, totalPaginas, 1);
  const hasta = clampInt(url.searchParams.get("hasta"), desde, totalPaginas, Math.min(desde + 9, totalPaginas));
  let totalInsertados = 0;
  const debug = [];
  for (let pagina = desde; pagina <= hasta; pagina += 1) {
    const ABC_CATALOGO_URLS = [
      `https://servicios.abc.gov.ar/servaddo/cargos.areas/?page=${pagina}`,
      `https://servicios3.abc.gob.ar/servaddo/cargos.areas/?page=${pagina}`
    ];
    let res = null;
    let lastFetchErr = null;
    for (const paginaUrl of ABC_CATALOGO_URLS) {
      try {
        res = await fetch(paginaUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          cf: { minTLSVersion: "1.0" }
        });
        if (res.ok) break;
      } catch (e) {
        lastFetchErr = e;
        res = null;
      }
    }
    if (!res || !res.ok) {
      const txt = res ? await res.text() : String(lastFetchErr?.message || "fetch failed");
      throw new Error(`ABC pagina ${pagina} respondio ${res?.status ?? "ERR"}: ${txt.slice(0, 300)}`);
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
__name2(handleImportarCatalogoCargos, "handleImportarCatalogoCargos");
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
__name2(runProvinciaBackfillStep, "runProvinciaBackfillStep");
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
__name2(fetchHistoricoRowsByDistritos, "fetchHistoricoRowsByDistritos");
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
__name2(buildHistoricoResumenPayload, "buildHistoricoResumenPayload");
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
__name2(emptyHistoricoPayload, "emptyHistoricoPayload");
async function fetchProvinciaCurrentRows(env, days) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
  const rows = await supabaseSelect(
    env,
    `apd_ofertas_global_current?last_seen_at=gte.${encodeURIComponent(sinceIso)}&select=source_offer_key,idoferta,iddetalle,estado,distrito,escuela,cargo,area,nivel_modalidad,turno,jornada,hsmodulos,cursodivision,supl_desde,supl_hasta,finoferta,ult_movimiento,first_seen_at,last_seen_at,last_state_change_at,times_seen,state_changes&order=last_seen_at.desc&limit=${PROVINCIA_SUMMARY_LIMIT}`
  ).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
__name(fetchProvinciaCurrentRows, "fetchProvinciaCurrentRows");
__name2(fetchProvinciaCurrentRows, "fetchProvinciaCurrentRows");
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
__name2(buildProvinciaResumenPayload, "buildProvinciaResumenPayload");
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
  __name2(pushCard, "pushCard");
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
__name2(buildProvincialInsightCards, "buildProvincialInsightCards");
function findSubjectLeader(rows, keywords) {
  const subset = rows.filter((row) => {
    const title = norm(`${row.cargo || ""} ${row.area || ""}`);
    return keywords.some((keyword) => title.includes(norm(keyword)));
  });
  return topCountItems(subset.map((row) => row.distrito), 1)[0] || null;
}
__name(findSubjectLeader, "findSubjectLeader");
__name2(findSubjectLeader, "findSubjectLeader");
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
__name2(buildProvinciaCoverageHint, "buildProvinciaCoverageHint");
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
__name2(obtenerScanState, "obtenerScanState");
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
__name2(saveScanState, "saveScanState");
function isStaleProvinciaBackfill(state) {
  if (String(state?.status || "").trim().toLowerCase() !== "running") return false;
  const ts = parseFechaFlexible(state?.updated_at || state?.last_run_at)?.getTime() || 0;
  if (!ts) return false;
  return Date.now() - ts > PROVINCIA_RUNNING_STALE_MS;
}
__name(isStaleProvinciaBackfill, "isStaleProvinciaBackfill");
__name2(isStaleProvinciaBackfill, "isStaleProvinciaBackfill");
async function obtenerDistritosProvincia(env) {
  const rows = await supabaseSelect(
    env,
    "catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc"
  );
  return Array.isArray(rows) ? rows : [];
}
__name(obtenerDistritosProvincia, "obtenerDistritosProvincia");
__name2(obtenerDistritosProvincia, "obtenerDistritosProvincia");
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
    const buffer = await res.arrayBuffer();
    const rawText = new TextDecoder("iso-8859-1").decode(buffer);
    const data = JSON.parse(rawText || "{}");
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
__name2(fetchAPDDistrictBatch, "fetchAPDDistrictBatch");
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
__name2(buildGlobalSnapshotRow, "buildGlobalSnapshotRow");
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
__name2(loadCurrentRowsMap, "loadCurrentRowsMap");
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
__name2(buildGlobalCurrentRow, "buildGlobalCurrentRow");
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
__name2(buildHistoricoCaptureRows, "buildHistoricoCaptureRows");
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
      resultados: []
    };
  }
  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const { ofertas, debugDistritos } = await traerOfertasAPDPorDistritos(prefsCanon);
  const pidData = await obtenerUltimaPidGuardada(userId).catch(() => null);
  const pidRows = normalizePidRows(pidData);
  const districtIndex = buildDistrictIndex(catalogos);
  const pidMeta = pidData?.result ? {
    listado: pidData.result.listado || "",
    anio: pidData.result.anio || ""
  } : null;
  const resultados = [];
  const descartadas = [];
  const vistos = /* @__PURE__ */ new Set();
  for (const oferta of ofertas) {
    if (!ofertaEsVisibleParaAlerta(oferta)) {
      descartadas.push({
        iddetalle: oferta.iddetalle || oferta.id || null,
        motivo: "oferta_no_usable"
      });
      continue;
    }
    const estado = String(
      oferta?.estado || oferta?.estado_oferta || oferta?.estado_actual || ""
    ).trim().toUpperCase();
    if (!estadoOfertaEsPublicada(oferta)) {
      descartadas.push({
        iddetalle: oferta.iddetalle || oferta.id || null,
        motivo: "estado_no_publicada",
        estado
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
    const pidEvalBase = evaluatePidCompatibility(
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
    if (evaluacion.match) {
      resultados.push(item);
    } else {
      descartadas.push({
        ...item,
        motivo: "no_coincide_preferencias"
      });
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
    total_fuente: ofertas.length,
    total: resultados.length,
    descartadas_total: descartadas.length,
    descartadas_preview: descartadas.slice(0, 20),
    debug_distritos: debugDistritos,
    resultados
  };
}
__name(construirAlertasParaUsuario, "construirAlertasParaUsuario");
var PID_STORAGE_WEBAPP = "https://script.google.com/macros/s/AKfycbxN1cKD8SWvYpFe0xZ-NZuDe0362NVbaTZuCVRq1EgnsB2ykFZYQd3EZnQxGLFpogs2Yg/exec";
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
    throw new Error(`PID storage devolvi\xF3 JSON inv\xE1lido: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(parsed?.error || parsed?.message || `PID storage HTTP ${res.status}`);
  }
  return parsed;
}
__name(postPidStorageFromMainWorker, "postPidStorageFromMainWorker");
__name2(construirAlertasParaUsuario, "construirAlertasParaUsuario");
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
__name2(formatearDiasHorariosOferta, "formatearDiasHorariosOferta");
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
__name2(resolverTipoRevistaOferta, "resolverTipoRevistaOferta");
async function obtenerUltimaPidGuardada(userId) {
  const docenteId = String(userId || "").trim();
  if (!docenteId) return null;
  function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = JSON.parse(String(value || "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  __name(parseJsonArray, "parseJsonArray");
  function normalizePidStorageResponse(data) {
    if (!data || data.ok !== true) return null;
    if (data.found === false) return null;
    const consulta = data.consulta && typeof data.consulta === "object" ? data.consulta : data.pid && typeof data.pid === "object" ? data.pid : data.data && typeof data.data === "object" ? data.data : data;
    const resultSource = consulta.result && typeof consulta.result === "object" ? consulta.result : data.result && typeof data.result === "object" ? data.result : consulta;
    const tableRows = Array.isArray(resultSource.table_rows) ? resultSource.table_rows : Array.isArray(resultSource.section_rows) ? resultSource.section_rows : Array.isArray(resultSource.items) ? resultSource.items : Array.isArray(consulta.table_rows) ? consulta.table_rows : parseJsonArray(resultSource.table_rows_json || consulta.table_rows_json);
    const hasPidData = !!(resultSource.apellido_nombre || resultSource.oblea || consulta.apellido_nombre || consulta.oblea || consulta.dni || tableRows.length);
    if (!hasPidData) return null;
    return {
      ...data,
      ok: true,
      found: true,
      result: {
        apellido_nombre: String(resultSource.apellido_nombre || consulta.apellido_nombre || "").trim(),
        distrito_residencia: String(resultSource.distrito_residencia || consulta.distrito_residencia || "").trim(),
        distritos_solicitados: String(resultSource.distritos_solicitados || consulta.distritos_solicitados || "").trim(),
        oblea: String(resultSource.oblea || consulta.oblea || "").trim(),
        table_rows: tableRows,
        dni: String(resultSource.dni || consulta.dni || "").trim(),
        anio: String(resultSource.anio || consulta.anio || "").trim(),
        listado: String(resultSource.listado || consulta.listado || "").trim(),
        version_worker: String(resultSource.version_worker || consulta.version_worker || "").trim(),
        fetched_at: String(resultSource.fetched_at || consulta.fetched_at || "").trim()
      }
    };
  }
  __name(normalizePidStorageResponse, "normalizePidStorageResponse");
  const actions = [
    "obtener_ultima_pid_consulta",
    "leer_pid_consulta",
    "leer_pid_guardado",
    "pid_guardado",
    "get_pid_guardado",
    "buscar_pid_consulta",
    "buscar_pid"
  ];
  for (const action of actions) {
    const data = await postPidStorageFromMainWorker({
      action,
      docente_id: docenteId
    }).catch(() => null);
    const normalized = normalizePidStorageResponse(data);
    if (normalized) return normalized;
  }
  return null;
}
__name(obtenerUltimaPidGuardada, "obtenerUltimaPidGuardada");
function normalizePidAreaCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (/^\/?[A-Z0-9]{1,6}$/.test(raw)) {
    return raw;
  }
  const m = raw.match(/\((\/?[A-Z0-9]{1,6})\)/);
  return m ? m[1] : "";
}
__name(normalizePidAreaCode, "normalizePidAreaCode");
function normalizePidAreaLabel(value) {
  return norm(String(value || "").replace(/\(\s*\/?[A-Z0-9]{1,6}\s*\)/g, " "));
}
__name(normalizePidAreaLabel, "normalizePidAreaLabel");
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
__name(extractOfertaAreaIdentity, "extractOfertaAreaIdentity");
function categoriasPidBloque(value) {
  const t = norm(value);
  const out = /* @__PURE__ */ new Set();
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
__name(categoriasPidBloque, "categoriasPidBloque");
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
__name(categoriasOfertaParaPid, "categoriasOfertaParaPid");
function setsIntersect(a, b) {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}
__name(setsIntersect, "setsIntersect");
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
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    raw = raw.replace(",", ".");
  } else {
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
__name(parsePidPuntaje, "parsePidPuntaje");
function normalizePidRows(pidData) {
  const rows = Array.isArray(pidData?.result?.table_rows) ? pidData.result.table_rows : [];
  return rows.map((row) => ({
    bloque: String(row?.bloque || "").trim(),
    area: String(row?.area || "").trim(),
    area_code: normalizePidAreaCode(row?.area || ""),
    area_label: normalizePidAreaLabel(row?.area || ""),
    puntaje_total: String(row?.puntaje_total || "").trim(),
    puntaje_total_num: parsePidPuntaje(row?.puntaje_total || "")
  })).filter((row) => row.bloque && (row.area_code || row.area_label));
}
__name(normalizePidRows, "normalizePidRows");
function isPidAreaCompatible(ofertaIdentity, pidRow) {
  if (ofertaIdentity.code && pidRow.area_code) {
    return ofertaIdentity.code === pidRow.area_code;
  }
  if (ofertaIdentity.label && pidRow.area_label) {
    return ofertaIdentity.label === pidRow.area_label;
  }
  return false;
}
__name(isPidAreaCompatible, "isPidAreaCompatible");
function isPidBlockCompatibleWithOferta(oferta, pidRow) {
  const catsOferta = categoriasOfertaParaPid(oferta);
  const catsPid = categoriasPidBloque(pidRow?.bloque || "");
  if (!catsOferta.size || !catsPid.size) return false;
  return setsIntersect(catsOferta, catsPid);
}
__name(isPidBlockCompatibleWithOferta, "isPidBlockCompatibleWithOferta");
function normalizeDistrictText(value) {
  return norm(value || "").replace(/\(\d+\)/g, " ").replace(/[.,;:/_-]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizeDistrictText, "normalizeDistrictText");
function addDistrictVariant(set, value) {
  const v = normalizeDistrictText(value);
  if (v) set.add(v);
}
__name(addDistrictVariant, "addDistrictVariant");
function buildDistrictVariants(officialName) {
  const set = /* @__PURE__ */ new Set();
  const base = normalizeDistrictText(officialName);
  if (!base) return set;
  addDistrictVariant(set, base);
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
__name(buildDistrictVariants, "buildDistrictVariants");
function extractCatalogDistrictNames(catalogos) {
  const raw = catalogos?.distritos || catalogos?.catalogo_distritos || catalogos?.districts || [];
  return raw.map(
    (item) => String(
      item?.descdistrito || item?.nombre || item?.label || item?.name || item?.distrito || ""
    ).trim()
  ).filter(Boolean);
}
__name(extractCatalogDistrictNames, "extractCatalogDistrictNames");
function buildDistrictIndex(catalogos) {
  const names = extractCatalogDistrictNames(catalogos);
  const index = /* @__PURE__ */ new Map();
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
__name(buildDistrictIndex, "buildDistrictIndex");
function resolveDistrictAgainstCatalog(value, districtIndex) {
  const normalized = normalizeDistrictText(value);
  if (!normalized) return "";
  if (districtIndex?.has(normalized)) {
    return districtIndex.get(normalized);
  }
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
__name(resolveDistrictAgainstCatalog, "resolveDistrictAgainstCatalog");
function extractPidRequestedDistricts(pidData, districtIndex) {
  const raw = String(
    pidData?.result?.distritos_solicitados || pidData?.distritos_solicitados || ""
  ).trim();
  if (!raw) return [];
  return unique(
    raw.split(/[;,|]/).map((part) => resolveDistrictAgainstCatalog(part, districtIndex)).filter(Boolean)
  );
}
__name(extractPidRequestedDistricts, "extractPidRequestedDistricts");
function resolveOfertaDistrict(oferta, districtIndex) {
  return resolveDistrictAgainstCatalog(
    oferta?.descdistrito || oferta?.distrito || oferta?.raw?.descdistrito || oferta?.raw?.distrito || "",
    districtIndex
  );
}
__name(resolveOfertaDistrict, "resolveOfertaDistrict");
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
  function getResidenciaBonus(oferta2, pidData2, districtIndex2) {
    const ofertaDistrict = resolveOfertaDistrict(oferta2, districtIndex2);
    const residenciaDistrict = resolveDistrictAgainstCatalog(
      pidData2?.result?.distrito_residencia || pidData2?.distrito_residencia || "",
      districtIndex2
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
  __name(getResidenciaBonus, "getResidenciaBonus");
  const offerDistrict = resolveOfertaDistrict(oferta, districtIndex);
  const pidDistricts = extractPidRequestedDistricts(pidData, districtIndex);
  if (offerDistrict && pidDistricts.length && !pidDistricts.includes(offerDistrict)) {
    return {
      compatible: false,
      reason: `No est\xE1s inscripto en ${offerDistrict}`,
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
      reason: "La oferta no trae un \xEDtem comparable con PID",
      district_ok: true,
      area_ok: false,
      bloque_ok: false,
      match: null,
      pid_distritos: pidDistricts
    };
  }
  const sameAreaRows = pidRows.filter((row) => isPidAreaCompatible(ofertaIdentity, row));
  if (!sameAreaRows.length) {
    return {
      compatible: false,
      reason: "No ten\xE9s ese \xEDtem en tu PID",
      district_ok: true,
      area_ok: false,
      bloque_ok: false,
      match: null,
      pid_distritos: pidDistricts
    };
  }
  const sameBlockRows = sameAreaRows.filter((row) => isPidBlockCompatibleWithOferta(oferta, row));
  if (!sameBlockRows.length) {
    return {
      compatible: false,
      reason: "Ten\xE9s ese \xEDtem, pero en otra rama o nivel",
      district_ok: true,
      area_ok: true,
      bloque_ok: false,
      match: null,
      pid_distritos: pidDistricts
    };
  }
  const best = sameBlockRows.slice().sort((a, b) => (b.puntaje_total_num || -Infinity) - (a.puntaje_total_num || -Infinity))[0];
  const residencia = getResidenciaBonus(oferta, pidData, districtIndex);
  const puntajeBase = Number.isFinite(best?.puntaje_total_num) ? best.puntaje_total_num : null;
  const puntajeFinal = Number.isFinite(puntajeBase) ? puntajeBase + residencia.puntos : null;
  return {
    compatible: true,
    reason: residencia.aplica ? "Compatible con tu PID + bonus por distrito de residencia" : "Compatible con tu PID",
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
__name(evaluatePidCompatibility, "evaluatePidCompatibility");
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
__name2(buildAlertItem, "buildAlertItem");
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
  const buffer = await res.arrayBuffer();
  const rawText = new TextDecoder("iso-8859-1").decode(buffer);
  const data = JSON.parse(rawText || "{}");
  const total = Number(data?.response?.numFound || 0);
  const first = data?.response?.docs?.[0] || null;
  return {
    total_postulantes: total,
    puntaje_primero: first?.puntaje != null ? Number(first.puntaje) : null,
    listado_origen_primero: first?.listadoorigen || ""
  };
}
__name(obtenerResumenPostulantesABC, "obtenerResumenPostulantesABC");
__name2(obtenerResumenPostulantesABC, "obtenerResumenPostulantesABC");
function buildAbcPostulantesUrl(ofertaId, detalleId) {
  const params = new URLSearchParams();
  const ofertaSafe = sanitizeSolrNumber(ofertaId);
  const detalleSafe = sanitizeSolrNumber(detalleId);
  if (ofertaSafe) params.set("oferta", ofertaSafe);
  if (detalleSafe) params.set("detalle", detalleSafe);
  return `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?${params.toString()}`;
}
__name(buildAbcPostulantesUrl, "buildAbcPostulantesUrl");
__name2(buildAbcPostulantesUrl, "buildAbcPostulantesUrl");
async function obtenerPlanPorCode(env, planCode) {
  const candidates = uniqueUpper([planCode, canonicalPlanCode(planCode)]);
  for (const code of candidates) {
    const rows = await supabaseSelect(
      env,
      `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags&limit=1`
    ).catch(() => []);
    if (rows?.[0]) {
      return applyFounderPricing(rows[0]);
    }
  }
  const fallback = defaultPlansCatalog().find(
    (plan) => canonicalPlanCode(plan.code) === canonicalPlanCode(planCode)
  ) || null;
  return fallback ? applyFounderPricing(fallback) : null;
}
__name(obtenerPlanPorCode, "obtenerPlanPorCode");
__name2(obtenerPlanPorCode, "obtenerPlanPorCode");
async function findUserByEmail(env, email) {
  const rows = await supabaseSelect(
    env,
    `users?email=ilike.${encodeURIComponent(email)}&select=id,nombre,apellido,email,password_hash,google_sub,activo&limit=1`
  );
  return rows?.[0] || null;
}
__name(findUserByEmail, "findUserByEmail");
__name2(findUserByEmail, "findUserByEmail");
async function findUserByGoogleSub(env, sub) {
  const rows = await supabaseSelect(
    env,
    `users?google_sub=eq.${encodeURIComponent(sub)}&select=id,nombre,apellido,email,password_hash,google_sub,activo&limit=1`
  );
  return rows?.[0] || null;
}
__name(findUserByGoogleSub, "findUserByGoogleSub");
__name2(findUserByGoogleSub, "findUserByGoogleSub");
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
__name2(createUserFromGoogle, "createUserFromGoogle");
async function obtenerUsuario(env, userId) {
  const rows = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo,celular,ultimo_login&limit=1`
  );
  return rows?.[0] || null;
}
__name(obtenerUsuario, "obtenerUsuario");
__name2(obtenerUsuario, "obtenerUsuario");
async function touchUltimoLogin(env, userId) {
  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(userId)}`, {
    ultimo_login: (/* @__PURE__ */ new Date()).toISOString()
  });
}
__name(touchUltimoLogin, "touchUltimoLogin");
__name2(touchUltimoLogin, "touchUltimoLogin");
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
__name2(verifyGoogleCredential, "verifyGoogleCredential");
function splitGoogleName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const nombre = parts.shift() || "Docente";
  const apellido = parts.join(" ") || "-";
  return { nombre, apellido };
}
__name(splitGoogleName, "splitGoogleName");
__name2(splitGoogleName, "splitGoogleName");
async function passwordMatches(storedPassword, plainPassword) {
  return (await accountVerifyPasswordV1(storedPassword, plainPassword)).ok;
}
__name(passwordMatches, "passwordMatches");
__name2(passwordMatches, "passwordMatches");
async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
__name2(sha256Hex, "sha256Hex");
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
__name2(supabaseSelect, "supabaseSelect");
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
__name2(supabaseInsertMany, "supabaseInsertMany");
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
__name2(supabaseUpsert, "supabaseUpsert");
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
__name2(supabaseUpsertReturning, "supabaseUpsertReturning");
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
__name2(supabasePatch, "supabasePatch");
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
__name(safeJson, "safeJson");
__name2(safeJson, "safeJson");
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
__name2(supabaseFetchWithRetry, "supabaseFetchWithRetry");
function shouldRetrySupabaseStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(Number(status));
}
__name(shouldRetrySupabaseStatus, "shouldRetrySupabaseStatus");
__name2(shouldRetrySupabaseStatus, "shouldRetrySupabaseStatus");
function shouldRetrySupabaseErrorMessage(message) {
  const text = String(message || "").toUpperCase();
  return text.includes("SUPABASE 429") || text.includes("SUPABASE 500") || text.includes("SUPABASE 502") || text.includes("SUPABASE 503") || text.includes("SUPABASE 504") || text.includes("BAD GATEWAY") || text.includes("TIMEOUT") || text.includes("ECONNRESET") || text.includes("FETCH") || text.includes("NETWORK");
}
__name(shouldRetrySupabaseErrorMessage, "shouldRetrySupabaseErrorMessage");
__name2(shouldRetrySupabaseErrorMessage, "shouldRetrySupabaseErrorMessage");
async function obtenerPreferenciasUsuario(env, userId) {
  const rows = await supabaseSelect(
    env,
    `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`
  ).catch(() => []);
  const row = rows?.[0];
  return row ? adaptarPreferenciasRow(row) : null;
}
__name(obtenerPreferenciasUsuario, "obtenerPreferenciasUsuario");
__name2(obtenerPreferenciasUsuario, "obtenerPreferenciasUsuario");
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
__name2(cargarCatalogos, "cargarCatalogos");
function canonicalPlanCode(code) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return "PLUS";
  if (key === "PRO") return "PREMIUM";
  return key;
}
__name(canonicalPlanCode, "canonicalPlanCode");
__name2(canonicalPlanCode, "canonicalPlanCode");
var FOUNDER_PRICE_POLICY = {
  active: true,
  label: "Precio fundador por tiempo limitado",
  original_prices_ars: {
    PLUS: 2990,
    PREMIUM: 4990,
    INSIGNE: 7990
  },
  promo_prices_ars: {
    PLUS: 1e3,
    PREMIUM: 2e3,
    INSIGNE: 3e3
  }
};
function getFounderPriceInfo(code, fallbackPrice = null) {
  const planCode = canonicalPlanCode(code);
  const promo = Number(FOUNDER_PRICE_POLICY.promo_prices_ars[planCode]);
  if (!FOUNDER_PRICE_POLICY.active || !Number.isFinite(promo) || promo <= 0) {
    return null;
  }
  const originalFromPolicy = Number(FOUNDER_PRICE_POLICY.original_prices_ars[planCode]);
  const originalFromPlan = Number(fallbackPrice);
  const original = Number.isFinite(originalFromPolicy) && originalFromPolicy > 0 ? originalFromPolicy : Number.isFinite(originalFromPlan) && originalFromPlan > promo ? originalFromPlan : promo;
  const discountPercent = original > promo ? Math.round((1 - promo / original) * 100) : 0;
  return {
    original_price_ars: original,
    price_ars: promo,
    discount_percent: discountPercent,
    pricing_label: FOUNDER_PRICE_POLICY.label
  };
}
__name(getFounderPriceInfo, "getFounderPriceInfo");
__name2(getFounderPriceInfo, "getFounderPriceInfo");
function applyFounderPricing(plan) {
  if (!plan || typeof plan !== "object") return plan;
  const planCode = canonicalPlanCode(plan.code || plan.plan_code || "");
  const info = getFounderPriceInfo(planCode, plan.price_ars);
  if (!info) return plan;
  return {
    ...plan,
    price_ars: info.price_ars,
    original_price_ars: info.original_price_ars,
    discount_percent: info.discount_percent,
    pricing_label: info.pricing_label,
    price_policy: {
      mode: "founder_price",
      active: true,
      original_price_ars: info.original_price_ars,
      promo_price_ars: info.price_ars,
      discount_percent: info.discount_percent,
      label: info.pricing_label
    }
  };
}
__name(applyFounderPricing, "applyFounderPricing");
__name2(applyFounderPricing, "applyFounderPricing");
function getPlanPreset(code) {
  const key = canonicalPlanCode(code);
  const presets = {
    TRIAL_7D: {
      code: "TRIAL_7D",
      nombre: "Prueba gratis 7 d\xEDas",
      descripcion: "Prob\xE1 APDocentePBA durante 7 d\xEDas con 1 distrito, hasta 2 materias/cargos, email incluido y Telegram por consulta incluido.",
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
      descripcion: "M\xE1s alcance sin irte de presupuesto: 2 distritos, hasta 4 materias/cargos, email incluido y Telegram por consulta incluido.",
      price_ars: 1e3,
      original_price_ars: 2990,
      discount_percent: 67,
      pricing_label: "Precio fundador por tiempo limitado",
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
      price_ars: 2e3,
      original_price_ars: 4990,
      discount_percent: 60,
      pricing_label: "Precio fundador por tiempo limitado",
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
      descripcion: "Cobertura m\xE1xima: 3 distritos principales + 2 de emergencia/chusmeo, hasta 10 materias/cargos, email incluido, Telegram por consulta incluido, WhatsApp por consulta incluido y match PID autom\xE1tico.",
      price_ars: 3e3,
      original_price_ars: 7990,
      discount_percent: 62,
      pricing_label: "Precio fundador por tiempo limitado",
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
__name2(getPlanPreset, "getPlanPreset");
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
__name2(buildPlanDistrictSlots, "buildPlanDistrictSlots");
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
__name2(buildPlanCargoSlots, "buildPlanCargoSlots");
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
    subscription: normalizeSubscriptionOut({
      id: null,
      user_id: userId,
      plan_code: "TRIAL_7D",
      status: "available",
      source: "catalogo_default",
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      trial_ends_at: null,
      current_period_ends_at: null,
      mercadopago_preapproval_id: null
    })
  };
}
__name(resolverPlanUsuario, "resolverPlanUsuario");
__name2(resolverPlanUsuario, "resolverPlanUsuario");
function elegirSuscripcionVigente(rows) {
  const permitidos = /* @__PURE__ */ new Set(["ACTIVE", "TRIALING", "AUTHORIZED", "PENDING", "PAUSED", "BETA"]);
  const nowTs = Date.now();
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toUpperCase();
    const planCode = canonicalPlanCode(row?.plan_code || "");
    if (!permitidos.has(status)) continue;
    if (["CANCELLED", "CANCELED", "REJECTED", "EXPIRED", "INACTIVE"].includes(status)) {
      continue;
    }
    if (status === "BETA") {
      return row;
    }
    const trialEndsTs = parseFechaFlexible(row?.trial_ends_at)?.getTime();
    const currentEndsTs = parseFechaFlexible(row?.current_period_ends_at)?.getTime();
    if (planCode === "TRIAL_7D" || status === "TRIALING") {
      if (!Number.isFinite(trialEndsTs)) continue;
      if (trialEndsTs < nowTs) continue;
      return row;
    }
    if (!Number.isFinite(currentEndsTs)) continue;
    if (currentEndsTs < nowTs) continue;
    return row;
  }
  return null;
}
__name(elegirSuscripcionVigente, "elegirSuscripcionVigente");
__name2(elegirSuscripcionVigente, "elegirSuscripcionVigente");
async function cargarPlanesCatalogo(env) {
  try {
    const rows = await supabaseSelect(
      env,
      "subscription_plans?select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,is_active,public_visible,sort_order,mercadopago_plan_id,feature_flags"
    );
    if (Array.isArray(rows) && rows.length) {
      return rows.map((plan) => applyFounderPricing(plan));
    }
  } catch {
  }
  return defaultPlansCatalog().map((plan) => applyFounderPricing(plan));
}
__name(cargarPlanesCatalogo, "cargarPlanesCatalogo");
__name2(cargarPlanesCatalogo, "cargarPlanesCatalogo");
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
__name2(defaultPlansCatalog, "defaultPlansCatalog");
function planPorCode(code) {
  const key = canonicalPlanCode(code);
  return defaultPlansCatalog().find((plan) => canonicalPlanCode(plan.code) === key) || defaultPlansCatalog().find((plan) => plan.code === "PLUS") || defaultPlansCatalog()[0];
}
__name(planPorCode, "planPorCode");
__name2(planPorCode, "planPorCode");
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
__name2(normalizePlanOut, "normalizePlanOut");
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
__name2(buildPlanFeatures, "buildPlanFeatures");
function resolveSubscriptionEndDate(row) {
  const status = String(row?.status || "").trim().toUpperCase();
  const planCode = String(row?.plan_code || "").trim().toUpperCase();
  const trialEnds = row?.trial_ends_at || null;
  const currentEnds = row?.current_period_ends_at || null;
  if (planCode === "TRIAL_7D" || status === "TRIALING") {
    return {
      ends_at: trialEnds || currentEnds || null,
      ends_at_source: trialEnds ? "trial_ends_at" : currentEnds ? "current_period_ends_at" : null
    };
  }
  if (currentEnds) {
    return {
      ends_at: currentEnds,
      ends_at_source: "current_period_ends_at"
    };
  }
  if (trialEnds) {
    return {
      ends_at: trialEnds,
      ends_at_source: "trial_ends_at"
    };
  }
  return {
    ends_at: null,
    ends_at_source: null
  };
}
__name(resolveSubscriptionEndDate, "resolveSubscriptionEndDate");
__name2(resolveSubscriptionEndDate, "resolveSubscriptionEndDate");
function calculateSubscriptionDaysRemaining(row) {
  const resolved = resolveSubscriptionEndDate(row);
  if (!resolved.ends_at) {
    return {
      ...resolved,
      days_remaining: null,
      is_expired: false,
      ends_at_label: null
    };
  }
  const endTs = parseFechaFlexible(resolved.ends_at)?.getTime();
  if (!Number.isFinite(endTs)) {
    return {
      ...resolved,
      days_remaining: null,
      is_expired: false,
      ends_at_label: null
    };
  }
  const nowTs = Date.now();
  const diffMs = endTs - nowTs;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1e3 * 60 * 60 * 24)));
  let label = null;
  try {
    label = new Date(endTs).toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    label = new Date(endTs).toISOString().slice(0, 10);
  }
  return {
    ...resolved,
    days_remaining: daysRemaining,
    is_expired: diffMs < 0,
    ends_at_label: label
  };
}
__name(calculateSubscriptionDaysRemaining, "calculateSubscriptionDaysRemaining");
__name2(calculateSubscriptionDaysRemaining, "calculateSubscriptionDaysRemaining");
function normalizeSubscriptionOut(row) {
  const planCode = String(row?.plan_code || "PLUS").trim().toUpperCase();
  const status = String(row?.status || "active").trim().toLowerCase();
  const expiration = calculateSubscriptionDaysRemaining({
    ...row,
    plan_code: planCode,
    status
  });
  return {
    id: row?.id || null,
    user_id: row?.user_id || null,
    plan_code: planCode,
    status,
    source: row?.source || null,
    started_at: row?.started_at || null,
    trial_ends_at: row?.trial_ends_at || null,
    current_period_ends_at: row?.current_period_ends_at || null,
    mercadopago_preapproval_id: row?.mercadopago_preapproval_id || null,
    // Campos calculados para mostrar en el panel
    ends_at: expiration.ends_at,
    ends_at_source: expiration.ends_at_source,
    ends_at_label: expiration.ends_at_label,
    days_remaining: expiration.days_remaining,
    is_expired: expiration.is_expired
  };
}
__name(normalizeSubscriptionOut, "normalizeSubscriptionOut");
__name2(normalizeSubscriptionOut, "normalizeSubscriptionOut");
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
    (Array.isArray(raw?.turnos) ? raw.turnos : []).map(canonicalizarTurnoPreferencia).filter(Boolean)
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
    alertas_whatsapp: !!raw?.alertas_whatsapp && !!plan?.feature_flags?.whatsapp,
    _plan_ajuste: {
      distritos_recortados: distritosRecortados,
      cargos_recortados: cargosRecortados,
      max_distritos: maxDistritos,
      max_cargos: maxCargos
    }
  };
}
__name(sanitizarPreferenciasEntrada, "sanitizarPreferenciasEntrada");
__name2(sanitizarPreferenciasEntrada, "sanitizarPreferenciasEntrada");
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
__name2(canonicalizarNivelPreferencia, "canonicalizarNivelPreferencia");
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
__name2(canonicalizarTurnoPreferencia, "canonicalizarTurnoPreferencia");
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
__name2(uniqueUpper, "uniqueUpper");
function clampPlanLimit(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
__name(clampPlanLimit, "clampPlanLimit");
__name2(clampPlanLimit, "clampPlanLimit");
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
__name2(parsearCargosDesdeHTML, "parsearCargosDesdeHTML");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
__name2(sleep, "sleep");
function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
__name(clampInt, "clampInt");
__name2(clampInt, "clampInt");
function pickFirstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}
__name(pickFirstNonEmpty, "pickFirstNonEmpty");
function simplifyNorm(value) {
  return norm(value).replace(/\bDE\b/g, " ").replace(/\bDEL\b/g, " ").replace(/\bLA\b/g, " ").replace(/\bLAS\b/g, " ").replace(/\bLOS\b/g, " ").replace(/\bEL\b/g, " ").replace(/\bY\b/g, " ").replace(/\s+/g, " ").trim();
}
__name(simplifyNorm, "simplifyNorm");
function tokenBag(value) {
  const stop = /* @__PURE__ */ new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "EN", "A", "AL", "PARA", "POR", "CON"]);
  return [...new Set(
    norm(value).split(" ").map((x) => x.trim()).filter(Boolean).filter((x) => x.length > 1).filter((x) => !stop.has(x))
  )];
}
__name(tokenBag, "tokenBag");
function buildDistrictCatalogIndex(catalogos) {
  const rows = Array.isArray(catalogos?.distritos) ? catalogos.distritos : [];
  const byCode = /* @__PURE__ */ new Map();
  const byExact = /* @__PURE__ */ new Map();
  const items = [];
  for (const row of rows) {
    const item = {
      kind: "district",
      code: norm(row?.codigo || ""),
      canonical: norm(pickFirstNonEmpty(row?.apd_nombre, row?.nombre)),
      simple: simplifyNorm(pickFirstNonEmpty(row?.apd_nombre, row?.nombre)),
      human: norm(pickFirstNonEmpty(row?.nombre, row?.apd_nombre)),
      aliases: unique([
        norm(row?.nombre || ""),
        norm(row?.nombre_norm || ""),
        norm(row?.apd_nombre || ""),
        norm(row?.apd_nombre_norm || "")
      ].filter(Boolean))
    };
    items.push(item);
    if (item.code) byCode.set(item.code, item);
    if (item.canonical) byExact.set(item.canonical, item);
    for (const alias of item.aliases) {
      byExact.set(alias, item);
    }
  }
  return { items, byCode, byExact };
}
__name(buildDistrictCatalogIndex, "buildDistrictCatalogIndex");
function normalizeCode(value) {
  return norm(String(value || "")).replace(/[()\s]/g, "").replace(/^\//, "");
}
__name(normalizeCode, "normalizeCode");
function extractExplicitCodesFromPreference(value) {
  const s = String(value || "");
  const out = /* @__PURE__ */ new Set();
  for (const m of s.matchAll(/\(\s*\/?\s*([A-Z0-9.\-]{1,40})\s*\)|(?:^|\s)\/([A-Z0-9.\-]{1,40})(?:\s|$)/g)) {
    const c1 = normalizeCode(m[1] || "");
    const c2 = normalizeCode(m[2] || "");
    if (c1) out.add(c1);
    if (c2) out.add(c2);
  }
  return [...out];
}
__name(extractExplicitCodesFromPreference, "extractExplicitCodesFromPreference");
function buildCargoCatalogIndex(catalogos) {
  const rows = Array.isArray(catalogos?.cargos) ? catalogos.cargos : [];
  const byCanonical = /* @__PURE__ */ new Map();
  const bySimple = /* @__PURE__ */ new Map();
  const byAlias = /* @__PURE__ */ new Map();
  const byCode = /* @__PURE__ */ new Map();
  const items = [];
  for (const row of rows) {
    const canonical = norm(
      pickFirstNonEmpty(
        row?.apd_nombre,
        row?.nombre,
        row?.apd_nombre_norm,
        row?.nombre_norm,
        row?.canonical,
        ""
      )
    );
    if (!canonical) continue;
    const simple = simplifyNorm(canonical);
    const human = norm(
      pickFirstNonEmpty(
        row?.nombre,
        row?.apd_nombre,
        canonical
      )
    );
    const rawCode = pickFirstNonEmpty(
      row?.codigo,
      row?.code,
      ""
    );
    const code = normalizeCode(rawCode);
    const aliases = unique([
      canonical,
      human,
      norm(row?.nombre || ""),
      norm(row?.apd_nombre || ""),
      norm(row?.apd_nombre_norm || ""),
      norm(row?.nombre_norm || ""),
      code ? `/${code}` : "",
      code
    ].filter(Boolean));
    const item = {
      kind: "cargo",
      code: code || "",
      canonical,
      simple,
      human,
      aliases,
      tokens_required: tokenBag(canonical),
      tokens_blocked: []
    };
    items.push(item);
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
    byCanonical.get(canonical).push(item);
    if (simple) {
      if (!bySimple.has(simple)) bySimple.set(simple, []);
      bySimple.get(simple).push(item);
    }
    for (const alias of aliases) {
      const a = norm(alias);
      if (!a) continue;
      if (!byAlias.has(a)) byAlias.set(a, []);
      byAlias.get(a).push(item);
      const aCode = normalizeCode(a);
      if (aCode) {
        if (!byCode.has(aCode)) byCode.set(aCode, []);
        byCode.get(aCode).push(item);
      }
    }
    if (code) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(item);
    }
  }
  return { items, byCanonical, bySimple, byAlias, byCode };
}
__name(buildCargoCatalogIndex, "buildCargoCatalogIndex");
function buildCatalogContext(catalogos) {
  return {
    districtIndex: buildDistrictCatalogIndex(catalogos),
    cargoIndex: buildCargoCatalogIndex(catalogos)
  };
}
__name(buildCatalogContext, "buildCatalogContext");
function resolveDistrictValue(input, districtIndex) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const n = norm(raw);
  const s = simplifyNorm(raw);
  if (districtIndex?.byCode?.has(n)) return districtIndex.byCode.get(n);
  if (districtIndex?.byExact?.has(n)) return districtIndex.byExact.get(n);
  for (const item of districtIndex?.items || []) {
    if (item.simple && item.simple === s) return item;
  }
  return {
    kind: "district",
    code: "",
    canonical: n,
    simple: s,
    human: n,
    aliases: [n]
  };
}
__name(resolveDistrictValue, "resolveDistrictValue");
function resolveCargoValue(input, cargoIndex) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const n = norm(raw);
  const s = simplifyNorm(raw);
  const explicitCodes = extractExplicitCodesFromPreference(raw);
  for (const code of explicitCodes) {
    const byCodeMatches = cargoIndex?.byCode?.get(code) || [];
    if (byCodeMatches.length === 1) {
      return byCodeMatches[0];
    }
    if (byCodeMatches.length > 1) {
      return [...byCodeMatches].sort((a, b) => {
        const la = (a?.canonical || "").length;
        const lb = (b?.canonical || "").length;
        return la - lb;
      })[0];
    }
  }
  const exactAliasMatches = cargoIndex?.byAlias?.get(n) || [];
  if (exactAliasMatches.length === 1) return exactAliasMatches[0];
  if (exactAliasMatches.length > 1) {
    return [...exactAliasMatches].sort((a, b) => {
      const la = (a?.canonical || "").length;
      const lb = (b?.canonical || "").length;
      return la - lb;
    })[0];
  }
  const exactCanonicalMatches = cargoIndex?.byCanonical?.get(n) || [];
  if (exactCanonicalMatches.length === 1) return exactCanonicalMatches[0];
  if (exactCanonicalMatches.length > 1) return exactCanonicalMatches[0];
  const exactSimpleMatches = cargoIndex?.bySimple?.get(s) || [];
  if (exactSimpleMatches.length === 1) return exactSimpleMatches[0];
  if (exactSimpleMatches.length > 1) {
    return [...exactSimpleMatches].sort((a, b) => {
      const la = (a?.canonical || "").length;
      const lb = (b?.canonical || "").length;
      return la - lb;
    })[0];
  }
  const prefTokens = tokenBag(raw);
  let best = null;
  let bestScore = -1;
  for (const item of cargoIndex?.items || []) {
    const corpus = [item.canonical, ...item.aliases || []].join(" ");
    const corpusNorm = norm(corpus);
    const corpusSimple = simplifyNorm(corpus);
    const bag = new Set(tokenBag(corpus));
    let score = 0;
    if (item.canonical === n) score += 100;
    if (item.simple === s) score += 80;
    for (const alias of item.aliases || []) {
      const a = norm(alias);
      if (!a) continue;
      if (a === n) score += 90;
      else if (a.includes(n) || n.includes(a)) score += 25;
    }
    for (const tok of prefTokens) {
      if (bag.has(tok)) score += 8;
    }
    if (corpusNorm.includes(n)) score += 20;
    if (corpusSimple.includes(s)) score += 15;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  if (best && bestScore >= 20) {
    return best;
  }
  return {
    kind: "cargo",
    code: "",
    canonical: n,
    simple: s,
    human: n,
    aliases: [n],
    tokens_required: prefTokens,
    tokens_blocked: []
  };
}
__name(resolveCargoValue, "resolveCargoValue");
function buildApdLabelFromResolved(originalValue, resolvedItem) {
  const original = String(originalValue || "").trim();
  const explicitCodes = extractExplicitCodesFromPreference(original).map((c) => normalizeCode(c)).filter(Boolean);
  const explicitCode = explicitCodes[0] || "";
  const resolvedCode = normalizeCode(
    resolvedItem?.code || resolvedItem?.codigo || ""
  );
  const finalCode = explicitCode || resolvedCode;
  let human = String(
    resolvedItem?.human || resolvedItem?.canonical || original || ""
  ).trim();
  human = human.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (finalCode) {
    return `(${finalCode}) ${human}`.trim();
  }
  return human;
}
__name(buildApdLabelFromResolved, "buildApdLabelFromResolved");
__name2(buildApdLabelFromResolved, "buildApdLabelFromResolved");
function buildResolvedApdList(originalList, resolvedList) {
  const originals = Array.isArray(originalList) ? originalList : [];
  const resolved = Array.isArray(resolvedList) ? resolvedList : [];
  const out = [];
  for (let i = 0; i < resolved.length; i += 1) {
    out.push(buildApdLabelFromResolved(originals[i], resolved[i]));
  }
  return unique(out.filter(Boolean));
}
__name(buildResolvedApdList, "buildResolvedApdList");
__name2(buildResolvedApdList, "buildResolvedApdList");
function resolveOfferDistrict(oferta) {
  return normDistritoABC(
    oferta?.descdistrito || oferta?.distrito || oferta?.raw?.descdistrito || oferta?.raw?.distrito || ""
  );
}
__name(resolveOfferDistrict, "resolveOfferDistrict");
function buscarEnCatalogo(lista, valor) {
  const raw = String(valor || "").trim();
  if (!raw) return null;
  const n = norm(raw);
  const s = simplifyNorm(raw);
  for (const row of Array.isArray(lista) ? lista : []) {
    const code = norm(row?.codigo || "");
    const canonical = norm(pickFirstNonEmpty(row?.apd_nombre, row?.nombre));
    const aliases = unique([
      norm(row?.nombre || ""),
      norm(row?.nombre_norm || ""),
      norm(row?.apd_nombre || ""),
      norm(row?.apd_nombre_norm || "")
    ].filter(Boolean));
    if (code && code === n) return row;
    if (canonical && canonical === n) return row;
    if (aliases.includes(n)) return row;
    if (simplifyNorm(canonical) === s) return row;
    if (aliases.some((a) => simplifyNorm(a) === s)) return row;
  }
  return null;
}
__name(buscarEnCatalogo, "buscarEnCatalogo");
__name2(buscarEnCatalogo, "buscarEnCatalogo");
function canonizarListaDistritos(lista, catalogo) {
  const districtIndex = buildDistrictCatalogIndex({ distritos: catalogo || [] });
  const resolved = (lista || []).map((item) => resolveDistrictValue(item, districtIndex)).filter(Boolean);
  return {
    humanos: unique(resolved.map((x) => x.human).filter(Boolean)),
    apd: unique(resolved.map((x) => x.canonical).filter(Boolean)),
    resolved
  };
}
__name(canonizarListaDistritos, "canonizarListaDistritos");
__name2(canonizarListaDistritos, "canonizarListaDistritos");
function cargoTokensExpanded(value) {
  const stop = /* @__PURE__ */ new Set([
    "DE",
    "DEL",
    "LA",
    "LAS",
    "EL",
    "LOS",
    "Y",
    "EN",
    "A",
    "AL",
    "CON",
    "SIN",
    "POR",
    "PARA",
    "E",
    "CICLO",
    "SUPERIOR"
  ]);
  const tokens = /* @__PURE__ */ new Set();
  for (const variant of cargoVariants(value)) {
    const clean = norm(
      String(variant || "").replace(/[()]/g, " ").replace(/\//g, " ").replace(/-/g, " ")
    );
    for (const token of clean.split(" ")) {
      const t = norm(token).replace(/\s+/g, "");
      if (!t || t.length < 2 || stop.has(t)) continue;
      tokens.add(t);
    }
  }
  return [...tokens];
}
__name(cargoTokensExpanded, "cargoTokensExpanded");
function canonizarListaCargosOMaterias(lista, catalogo) {
  const cargoIndex = buildCargoCatalogIndex({ cargos: catalogo || [] });
  const resolved = (lista || []).map((item) => resolveCargoValue(item, cargoIndex)).filter(Boolean);
  return {
    humanos: unique(resolved.map((x) => x.human).filter(Boolean)),
    apd: unique(resolved.map((x) => x.canonical).filter(Boolean)),
    resolved
  };
}
__name(canonizarListaCargosOMaterias, "canonizarListaCargosOMaterias");
__name2(canonizarListaCargosOMaterias, "canonizarListaCargosOMaterias");
function canonizarPreferenciasConCatalogo(prefs, catalogos) {
  const ctx = buildCatalogContext(catalogos);
  const principalResolved = resolveDistrictValue(
    prefs?.distrito_principal || "",
    ctx.districtIndex
  );
  const otrosResolved = unique(
    (prefs?.otros_distritos || []).map((x) => resolveDistrictValue(x, ctx.districtIndex)).filter(Boolean).map((x) => x.canonical)
  ).map((x) => resolveDistrictValue(x, ctx.districtIndex));
  const cargosOriginales = Array.isArray(prefs?.cargos) ? prefs.cargos : [];
  const materiasOriginales = Array.isArray(prefs?.materias) ? prefs.materias : [];
  const cargosResolved = cargosOriginales.map((x) => resolveCargoValue(x, ctx.cargoIndex)).filter(Boolean);
  const materiasResolved = materiasOriginales.map((x) => resolveCargoValue(x, ctx.cargoIndex)).filter(Boolean);
  return {
    ...prefs,
    distrito_principal: principalResolved?.human || norm(prefs?.distrito_principal || ""),
    distrito_principal_apd: principalResolved?.canonical || norm(prefs?.distrito_principal || ""),
    distrito_principal_resolved: principalResolved || null,
    otros_distritos: unique(otrosResolved.map((x) => x.human).filter(Boolean)),
    otros_distritos_apd: unique(otrosResolved.map((x) => x.canonical).filter(Boolean)),
    otros_distritos_resolved: otrosResolved,
    cargos: unique(cargosResolved.map((x) => x.human).filter(Boolean)),
    cargos_apd: buildResolvedApdList(cargosOriginales, cargosResolved),
    cargos_resolved: cargosResolved,
    materias: unique(materiasResolved.map((x) => x.human).filter(Boolean)),
    materias_apd: buildResolvedApdList(materiasOriginales, materiasResolved),
    materias_resolved: materiasResolved
  };
}
__name(canonizarPreferenciasConCatalogo, "canonizarPreferenciasConCatalogo");
__name2(canonizarPreferenciasConCatalogo, "canonizarPreferenciasConCatalogo");
async function traerOfertasAPDPorDistritos(prefs) {
  const distritos = distritosPrefsAPD(prefs);
  const todas = [];
  const vistos = /* @__PURE__ */ new Set();
  const debugDistritos = [];
  for (const distritoAPD of distritos) {
    const info = await traerOfertasAPDDeUnDistrito(distritoAPD);
    debugDistritos.push({
      distrito_apd: distritoAPD,
      estrategia: "fetch_por_distrito_completo",
      query_usada: info.query,
      total_apd_bruto: info.totalBruto,
      total_apd_filtrado: info.totalFiltrado
    });
    for (const doc of info.docs || []) {
      const clave = buildSourceOfferKeyFromOferta(doc);
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      todas.push(doc);
    }
  }
  todas.sort((a, b) => {
    const ta = parseFechaFlexible(
      a?.ult_movimiento || a?.finoferta || a?.fecha_cierre || ""
    )?.getTime() || 0;
    const tb = parseFechaFlexible(
      b?.ult_movimiento || b?.finoferta || b?.fecha_cierre || ""
    )?.getTime() || 0;
    return tb - ta;
  });
  return {
    ofertas: todas,
    debugDistritos
  };
}
__name(traerOfertasAPDPorDistritos, "traerOfertasAPDPorDistritos");
__name2(traerOfertasAPDPorDistritos, "traerOfertasAPDPorDistritos");
function districtQueryVariants(distrito) {
  const base = normDistritoABC(distrito || "");
  if (!base) return [];
  const out = /* @__PURE__ */ new Set([base]);
  out.add(base.replace(/^PARTIDO DE /, "").trim());
  out.add(base.replace(/^GENERAL /, "GRAL ").trim());
  out.add(base.replace(/^GENERAL /, "G ").trim());
  out.add(base.replace(/^GRAL[.]? /, "GENERAL ").trim());
  if (base === "LOMAS DE ZAMORA") {
    out.add("L DE ZAMORA");
    out.add("LOMAS");
  }
  if (base === "GENERAL SAN MARTIN") {
    out.add("SAN MARTIN");
    out.add("G SAN MARTIN");
    out.add("GRAL SAN MARTIN");
    out.add("GRAL. SAN MARTIN");
  }
  if (base === "PARTIDO DE LA COSTA") {
    out.add("LA COSTA");
  }
  if (base === "GENERAL PUEYRREDON") {
    out.add("GRAL PUEYRREDON");
    out.add("GRAL. PUEYRREDON");
  }
  return [...out].map((v) => norm(v)).filter(Boolean);
}
__name(districtQueryVariants, "districtQueryVariants");
async function traerOfertasAPDDeUnDistrito(distrito) {
  const distritoNorm = normDistritoABC(distrito || "");
  const variantes = districtQueryVariants(distritoNorm);
  if (!distritoNorm || !variantes.length) {
    return {
      docs: [],
      query: "",
      totalBruto: 0,
      totalFiltrado: 0
    };
  }
  const q = variantes.map((v) => `descdistrito:"${escaparSolr(v)}"`).join(" OR ");
  const url = "https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
  const rowsPerPage = 200;
  const maxPages = 8;
  const docsRaw = [];
  for (let page = 0; page < maxPages; page++) {
    const start = page * rowsPerPage;
    const params = new URLSearchParams({
      q: `(${q})`,
      rows: String(rowsPerPage),
      start: String(start),
      wt: "json",
      sort: "ult_movimiento desc"
    });
    const res = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
      headers: {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "user-agent": "Mozilla/5.0",
        "referer": "http://servicios2.abc.gob.ar/",
        "origin": "http://servicios2.abc.gob.ar"
      }
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`ABC ERROR ${res.status}: ${txt}`);
    }
    const buffer = await res.arrayBuffer();
    const rawText = new TextDecoder("iso-8859-1").decode(buffer);
    const data = JSON.parse(rawText || "{}");
    const pageDocs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    docsRaw.push(...pageDocs);
    if (pageDocs.length < rowsPerPage) {
      break;
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const docs = docsRaw.filter((doc) => {
    const docDistrict = normDistritoABC(doc?.descdistrito || "");
    const districtOk = docDistrict === distritoNorm || variantes.includes(docDistrict);
    if (!districtOk) return false;
    const key = buildSourceOfferKeyFromOferta(doc);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    docs,
    query: `(${q})`,
    totalBruto: docsRaw.length,
    totalFiltrado: docs.length
  };
}
__name(traerOfertasAPDDeUnDistrito, "traerOfertasAPDDeUnDistrito");
__name2(traerOfertasAPDDeUnDistrito, "traerOfertasAPDDeUnDistrito");
async function debugBuscarCargoExactoEnABC(distritoAPD, textoCargoBusqueda) {
  const q = [
    `descdistrito:"${escaparSolr(distritoAPD)}"`,
    `(` + [
      `descripcioncargo:"${escaparSolr(textoCargoBusqueda)}"`,
      `descripcionarea:"${escaparSolr(textoCargoBusqueda)}"`,
      `cargo:"${escaparSolr(textoCargoBusqueda)}"`
    ].join(" OR ") + `)`
  ].join(" AND ");
  const consultaUrl = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=10&start=0&wt=json`;
  const res = await fetch(consultaUrl);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`APD respondio ${res.status}: ${txt}`);
  }
  const buffer = await res.arrayBuffer();
  const rawText = new TextDecoder("iso-8859-1").decode(buffer);
  const data = JSON.parse(rawText || "{}");
  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
  return {
    texto_buscado: textoCargoBusqueda,
    query: q,
    total: docs.length,
    ejemplos: docs.slice(0, 3).map((doc) => ({
      iddetalle: doc?.iddetalle ?? null,
      idoferta: doc?.idoferta ?? null,
      descdistrito: doc?.descdistrito ?? null,
      descripcioncargo: doc?.descripcioncargo ?? null,
      descripcionarea: doc?.descripcionarea ?? null,
      cargo: doc?.cargo ?? null,
      materia: doc?.materia ?? null,
      asignatura: doc?.asignatura ?? null,
      descnivelmodalidad: doc?.descnivelmodalidad ?? null
    }))
  };
}
__name(debugBuscarCargoExactoEnABC, "debugBuscarCargoExactoEnABC");
function normDistritoABC(value) {
  let v = norm(value || "");
  const aliases = {
    "L DE ZAMORA": "LOMAS DE ZAMORA",
    "LOMAS": "LOMAS DE ZAMORA",
    "G SAN MARTIN": "GENERAL SAN MARTIN",
    "SAN MARTIN": "GENERAL SAN MARTIN",
    "GRAL SAN MARTIN": "GENERAL SAN MARTIN",
    "GRAL. SAN MARTIN": "GENERAL SAN MARTIN",
    "PARTIDO DE LA COSTA": "PARTIDO DE LA COSTA",
    "LA COSTA": "PARTIDO DE LA COSTA",
    "GRAL PUEYRREDON": "GENERAL PUEYRREDON",
    "GRAL. PUEYRREDON": "GENERAL PUEYRREDON"
  };
  return aliases[v] || v;
}
__name(normDistritoABC, "normDistritoABC");
async function traerOfertasAPDDeUnDistritoYCargo(distritoAPD, cargoMateria) {
  const info = await traerOfertasAPDDeUnDistrito(distritoAPD);
  const cargoNorm = norm(cargoMateria);
  const docsFiltrados = (info.docs || []).filter((doc) => {
    const textoCargo = norm([
      doc?.descripcioncargo,
      doc?.cargo,
      doc?.descripcionarea,
      doc?.materia,
      doc?.asignatura,
      doc?.descripcionmateria
    ].filter(Boolean).join(" "));
    if (!textoCargo) return false;
    const variants = cargoVariants(cargoMateria);
    if (!variants.length) {
      return textoCargo.includes(cargoNorm) || cargoNorm.includes(textoCargo);
    }
    const offerTokens = new Set(
      textoCargo.split(" ").map((t) => norm(t)).filter(Boolean)
    );
    return variants.some((variant) => {
      if (!variant) return false;
      if (textoCargo.includes(variant) || variant.includes(textoCargo)) {
        return true;
      }
      const prefTokens = cargoTokensExpanded(variant);
      if (!prefTokens.length) return false;
      let overlap = 0;
      for (const token of prefTokens) {
        if (offerTokens.has(token)) overlap++;
      }
      const coverage = overlap / Math.max(prefTokens.length, 1);
      return coverage >= 0.6 || overlap >= 2;
    });
  });
  return {
    docs: docsFiltrados,
    query: `FALLBACK_LOCAL distrito="${distritoAPD}" cargo="${cargoMateria}"`,
    totalBruto: info.totalBruto,
    totalFiltrado: docsFiltrados.length
  };
}
__name(traerOfertasAPDDeUnDistritoYCargo, "traerOfertasAPDDeUnDistritoYCargo");
__name2(traerOfertasAPDDeUnDistritoYCargo, "traerOfertasAPDDeUnDistritoYCargo");
function buildSourceOfferKeyFromOferta(oferta) {
  const detalle = sanitizeSolrNumber(oferta?.iddetalle || oferta?.id || "");
  if (detalle) return `D_${detalle}`;
  const ofertaId = sanitizeSolrNumber(oferta?.idoferta || "");
  if (ofertaId) return `O_${ofertaId}`;
  return [norm(oferta?.descdistrito || ""), norm(oferta?.escuela || oferta?.nombreestablecimiento || ""), norm(oferta?.descripcioncargo || oferta?.cargo || ""), norm(oferta?.descripcionarea || ""), sanitizeKeyText(oferta?.finoferta || "")].filter(Boolean).join("_").slice(0, 220);
}
__name(buildSourceOfferKeyFromOferta, "buildSourceOfferKeyFromOferta");
__name2(buildSourceOfferKeyFromOferta, "buildSourceOfferKeyFromOferta");
function sanitizeKeyText(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(sanitizeKeyText, "sanitizeKeyText");
__name2(sanitizeKeyText, "sanitizeKeyText");
function escaparSolr(text) {
  return String(text || "").replace(/(["\\])/g, "\\$1");
}
__name(escaparSolr, "escaparSolr");
__name2(escaparSolr, "escaparSolr");
function ofertaEsVisibleParaAlerta(oferta) {
  const estado = norm(
    oferta?.estado || oferta?.estado_oferta || oferta?.estado_actual || ""
  );
  if (estado.includes("ANULADA")) return false;
  if (estado.includes("DESIGNADA")) return false;
  if (estado.includes("DESIERTA")) return false;
  if (estado.includes("CERRADA")) return false;
  if (estado.includes("FINALIZADA")) return false;
  if (estado.includes("NO VIGENTE")) return false;
  return true;
}
__name(ofertaEsVisibleParaAlerta, "ofertaEsVisibleParaAlerta");
__name2(ofertaEsVisibleParaAlerta, "ofertaEsVisibleParaAlerta");
function ofertaEsVisibleParaHistoricoUsuario(oferta) {
  const fin = parseFechaFlexible(oferta?.finoferta)?.getTime() || 0;
  const ahora = Date.now();
  if (fin && fin < ahora - 180 * 24 * 60 * 60 * 1e3) return false;
  return true;
}
__name(ofertaEsVisibleParaHistoricoUsuario, "ofertaEsVisibleParaHistoricoUsuario");
__name2(ofertaEsVisibleParaHistoricoUsuario, "ofertaEsVisibleParaHistoricoUsuario");
function norm(value) {
  return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s/().,-]/gu, " ").replace(/\s+/g, " ").trim();
}
__name(norm, "norm");
__name2(norm, "norm");
function arrNorm(value) {
  if (Array.isArray(value)) return value.map((item) => norm(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => norm(item)).filter(Boolean);
  return [];
}
__name(arrNorm, "arrNorm");
__name2(arrNorm, "arrNorm");
function unique(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}
__name(unique, "unique");
__name2(unique, "unique");
function adaptarPreferenciasRow(row) {
  return { user_id: row.user_id || "", distrito_principal: norm(row.distrito_principal || ""), otros_distritos: unique(arrNorm(row.otros_distritos)), cargos: unique(arrNorm(row.cargos)), materias: unique(arrNorm(row.materias)), niveles: unique(arrNorm(row.niveles)), turnos: unique(arrNorm(row.turnos)), alertas_activas: !!row.alertas_activas, alertas_email: !!row.alertas_email, alertas_telegram: !!row.alertas_telegram, alertas_whatsapp: !!row.alertas_whatsapp };
}
__name(adaptarPreferenciasRow, "adaptarPreferenciasRow");
__name2(adaptarPreferenciasRow, "adaptarPreferenciasRow");
function distritosPrefsAPD(prefs) {
  return unique([
    normDistritoABC(prefs?.distrito_principal_apd || prefs?.distrito_principal || ""),
    ...(Array.isArray(prefs?.otros_distritos_apd) ? prefs.otros_distritos_apd : []).map((x) => normDistritoABC(x))
  ].filter(Boolean));
}
__name(distritosPrefsAPD, "distritosPrefsAPD");
__name2(distritosPrefsAPD, "distritosPrefsAPD");
function extraerSiglasEntreParentesis(texto) {
  const raw = String(texto || "");
  if (!raw) return [];
  const matches = [...raw.matchAll(/\(([^)]+)\)/g)];
  if (!matches.length) return [];
  return unique(
    matches.map((m) => normalizeCode(m[1] || "")).map((s) => String(s || "").replace(/\s+/g, "").trim()).filter(Boolean)
  );
}
__name(extraerSiglasEntreParentesis, "extraerSiglasEntreParentesis");
__name2(extraerSiglasEntreParentesis, "extraerSiglasEntreParentesis");
function cargosMateriasPrefsAPD(prefs) {
  const items = [
    ...Array.isArray(prefs?.cargos_apd) ? prefs.cargos_apd : [],
    ...Array.isArray(prefs?.materias_apd) ? prefs.materias_apd : [],
    ...Array.isArray(prefs?.cargos) ? prefs.cargos : [],
    ...Array.isArray(prefs?.materias) ? prefs.materias : []
  ];
  const siglas = [];
  for (const item of items) {
    siglas.push(...extraerSiglasEntreParentesis(item));
  }
  return unique(siglas);
}
__name(cargosMateriasPrefsAPD, "cargosMateriasPrefsAPD");
__name2(cargosMateriasPrefsAPD, "cargosMateriasPrefsAPD");
function siglasOfertaCargoMateria(oferta) {
  const campos = [
    oferta?.descripcioncargo,
    oferta?.cargo,
    oferta?.descripcionarea,
    oferta?.materia,
    oferta?.asignatura,
    oferta?.descripcionmateria
  ];
  const siglas = [];
  for (const campo of campos) {
    siglas.push(...extraerSiglasEntreParentesis(campo));
  }
  return unique(siglas);
}
__name(siglasOfertaCargoMateria, "siglasOfertaCargoMateria");
__name2(siglasOfertaCargoMateria, "siglasOfertaCargoMateria");
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
__name2(turnosPrefs, "turnosPrefs");
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
__name2(categoriasNivel, "categoriasNivel");
function matchDistritos(oferta, prefs) {
  const prefsD = distritosPrefsAPD(prefs);
  if (!prefsD.length) {
    return { ok: true, motivo: "Sin filtro de distrito" };
  }
  const distritoOferta = resolveOfferDistrict(oferta);
  if (!distritoOferta) {
    return { ok: false, motivo: "La oferta no trae distrito" };
  }
  const ok = prefsD.includes(distritoOferta);
  return {
    ok,
    motivo: ok ? `Distrito compatible: ${distritoOferta}` : `Distrito no compatible: ${distritoOferta}`
  };
}
__name(matchDistritos, "matchDistritos");
__name2(matchDistritos, "matchDistritos");
function extraerSigla(texto) {
  const t = String(texto || "").toUpperCase();
  const m = t.match(/\(([^)]+)\)/);
  return m ? m[1].replace(/\s+/g, "") : "";
}
__name(extraerSigla, "extraerSigla");
function normalizarTextoSimple(texto) {
  return String(texto || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\([^)]*\)/g, " ").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizarTextoSimple, "normalizarTextoSimple");
function matchCargosMaterias(oferta, prefs) {
  const textoOferta = String(
    oferta?.descripcioncargo || oferta?.cargo || oferta?.descripcionarea || oferta?.materia || ""
  ).trim();
  const siglaOferta = extraerSigla(textoOferta);
  const listaPrefs = [
    ...Array.isArray(prefs?.cargos_apd) ? prefs.cargos_apd : [],
    ...Array.isArray(prefs?.materias_apd) ? prefs.materias_apd : [],
    ...Array.isArray(prefs?.cargos) ? prefs.cargos : [],
    ...Array.isArray(prefs?.materias) ? prefs.materias : []
  ].map((x) => String(x || "").trim()).filter(Boolean);
  if (!listaPrefs.length) {
    return { ok: true, motivo: "sin_filtro_cargo_materia" };
  }
  for (const pref of listaPrefs) {
    const siglaPref = extraerSigla(pref);
    if (siglaPref && siglaOferta && siglaPref === siglaOferta) {
      return {
        ok: true,
        motivo: "sigla_cargo_materia_ok",
        detalle: { siglaPref, siglaOferta }
      };
    }
  }
  const ofertaNorm = normalizarTextoSimple(textoOferta);
  for (const pref of listaPrefs) {
    const siglaPref = extraerSigla(pref);
    if (siglaPref) continue;
    const prefNorm = normalizarTextoSimple(pref);
    if (prefNorm && ofertaNorm === prefNorm) {
      return {
        ok: true,
        motivo: "texto_cargo_materia_exacto_ok",
        detalle: { prefNorm, ofertaNorm }
      };
    }
  }
  return {
    ok: false,
    motivo: "cargo_materia_no_coincide",
    detalle: {
      textoOferta,
      siglaOferta,
      prefs: listaPrefs
    }
  };
}
__name(matchCargosMaterias, "matchCargosMaterias");
__name2(matchCargosMaterias, "matchCargosMaterias");
function matchTurno(oferta, prefs) {
  const prefsT = turnosPrefs(prefs);
  if (!prefsT.length) {
    return { ok: true, motivo: "Sin filtro de turno" };
  }
  const turnoOferta = mapTurnoAPD(
    oferta?.turno || oferta?.descturno || oferta?.raw?.turno || ""
  );
  if (!turnoOferta) {
    return { ok: false, motivo: "La oferta no trae turno" };
  }
  const ok = prefsT.includes(turnoOferta);
  return {
    ok,
    motivo: ok ? `Turno compatible: ${turnoOferta}` : `Turno no compatible: ${turnoOferta}`
  };
}
__name(matchTurno, "matchTurno");
__name2(matchTurno, "matchTurno");
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
__name2(matchNivelModalidad, "matchNivelModalidad");
function coincideOfertaConPreferencias(oferta, prefs) {
  const distrito = matchDistritos(oferta, prefs);
  if (!distrito.ok) {
    return { match: false, detalle: { distrito } };
  }
  const cargosMaterias = matchCargosMaterias(oferta, prefs);
  if (!cargosMaterias.ok) {
    return { match: false, detalle: { distrito, cargosMaterias } };
  }
  const nivelModalidad = matchNivelModalidad(oferta, prefs);
  if (!nivelModalidad.ok) {
    return { match: false, detalle: { distrito, cargosMaterias, nivelModalidad } };
  }
  const turno = matchTurno(oferta, prefs);
  if (!turno.ok) {
    return { match: false, detalle: { distrito, cargosMaterias, nivelModalidad, turno } };
  }
  return {
    match: true,
    detalle: { distrito, cargosMaterias, nivelModalidad, turno }
  };
}
__name(coincideOfertaConPreferencias, "coincideOfertaConPreferencias");
__name2(coincideOfertaConPreferencias, "coincideOfertaConPreferencias");
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
__name2(mapTurnoAPD, "mapTurnoAPD");
function coincideOfertaConPreferenciasAPD(oferta, prefs) {
  const distrito = matchDistritos(oferta, prefs);
  if (!distrito.ok) {
    return {
      match: false,
      motivo: distrito.motivo || "Distrito no coincide",
      detalle: { distrito }
    };
  }
  const cargoMateria = matchCargosMaterias(oferta, prefs);
  if (!cargoMateria.ok) {
    return {
      match: false,
      motivo: cargoMateria.motivo || "Cargo o materia no coincide",
      detalle: { distrito, cargoMateria }
    };
  }
  const nivelModalidad = matchNivelModalidad(oferta, prefs);
  if (!nivelModalidad.ok) {
    return {
      match: false,
      motivo: nivelModalidad.motivo || "Nivel o modalidad no coincide",
      detalle: { distrito, cargoMateria, nivelModalidad }
    };
  }
  const turno = matchTurno(oferta, prefs);
  if (!turno.ok) {
    return {
      match: false,
      motivo: turno.motivo || "Turno no coincide",
      detalle: { distrito, cargoMateria, nivelModalidad, turno }
    };
  }
  return {
    match: true,
    motivo: "Coincide con preferencias",
    detalle: { distrito, cargoMateria, nivelModalidad, turno }
  };
}
__name(coincideOfertaConPreferenciasAPD, "coincideOfertaConPreferenciasAPD");
__name2(coincideOfertaConPreferenciasAPD, "coincideOfertaConPreferenciasAPD");
function historicoRowToOferta(row) {
  return { descdistrito: row?.distrito || "", descripcioncargo: row?.cargo || "", descripcionarea: row?.area || "", turno: row?.turno || "", descnivelmodalidad: row?.nivel_modalidad || "" };
}
__name(historicoRowToOferta, "historicoRowToOferta");
__name2(historicoRowToOferta, "historicoRowToOferta");
function historicoRowKey(row) {
  const sourceKey = String(row?.source_offer_key || "").trim();
  if (sourceKey) return sourceKey;
  const detalle = String(row?.iddetalle || "").trim();
  if (detalle) return detalle;
  return [row?.idoferta || "", row?.distrito || "", row?.escuela || "", row?.cargo || "", row?.area || "", row?.finoferta || ""].map((value) => norm(value)).join("|");
}
__name(historicoRowKey, "historicoRowKey");
__name2(historicoRowKey, "historicoRowKey");
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
__name2(estadoHistoricoKey, "estadoHistoricoKey");
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
__name2(estadoHistoricoLabel, "estadoHistoricoLabel");
function ofertaHistoricaActiva(row) {
  const estadoKey = estadoHistoricoKey(row);
  const fin = parseFechaFlexible(row?.finoferta)?.getTime() || 0;
  const ahora = Date.now();
  if (estadoKey === "ANULADA" || estadoKey === "DESIGNADA" || estadoKey === "DESIERTA" || estadoKey === "CERRADA" || estadoKey === "FINALIZADA") return false;
  if (fin && fin < ahora - 48 * 60 * 60 * 1e3) return false;
  return true;
}
__name(ofertaHistoricaActiva, "ofertaHistoricaActiva");
__name2(ofertaHistoricaActiva, "ofertaHistoricaActiva");
function tituloHistoricoRow(row) {
  return unique([row?.cargo || "", row?.area || ""].filter(Boolean)).join(" \xB7 ") || "Oferta APD";
}
__name(tituloHistoricoRow, "tituloHistoricoRow");
__name2(tituloHistoricoRow, "tituloHistoricoRow");
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
__name2(topCountItems, "topCountItems");
function promedioNumerico(values, digits = 1) {
  const nums = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  const avg = nums.reduce((acc, n) => acc + n, 0) / nums.length;
  const factor = 10 ** digits;
  return Math.round(avg * factor) / factor;
}
__name(promedioNumerico, "promedioNumerico");
__name2(promedioNumerico, "promedioNumerico");
function sortHistoricoDesc(a, b) {
  const ta = parseFechaFlexible(a?.captured_at || a?.last_seen_at)?.getTime() || 0;
  const tb = parseFechaFlexible(b?.captured_at || b?.last_seen_at)?.getTime() || 0;
  return tb - ta;
}
__name(sortHistoricoDesc, "sortHistoricoDesc");
__name2(sortHistoricoDesc, "sortHistoricoDesc");
function estadoOfertaEsPublicada(oferta) {
  const estado = String(
    oferta?.estado || oferta?.estado_oferta || oferta?.estado_actual || ""
  ).trim().toUpperCase();
  return estado === "PUBLICADA";
}
__name(estadoOfertaEsPublicada, "estadoOfertaEsPublicada");
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
__name2(parseFechaFlexible, "parseFechaFlexible");
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
__name2(parsePartesFechaAbc, "parsePartesFechaAbc");
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
__name2(formatearFechaAbc, "formatearFechaAbc");
function normalizarCursoDivisionServidor(value) {
  let s = String(value || "").trim();
  if (!s) return "";
  s = s.replace(/Â°/g, "\xB0").replace(/º/g, "\xB0").replace(/\u015E/g, "\xB0").replace(/\uFFFD/g, "\xB0");
  s = s.replace(/(\d)\s*°\s*(\d)\s*°?/g, "$1\xB0$2\xB0");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
__name(normalizarCursoDivisionServidor, "normalizarCursoDivisionServidor");
__name2(normalizarCursoDivisionServidor, "normalizarCursoDivisionServidor");
function sanitizeSolrNumber(value) {
  return String(value || "").replace(/[^\d]/g, "");
}
__name(sanitizeSolrNumber, "sanitizeSolrNumber");
__name2(sanitizeSolrNumber, "sanitizeSolrNumber");
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders() });
}
__name(json, "json");
__name2(json, "json");
async function sendPendingEmailDigests(env, options = {}) {
  const users = await supabaseSelect(
    env,
    `users?select=id,nombre,apellido,email,activo&activo=eq.true&email=not.is.null`
  ).catch(() => []);
  let processedUsers = 0;
  let sentDigests = 0;
  let failedDigests = 0;
  for (const user of users) {
    if (!user?.id || !user?.email) continue;
    const resolved = await resolverPlanUsuario(env, user.id).catch(() => null);
    if (!resolved || !isPlanActivo(resolved)) continue;
    const prefsRows = await supabaseSelect(
      env,
      `user_preferences?user_id=eq.${encodeURIComponent(user.id)}&select=alertas_activas,alertas_email`
    ).catch(() => []);
    const prefs = Array.isArray(prefsRows) ? prefsRows[0] : null;
    if (!prefs?.alertas_activas || !prefs?.alertas_email) continue;
    const rows = await supabaseSelect(
      env,
      `user_offer_state?user_id=eq.${encodeURIComponent(user.id)}&is_active=eq.true&select=id,offer_id,offer_payload,first_emailed_at,last_emailed_at,last_seen_at`
    ).catch(() => []);
    if (!Array.isArray(rows) || !rows.length) continue;
    const nuevas = rows.filter((x) => x && x.is_active !== false).sort((a, b) => {
      const tb = parseFechaFlexible(b?.last_seen_at)?.getTime() || parseFechaFlexible(b?.updated_at)?.getTime() || parseFechaFlexible(b?.created_at)?.getTime() || 0;
      const ta = parseFechaFlexible(a?.last_seen_at)?.getTime() || parseFechaFlexible(a?.updated_at)?.getTime() || parseFechaFlexible(a?.created_at)?.getTime() || 0;
      return tb - ta;
    }).slice(0, 5);
    if (!nuevas.length) continue;
    processedUsers++;
    const alerts = await Promise.all(
      nuevas.map(async (row) => {
        const payload = row.offer_payload || {};
        const merged = { ...payload };
        const ofertaId = String(payload.idoferta || "").trim();
        const detalleId = String(payload.iddetalle || "").trim();
        if (ofertaId || detalleId) {
          try {
            const resumen = await obtenerResumenPostulantesABC(ofertaId, detalleId);
            merged.total_postulantes = resumen.total_postulantes ?? payload.total_postulantes ?? null;
            merged.puntaje_primero = resumen.puntaje_primero ?? payload.puntaje_primero ?? null;
            merged.listado_origen_primero = resumen.listado_origen_primero || payload.listado_origen_primero || "";
          } catch (_) {
            merged.total_postulantes = payload.total_postulantes ?? null;
            merged.puntaje_primero = payload.puntaje_primero ?? null;
            merged.listado_origen_primero = payload.listado_origen_primero || "";
          }
        }
        return {
          row_id: row.id,
          offer_payload: merged
        };
      })
    );
    const html = buildTop5NuevasHtml(alerts, user);
    const asunto = `APDocentePBA: ${alerts.length} nueva${alerts.length === 1 ? "" : "s"} oferta${alerts.length === 1 ? "" : "s"} para vos`;
    const send = await enviarMailBrevo(
      user.email,
      user.nombre || "",
      asunto,
      html,
      env
    );
    if (send?.ok) {
      sentDigests++;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      await Promise.all(
        nuevas.map((row) => {
          const patch = {
            last_emailed_at: nowIso
          };
          if (!row.first_emailed_at) {
            patch.first_emailed_at = nowIso;
          }
          return fetch(
            `${env.SUPABASE_URL}/rest/v1/user_offer_state?id=eq.${encodeURIComponent(row.id)}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                Prefer: "return=minimal"
              },
              body: JSON.stringify(patch)
            }
          ).catch(() => null);
        })
      );
    } else {
      failedDigests++;
    }
  }
  return {
    ok: true,
    processed_rows: processedUsers,
    sent_digests: sentDigests,
    failed_digests: failedDigests,
    source: options.source || "cron"
  };
}
__name(sendPendingEmailDigests, "sendPendingEmailDigests");
__name2(sendPendingEmailDigests, "sendPendingEmailDigests");
function buildDigestHtml(alerts, user, options = {}) {
  const panelUrl = String(options?.panel_url || "https://alertasapd.com.ar").trim();
  const normalizedAlerts = (Array.isArray(alerts) ? alerts : []).map((item) => ({
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
  const title = `Resumen APD compatible con tus preferencias`;
  const intro = String(options?.intro_text || "").trim() || `Hola ${escHtml(user?.nombre || "docente")}, encontramos coincidencias con las preferencias que cargaste en APDocentePBA. Te mostramos las m\xE1s recientes para que puedas revisarlas.`;
  const items = visibleAlerts.map(renderMailOfferCard).join("");
  const moreNote = remainingCount > 0 ? `
      <div style="margin-top:14px;padding:12px 14px;background:#fff8e8;border:1px solid #f2d38b;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#6b4e00;">
Hay m\xE1s coincidencias disponibles. Pod\xE9s ver el listado completo desde tu panel.      </div>
    ` : "";
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
Resumen personalizado                  </div>
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
                    ${items || `
                        <tr>
                          <td style="padding:16px;border:1px dashed #cbd5e1;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#475569;">
                            No hay alertas para mostrar en este env\xEDo.
                          </td>
                        </tr>
                      `}
                  </table>

                  ${moreNote}

                  <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
                    <a href="${panelUrl}" target="_blank" style="display:inline-block;background:#0f3460;color:#ffffff;padding:10px 14px;margin:5px;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">
                      Si quer\xE9s mirar todas las alertas, ingres\xE1 al panel
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
function buildTop5NuevasHtml(alerts, user) {
  return buildDigestHtml(alerts, user, {
    max_visible: 5,
    total_alerts: Array.isArray(alerts) ? alerts.length : 0,
    intro_text: `Hola ${escHtml(user?.nombre || "docente")}, estas son las ofertas m\xE1s recientes detectadas para vos.`
  });
}
__name(buildTop5NuevasHtml, "buildTop5NuevasHtml");
function mailInfoBox(label, value) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="
      width:100%;
      border:1px solid #d7dee9;
      border-radius:12px;
      background:#f8fafc;
    ">
      <tr>
        <td style="padding:10px 12px;">
          <div style="
            font-family:Arial,Helvetica,sans-serif;
            font-size:9px;
            line-height:1.2;
            font-weight:700;
            letter-spacing:.10em;
            text-transform:uppercase;
            color:#6b7280;
            margin-bottom:6px;
          ">${label}</div>
          <div style="
            font-family:Arial,Helvetica,sans-serif;
            font-size:13px;
            line-height:1.5;
            color:#111827;
            font-weight:600;
          ">${value}</div>
        </td>
      </tr>
    </table>
  `;
}
__name(mailInfoBox, "mailInfoBox");
function mailMiniBox(label, value) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="
      width:100%;
      border:1px solid #e5dcc2;
      border-radius:10px;
      background:#fffdf8;
    ">
      <tr>
        <td style="padding:9px 10px;">
          <div style="
            font-family:Arial,Helvetica,sans-serif;
            font-size:8px;
            line-height:1.2;
            font-weight:700;
            letter-spacing:.10em;
            text-transform:uppercase;
            color:#6b7280;
            margin-bottom:5px;
          ">${label}</div>
          <div style="
            font-family:Arial,Helvetica,sans-serif;
            font-size:12px;
            line-height:1.45;
            color:#111827;
            font-weight:600;
          ">${value}</div>
        </td>
      </tr>
    </table>
  `;
}
__name(mailMiniBox, "mailMiniBox");
var API_URL_PREFIX3 = "/api";
var LEGACY_GAS_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
var HOTFIX_VERSION = "2026-09-15-backfill-telemetry-2";
var ALERT_ROWS_PER_PAGE = 150;
var ALERT_MAX_PAGES = 6;
function corsHeaders2() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
__name(corsHeaders2, "corsHeaders2");
__name2(corsHeaders2, "corsHeaders");
function json2(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders2() });
}
__name(json2, "json2");
__name2(json2, "json");
function normalizeEmail2(v) {
  return String(v || "").trim().toLowerCase();
}
__name(normalizeEmail2, "normalizeEmail2");
__name2(normalizeEmail2, "normalizeEmail");
function normalizeText2(v) {
  return String(v || "").trim();
}
__name(normalizeText2, "normalizeText2");
__name2(normalizeText2, "normalizeText");
function norm2(v) {
  return String(v || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s/().,-]/gu, " ").replace(/\s+/g, " ").trim();
}
__name(norm2, "norm2");
__name2(norm2, "norm");
function unique2(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}
__name(unique2, "unique2");
__name2(unique2, "unique");
function sanitizeSolrNumber2(value) {
  return String(value || "").replace(/[^\d]/g, "");
}
__name(sanitizeSolrNumber2, "sanitizeSolrNumber2");
__name2(sanitizeSolrNumber2, "sanitizeSolrNumber");
function mapTurnoAPD2(turno) {
  const x = norm2(turno);
  if (x === "M" || x === "MANANA") return "MANANA";
  if (x === "T" || x === "TARDE") return "TARDE";
  if (x === "V" || x === "VESPERTINO") return "VESPERTINO";
  if (x === "N" || x === "NOCHE") return "NOCHE";
  if (x === "A" || x === "ALTERNADO") return "ALTERNADO";
  return x;
}
__name(mapTurnoAPD2, "mapTurnoAPD2");
__name2(mapTurnoAPD2, "mapTurnoAPD");
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
__name(canonicalizarNivelPreferencia2, "canonicalizarNivelPreferencia2");
__name2(canonicalizarNivelPreferencia2, "canonicalizarNivelPreferencia");
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
__name2(nivelOfertaKeys, "nivelOfertaKeys");
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
__name(parseFechaFlexible2, "parseFechaFlexible2");
__name2(parseFechaFlexible2, "parseFechaFlexible");
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
__name(parsePartesFechaAbc2, "parsePartesFechaAbc2");
__name2(parsePartesFechaAbc2, "parsePartesFechaAbc");
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
__name(formatearFechaAbc2, "formatearFechaAbc2");
__name2(formatearFechaAbc2, "formatearFechaAbc");
function buildSourceOfferKeyFromOferta2(oferta) {
  const detalle = sanitizeSolrNumber2(oferta?.iddetalle || oferta?.id || "");
  if (detalle) return `D_${detalle}`;
  const ofertaId = sanitizeSolrNumber2(oferta?.idoferta || "");
  if (ofertaId) return `O_${ofertaId}`;
  return [norm2(oferta?.descdistrito || ""), norm2(oferta?.escuela || oferta?.nombreestablecimiento || ""), norm2(oferta?.descripcioncargo || oferta?.cargo || ""), norm2(oferta?.descripcionarea || "")].filter(Boolean).join("_").slice(0, 220);
}
__name(buildSourceOfferKeyFromOferta2, "buildSourceOfferKeyFromOferta2");
__name2(buildSourceOfferKeyFromOferta2, "buildSourceOfferKeyFromOferta");
function buildAbcPostulantesUrl2(ofertaId, detalleId) {
  const params = new URLSearchParams();
  const ofertaSafe = sanitizeSolrNumber2(ofertaId);
  const detalleSafe = sanitizeSolrNumber2(detalleId);
  if (ofertaSafe) params.set("oferta", ofertaSafe);
  if (detalleSafe) params.set("detalle", detalleSafe);
  return `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?${params.toString()}`;
}
__name(buildAbcPostulantesUrl2, "buildAbcPostulantesUrl2");
__name2(buildAbcPostulantesUrl2, "buildAbcPostulantesUrl");
async function sha256Hex2(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex2, "sha256Hex2");
__name2(sha256Hex2, "sha256Hex");
async function passwordMatches2(storedPassword, plainPassword) {
  return (await accountVerifyPasswordV1(storedPassword, plainPassword)).ok;
}
__name(passwordMatches2, "passwordMatches2");
__name2(passwordMatches2, "passwordMatches");
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
__name2(supabaseRequest, "supabaseRequest");
async function supabaseSelect2(env, query) {
  return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}
__name(supabaseSelect2, "supabaseSelect2");
__name2(supabaseSelect2, "supabaseSelect");
async function supabaseInsertReturning2(env, table, data) {
  const rows = await supabaseRequest(env, table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
  return Array.isArray(rows) ? rows[0] : rows;
}
__name(supabaseInsertReturning2, "supabaseInsertReturning2");
__name2(supabaseInsertReturning2, "supabaseInsertReturning");
async function supabasePatch2(env, table, filter, data) {
  return await supabaseRequest(env, `${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
}
__name(supabasePatch2, "supabasePatch2");
__name2(supabasePatch2, "supabasePatch");
async function findUserByEmail2(env, email) {
  const rows = await supabaseSelect2(env, `users?email=ilike.${encodeURIComponent(email)}&select=id,nombre,apellido,email,celular,password_hash,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
__name(findUserByEmail2, "findUserByEmail2");
__name2(findUserByEmail2, "findUserByEmail");
async function getUserById(env, userId) {
  const rows = await supabaseSelect2(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,ultimo_login&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
__name(getUserById, "getUserById");
__name2(getUserById, "getUserById");
async function ensureTrialIfNoSubscriptions2(env, userId, email, source = "trial_auto_hotfix") {
  const existing = await supabaseSelect2(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`).catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) return { ok: true, created: false };
  await supabaseInsertReturning2(env, "user_subscriptions", { user_id: userId, plan_code: "TRIAL_7D", status: "ACTIVE", source, started_at: (/* @__PURE__ */ new Date()).toISOString(), trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString(), current_period_ends_at: null, mercadopago_preapproval_id: null, mercadopago_payer_email: email || null, external_reference: `${userId}:TRIAL_7D:${Date.now()}` }).catch(() => null);
  return { ok: true, created: true };
}
__name(ensureTrialIfNoSubscriptions2, "ensureTrialIfNoSubscriptions2");
__name2(ensureTrialIfNoSubscriptions2, "ensureTrialIfNoSubscriptions");
async function touchUltimoLogin2(env, userId) {
  await supabasePatch2(env, "users", `id=eq.${encodeURIComponent(userId)}`, { ultimo_login: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => null);
}
__name(touchUltimoLogin2, "touchUltimoLogin2");
__name2(touchUltimoLogin2, "touchUltimoLogin");
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
__name(verifyGoogleCredential2, "verifyGoogleCredential2");
__name2(verifyGoogleCredential2, "verifyGoogleCredential");
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
    if (!existing.password_hash && payload?.password) patch.password_hash = await accountHashPasswordV1(String(payload.password));
    if (Object.keys(patch).length) {
      const patched = await supabasePatch2(env, "users", `id=eq.${encodeURIComponent(existing.id)}`, patch).catch(() => null);
      return Array.isArray(patched) ? patched[0] || { ...existing, ...patch } : { ...existing, ...patch };
    }
    return existing;
  }
  return await supabaseInsertReturning2(env, "users", { nombre: normalizeText2(payload?.nombre || "Docente"), apellido: normalizeText2(payload?.apellido || "-") || "-", email, celular: normalizeText2(payload?.celular || ""), password_hash: payload?.password ? await accountHashPasswordV1(String(payload.password)) : null, activo: true });
}
__name(ensureLocalUser, "ensureLocalUser");
__name2(ensureLocalUser, "ensureLocalUser");
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
__name2(tryLegacyPasswordLogin, "tryLegacyPasswordLogin");
async function accountCreateSessionV1(env, userId, metodo = "password") {
  const token = accountRandomHexV1(32);
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
  await supabaseInsertReturning2(env, "sessions", {
    token,
    user_id: userId,
    metodo,
    created_at: createdAt,
    expires_at: expiresAt,
    activo: true
  });
  return { token, created_at: createdAt, expires_at: expiresAt };
}
__name(accountCreateSessionV1, "accountCreateSessionV1");
__name2(accountCreateSessionV1, "accountCreateSessionV1");
async function handleLoginHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail2(body?.email);
  const password = String(body?.password || "");
  if (!email || !password) return json2({ ok: false, message: "Faltan datos" }, 400);
  let user = await findUserByEmail2(env, email);
  if (user?.id && user.activo === false) return json2({ ok: false, message: "Usuario inactivo" }, 403);
  if (user?.id) {
    const verifiedPassword = await accountVerifyPasswordV1(user.password_hash, password);
    if (verifiedPassword.ok) {
      if (verifiedPassword.needsUpgrade) {
        await supabasePatch2(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { password_hash: await accountHashPasswordV1(password) }).catch(() => null);
      }
      await ensureTrialIfNoSubscriptions2(env, user.id, user.email, "trial_auto_login_hotfix");
      const session = await accountCreateSessionV1(env, user.id, "password");
      await touchUltimoLogin2(env, user.id);
      return json2({ ok: true, token: String(user.id), session_token: session.token, user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
    }
  }
  const legacy = await tryLegacyPasswordLogin(email, password);
  if (legacy.ok) {
    const legacyUser = legacy.data?.user || legacy.data?.data || {};
    user = await ensureLocalUser(env, { email, password, nombre: legacyUser?.nombre || legacyUser?.name || "", apellido: legacyUser?.apellido || legacyUser?.last_name || "", celular: legacyUser?.celular || legacyUser?.phone || "" });
    if (!user?.id) return json2({ ok: false, message: "No se pudo migrar la cuenta existente" }, 500);
    await supabasePatch(env, "users", `id=eq.${encodeURIComponent(user.id)}`, {
      password_hash: await accountHashPasswordV1(password),
      activo: true
    }).catch(() => null);
    await ensureTrialIfNoSubscriptions2(env, user.id, user.email, "trial_auto_login_legacy");
    const session = await accountCreateSessionV1(env, user.id, "password_legacy");
    await touchUltimoLogin2(env, user.id);
    return json2({ ok: true, migrated_legacy: true, token: String(user.id), session_token: session.token, user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
  }
  if (user?.id) return json2({ ok: false, message: "Password incorrecto" }, 401);
  return json2({ ok: false, message: "Usuario no encontrado o credenciales incorrectas" }, 401);
}
__name(handleLoginHotfix, "handleLoginHotfix");
__name2(handleLoginHotfix, "handleLoginHotfix");
async function handleGoogleAuthHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const credential = String(body?.credential || "").trim();
  if (!credential) return json2({ ok: false, message: "Falta credential de Google" }, 400);
  const googleUser = await verifyGoogleCredential2(credential, env.GOOGLE_CLIENT_ID);
  const user = await ensureLocalUser(env, googleUser);
  if (!user?.id) return json2({ ok: false, message: "No se pudo crear o vincular el usuario con Google" }, 500);
  await ensureTrialIfNoSubscriptions2(env, user.id, user.email, "trial_auto_google_hotfix");
  const session = await accountCreateSessionV1(env, user.id, "google");
  await touchUltimoLogin2(env, user.id);
  return json2({ ok: true, mode: "login", token: String(user.id), session_token: session.token, user: { id: user.id, nombre: user.nombre || googleUser.nombre || "", apellido: user.apellido || googleUser.apellido || "", email: user.email || googleUser.email || "" } });
}
__name(handleGoogleAuthHotfix, "handleGoogleAuthHotfix");
__name2(handleGoogleAuthHotfix, "handleGoogleAuthHotfix");
function adaptarPreferenciasRow2(row) {
  const arrNorm2 = /* @__PURE__ */ __name2((value) => {
    if (Array.isArray(value)) return value.map((item) => norm2(item)).filter(Boolean);
    if (typeof value === "string" && value.trim()) return value.split(",").map((item) => norm2(item)).filter(Boolean);
    return [];
  }, "arrNorm");
  return { user_id: row.user_id || "", distrito_principal: norm2(row.distrito_principal || ""), otros_distritos: unique2(arrNorm2(row.otros_distritos)), cargos: unique2(arrNorm2(row.cargos)), materias: unique2(arrNorm2(row.materias)), niveles: unique2(arrNorm2(row.niveles)), turnos: unique2(arrNorm2(row.turnos)), alertas_activas: !!row.alertas_activas, alertas_email: !!row.alertas_email, alertas_telegram: !!row.alertas_telegram, alertas_whatsapp: !!row.alertas_whatsapp };
}
__name(adaptarPreferenciasRow2, "adaptarPreferenciasRow2");
__name2(adaptarPreferenciasRow2, "adaptarPreferenciasRow");
async function getUserPrefs(env, userId) {
  const rows = await supabaseSelect2(env, `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`).catch(() => []);
  return rows?.[0] ? adaptarPreferenciasRow2(rows[0]) : null;
}
__name(getUserPrefs, "getUserPrefs");
__name2(getUserPrefs, "getUserPrefs");
async function getCatalogDistricts(env) {
  const rows = await supabaseSelect2(env, "catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
__name(getCatalogDistricts, "getCatalogDistricts");
__name2(getCatalogDistricts, "getCatalogDistricts");
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
__name2(resolveDistrictsForQuery, "resolveDistrictsForQuery");
function matchesTurno(oferta, prefs) {
  const turnos = unique2((prefs?.turnos || []).map((item) => mapTurnoAPD2(item)).filter(Boolean));
  if (!turnos.length) return true;
  return turnos.includes(mapTurnoAPD2(oferta?.turno || ""));
}
__name(matchesTurno, "matchesTurno");
__name2(matchesTurno, "matchesTurno");
function matchesNivel(oferta, prefs) {
  const niveles = unique2((prefs?.niveles || []).map(canonicalizarNivelPreferencia2).filter(Boolean));
  if (!niveles.length) return true;
  const ofertaKeys = nivelOfertaKeys(oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "");
  return niveles.some((item) => ofertaKeys.has(item));
}
__name(matchesNivel, "matchesNivel");
__name2(matchesNivel, "matchesNivel");
function ofertaVigente(oferta) {
  const estado = norm2(oferta?.estado || "");
  if (["ANULADA", "DESIGNADA", "DESIERTA", "CERRADA", "FINALIZADA", "NO VIGENTE"].includes(estado)) return false;
  const cierre = parseFechaFlexible2(oferta?.finoferta || oferta?.fecha_cierre || "");
  if (cierre && cierre.getTime() < Date.now()) return false;
  return true;
}
__name(ofertaVigente, "ofertaVigente");
__name2(ofertaVigente, "ofertaVigente");
function adaptOffer(oferta) {
  const cargo = oferta?.descripcioncargo || oferta?.cargo || "";
  const area = oferta?.descripcionarea || oferta?.area || oferta?.materia || "";
  const finoferta = oferta?.finoferta || "";
  return { source_offer_key: buildSourceOfferKeyFromOferta2(oferta), iddetalle: oferta?.iddetalle || oferta?.id || null, idoferta: oferta?.idoferta || null, distrito: norm2(oferta?.descdistrito || oferta?.distrito || ""), cargo, materia: area, area, turno: mapTurnoAPD2(oferta?.turno || ""), nivel_modalidad: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", nivel: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", modalidad: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", escuela: oferta?.escuela || oferta?.nombreestablecimiento || "", cursodivision: oferta?.cursodivision || oferta?.curso_division || "", curso_division: oferta?.cursodivision || oferta?.curso_division || "", jornada: oferta?.jornada || "", hsmodulos: oferta?.hsmodulos || oferta?.modulos || "", modulos: oferta?.hsmodulos || oferta?.modulos || "", supl_desde: oferta?.supl_desde || "", supl_hasta: oferta?.supl_hasta || "", desde: formatearFechaAbc2(oferta?.supl_desde || "", "date"), hasta: formatearFechaAbc2(oferta?.supl_hasta || "", "date"), revista: oferta?.revista || oferta?.supl_revista || "", situacion_revista: oferta?.revista || oferta?.supl_revista || "", revista_codigo: "", finoferta, finoferta_label: formatearFechaAbc2(finoferta, "datetime") || finoferta, fecha_cierre: formatearFechaAbc2(finoferta, "datetime") || finoferta, cierre: formatearFechaAbc2(finoferta, "datetime") || finoferta, dias_horarios: String(oferta?.dias_horarios || oferta?.diashorarios || oferta?.horario || "").trim(), horario: String(oferta?.dias_horarios || oferta?.diashorarios || oferta?.horario || "").trim(), observaciones: oferta?.observaciones || "", abc_postulantes_url: buildAbcPostulantesUrl2(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), abc_url: buildAbcPostulantesUrl2(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), link: buildAbcPostulantesUrl2(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), estado: oferta?.estado || "", raw: oferta };
}
__name(adaptOffer, "adaptOffer");
__name2(adaptOffer, "adaptOffer");
async function fetchOffersForDistrict(distritoAPD) {
  const docs = [];
  for (let i = 0; i < ALERT_MAX_PAGES; i += 1) {
    const start = i * ALERT_ROWS_PER_PAGE;
    const q = `descdistrito:"${String(distritoAPD || "").replace(/(["\\])/g, "\\$1")}"`;
    const url = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${ALERT_ROWS_PER_PAGE}&start=${start}&wt=json&sort=ult_movimiento%20desc`;
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`APD respondi\xF3 ${res.status}: ${errText}`);
    }
    const buffer = await res.arrayBuffer();
    const rawText = new TextDecoder("latin1").decode(buffer);
    const data = JSON.parse(rawText || "{}");
    const pageDocs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    if (!pageDocs.length) break;
    docs.push(...pageDocs.filter((doc) => norm2(doc?.descdistrito || "") === norm2(distritoAPD)));
    if (pageDocs.length < ALERT_ROWS_PER_PAGE) break;
  }
  return docs;
}
__name(fetchOffersForDistrict, "fetchOffersForDistrict");
__name2(fetchOffersForDistrict, "fetchOffersForDistrict");
async function buildAlertResultsFallback(env, userId) {
  const user = await getUserById(env, userId);
  if (!user) {
    return { ok: false, message: "Usuario no encontrado" };
  }
  const prefs = await getUserPrefs(env, userId);
  if (!prefs || !prefs.alertas_activas) {
    return {
      ok: true,
      user,
      total_fuente: 0,
      total: 0,
      descartadas_total: 0,
      descartadas_preview: [],
      debug_distritos: [],
      resultados: []
    };
  }
  const catalogos = await cargarCatalogos(env).catch(() => ({ distritos: [], cargos: [] }));
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const distritos = distritosPrefsAPD(prefsCanon);
  if (!distritos.length) {
    return {
      ok: true,
      user,
      preferencias_originales: prefs,
      preferencias_canonizadas: prefsCanon,
      total_fuente: 0,
      total: 0,
      descartadas_total: 0,
      descartadas_preview: [],
      debug_distritos: [],
      resultados: []
    };
  }
  const debug = [];
  const allDocs = [];
  const seenDocs = /* @__PURE__ */ new Set();
  for (const distrito of distritos) {
    const docs = await fetchOffersForDistrict(distrito).catch(() => []);
    debug.push({
      distrito_apd: distrito,
      query_usada: `descdistrito:"${distrito}"`,
      total_apd_bruto: docs.length,
      total_apd_filtrado: docs.length
    });
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
      descartadas.push({
        iddetalle: oferta?.iddetalle || oferta?.id || null,
        motivo: "oferta_no_vigente"
      });
      continue;
    }
    const evaluacion = coincideOfertaConPreferenciasAPD(oferta, prefsCanon);
    if (!evaluacion?.match) {
      descartadas.push({
        iddetalle: oferta?.iddetalle || oferta?.id || null,
        motivo: "no_coincide_preferencias",
        detalle: evaluacion?.detalle || {},
        motivo_match: evaluacion?.motivo || ""
      });
      continue;
    }
    const item = adaptOffer(oferta);
    item.detalle_match = evaluacion?.detalle || {};
    item.motivo_match = evaluacion?.motivo || "Coincide con preferencias";
    const key = `${item.source_offer_key}|${item.escuela}|${item.turno}`;
    if (seenAlerts.has(key)) continue;
    seenAlerts.add(key);
    resultados.push(item);
  }
  resultados.sort((a, b) => {
    const ta = parseFechaFlexible2(a?.finoferta)?.getTime() || 0;
    const tb = parseFechaFlexible2(b?.finoferta)?.getTime() || 0;
    return tb - ta;
  });
  return {
    ok: true,
    user,
    preferencias_originales: prefs,
    preferencias_canonizadas: prefsCanon,
    total_fuente: allDocs.length,
    total: resultados.length,
    descartadas_total: descartadas.length,
    descartadas_preview: descartadas.slice(0, 20),
    debug_distritos: debug,
    resultados
  };
}
__name(buildAlertResultsFallback, "buildAlertResultsFallback");
__name2(buildAlertResultsFallback, "buildAlertResultsFallback");
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
__name2(delegateJson, "delegateJson");
function getChannelStateStore(env) {
  return env.EMAIL_SWEEP_STATE || env.CHANNEL_STATE || null;
}
__name(getChannelStateStore, "getChannelStateStore");
__name2(getChannelStateStore, "getChannelStateStore");
function telegramStateKey(userId) {
  return `telegram:user:${String(userId || "").trim().toUpperCase()}`;
}
__name(telegramStateKey, "telegramStateKey");
__name2(telegramStateKey, "telegramStateKey");
function telegramChatStateKey(chatId) {
  return `telegram:chat:${String(chatId || "").trim()}`;
}
__name(telegramChatStateKey, "telegramChatStateKey");
__name2(telegramChatStateKey, "telegramChatStateKey");
function whatsappStateKey(userId) {
  return `whatsapp:user:${String(userId || "").trim().toUpperCase()}`;
}
__name(whatsappStateKey, "whatsappStateKey");
__name2(whatsappStateKey, "whatsappStateKey");
async function getTelegramState(env, userId) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const raw = await kv.get(telegramStateKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(getTelegramState, "getTelegramState");
__name2(getTelegramState, "getTelegramState");
async function saveTelegramState(env, userId, patch) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const current = await getTelegramState(env, userId) || {};
  const next = { ...current, ...patch, user_id: String(userId || "").trim().toUpperCase(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  await kv.put(telegramStateKey(userId), JSON.stringify(next));
  if (next.connected && next.chat_id) {
    await kv.put(telegramChatStateKey(next.chat_id), next.user_id);
  }
  return next;
}
__name(saveTelegramState, "saveTelegramState");
__name2(saveTelegramState, "saveTelegramState");
async function getTelegramUserIdByChat(env, chatId) {
  const kv = getChannelStateStore(env);
  if (!kv || !chatId) return "";
  return String(await kv.get(telegramChatStateKey(chatId)) || "").trim().toUpperCase();
}
__name(getTelegramUserIdByChat, "getTelegramUserIdByChat");
__name2(getTelegramUserIdByChat, "getTelegramUserIdByChat");
async function getWhatsAppState(env, userId) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const raw = await kv.get(whatsappStateKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(getWhatsAppState, "getWhatsAppState");
__name2(getWhatsAppState, "getWhatsAppState");
async function saveWhatsAppState(env, userId, patch) {
  const kv = getChannelStateStore(env);
  if (!kv || !userId) return null;
  const current = await getWhatsAppState(env, userId) || {};
  const next = { ...current, ...patch, user_id: String(userId || "").trim().toUpperCase(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  await kv.put(whatsappStateKey(userId), JSON.stringify(next));
  return next;
}
__name(saveWhatsAppState, "saveWhatsAppState");
__name2(saveWhatsAppState, "saveWhatsAppState");
function maskChatId(chatId) {
  const raw = String(chatId || "").trim();
  if (!raw) return "";
  if (raw.length <= 4) return raw;
  return `${"\u2022".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}
__name(maskChatId, "maskChatId");
__name2(maskChatId, "maskChatId");
function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `${"\u2022".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
__name(maskPhone, "maskPhone");
__name2(maskPhone, "maskPhone");
function buildTelegramBotLink(env, userId) {
  const username = String(env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@+/, "");
  const normalizedUserId = String(userId || "").trim();
  if (!username || !normalizedUserId) return "";
  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(normalizedUserId)}`;
}
__name(buildTelegramBotLink, "buildTelegramBotLink");
__name2(buildTelegramBotLink, "buildTelegramBotLink");
function buildWhatsAppBotNumber(env) {
  const raw = String(
    env.WHATSAPP_BOT_NUMBER || env.WHATSAPP_BOT_PHONE || env.WHATSAPP_BUSINESS_PHONE || env.WHATSAPP_DISPLAY_PHONE || env.WHATSAPP_FROM_PHONE || env.WHATSAPP_PHONE || env.WHATSAPP_NUMBER || ""
  ).trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("549")) {
    return digits;
  }
  if (digits.startsWith("54")) {
    return `549${digits.slice(2)}`;
  }
  if (digits.startsWith("9") && digits.length >= 11) {
    return `54${digits}`;
  }
  if (digits.startsWith("15") && digits.length > 8) {
    digits = digits.slice(2);
  }
  return `549${digits}`;
}
__name(buildWhatsAppBotNumber, "buildWhatsAppBotNumber");
__name2(buildWhatsAppBotNumber, "buildWhatsAppBotNumber");
function buildWhatsAppBotLink(env) {
  const directLink = String(
    env.WHATSAPP_BOT_LINK || env.WHATSAPP_LINK || env.WHATSAPP_CONNECT_URL || ""
  ).trim();
  if (/^https?:\/\//i.test(directLink)) {
    return directLink;
  }
  const phone = buildWhatsAppBotNumber(env);
  if (!phone) return "";
  return `https://wa.me/${phone}?text=ALERTAS`;
}
__name(buildWhatsAppBotLink, "buildWhatsAppBotLink");
__name2(buildWhatsAppBotLink, "buildWhatsAppBotLink");
async function sendTelegramText(env, chatId, text) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  const safeText = String(text || "").trim();
  if (!safeText) throw new Error("Mensaje Telegram vac\xEDo");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: safeText,
      disable_web_page_preview: true
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram HTTP ${res.status}`);
  }
  return data;
}
__name(sendTelegramText, "sendTelegramText");
__name2(sendTelegramText, "sendTelegramText");
function splitTelegramText(text, maxLen = 3500) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const chunks = [];
  const blocks = raw.split("\n\n");
  let current = "";
  const pushCurrent = /* @__PURE__ */ __name(() => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  }, "pushCurrent");
  for (const block of blocks) {
    const candidate = current ? `${current}

${block}` : block;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    if (current) pushCurrent();
    if (block.length <= maxLen) {
      current = block;
      continue;
    }
    const lines = block.split("\n");
    let lineChunk = "";
    for (const line of lines) {
      const lineCandidate = lineChunk ? `${lineChunk}
${line}` : line;
      if (lineCandidate.length <= maxLen) {
        lineChunk = lineCandidate;
        continue;
      }
      if (lineChunk.trim()) {
        chunks.push(lineChunk.trim());
        lineChunk = "";
      }
      if (line.length <= maxLen) {
        lineChunk = line;
      } else {
        for (let i = 0; i < line.length; i += maxLen) {
          chunks.push(line.slice(i, i + maxLen));
        }
      }
    }
    if (lineChunk.trim()) {
      chunks.push(lineChunk.trim());
    }
  }
  if (current.trim()) pushCurrent();
  return chunks.filter(Boolean);
}
__name(splitTelegramText, "splitTelegramText");
async function sendTelegramLongText(env, chatId, text, maxLen = 3500) {
  const parts = splitTelegramText(text, maxLen);
  let last = null;
  for (const part of parts) {
    last = await sendTelegramText(env, chatId, part);
  }
  return last;
}
__name(sendTelegramLongText, "sendTelegramLongText");
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
__name2(requireTelegramWebhookSecret, "requireTelegramWebhookSecret");
function telegramUpdateDedupeKey(updateId) {
  return `telegram:update:${String(updateId || "").trim()}`;
}
__name(telegramUpdateDedupeKey, "telegramUpdateDedupeKey");
__name2(telegramUpdateDedupeKey, "telegramUpdateDedupeKey");
function whatsappMessageDedupeKey(messageId) {
  return `whatsapp:message:${String(messageId || "").trim()}`;
}
__name(whatsappMessageDedupeKey, "whatsappMessageDedupeKey");
__name2(whatsappMessageDedupeKey, "whatsappMessageDedupeKey");
async function wasInboundEventProcessed(env, key) {
  const kv = getChannelStateStore(env);
  if (!kv || !key) return false;
  return !!await kv.get(key);
}
__name(wasInboundEventProcessed, "wasInboundEventProcessed");
__name2(wasInboundEventProcessed, "wasInboundEventProcessed");
async function markInboundEventProcessed(env, key, ttlSeconds) {
  const kv = getChannelStateStore(env);
  if (!kv || !key) return;
  await kv.put(key, (/* @__PURE__ */ new Date()).toISOString(), { expirationTtl: ttlSeconds });
}
__name(markInboundEventProcessed, "markInboundEventProcessed");
__name2(markInboundEventProcessed, "markInboundEventProcessed");
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
__name2(resolveTelegramEntitlement, "resolveTelegramEntitlement");
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
__name2(resolveWhatsAppEntitlement, "resolveWhatsAppEntitlement");
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
__name(extractTelegramCommand, "extractTelegramCommand");
__name2(extractTelegramCommand, "extractTelegramCommand");
function buildRichTextAlertLines(payload, index) {
  const p = normalizeOfferPayload(payload || {});
  const title = [String(p.cargo || "").trim(), String(p.materia || "").trim()].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" \xB7 ") || "Oferta APD";
  const safe = /* @__PURE__ */ __name((v, fallback = "\u2014") => {
    const s = String(v ?? "").trim();
    return s ? s : fallback;
  }, "safe");
  const num = /* @__PURE__ */ __name((v) => {
    const n = typeof parseMailNumber === "function" ? parseMailNumber(v) : Number(v);
    return Number.isFinite(n) ? n : null;
  }, "num");
  const fmt = /* @__PURE__ */ __name((v, fallback = "\u2014") => {
    const n = num(v);
    if (!Number.isFinite(n)) return fallback;
    return typeof formatMailNumber === "function" ? formatMailNumber(n) : String(n);
  }, "fmt");
  function tgPostuladosUrl() {
    const raw = p?.raw || {};
    const oferta = String(
      p.idoferta || raw.idoferta || raw.oferta || raw.id_oferta || ""
    ).replace(/\D/g, "");
    const detalle = String(
      p.iddetalle || raw.iddetalle || raw.detalle || raw.id_detalle || p.offer_id || raw.offer_id || ""
    ).replace(/\D/g, "");
    if (oferta && detalle && typeof buildAbcPostulantesUrl === "function") {
      return buildAbcPostulantesUrl(oferta, detalle);
    }
    const direct = String(
      p.url_postulados || p.link_postulados || p.postulantes_url || p.postulados_url || ""
    ).trim();
    return direct;
  }
  __name(tgPostuladosUrl, "tgPostuladosUrl");
  const lines = [`${index + 1}) ${title}`];
  if (p.distrito) lines.push(`\u{1F4CD} Distrito: ${safe(p.distrito)}`);
  if (p.escuela) lines.push(`\u{1F3EB} Escuela: ${safe(p.escuela)}`);
  if (p.turno) lines.push(`\u{1F552} Turno: ${safe(p.turno)}`);
  if (p.jornada) lines.push(`\u{1F3F7}\uFE0F Jornada: ${safe(p.jornada)}`);
  if (p.nivel) lines.push(`\u{1F393} Nivel: ${safe(p.nivel)}`);
  if (p.curso_division) lines.push(`\u{1F465} Curso/divisi\xF3n: ${safe(p.curso_division)}`);
  if (p.modulos) lines.push(`\u{1F4E6} M\xF3dulos: ${safe(p.modulos)}`);
  if (p.dias_horarios) lines.push(`\u{1F5D3}\uFE0F D\xEDas y horarios: ${safe(p.dias_horarios)}`);
  const vigencia = [String(p.desde || "").trim(), String(p.hasta || "").trim()].filter(Boolean).join(" \u2192 ");
  if (vigencia) lines.push(`\u{1F4C5} Vigencia: ${vigencia}`);
  if (p.fecha_cierre || p.finoferta_label) {
    lines.push(`\u23F0 Cierre: ${safe(p.fecha_cierre || p.finoferta_label)}`);
  }
  if (p.observaciones) {
    lines.push(`\u{1F4DD} Observaciones: ${safe(p.observaciones)}`);
  }
  const totalPostulantes = p.total_postulantes != null && p.total_postulantes !== "" ? String(p.total_postulantes) : "Sin postulados visibles";
  const puntajeMasAlto = p.puntaje_primero != null && p.puntaje_primero !== "" ? fmt(p.puntaje_primero, "Sin datos") : "Sin datos";
  const listadoMasAlto = safe(p.listado_origen_primero, "Sin datos");
  lines.push("");
  lines.push("\u{1F4CC} Referencia de postulantes");
  lines.push(`\u{1F465} Postulados visibles: ${totalPostulantes}`);
  lines.push(`\u{1F4C8} Puntaje m\xE1s alto: ${puntajeMasAlto}`);
  lines.push(`\u{1F4C4} Listado del m\xE1s alto: ${listadoMasAlto}`);
  if (hasPidEvidence(p)) {
    const chance = buildMailChanceInfo(p);
    const puntajeBase = Number.isFinite(Number(p.pid_puntaje_total_base)) ? Number(p.pid_puntaje_total_base) : num(p.pid_puntaje_total);
    const bonusResidencia = p.pid_residencia_bonus_aplicado ? Number(p.pid_residencia_bonus_puntos || 0) : 0;
    const puntajeFinal = Number.isFinite(Number(p.pid_puntaje_total_final)) ? Number(p.pid_puntaje_total_final) : Number.isFinite(puntajeBase) ? puntajeBase + bonusResidencia : null;
    const primero = num(p.puntaje_primero);
    const diff = Number.isFinite(puntajeFinal) && Number.isFinite(primero) ? puntajeFinal - primero : null;
    lines.push("");
    lines.push(`\u{1F9E0} ${chance?.title || (p.pid_compatible ? "Compatible con tu PID" : "No compatible con tu PID")}`);
    lines.push(`\u{1F9FE} Motivo PID: ${safe(p.pid_reason || (p.pid_compatible ? "Compatible con tu PID" : "No compatible con tu PID"))}`);
    lines.push(`\u{1F4DA} \xC1rea PID: ${safe(p.pid_area || p.area || p.materia)}`);
    lines.push(`\u{1F5C2}\uFE0F Bloque PID: ${safe(p.pid_bloque || p.bloque_pid)}`);
    lines.push(`\u{1F4CA} Puntaje PID base: ${Number.isFinite(puntajeBase) ? fmt(puntajeBase) : "\u2014"}`);
    if (p.pid_residencia_bonus_aplicado) {
      lines.push(`\u2795 Bonus residencia: +${fmt(bonusResidencia, "0")}`);
      lines.push(`\u{1F3E0} Distrito residencia: ${safe(p.pid_distrito_residencia)}`);
    } else {
      lines.push("\u2795 Bonus residencia: No");
    }
    lines.push(`\u2B50 Tu puntaje total: ${Number.isFinite(puntajeFinal) ? fmt(puntajeFinal) : "\u2014"}`);
    lines.push(`\u{1F9F7} Listado/a\xF1o PID: ${safe(p.pid_listado)} \xB7 ${safe(p.pid_anio)}`);
    if (Number.isFinite(diff)) {
      const sign = diff > 0 ? "+" : "";
      lines.push(`\u{1F9EE} Diferencia vs m\xE1s alto: ${sign}${fmt(diff)}`);
    }
    if (chance?.text) {
      lines.push(`\u2139\uFE0F ${chance.text}`);
    }
  }
  const postuladosUrl = tgPostuladosUrl();
  if (postuladosUrl) {
    lines.push("");
    lines.push(`\u{1F517} Postulados: ${postuladosUrl}`);
  }
  return lines;
}
__name(buildRichTextAlertLines, "buildRichTextAlertLines");
__name2(buildRichTextAlertLines, "buildRichTextAlertLines");
function buildTelegramQueryDigest(alerts) {
  const all = Array.isArray(alerts) ? alerts : [];
  if (!all.length) {
    return `\u{1F4DA} APDocentePBA

No hay alertas compatibles con tus filtros en este momento.

Escrib\xED ALERTAS para refrescar.`;
  }
  const header = `\u{1F4DA} APDocentePBA

Se encontraron ${all.length} alerta(s) compatibles.
`;
  const blocks = all.map((item, idx) => {
    const payload = item?.offer_payload || item || {};
    return buildRichTextAlertLines(payload, idx).join("\n");
  });
  return header + `
` + blocks.join(`

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

`) + `

\u{1F310} Panel: https://alertasapd.com.ar
Escrib\xED ALERTAS para refrescar.`;
}
__name(buildTelegramQueryDigest, "buildTelegramQueryDigest");
__name2(buildTelegramQueryDigest, "buildTelegramQueryDigest");
function buildWhatsAppQueryDigestParts(alerts) {
  const safe = /* @__PURE__ */ __name((v) => String(v ?? "").trim(), "safe");
  const pick = /* @__PURE__ */ __name((obj, keys) => {
    for (const k of keys) {
      const val = safe(obj?.[k]);
      if (val) return val;
    }
    return "";
  }, "pick");
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return [
      "No encontr\xE9 alertas activas para vos en este momento.\n\nPanel: https://alertasapd.com.ar"
    ];
  }
  const parts = [];
  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i] || {};
    const cargo = pick(a, [
      "cargo",
      "descripcioncargo",
      "title",
      "materia",
      "descripcion"
    ]) || "-";
    const distrito = pick(a, [
      "distrito",
      "descdistrito",
      "desc_distrito"
    ]) || "-";
    const escuela = pick(a, [
      "escuela",
      "establecimiento",
      "servicio",
      "nomestablecimiento",
      "nombreestablecimiento"
    ]) || "-";
    const turno = pick(a, [
      "turno",
      "desc_turno"
    ]) || "-";
    const jornada = pick(a, [
      "jornada",
      "descjornada",
      "tipojornada"
    ]) || "-";
    const nivel = pick(a, [
      "nivel",
      "descnivelmodalidad",
      "nivelmodalidad",
      "modalidad"
    ]) || "-";
    const modulos = pick(a, [
      "modulos",
      "cantidad_modulos",
      "cantmodulos",
      "mod"
    ]) || "-";
    const dias = pick(a, [
      "dias_y_horarios",
      "dias_horarios",
      "dias",
      "horarios",
      "diasyhorarios",
      "observaciones_horario"
    ]) || "-";
    const vigDesde = pick(a, [
      "vigencia_desde",
      "desde",
      "desdefecha",
      "inicio",
      "fechadesde"
    ]);
    const vigHasta = pick(a, [
      "vigencia_hasta",
      "hasta",
      "hastafecha",
      "fin",
      "fechahasta"
    ]);
    const vigencia = pick(a, ["vigencia", "periodo_vigencia"]) || [vigDesde, vigHasta].filter(Boolean).join(" / ") || "-";
    const cierre = pick(a, [
      "finoferta",
      "cierre",
      "fecha_cierre",
      "fechacierre",
      "fincierre",
      "vencimiento"
    ]) || "-";
    const postulados = pick(a, [
      "total_postulantes",
      "postulados",
      "cant_postulantes"
    ]) || "-";
    const puntaje1 = pick(a, [
      "puntaje_primero",
      "puntaje1",
      "puntaje_mas_alto",
      "mayor_puntaje"
    ]) || "-";
    const listado1 = pick(a, [
      "listado_origen_primero",
      "listado_primero",
      "listado1",
      "origen_listado_primero"
    ]) || "-";
    const link = pick(a, [
      "link",
      "url",
      "postular_url",
      "oferta_url"
    ]) || "https://alertasapd.com.ar";
    parts.push(
      `${i + 1}) ${cargo}
Distrito: ${distrito}
Escuela: ${escuela}
Turno: ${turno}
Jornada: ${jornada}
Nivel: ${nivel}
M\xF3dulos: ${modulos}
D\xEDas y horarios: ${dias}
Vigencia: ${vigencia}
Cierre: ${cierre}
Postulados: ${postulados}
Puntaje m\xE1s alto: ${puntaje1}
Listado m\xE1s alto: ${listado1}
Link: ${link}
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`
    );
  }
  return parts;
}
__name(buildWhatsAppQueryDigestParts, "buildWhatsAppQueryDigestParts");
__name2(buildWhatsAppQueryDigestParts, "buildWhatsAppQueryDigestParts");
async function sendWhatsAppText(env, destination, text) {
  const response = await fetch(
    `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destination,
        type: "text",
        text: {
          body: String(text || "").slice(0, 4096),
          preview_url: false
        }
      })
    }
  );
  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { raw_text: rawText };
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || `WhatsApp HTTP ${response.status}`);
  }
  return {
    ok: true,
    status: response.status,
    data
  };
}
__name(sendWhatsAppText, "sendWhatsAppText");
__name2(sendWhatsAppText, "sendWhatsAppText");
async function trySendWhatsAppText(env, destination, text, context = "unknown") {
  try {
    return await sendWhatsAppText(env, destination, text);
  } catch (err) {
    console.error("WHATSAPP SEND ERROR:", {
      context,
      destination,
      error: err?.message || String(err || "send_failed")
    });
    return {
      ok: false,
      status: 500,
      error: err?.message || String(err || "send_failed")
    };
  }
}
__name(trySendWhatsAppText, "trySendWhatsAppText");
__name2(trySendWhatsAppText, "trySendWhatsAppText");
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
__name2(findUserByWhatsAppNumber, "findUserByWhatsAppNumber");
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
__name2(handleTelegramStatus, "handleTelegramStatus");
async function handleTelegramWebhook(request, env) {
  requireTelegramWebhookSecret(request, env);
  async function loadTelegramStoredAlerts(env2, userId, limit = 10) {
    const rows = await supabaseSelect(
      env2,
      `user_offer_state?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=offer_id,offer_payload,last_seen_at&order=last_seen_at.desc&limit=${encodeURIComponent(String(limit))}`
    ).catch((err) => {
      console.error("TELEGRAM STORED ALERTS READ ERROR:", err);
      return [];
    });
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      offer_payload: normalizeOfferPayload(row?.offer_payload || {}),
      last_seen_at: row?.last_seen_at || ""
    })).filter((item) => {
      const p = item.offer_payload || {};
      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.cargo || p.materia || p.title);
    });
  }
  __name(loadTelegramStoredAlerts, "loadTelegramStoredAlerts");
  async function loadTelegramLiveAlertsWithTimeout(env2, userId, timeoutMs = 12e3) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout_consultando_alertas")), timeoutMs);
    });
    const data = await Promise.race([
      construirAlertasParaUsuario(env2, userId),
      timeout
    ]);
    const rawAlerts = Array.isArray(data) ? data : Array.isArray(data?.resultados) ? data.resultados : Array.isArray(data?.alertas) ? data.alertas : Array.isArray(data?.items) ? data.items : [];
    return rawAlerts.map((item) => ({
      offer_payload: normalizeOfferPayload(item?.offer_payload || item || {})
    })).filter((item) => {
      const p = item.offer_payload || {};
      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.cargo || p.materia || p.title);
    });
  }
  __name(loadTelegramLiveAlertsWithTimeout, "loadTelegramLiveAlertsWithTimeout");
  function tgCleanId(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    const m = s.match(/\d+/);
    return m ? m[0] : "";
  }
  __name(tgCleanId, "tgCleanId");
  function tgGetOfertaDetalle(payload) {
    const p = normalizeOfferPayload(payload || {});
    const raw = p?.raw || {};
    const oferta = tgCleanId(
      p.idoferta || raw.idoferta || raw.oferta || raw.id_oferta || ""
    );
    const detalle = tgCleanId(
      p.iddetalle || raw.iddetalle || raw.detalle || raw.id_detalle || p.offer_id || raw.offer_id || ""
    );
    return { oferta, detalle };
  }
  __name(tgGetOfertaDetalle, "tgGetOfertaDetalle");
  async function enrichTelegramAlertsWithPostulantes(env2, alerts, maxEnrich = 30) {
    const source = Array.isArray(alerts) ? alerts : [];
    const limit = Math.max(0, Math.min(Number(maxEnrich || 0), source.length));
    const enrichedHead = await Promise.all(
      source.slice(0, limit).map(async (item) => {
        const base = normalizeOfferPayload(item?.offer_payload || item || {});
        const ids = tgGetOfertaDetalle(base);
        if (!ids.oferta || !ids.detalle || typeof obtenerResumenPostulantesABC !== "function") {
          return {
            ...item,
            offer_payload: base
          };
        }
        try {
          const resumen = await Promise.race([
            obtenerResumenPostulantesABC(ids.oferta, ids.detalle),
            new Promise(
              (_, reject) => setTimeout(() => reject(new Error("timeout_postulantes_telegram")), 4500)
            )
          ]);
          return {
            ...item,
            offer_payload: normalizeOfferPayload({
              ...base,
              total_postulantes: resumen?.total_postulantes ?? base.total_postulantes ?? null,
              puntaje_primero: resumen?.puntaje_primero ?? base.puntaje_primero ?? null,
              listado_origen_primero: resumen?.listado_origen_primero || base.listado_origen_primero || ""
            })
          };
        } catch (err) {
          console.error("TELEGRAM POSTULANTES ENRICH ERROR:", {
            oferta: ids.oferta || null,
            detalle: ids.detalle || null,
            error: String(err?.message || err || "")
          });
          return {
            ...item,
            offer_payload: base
          };
        }
      })
    );
    const tail = source.slice(limit).map((item) => ({
      ...item,
      offer_payload: normalizeOfferPayload(item?.offer_payload || item || {})
    }));
    return [...enrichedHead, ...tail];
  }
  __name(enrichTelegramAlertsWithPostulantes, "enrichTelegramAlertsWithPostulantes");
  const update = await request.json().catch(() => ({}));
  const updateId = update?.update_id != null ? String(update.update_id).trim() : "";
  if (updateId) {
    const dedupeKey = telegramUpdateDedupeKey(updateId);
    if (await wasInboundEventProcessed(env, dedupeKey)) {
      return json2({
        ok: true,
        duplicate: true,
        update_id: updateId
      });
    }
    await markInboundEventProcessed(
      env,
      dedupeKey,
      TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS
    ).catch(() => null);
  }
  const message = update?.message || {};
  const chatId = String(message?.chat?.id || "").trim();
  const chatType = String(message?.chat?.type || "private").trim();
  if (!chatId || chatType && chatType !== "private") {
    return json2({
      ok: true,
      ignored: true,
      reason: "invalid_chat"
    });
  }
  const command = extractTelegramCommand(message?.text || "");
  if (command.kind === "start") {
    const userId = String(command.payload || "").trim();
    const validStartPayload = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
    if (!validStartPayload) {
      const alreadyLinkedUserId = await getTelegramUserIdByChat(env, chatId).catch(() => "");
      if (alreadyLinkedUserId) {
        await sendTelegramText(
          env,
          chatId,
          "\u2705 Este chat ya est\xE1 vinculado con tu cuenta de APDocentePBA.\n\nEscrib\xED ALERTAS cuando quieras consultar tus ofertas compatibles."
        ).catch(() => null);
        return json2({
          ok: true,
          ignored: false,
          already_linked: true,
          user_id: alreadyLinkedUserId,
          reason: "start_without_payload_but_chat_already_linked"
        });
      }
      await sendTelegramText(
        env,
        chatId,
        "\u26A0\uFE0F Telegram abri\xF3 el bot, pero no lleg\xF3 el c\xF3digo de vinculaci\xF3n.\n\nVolv\xE9 al panel de APDocentePBA y toc\xE1 nuevamente el bot\xF3n \u201CConectar Telegram\u201D.\n\nSi el problema sigue, cerr\xE1 esta conversaci\xF3n de Telegram, recarg\xE1 el panel y volv\xE9 a intentarlo."
      ).catch(() => null);
      return json2({
        ok: true,
        ignored: true,
        reason: "invalid_start_payload"
      });
    }
    const entitlement2 = await resolveTelegramEntitlement(env, userId);
    const prev = await getTelegramState(env, userId) || {};
    const prefs2 = await obtenerPreferenciasUsuario(env, userId).catch(() => null);
    const next = await saveTelegramState(env, userId, {
      connected: true,
      chat_id: chatId,
      username: String(message?.from?.username || "").trim(),
      first_name: String(message?.from?.first_name || "").trim(),
      connected_at: prev.connected_at || (/* @__PURE__ */ new Date()).toISOString(),
      alerts_requested: !!prefs2?.alertas_telegram,
      alerts_enabled: !!entitlement2?.allowed,
      last_inbound_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    await sendTelegramText(
      env,
      chatId,
      "\u2705 APDocentePBA conect\xF3 este chat con tu cuenta.\n\nEscrib\xED ALERTAS cuando quieras consultar tus ofertas compatibles."
    ).catch(() => null);
    return json2({
      ok: true,
      connected: true,
      user_id: userId,
      state: next
    });
  }
  const linkedUserId = await getTelegramUserIdByChat(env, chatId);
  if (!linkedUserId) {
    await sendTelegramText(
      env,
      chatId,
      "Todav\xEDa no vinculaste este chat con tu cuenta. Entr\xE1 al panel y us\xE1 el bot\xF3n de conectar Telegram."
    ).catch(() => null);
    return json2({
      ok: true,
      ignored: true,
      reason: "chat_not_linked"
    });
  }
  const user = await obtenerUsuario(env, linkedUserId);
  if (!user?.id) {
    await sendTelegramText(
      env,
      chatId,
      "No pude encontrar tu usuario vinculado. Volv\xE9 a conectar Telegram desde el panel."
    ).catch(() => null);
    return json2({
      ok: true,
      ignored: true,
      reason: "user_not_found"
    });
  }
  if (user.activo === false) {
    await sendTelegramText(
      env,
      chatId,
      "Tu usuario figura inactivo. Revis\xE1 tu cuenta en el panel.\n\n\u{1F310} https://alertasapd.com.ar"
    ).catch(() => null);
    return json2({
      ok: true,
      ignored: true,
      reason: "inactive_user"
    });
  }
  const entitlement = await resolveTelegramEntitlement(env, user.id).catch(() => ({
    allowed: false,
    plan_code: "UNKNOWN"
  }));
  const state = await saveTelegramState(env, user.id, {
    connected: true,
    chat_id: chatId,
    username: String(message?.from?.username || "").trim(),
    first_name: String(message?.from?.first_name || "").trim(),
    last_inbound_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  const prefs = await obtenerPreferenciasUsuario(env, user.id).catch(() => null);
  if (command.kind === "alertas") {
    const telegramConnected = !!state?.connected && !!String(state?.chat_id || "").trim();
    await saveTelegramState(env, user.id, {
      alerts_requested: !!prefs?.alertas_telegram,
      alerts_enabled: !!(entitlement?.allowed && telegramConnected),
      last_inbound_at: (/* @__PURE__ */ new Date()).toISOString()
    }).catch(() => null);
    if (!telegramConnected) {
      await sendTelegramText(
        env,
        chatId,
        "Todav\xEDa no pude vincular este chat con tu cuenta. Entr\xE1 al panel, toc\xE1 conectar Telegram y despu\xE9s escrib\xED ALERTAS."
      ).catch(() => null);
      return json2({
        ok: true,
        delivered: false,
        reason: "telegram_not_connected",
        connected: false,
        channel_mode: "query_only"
      });
    }
    if (!entitlement?.allowed) {
      await sendTelegramText(
        env,
        chatId,
        "Tu plan todav\xEDa no habilita Telegram.\n\n\u{1F310} https://alertasapd.com.ar"
      ).catch(() => null);
      return json2({
        ok: true,
        delivered: false,
        reason: "telegram_not_allowed_by_plan",
        connected: telegramConnected,
        plan_code: entitlement?.plan_code || null,
        channel_mode: "query_only"
      });
    }
    await sendTelegramText(
      env,
      chatId,
      "\u{1F50E} Estoy consultando tus alertas compatibles..."
    ).catch(() => null);
    const limit = Number(TELEGRAM_QUERY_ALERTS_LIMIT || 50);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 50;
    let alerts = [];
    let source = "stored";
    try {
      alerts = await loadTelegramStoredAlerts(env, user.id, safeLimit);
    } catch (err) {
      console.error("TELEGRAM STORED ALERTS ERROR:", err);
      alerts = [];
    }
    if (!alerts.length) {
      source = "live";
      try {
        alerts = await loadTelegramLiveAlertsWithTimeout(env, user.id, 12e3);
      } catch (err) {
        console.error("TELEGRAM LIVE ALERTS ERROR:", err);
        await sendTelegramText(
          env,
          chatId,
          "No pude consultar tus alertas ahora mismo. La b\xFAsqueda est\xE1 tardando demasiado.\n\nProb\xE1 de nuevo en unos minutos o miralas en el panel:\n\u{1F310} https://alertasapd.com.ar"
        ).catch(() => null);
        return json2({
          ok: true,
          delivered: false,
          reason: "live_build_failed_or_timeout",
          error: String(err?.message || err || ""),
          source,
          channel_mode: "query_only"
        });
      }
    }
    const visibleBaseAlerts = alerts.slice(0, safeLimit);
    const visibleAlerts = await enrichTelegramAlertsWithPostulantes(
      env,
      visibleBaseAlerts,
      Math.min(safeLimit, 30)
    );
    if (!visibleAlerts.length) {
      await sendTelegramText(
        env,
        chatId,
        "No encontr\xE9 alertas compatibles en este momento.\n\n\u{1F310} https://alertasapd.com.ar"
      ).catch(() => null);
      return json2({
        ok: true,
        delivered: true,
        total_alerts: 0,
        shown_alerts: 0,
        source,
        channel_mode: "query_only"
      });
    }
    const visibleAlertsForRender = applyPidVisibilityToAlerts(
      visibleAlerts,
      entitlement?.plan_code
    );
    const reply = buildTelegramQueryDigest(visibleAlertsForRender);
    try {
      await sendTelegramLongText(env, chatId, reply);
    } catch (err) {
      console.error("TELEGRAM ALERTS SEND ERROR:", err);
      await sendTelegramText(
        env,
        chatId,
        `Encontr\xE9 ${visibleAlerts.length} alerta(s) compatibles, pero no pude mandarte el detalle completo por Telegram.

Miralas en el panel:
https://alertasapd.com.ar

Escrib\xED ALERTAS otra vez si quer\xE9s refrescar.`
      ).catch(() => null);
    }
    return json2({
      ok: true,
      delivered: true,
      total_alerts: alerts.length,
      shown_alerts: visibleAlerts.length,
      source,
      plan_code: entitlement?.plan_code || null,
      channel_mode: "query_only",
      enriched_postulantes: true,
      enriched_limit: Math.min(safeLimit, 30),
      pid_visible: canShowPidForPlan(entitlement)
    });
  }
  await sendTelegramText(
    env,
    chatId,
    "Hola. Escrib\xED ALERTAS y te devuelvo tus ofertas compatibles ahora mismo.\n\n\u{1F310} https://alertasapd.com.ar"
  ).catch(() => null);
  return json2({
    ok: true,
    delivered: true,
    help: true,
    channel_mode: "query_only"
  });
}
__name(handleTelegramWebhook, "handleTelegramWebhook");
__name2(handleTelegramWebhook, "handleTelegramWebhook");
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
      alerts_enabled: tgEntitlement.allowed ? requestedTelegram && !!currentTgState.connected : false,
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
    const whatsappBotNumber = String(env.WHATSAPP_BOT_NUMBER || "").trim();
    const whatsappBotPhone = buildWhatsAppBotNumber(env);
    const whatsappBotLink = buildWhatsAppBotLink(env);
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
      bot_link: whatsappBotLink,
      whatsapp_link: whatsappBotLink,
      wa_link: whatsappBotLink,
      connect_url: whatsappBotLink,
      deep_link: whatsappBotLink,
      bot_phone: whatsappBotPhone,
      whatsapp_phone: whatsappBotPhone,
      connect_hint: whatsappBotLink ? "Abr\xED el bot de WhatsApp y escrib\xED ALERTAS para pedir tus alertas del momento." : whatsappBotNumber ? `Guard\xE1 tu celular en el panel y escrib\xED a ${whatsappBotNumber} por WhatsApp para consultar alertas.` : "Guard\xE1 tu celular en el panel y escribile al n\xFAmero del bot por WhatsApp para consultar alertas."
    };
  }
  let message = delegated.data?.message || "Preferencias guardadas";
  if (telegramStatus && telegramStatus.alerts_requested && !telegramStatus.connected) {
    message = `${message}. Telegram qued\xF3 pedido en tu cuenta, pero todav\xEDa falta vincular el bot.`;
  }
  if (whatsappStatus && whatsappStatus.alerts_requested && !whatsappStatus.connected && whatsappStatus.allowed_by_plan) {
    message = `${message}. WhatsApp qued\xF3 pedido en tu cuenta, pero todav\xEDa falta vincular el canal.`;
  }
  return json2(
    {
      ...typeof delegated.data === "object" && delegated.data ? delegated.data : { ok: true },
      message,
      telegram_status: telegramStatus,
      whatsapp_status: whatsappStatus
    },
    delegated.response.status || 200
  );
}
__name(handleGuardarPreferenciasChannelsAware, "handleGuardarPreferenciasChannelsAware");
__name2(handleGuardarPreferenciasChannelsAware, "handleGuardarPreferenciasChannelsAware");
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
  const botPhone = buildWhatsAppBotNumber(env);
  const botLink = buildWhatsAppBotLink(env);
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
    bot_link: botLink,
    whatsapp_link: botLink,
    wa_link: botLink,
    connect_url: botLink,
    deep_link: botLink,
    bot_phone: botPhone,
    whatsapp_phone: botPhone,
    connect_hint: botLink ? "Abr\xED el bot de WhatsApp y escrib\xED ALERTAS para pedir tus alertas del momento." : botNumber ? `Guard\xE1 tu celular en el panel y escrib\xED a ${botNumber} por WhatsApp para consultar alertas.` : "Guard\xE1 tu celular en el panel y escribile al n\xFAmero del bot por WhatsApp para consultar alertas."
  });
}
__name(handleWhatsAppStatus, "handleWhatsAppStatus");
__name2(handleWhatsAppStatus, "handleWhatsAppStatus");
async function handleWhatsAppWebhookVerify(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = String(
    env.WHATSAPP_VERIFY_TOKEN || "apdocente_token"
  ).trim();
  console.log("WA VERIFY", {
    path: url.pathname,
    mode,
    token_received: token,
    token_expected: expectedToken,
    has_challenge: !!challenge
  });
  if (mode === "subscribe" && token === expectedToken) {
    return new Response(challenge || "", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}
__name(handleWhatsAppWebhookVerify, "handleWhatsAppWebhookVerify");
__name2(handleWhatsAppWebhookVerify, "handleWhatsAppWebhookVerify");
async function handleWhatsAppWebhook(request, env) {
  function waNormText(value) {
    return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }
  __name(waNormText, "waNormText");
  function waIsAlertasCommand(value) {
    const t = waNormText(value);
    return t === "ALERTAS" || t === "ALERTA" || t.startsWith("ALERTAS ") || t.startsWith("ALERTA ");
  }
  __name(waIsAlertasCommand, "waIsAlertasCommand");
  function waCleanId(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    const m = s.match(/\d+/);
    return m ? m[0] : "";
  }
  __name(waCleanId, "waCleanId");
  function waGetOfertaDetalle(payload) {
    const p = normalizeOfferPayload(payload || {});
    const raw = p?.raw || {};
    const oferta = waCleanId(
      p.idoferta || raw.idoferta || raw.oferta || raw.id_oferta || ""
    );
    const detalle = waCleanId(
      p.iddetalle || raw.iddetalle || raw.detalle || raw.id_detalle || p.offer_id || raw.offer_id || ""
    );
    return { oferta, detalle };
  }
  __name(waGetOfertaDetalle, "waGetOfertaDetalle");
  function waBuildPostuladosUrl(payload) {
    const ids = waGetOfertaDetalle(payload);
    if (!ids.oferta || !ids.detalle) {
      return "";
    }
    if (typeof buildAbcPostulantesUrl === "function") {
      return buildAbcPostulantesUrl(ids.oferta, ids.detalle);
    }
    return `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?oferta=${encodeURIComponent(ids.oferta)}&detalle=${encodeURIComponent(ids.detalle)}`;
  }
  __name(waBuildPostuladosUrl, "waBuildPostuladosUrl");
  function waAlertTime(item) {
    const p = item?.offer_payload || item || {};
    const raw = p?.raw || {};
    const candidates = [
      item?.last_seen_at,
      raw?.last_seen_at,
      p?.last_seen_at,
      raw?.ult_movimiento,
      p?.ult_movimiento,
      raw?.created_at,
      p?.created_at,
      raw?.finoferta,
      p?.finoferta,
      p?.fecha_cierre,
      raw?.fecha_cierre
    ];
    for (const value of candidates) {
      const s = String(value || "").trim();
      if (!s) continue;
      let d = null;
      try {
        d = typeof parseFechaFlexible === "function" ? parseFechaFlexible(s) : new Date(s);
      } catch {
        d = new Date(s);
      }
      const t = d instanceof Date ? d.getTime() : 0;
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  }
  __name(waAlertTime, "waAlertTime");
  function waFormatNumber(value) {
    const n = typeof parseMailNumber === "function" ? parseMailNumber(value) : Number(value);
    if (!Number.isFinite(n)) return "Sin datos";
    if (typeof formatMailNumber === "function") {
      return formatMailNumber(n);
    }
    return String(n);
  }
  __name(waFormatNumber, "waFormatNumber");
  function waValue(value, fallback = "\u2014") {
    const s = String(value ?? "").trim();
    return s ? s : fallback;
  }
  __name(waValue, "waValue");
  function waOfferText(item, index, totalShown) {
    const p = normalizeOfferPayload(item?.offer_payload || item || {});
    const raw = p?.raw || {};
    const safe = /* @__PURE__ */ __name((value, fallback = "\u2014") => {
      const s = String(value ?? "").trim();
      return s ? s : fallback;
    }, "safe");
    const clip = /* @__PURE__ */ __name((value, max = 700) => {
      const s = safe(value, "");
      if (!s) return "";
      return s.length > max ? `${s.slice(0, max).trim()}...` : s;
    }, "clip");
    const num = /* @__PURE__ */ __name((value) => {
      const n = typeof parseMailNumber === "function" ? parseMailNumber(value) : Number(value);
      return Number.isFinite(n) ? n : null;
    }, "num");
    const fmt = /* @__PURE__ */ __name((value, fallback = "\u2014") => {
      const n = num(value);
      if (!Number.isFinite(n)) return fallback;
      return typeof formatMailNumber === "function" ? formatMailNumber(n) : String(n);
    }, "fmt");
    const titulo = safe(
      p.cargo || p.materia || p.title || raw.cargo || raw.descripcioncargo || raw.descripcionarea,
      "Oferta APD"
    );
    const distrito = safe(p.distrito || raw.descdistrito);
    const escuela = safe(p.escuela || raw.escuela || raw.nombreestablecimiento);
    const turno = safe(p.turno || raw.turno);
    const jornada = safe(p.jornada || raw.jornada);
    const nivel = safe(p.nivel || p.nivel_modalidad || raw.descnivelmodalidad);
    const curso = safe(p.curso_division || p.cursodivision || raw.cursodivision);
    const modulos = safe(p.modulos || p.hsmodulos || raw.hsmodulos);
    const dias = safe(
      p.dias_horarios || p.diashora || p.horario || raw.diashorarios || raw.dias_horarios
    );
    const desde = safe(p.desde || p.supl_desde || raw.supl_desde, "Sin fecha");
    const hasta = safe(p.hasta || p.supl_hasta || raw.supl_hasta, "Sin fecha");
    const vigencia = safe(p.vigencia, `${desde} / ${hasta}`);
    const cierre = safe(p.fecha_cierre || p.finoferta || raw.finoferta);
    const observaciones = clip(p.observaciones || raw.observaciones || "", 700);
    const totalPostulantes = p.total_postulantes != null && p.total_postulantes !== "" ? String(p.total_postulantes) : "Sin postulados visibles";
    const puntajeMasAlto = p.puntaje_primero != null && p.puntaje_primero !== "" ? fmt(p.puntaje_primero, "Sin datos") : "Sin datos";
    const listadoMasAlto = safe(p.listado_origen_primero, "Sin datos");
    const postuladosUrl = waBuildPostuladosUrl(p);
    const lines = [
      `*${index + 1}/${totalShown} \xB7 ${titulo}*`,
      ``,
      `\u{1F4CD} Distrito: ${distrito}`,
      `\u{1F3EB} Escuela: ${escuela}`,
      `\u{1F552} Turno: ${turno}`,
      `\u{1F4CC} Jornada: ${jornada}`,
      `\u{1F393} Nivel: ${nivel}`,
      `\u{1F4DA} Curso/divisi\xF3n: ${curso}`,
      `\u{1F522} M\xF3dulos: ${modulos}`,
      `\u{1F4C5} D\xEDas/horarios: ${dias}`,
      `\u{1F5D3}\uFE0F Vigencia: ${vigencia}`,
      `\u23F0 Cierre: ${cierre}`
    ];
    if (observaciones) {
      lines.push(`\u{1F4DD} Observaciones: ${observaciones}`);
    }
    lines.push(``);
    lines.push(`\u{1F4CC} *Referencia de postulantes*`);
    lines.push(`\u{1F465} Postulados visibles: ${totalPostulantes}`);
    lines.push(`\u{1F4C8} Puntaje m\xE1s alto: ${puntajeMasAlto}`);
    lines.push(`\u{1F4C4} Listado del m\xE1s alto: ${listadoMasAlto}`);
    if (hasPidEvidence(p)) {
      const chance = buildMailChanceInfo(p);
      const puntajeBase = Number.isFinite(Number(p.pid_puntaje_total_base)) ? Number(p.pid_puntaje_total_base) : num(p.pid_puntaje_total);
      const bonusResidencia = p.pid_residencia_bonus_aplicado ? Number(p.pid_residencia_bonus_puntos || 0) : 0;
      const puntajeFinal = Number.isFinite(Number(p.pid_puntaje_total_final)) ? Number(p.pid_puntaje_total_final) : Number.isFinite(puntajeBase) ? puntajeBase + bonusResidencia : null;
      const primero = num(p.puntaje_primero);
      const diff = Number.isFinite(puntajeFinal) && Number.isFinite(primero) ? puntajeFinal - primero : null;
      lines.push(``);
      lines.push(`\u{1F9E0} *${chance?.title || (p.pid_compatible ? "Compatible con tu PID" : "No compatible con tu PID")}*`);
      lines.push(`\u{1F9FE} Motivo PID: ${safe(p.pid_reason || (p.pid_compatible ? "Compatible con tu PID" : "No compatible con tu PID"))}`);
      lines.push(`\u{1F4DA} \xC1rea PID: ${safe(p.pid_area || p.area || p.materia)}`);
      lines.push(`\u{1F5C2}\uFE0F Bloque PID: ${safe(p.pid_bloque || p.bloque_pid)}`);
      lines.push(`\u{1F4CA} Puntaje PID base: ${Number.isFinite(puntajeBase) ? fmt(puntajeBase) : "\u2014"}`);
      if (p.pid_residencia_bonus_aplicado) {
        lines.push(`\u2795 Bonus residencia: +${fmt(bonusResidencia, "0")}`);
        lines.push(`\u{1F3E0} Distrito residencia: ${safe(p.pid_distrito_residencia)}`);
      } else {
        lines.push(`\u2795 Bonus residencia: No`);
      }
      lines.push(`\u2B50 Tu puntaje total: ${Number.isFinite(puntajeFinal) ? fmt(puntajeFinal) : "\u2014"}`);
      lines.push(`\u{1F9F7} Listado/a\xF1o PID: ${safe(p.pid_listado)} \xB7 ${safe(p.pid_anio)}`);
      if (Number.isFinite(diff)) {
        const sign = diff > 0 ? "+" : "";
        lines.push(`\u{1F9EE} Diferencia vs m\xE1s alto: ${sign}${fmt(diff)}`);
      }
      if (chance?.text) {
        lines.push(`\u2139\uFE0F ${clip(chance.text, 500)}`);
      }
    }
    if (postuladosUrl) {
      lines.push(``);
      lines.push(`\u{1F517} Postulados: ${postuladosUrl}`);
    }
    return lines.join("\n");
  }
  __name(waOfferText, "waOfferText");
  async function waSend(env2, to, text, context = "wa_send") {
    try {
      if (typeof trySendWhatsAppText === "function") {
        const r = await trySendWhatsAppText(env2, to, text, context);
        if (r && r.ok === false) {
          console.error("WHATSAPP SEND FAIL", {
            context,
            to,
            response: r
          });
        }
        return r || { ok: true };
      }
      await sendWhatsAppText(env2, to, text);
      return { ok: true };
    } catch (err) {
      console.error("WHATSAPP SEND ERROR", {
        context,
        to,
        error: String(err?.message || err || "")
      });
      return {
        ok: false,
        error: String(err?.message || err || "")
      };
    }
  }
  __name(waSend, "waSend");
  async function waLoadStoredAlerts(env2, userId, limit = 50) {
    const rows = await supabaseSelect(
      env2,
      `user_offer_state?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=offer_id,offer_payload,last_seen_at&order=last_seen_at.desc&limit=${encodeURIComponent(String(limit))}`
    ).catch((err) => {
      console.error("WHATSAPP STORED ALERTS READ ERROR:", err);
      return [];
    });
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      offer_id: row?.offer_id || "",
      offer_payload: normalizeOfferPayload(row?.offer_payload || {}),
      last_seen_at: row?.last_seen_at || ""
    })).filter((item) => {
      const p = item.offer_payload || {};
      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.codigo || p.cargo || p.materia || p.title);
    });
  }
  __name(waLoadStoredAlerts, "waLoadStoredAlerts");
  async function waEnrichVisibleAlerts(env2, alerts) {
    const source = Array.isArray(alerts) ? alerts : [];
    const enriched = await Promise.all(
      source.map(async (item) => {
        const base = normalizeOfferPayload(item?.offer_payload || item || {});
        const ids = waGetOfertaDetalle(base);
        if (!ids.oferta && !ids.detalle) {
          return {
            ...item,
            offer_payload: base
          };
        }
        try {
          const resumen = await Promise.race([
            obtenerResumenPostulantesABC(ids.oferta, ids.detalle),
            new Promise(
              (_, reject) => setTimeout(() => reject(new Error("timeout_postulantes_abc")), 4500)
            )
          ]);
          return {
            ...item,
            offer_payload: normalizeOfferPayload({
              ...base,
              total_postulantes: resumen?.total_postulantes ?? base.total_postulantes ?? null,
              puntaje_primero: resumen?.puntaje_primero ?? base.puntaje_primero ?? null,
              listado_origen_primero: resumen?.listado_origen_primero || base.listado_origen_primero || ""
            })
          };
        } catch (err) {
          console.error("WHATSAPP POSTULANTES ENRICH ERROR", {
            oferta: ids.oferta || null,
            detalle: ids.detalle || null,
            error: String(err?.message || err || "")
          });
          return {
            ...item,
            offer_payload: base
          };
        }
      })
    );
    return enriched;
  }
  __name(waEnrichVisibleAlerts, "waEnrichVisibleAlerts");
  try {
    if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
      return json2({
        ok: true,
        skipped: true,
        reason: "missing_config",
        phone_number_id_ready: !!env.WHATSAPP_PHONE_NUMBER_ID,
        access_token_ready: !!env.WHATSAPP_ACCESS_TOKEN
      });
    }
    const body = await request.json().catch(() => ({}));
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let handled = 0;
    let delivered = 0;
    const results = [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of messages) {
          handled += 1;
          const messageId = String(message?.id || "").trim();
          if (messageId) {
            const dedupeKey = whatsappMessageDedupeKey(messageId);
            if (await wasInboundEventProcessed(env, dedupeKey)) {
              results.push({
                message_id: messageId,
                duplicate: true
              });
              continue;
            }
            await markInboundEventProcessed(
              env,
              dedupeKey,
              WHATSAPP_MESSAGE_DEDUPE_TTL_SECONDS
            ).catch(() => null);
          }
          const from = String(message?.from || "").trim();
          if (!from) {
            results.push({
              message_id: messageId || null,
              skipped: true,
              reason: "missing_from"
            });
            continue;
          }
          const inboundText = String(
            message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || ""
          ).trim();
          const user = await findUserByWhatsAppNumber(env, from);
          if (!user?.id) {
            await waSend(
              env,
              from,
              "No encontr\xE9 una cuenta de APDocentePBA asociada a este n\xFAmero.\n\nGuard\xE1 tu celular en el panel y prob\xE1 de nuevo:\nhttps://alertasapd.com.ar",
              "user_not_found"
            );
            results.push({
              message_id: messageId || null,
              delivered: false,
              reason: "user_not_found"
            });
            continue;
          }
          if (user.activo === false) {
            await waSend(
              env,
              from,
              "Tu usuario figura inactivo. Revis\xE1 tu cuenta en el panel.\n\nhttps://alertasapd.com.ar",
              "inactive_user"
            );
            results.push({
              message_id: messageId || null,
              delivered: false,
              user_id: user.id,
              reason: "inactive_user"
            });
            continue;
          }
          await saveWhatsAppState(env, user.id, {
            connected: true,
            phone: from,
            phone_masked: typeof maskPhone === "function" ? maskPhone(from) : "",
            last_inbound_at: (/* @__PURE__ */ new Date()).toISOString()
          }).catch(() => null);
          const entitlement = await resolveWhatsAppEntitlement(env, user.id).catch(() => ({
            allowed: false,
            plan_code: "UNKNOWN",
            plan_name: "UNKNOWN"
          }));
          if (!entitlement?.allowed) {
            await waSend(
              env,
              from,
              "WhatsApp queda reservado para el plan Insigne.\n\nEn tu plan actual segu\xEDs teniendo email y Telegram.",
              "plan_not_allowed"
            );
            results.push({
              message_id: messageId || null,
              delivered: false,
              user_id: user.id,
              reason: "plan_not_allowed",
              plan_code: entitlement?.plan_code || null
            });
            continue;
          }
          const prefs = await obtenerPreferenciasUsuario(env, user.id).catch(() => null);
          await saveWhatsAppState(env, user.id, {
            connected: true,
            phone: from,
            alerts_requested: !!prefs?.alertas_whatsapp,
            alerts_enabled: true,
            last_inbound_at: (/* @__PURE__ */ new Date()).toISOString()
          }).catch(() => null);
          if (!waIsAlertasCommand(inboundText)) {
            await waSend(
              env,
              from,
              "Hola. Escrib\xED ALERTAS y te devuelvo las 5 ofertas compatibles m\xE1s recientes.\n\nhttps://alertasapd.com.ar",
              "help"
            );
            delivered += 1;
            results.push({
              message_id: messageId || null,
              delivered: true,
              user_id: user.id,
              help: true
            });
            continue;
          }
          await waSend(
            env,
            from,
            "\u{1F50E} Estoy consultando tus alertas compatibles...",
            "lookup_start"
          );
          const storedAlerts = await waLoadStoredAlerts(env, user.id, 50);
          const sortedAlerts = storedAlerts.slice().sort((a, b) => waAlertTime(b) - waAlertTime(a));
          const totalAlerts = sortedAlerts.length;
          const MAX_WHATSAPP_ALERTS = 5;
          const visibleBaseAlerts = sortedAlerts.slice(0, MAX_WHATSAPP_ALERTS).map((item) => ({
            offer_payload: normalizeOfferPayload(item?.offer_payload || item || {}),
            last_seen_at: item?.last_seen_at || ""
          }));
          const visibleAlerts = await waEnrichVisibleAlerts(env, visibleBaseAlerts);
          const visibleAlertsForRender = applyPidVisibilityToAlerts(
            visibleAlerts,
            entitlement?.plan_code
          );
          if (!visibleAlertsForRender.length) {
            await waSend(
              env,
              from,
              "No encontr\xE9 alertas compatibles guardadas ahora.\n\nRevis\xE1 el panel:\nhttps://alertasapd.com.ar",
              "no_stored_alerts"
            );
            delivered += 1;
            results.push({
              message_id: messageId || null,
              delivered: true,
              user_id: user.id,
              total_alerts: 0,
              shown_alerts: 0,
              source: "stored"
            });
            continue;
          }
          const intro = totalAlerts > visibleAlerts.length ? `Encontr\xE9 ${totalAlerts} alertas compatibles para vos.

Te mando las ${visibleAlertsForRender.length} m\xE1s recientes para no saturarte WhatsApp.

Para ver el carrusel completo entr\xE1 al panel:
https://alertasapd.com.ar` : `Encontr\xE9 ${totalAlerts} alerta(s) compatible(s) para vos.

Te mando las m\xE1s recientes.`;
          await waSend(env, from, intro, "alert_intro");
          let sentParts = 0;
          let failedParts = 0;
          for (let i = 0; i < visibleAlertsForRender.length; i++) {
            const sendResult = await waSend(
              env,
              from,
              waOfferText(visibleAlertsForRender[i], i, visibleAlertsForRender.length),
              "alert_item"
            );
            if (sendResult?.ok !== false) {
              sentParts += 1;
            } else {
              failedParts += 1;
            }
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
          if (totalAlerts > visibleAlertsForRender.length) {
            await waSend(
              env,
              from,
              `Hay ${totalAlerts - visibleAlertsForRender.length} oferta(s) m\xE1s compatibles.

Revis\xE1 el resto en el panel:
https://alertasapd.com.ar`,
              "alert_more"
            );
          }
          if (failedParts > 0) {
            await waSend(
              env,
              from,
              `Pude enviar ${sentParts} detalle(s), pero ${failedParts} no salieron correctamente.

Pod\xE9s ver todo en el panel:
https://alertasapd.com.ar`,
              "partial_failure"
            );
          }
          delivered += sentParts > 0 ? 1 : 0;
          results.push({
            message_id: messageId || null,
            delivered: sentParts > 0,
            user_id: user.id,
            total_alerts: totalAlerts,
            shown_alerts: visibleAlertsForRender.length,
            plan_code: entitlement?.plan_code || null,
            pid_visible: canShowPidForPlan(entitlement),
            sent_parts: sentParts,
            failed_parts: failedParts,
            source: "stored_enriched",
            mode: "latest_5_only"
          });
        }
      }
    }
    return json2({
      ok: true,
      handled,
      delivered,
      channel_mode: "query_only",
      results
    });
  } catch (err) {
    console.error("WHATSAPP WEBHOOK ERROR", err);
    return json2(
      {
        ok: false,
        error: String(err?.message || err || "webhook_error")
      },
      Number(err?.status || 500) || 500
    );
  }
}
__name(handleWhatsAppWebhook, "handleWhatsAppWebhook");
__name2(handleWhatsAppWebhook, "handleWhatsAppWebhook");
function safeProvinciaBackfillStatus(message = null) {
  return { ok: true, scope: "PROVINCIA_FULL", status: "idle", district_index: 0, district_name: null, next_page: 0, pages_processed: 0, districts_completed: 0, offers_processed: 0, last_batch_count: 0, total_districts: 0, progress_pct: 0, started_at: null, finished_at: null, last_run_at: null, updated_at: null, last_error: message || null, retryable: false, stale_running: false, failed_page: 0 };
}
__name(safeProvinciaBackfillStatus, "safeProvinciaBackfillStatus");
__name2(safeProvinciaBackfillStatus, "safeProvinciaBackfillStatus");
function safeProvinciaResumen(message = null) {
  return { ok: true, empty: true, ventana_dias: 30, total_ofertas: 0, activas_estimadas: 0, cerradas_estimadas: 0, districts_with_activity: 0, coverage_hint: null, nuevas_7d: 0, top_distritos: [], top_cargos: [], top_turnos: [], top_escuelas: [], state_breakdown: { activas: 0, designadas: 0, anuladas: 0, desiertas: 0, cerradas: 0 }, leaders: { matematica: null, ingles: null }, latest_rows: [], banner_items: [{ title: "Radar provincial", text: message || "Todavia no hay suficiente historial provincial para construir insights serios." }], scan_state: null };
}
__name(safeProvinciaResumen, "safeProvinciaResumen");
__name2(safeProvinciaResumen, "safeProvinciaResumen");
async function debugLomasPreceptor(env, userId) {
  const user = await obtenerUsuario(env, userId);
  if (!user) {
    return { ok: false, message: "Usuario no encontrado" };
  }
  const prefs = await obtenerPreferenciasUsuario(env, userId);
  if (!prefs) {
    return { ok: false, message: "Usuario sin preferencias" };
  }
  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const distritoObjetivo = "LOMAS DE ZAMORA";
  const info = await traerOfertasAPDDeUnDistrito(distritoObjetivo);
  const docs = Array.isArray(info?.docs) ? info.docs : [];
  const candidatosPR = docs.filter((of) => {
    const texto = norm([
      of?.descripcioncargo,
      of?.cargo,
      of?.descripcionarea,
      of?.materia,
      of?.asignatura,
      of?.descripcionmateria
    ].filter(Boolean).join(" "));
    return texto.includes("PRECEPTOR") || texto.includes("PRECEPTORIA") || texto.includes("(PR)") || texto.includes("/PR");
  });
  const evaluados = candidatosPR.map((of) => {
    const distrito = matchDistritos(of, prefsCanon);
    const cargosMaterias = matchCargosMaterias(of, prefsCanon);
    const turno = matchTurno(of, prefsCanon);
    const nivelModalidad = matchNivelModalidad(of, prefsCanon);
    const final = coincideOfertaConPreferenciasAPD(of, prefsCanon);
    return {
      iddetalle: of?.iddetalle || of?.id || null,
      idoferta: of?.idoferta || null,
      descdistrito: of?.descdistrito || "",
      cargo_texto: [
        of?.descripcioncargo,
        of?.cargo,
        of?.descripcionarea,
        of?.materia,
        of?.asignatura,
        of?.descripcionmateria
      ].filter(Boolean).join(" | "),
      distrito,
      cargosMaterias,
      turno,
      nivelModalidad,
      final_match: !!final?.match,
      final_motivo: final?.motivo || "",
      detalle_final: final?.detalle || {}
    };
  });
  return {
    ok: true,
    user_id: userId,
    prefs_originales: prefs,
    prefs_canonizadas: prefsCanon,
    distrito_debug: distritoObjetivo,
    fetch_info: info,
    total_docs_distrito: docs.length,
    total_candidatos_pr: candidatosPR.length,
    candidatos_pr_preview: evaluados.slice(0, 25)
  };
}
__name(debugLomasPreceptor, "debugLomasPreceptor");
var SENSITIVE_TEST_PATHS = /* @__PURE__ */ new Set(["/test-mail", "/test-email-sweep", "/test-digest", "/api/test-db", "/api/whatsapp/test-send", "/api/debug-lomas-pr", "/api/provincia/backfill-kick"]);
function requireAdminTestSecret(env, request) {
  const configured = String(env.ADMIN_TEST_SECRET || "").trim();
  if (!configured) {
    return adminJson({ ok: false, error: "Test endpoints disabled" }, 503);
  }
  const provided = String(request.headers.get("X-Admin-Test-Secret") || "").trim();
  if (!provided || provided !== configured) {
    return adminJson({ ok: false, error: "No autorizado" }, 401);
  }
  return null;
}
__name(requireAdminTestSecret, "requireAdminTestSecret");
__name2(requireAdminTestSecret, "requireAdminTestSecret");
async function handleEmailAlertsHealth(env) {
  const latest = await supabaseSelect(
    env,
    "notification_delivery_logs?channel=eq.email&select=created_at,status&order=created_at.desc&limit=1"
  ).catch(() => []);
  const pending = await supabaseSelect(
    env,
    "pending_notifications?channel=eq.email&status=eq.pending&select=id&limit=101"
  ).catch(() => []);
  const last = Array.isArray(latest) ? latest[0] || null : null;
  return json2({
    ok: true,
    service: "email-alerts",
    version: HOTFIX_VERSION,
    provider_configured: !!env.BREVO_API_KEY,
    pending_email_count: Array.isArray(pending) ? pending.length : 0,
    pending_count_capped: Array.isArray(pending) && pending.length >= 101,
    latest_delivery_at: last?.created_at || null,
    latest_delivery_status: last?.status || null
  });
}
__name(handleEmailAlertsHealth, "handleEmailAlertsHealth");
async function telemetrySupabaseRequest(env, path, method = "GET", payload = null, returnRepresentation = false) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: returnRepresentation ? "return=representation" : "return=minimal"
    },
    body: payload == null ? void 0 : JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase telemetry ${method} ${path}: ${res.status} ${text.slice(0, 700)}`);
  if (!returnRepresentation || !text) return null;
  const data = JSON.parse(text);
  return Array.isArray(data) ? data[0] || null : data;
}
__name(telemetrySupabaseRequest, "telemetrySupabaseRequest");
async function safeInsertSystemError(env, origin, err, detail = null) {
  try {
    const message = String(err?.message || err || "Error desconocido").slice(0, 900);
    const stack = String(err?.stack || "").slice(0, 3e3);
    const extra = detail && typeof detail === "object" ? JSON.stringify(detail).slice(0, 1800) : String(detail || "").slice(0, 1800);
    await telemetrySupabaseRequest(env, "errores_sistema", "POST", {
      origen: String(origin || "worker_cron").slice(0, 120),
      mensaje: message,
      detalle: [stack, extra].filter(Boolean).join("\n").slice(0, 4800)
    });
  } catch (telemetryErr) {
    console.error("ERROR TELEMETRY WRITE FAILED", String(telemetryErr?.message || telemetryErr || ""));
  }
}
__name(safeInsertSystemError, "safeInsertSystemError");
async function recordObservedEmailCron(env, startedAt, result, slotKey) {
  try {
    const failed = Number(result?.failed_count || 0);
    const attempts = Number(result?.send_attempts || 0);
    const sent = Number(result?.sent_count ?? Math.max(0, attempts - failed));
    const processed = Number(result?.processed_users || 0);
    const safeFailedSamples = (Array.isArray(result?.failed_samples) ? result.failed_samples : []).slice(0, 10).map((item) => ({
      user_id: String(item?.user_id || "") || null,
      reason: String(item?.reason || "") || null,
      error: String(item?.error || item?.provider_response?.error || "").slice(0, 500) || null
    }));
    const safeSkippedSamples = (Array.isArray(result?.skipped_user_samples) ? result.skipped_user_samples : []).slice(0, 10).map((item) => ({
      user_id: String(item?.user_id || "") || null,
      stage: String(item?.stage || "") || null,
      reason: String(item?.reason || "") || null,
      error: String(item?.error || "").slice(0, 500) || null
    }));
    const safeMeta = {
      job_name: "email_alerts_cron",
      slot_key: String(slotKey || ""),
      finished: !!result?.finished,
      processed_users: processed,
      send_attempts: attempts,
      sent_count: sent,
      failed_count: failed,
      skipped_count: Number(result?.skipped_count || 0),
      cursor_user_id: String(result?.cursor_user_id || "") || null,
      skip_reason_counts: result?.skip_reason_counts && typeof result.skip_reason_counts === "object" ? result.skip_reason_counts : {},
      skipped_user_samples: safeSkippedSamples,
      failed_samples: safeFailedSamples
    };
    await telemetrySupabaseRequest(env, "worker_runs", "POST", {
      fecha_inicio: startedAt || (/* @__PURE__ */ new Date()).toISOString(),
      fecha_fin: (/* @__PURE__ */ new Date()).toISOString(),
      estado: failed > 0 ? "warning" : "success",
      usuarios_total: processed,
      alertas_total: sent,
      errores: failed,
      detalle: JSON.stringify(safeMeta).slice(0, 12e3)
    });
    if (failed > 0) {
      await safeInsertSystemError(env, "email_alerts_cron", new Error(`${failed} fallos en barrido de email`), safeMeta);
    }
  } catch (err) {
    console.error("EMAIL CRON TELEMETRY FAILED", String(err?.message || err || ""));
  }
}
__name(recordObservedEmailCron, "recordObservedEmailCron");
var ACCOUNT_PBKDF2_ITERATIONS_V1 = 1e5;
function accountToHexV1(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(accountToHexV1, "accountToHexV1");
function accountFromHexV1(hex) {
  const clean = String(hex || "").trim();
  if (!clean || clean.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(clean)) throw new Error("Salt/hash inv\xE1lido");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
__name(accountFromHexV1, "accountFromHexV1");
function accountRandomHexV1(bytes = 16) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return accountToHexV1(value);
}
__name(accountRandomHexV1, "accountRandomHexV1");
async function accountSha256HexV1(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return accountToHexV1(new Uint8Array(hash));
}
__name(accountSha256HexV1, "accountSha256HexV1");
async function accountPbkdf2HexV1(password, saltHex, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: accountFromHexV1(saltHex), iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return accountToHexV1(new Uint8Array(bits));
}
__name(accountPbkdf2HexV1, "accountPbkdf2HexV1");
async function accountHashPasswordV1(password) {
  const plain = String(password || "");
  if (!plain) throw new Error("Contrase\xF1a vac\xEDa");
  const salt = accountRandomHexV1(16);
  const hash = await accountPbkdf2HexV1(plain, salt, ACCOUNT_PBKDF2_ITERATIONS_V1);
  return `pbkdf2_sha256$${ACCOUNT_PBKDF2_ITERATIONS_V1}$${salt}$${hash}`;
}
__name(accountHashPasswordV1, "accountHashPasswordV1");
async function accountVerifyPasswordV1(storedPassword, plainPassword) {
  const stored = String(storedPassword || "").trim();
  const plain = String(plainPassword || "");
  if (!stored || !plain) return { ok: false, needsUpgrade: false };
  if (stored.startsWith("pbkdf2_sha256$")) {
    const parts = stored.split("$");
    if (parts.length !== 4) return { ok: false, needsUpgrade: false };
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expected = parts[3];
    if (!Number.isInteger(iterations) || iterations < 1e4 || iterations > 1e6 || !salt || !expected) {
      return { ok: false, needsUpgrade: false };
    }
    if (iterations > ACCOUNT_PBKDF2_ITERATIONS_V1) {
      return { ok: false, needsUpgrade: false, unsupportedPbkdf2: true };
    }
    try {
      const actual = await accountPbkdf2HexV1(plain, salt, iterations);
      return { ok: actual === expected, needsUpgrade: actual === expected && iterations < ACCOUNT_PBKDF2_ITERATIONS_V1 };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  if (stored === plain) return { ok: true, needsUpgrade: true };
  const legacySha = await accountSha256HexV1(plain);
  if (stored === legacySha) return { ok: true, needsUpgrade: true };
  return { ok: false, needsUpgrade: false };
}
__name(accountVerifyPasswordV1, "accountVerifyPasswordV1");
async function accountReadUserV1(env, userId, includePassword = false) {
  const select = includePassword ? "id,nombre,apellido,email,celular,password_hash,activo" : "id,nombre,apellido,email,celular,activo";
  const rows = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=${select}&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
__name(accountReadUserV1, "accountReadUserV1");
async function handleAccountProfileSecureV1(request, env) {
  const authUser = await getSessionUserByBearer(env, request);
  if (!authUser?.id) return json2({ ok: false, message: "No autenticado" }, 401);
  if (request.method === "GET") {
    const user2 = await accountReadUserV1(env, authUser.id, false);
    if (!user2?.id) return json2({ ok: false, message: "Usuario no encontrado" }, 404);
    return json2({ ok: true, user: { id: user2.id, nombre: user2.nombre || "", apellido: user2.apellido || "", email: user2.email || "", celular: user2.celular || "" } });
  }
  if (request.method !== "PATCH") return json2({ ok: false, message: "M\xE9todo no permitido" }, 405);
  const body = await request.json().catch(() => ({}));
  const nombre = String(body?.nombre || "").trim();
  const apellido = String(body?.apellido || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const celular = String(body?.celular || "").trim();
  if (!nombre || !apellido || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json2({ ok: false, message: "Datos personales inv\xE1lidos" }, 400);
  }
  const matches = await supabaseSelect(
    env,
    `users?email=ilike.${encodeURIComponent(email)}&select=id&limit=10`
  ).catch(() => []);
  const taken = (Array.isArray(matches) ? matches : []).some((row) => String(row?.id || "") !== String(authUser.id));
  if (taken) return json2({ ok: false, message: "Ese email ya est\xE1 registrado en otra cuenta" }, 409);
  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(authUser.id)}`, { nombre, apellido, email, celular });
  const user = await accountReadUserV1(env, authUser.id, false);
  return json2({ ok: true, user: { id: user?.id || authUser.id, nombre: user?.nombre || nombre, apellido: user?.apellido || apellido, email: user?.email || email, celular: user?.celular || celular } });
}
__name(handleAccountProfileSecureV1, "handleAccountProfileSecureV1");
async function handleAccountChangePasswordSecureV1(request, env) {
  const authUser = await getSessionUserByBearer(env, request);
  if (!authUser?.id) return json2({ ok: false, message: "No autenticado" }, 401);
  if (request.method !== "POST") return json2({ ok: false, message: "M\xE9todo no permitido" }, 405);
  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body?.current_password || "");
  const newPassword = String(body?.new_password || "");
  if (newPassword.length < 6) return json2({ ok: false, message: "La nueva contrase\xF1a debe tener al menos 6 caracteres" }, 400);
  const user = await accountReadUserV1(env, authUser.id, true);
  if (!user?.id) return json2({ ok: false, message: "Usuario no encontrado" }, 404);
  const stored = String(user.password_hash || "").trim();
  if (stored) {
    if (!currentPassword) return json2({ ok: false, message: "Ingres\xE1 tu contrase\xF1a actual" }, 400);
    const verified = await accountVerifyPasswordV1(stored, currentPassword);
    if (!verified.ok) return json2({ ok: false, message: "La contrase\xF1a actual no coincide" }, 401);
  }
  const passwordHash = await accountHashPasswordV1(newPassword);
  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(authUser.id)}`, { password_hash: passwordHash });
  return json2({ ok: true, message: "Contrase\xF1a actualizada" });
}
__name(handleAccountChangePasswordSecureV1, "handleAccountChangePasswordSecureV1");
var worker_hotfix_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders2() });
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === `${API_URL_PREFIX3}/account/profile`) {
      return await handleAccountProfileSecureV1(request, env);
    }
    if (path === `${API_URL_PREFIX3}/account/change-password`) {
      return await handleAccountChangePasswordSecureV1(request, env);
    }
    const protectedSessionGetPaths = /* @__PURE__ */ new Set([
      `${API_URL_PREFIX3}/mi-plan`,
      `${API_URL_PREFIX3}/mis-alertas`,
      `${API_URL_PREFIX3}/historico-resumen`
    ]);
    const protectedSessionPostPaths = /* @__PURE__ */ new Set([
      `${API_URL_PREFIX3}/guardar-preferencias`,
      `${API_URL_PREFIX3}/capturar-historico-apd`,
      `${API_URL_PREFIX3}/mercadopago/create-checkout-link`,
      `${API_URL_PREFIX3}/whatsapp/test-send`
    ]);
    if (protectedSessionGetPaths.has(path) || protectedSessionPostPaths.has(path)) {
      const authUser = await getSessionUserByBearer(env, request);
      if (!authUser?.id) return json2({ ok: false, message: "No autenticado" }, 401);
      if (request.method === "GET" || request.method === "HEAD") {
        url.searchParams.set("user_id", authUser.id);
        request = new Request(url.toString(), {
          method: request.method,
          headers: new Headers(request.headers)
        });
      } else {
        const contentType = request.headers.get("Content-Type") || request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return json2({ ok: false, message: "Content-Type no soportado" }, 415);
        }
        const body = await request.clone().json().catch(() => ({}));
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        request = new Request(request.url, {
          method: request.method,
          headers,
          body: JSON.stringify({ ...body || {}, user_id: authUser.id })
        });
      }
    }
    if (SENSITIVE_TEST_PATHS.has(path)) {
      const denied = requireAdminTestSecret(env, request);
      if (denied) return denied;
    }
    if (path === `${API_URL_PREFIX3}/email-alerts-health` && request.method === "GET") {
      return await handleEmailAlertsHealth(env);
    }
    if (path === `${API_URL_PREFIX3}/version` && request.method === "GET") {
      return json2({
        ok: true,
        version: HOTFIX_VERSION,
        worker_version: env.WORKER_URL || "ancient-wildflower-cd37"
      });
    }
    if (path === `${API_URL_PREFIX3}/debug-cargo` && request.method === "GET") {
      try {
        const distrito = url.searchParams.get("distrito") || "GENERAL PUEYRREDON";
        const cargo = url.searchParams.get("cargo") || "(NTI) NTICX";
        const variantes = [
          cargo,
          "NTICX (NTI)",
          "NTICX",
          "NTI"
        ];
        const resultados = [];
        const vistos = /* @__PURE__ */ new Set();
        for (const variante of variantes) {
          const clave = norm(variante);
          if (!clave || vistos.has(clave)) continue;
          vistos.add(clave);
          const r = await debugBuscarCargoExactoEnABC(distrito, variante);
          resultados.push(r);
        }
        return json2({
          ok: true,
          distrito,
          cargo_original: cargo,
          pruebas: resultados
        });
      } catch (err) {
        return json2({
          ok: false,
          error: String(err?.message || err)
        }, 500);
      }
    }
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
        const targetUserId = String(
          url.searchParams.get("target_user_id") || url.searchParams.get("user_id") || ""
        ).trim();
        const debug = url.searchParams.get("debug") === "1";
        const dryRun = url.searchParams.get("dry_run") === "1";
        const manualLimit = clampInt(
          url.searchParams.get("limit"),
          1,
          10,
          1
        );
        const r = await runEmailAlertsSweep(env, {
          source: "manual_test",
          target_user_id: targetUserId || void 0,
          debug,
          debug_user_id: targetUserId || "",
          dry_run: dryRun,
          manual_limit: manualLimit
        });
        return json(r, 200);
      } catch (e) {
        return json({
          ok: false,
          error: String(e?.message || e)
        }, 500);
      }
    }
    if (path === `${API_URL_PREFIX3}/debug-lomas-pr` && request.method === "GET") {
      try {
        const userId = String(url.searchParams.get("user_id") || "").trim();
        if (!userId) {
          return json2({ ok: false, message: "Falta user_id" }, 400);
        }
        const data = await debugLomasPreceptor(env, userId);
        return json2(data, data?.ok ? 200 : 400);
      } catch (err) {
        return json2({
          ok: false,
          error: String(err?.message || err)
        }, 500);
      }
    }
    return await worker_default.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    const emailCronStartedAt = (/* @__PURE__ */ new Date()).toISOString();
    const slot = getArgentinaDigestSlotInfo(event?.scheduledTime || Date.now());
    const kv = getChannelStateStore(env);
    if (!kv) {
      console.log("Sin KV de estado, no envio para evitar duplicados");
      return;
    }
    const ACTIVE_SLOT_KEY = "email:active_slot_key";
    let activeSlotKey = String(await kv.get(ACTIVE_SLOT_KEY).catch(() => "") || "").trim();
    const emailCronExpr = String(event?.cron || "").trim();
    const isContinuationCron = emailCronExpr === "1-59/2 * * * *";
    const isPrimaryEmailCron = emailCronExpr === "0 01 * * *" || emailCronExpr === "0 17 * * *" || emailCronExpr === "0 21 * * *";
    const isRecognizedEmailCron = isPrimaryEmailCron || isContinuationCron;
    if (!isRecognizedEmailCron) return;
    if (isContinuationCron && !activeSlotKey) return;
    let bypassFinishedForRecovery = false;
    if (slot.slot_hour && slot.slot_key) {
      const currentFinishedKey = `email:slot:${slot.slot_key}:finished`;
      const currentFinished = await kv.get(currentFinishedKey).catch(() => null);
      if (!activeSlotKey && !currentFinished) {
        activeSlotKey = slot.slot_key;
        await kv.put(ACTIVE_SLOT_KEY, activeSlotKey, {
          expirationTtl: 60 * 60 * 36
        }).catch(() => null);
        await kv.put(`email:slot:${activeSlotKey}:started_at`, (/* @__PURE__ */ new Date()).toISOString(), {
          expirationTtl: 60 * 60 * 36
        }).catch(() => null);
        console.log("CRON EMAIL SLOT START", activeSlotKey);
      } else if (activeSlotKey && activeSlotKey !== slot.slot_key) {
        console.log("CRON EMAIL SLOT PENDING, continuo slot anterior:", activeSlotKey, "nuevo slot:", slot.slot_key);
      } else if (currentFinished) {
        console.log("CRON EMAIL SLOT YA FINALIZADO:", slot.slot_key);
      }
    }
    if (!activeSlotKey) {
      const recoverySlot = getMostRecentArgentinaDigestSlotInfo(event?.scheduledTime || Date.now());
      if (recoverySlot?.slot_key) {
        const recoveryFinishedKey = "email:slot:" + recoverySlot.slot_key + ":finished";
        const recoveryFinished = await kv.get(recoveryFinishedKey).catch(() => null);
        const recoveryForceKey = "email:slot:" + recoverySlot.slot_key + ":recovery_force_once_v3";
        const recoveryForced = await kv.get(recoveryForceKey).catch(() => null);
        const forceRecoveryOnce = recoverySlot.slot_key === "2026-09-16_22" && !recoveryForced;
        if (!recoveryFinished || forceRecoveryOnce) {
          if (forceRecoveryOnce) {
            await kv.delete(recoveryFinishedKey).catch(() => null);
            await kv.delete("email:slot:" + recoverySlot.slot_key + ":cursor_user_id").catch(() => null);
            bypassFinishedForRecovery = true;
            await kv.put(recoveryForceKey, (/* @__PURE__ */ new Date()).toISOString(), { expirationTtl: 60 * 60 * 48 });
            console.log("EMAIL RECOVERY FORCE ONCE", recoverySlot.slot_key);
          }
          activeSlotKey = recoverySlot.slot_key;
          await kv.put(ACTIVE_SLOT_KEY, activeSlotKey, { expirationTtl: 60 * 60 * 36 }).catch(() => null);
          await kv.put("email:slot:" + activeSlotKey + ":started_at", (/* @__PURE__ */ new Date()).toISOString(), { expirationTtl: 60 * 60 * 36 }).catch(() => null);
          console.log("CRON EMAIL SLOT RECOVERY START", activeSlotKey);
        }
      }
      if (!activeSlotKey) return;
    }
    const activeFinishedKey = "email:slot:" + activeSlotKey + ":finished";
    const activeFinished = await kv.get(activeFinishedKey).catch(() => null);
    if (activeFinished && !bypassFinishedForRecovery) {
      const cleanedSlotKey = activeSlotKey;
      await kv.delete(ACTIVE_SLOT_KEY).catch(() => null);
      console.log("CRON EMAIL ACTIVE SLOT CLEANED", cleanedSlotKey);
      activeSlotKey = "";
      if (slot.slot_hour && slot.slot_key && cleanedSlotKey !== slot.slot_key) {
        const currentFinishedKey = `email:slot:${slot.slot_key}:finished`;
        const currentFinished = await kv.get(currentFinishedKey).catch(() => null);
        if (!currentFinished) {
          activeSlotKey = slot.slot_key;
          await kv.put(ACTIVE_SLOT_KEY, activeSlotKey, {
            expirationTtl: 60 * 60 * 36
          }).catch(() => null);
          await kv.put(`email:slot:${activeSlotKey}:started_at`, (/* @__PURE__ */ new Date()).toISOString(), {
            expirationTtl: 60 * 60 * 36
          }).catch(() => null);
          console.log("CRON EMAIL SLOT START AFTER STALE CLEANUP", activeSlotKey);
        }
      }
      if (!activeSlotKey) return;
    }
    let result = null;
    try {
      result = await runEmailAlertsSweep(env, {
        source: "cron_slot",
        slot_key: activeSlotKey,
        max_users: 2
      });
    } catch (err) {
      const failureResult = {
        ok: false,
        finished: false,
        processed_users: 0,
        send_attempts: 0,
        sent_count: 0,
        skipped_count: 0,
        failed_count: 1,
        failed_samples: [{
          user_id: null,
          reason: "sweep_unhandled",
          error: String(err?.message || err || "").slice(0, 500)
        }]
      };
      console.error("CRON EMAIL SWEEP UNHANDLED", err);
      ctx.waitUntil(recordObservedEmailCron(env, emailCronStartedAt, failureResult, activeSlotKey));
      return;
    }
    console.log("CRON EMAIL SWEEP RESULT", JSON.stringify(result || {}));
    ctx.waitUntil(recordObservedEmailCron(env, emailCronStartedAt, result, activeSlotKey));
    if (result?.finished) {
      await kv.put(activeFinishedKey, (/* @__PURE__ */ new Date()).toISOString(), {
        expirationTtl: 60 * 60 * 36
      }).catch(() => null);
      await kv.delete(ACTIVE_SLOT_KEY).catch(() => null);
      console.log("CRON EMAIL SLOT FINISHED", activeSlotKey);
    }
  }
};
async function handleTestMail(env) {
  const r = await enviarMailBrevo(
    "martin.nicolas.podubinio@gmail.com",
    "Martin",
    "PRUEBA APDocentePBA \u{1F680}",
    "<h1>Funciona desde Worker</h1>",
    env
  );
  return jsonResponse(r, 200);
}
__name(handleTestMail, "handleTestMail");
async function handleTestEmailSweep(env) {
  const r = await runEmailAlertsSweep(env, { source: "manual_test" });
  return jsonResponse(r, 200);
}
__name(handleTestEmailSweep, "handleTestEmailSweep");
async function handleTestDigest(request, env) {
  try {
    const url = new URL(request.url);
    const targetEmail = String(url.searchParams.get("target_email") || "").trim().toLowerCase();
    let targetUserId = String(url.searchParams.get("target_user_id") || "").trim();
    if (!targetUserId && targetEmail) {
      const rows = await supabaseSelect(
        env,
        `users?email=eq.${encodeURIComponent(targetEmail)}&select=id,email&limit=1`
      ).catch(() => []);
      const found = Array.isArray(rows) ? rows[0] || null : null;
      targetUserId = String(found?.id || "").trim();
      if (!targetUserId) {
        return jsonResponse({
          ok: false,
          error: "No se encontr\xF3 usuario para ese email",
          target_email: targetEmail
        }, 404);
      }
    }
    if (!targetUserId) {
      return jsonResponse({
        ok: false,
        error: "Falta target_user_id o target_email"
      }, 400);
    }
    const result = await runEmailAlertsSweep(env, {
      source: "manual_test_digest_targeted",
      max_users: 1,
      target_user_id: targetUserId,
      debug: true,
      debug_user_id: targetUserId
    });
    return jsonResponse({
      ok: true,
      direct_test: true,
      target_user_id: targetUserId,
      target_email: targetEmail || null,
      ...result
    }, 200);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err?.message || err || ""),
      stack: String(err?.stack || "")
    }, 500);
  }
}
__name(handleTestDigest, "handleTestDigest");
export {
  worker_hotfix_default as default
};
//# sourceMappingURL=worker_hotfix.js.map

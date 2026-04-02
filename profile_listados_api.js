const API_URL_PREFIX = "/api";
const PD_ABC_LISTADO_SELECT_URL = "https://abc.gob.ar/listado-oficial/select/";
const PD_ABC_SYNC_SOURCE = "abc_public";

function pdCorsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function pdJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: pdCorsHeaders() });
}

function pdNorm(v) {
  return String(v || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s/().,-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdGetBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? String(auth.slice(7) || "").trim() : "";
}

function pdGetAuthedUserId(request, body = null, url = null) {
  const bearer = pdGetBearerToken(request);
  const hinted = String(body?.user_id || url?.searchParams?.get("user_id") || "").trim();
  if (bearer && hinted && bearer !== hinted) {
    throw new Error("La sesión no coincide con el user_id enviado");
  }
  return bearer || hinted;
}

async function pdSupabaseRequest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }
  return data;
}

async function pdSupabaseSelect(env, query) {
  return await pdSupabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}

async function pdSupabaseInsertReturning(env, table, data) {
  const rows = await pdSupabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function pdSupabaseUpsert(env, table, rows, conflict) {
  return await pdSupabaseRequest(env, `${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}

async function pdGetUserById(env, userId) {
  const rows = await pdSupabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function pdNormalizeDni(raw) {
  return String(raw || "").replace(/\D/g, "");
}

async function pdSha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(x => x.toString(16).padStart(2, "0")).join("");
}

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

function pdParsePuntaje(raw) {
  const text = String(raw || "").trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(/,/g, ".") : text;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function pdNormalizeListadoRow(row, fallback = {}) {
  const cargo = String(row?.cargo || fallback.cargo || "").trim();
  const materia = String(row?.materia || fallback.materia || "").trim();
  const joined = [cargo, materia].filter(Boolean).join(" ").trim();
  return {
    anio: Number(row?.anio || fallback.anio || new Date().getFullYear()),
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

function pdParseListadoText(rawText, fallback = {}) {
  const lines = String(rawText || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const chunks = line.split("|").map(x => x.trim()).filter(Boolean);
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
  return rows.filter(row => row.cargo_materia_normalizado);
}

function pdSafeOfferId(offer) {
  return String(offer?.offer_id || offer?.source_offer_key || offer?.idoferta || offer?.iddetalle || offer?.id || "").trim();
}

function pdNormalizeOfferText(offer) {
  return pdNorm(
    [offer?.cargo, offer?.materia, offer?.area, offer?.title, offer?.descripcioncargo, offer?.descripcionarea]
      .filter(Boolean)
      .join(" ")
  );
}

function pdComputeEligibilityForOffer(offer, listados) {
  const offerId = pdSafeOfferId(offer);
  const offerText = pdNormalizeOfferText(offer);
  const offerDistrito = pdNorm(offer?.distrito || offer?.descdistrito || "");
  let best = null;

  for (const row of Array.isArray(listados) ? listados : []) {
    const base = pdNorm(row?.cargo_materia_normalizado || [row?.cargo, row?.materia].filter(Boolean).join(" "));
    if (!base || !offerText) continue;

    let score = 0;
    if (offerText === base) score = 1;
    else if (offerText.includes(base) || base.includes(offerText)) score = 0.92;
    else {
      const offerTokens = offerText.split(" ").filter(Boolean);
      const rowTokens = base.split(" ").filter(Boolean);
      const overlap = rowTokens.filter(token => token.length > 2 && offerTokens.includes(token)).length;
      score = overlap / Math.max(offerTokens.length, rowTokens.length, 1);
    }

    if (offerDistrito && row?.distrito && pdNorm(row.distrito) === offerDistrito) score += 0.03;
    if (score < 0.55) continue;

    const puntajeUsuario = row?.puntaje != null ? Number(row.puntaje) : null;
    const puntajePrimero = offer?.puntaje_primero != null ? Number(offer.puntaje_primero) : null;

    let competitiveness = score;
    let confidenceLevel = score >= 0.9 ? "alta" : score >= 0.72 ? "media" : "baja";
    let strategicMessage = puntajeUsuario != null
      ? `Puntaje detectado: ${puntajeUsuario.toFixed(2)}`
      : "Compatible, pero sin puntaje usable detectado";

    if (puntajeUsuario != null && Number.isFinite(puntajePrimero)) {
      const delta = puntajeUsuario - puntajePrimero;
      competitiveness = Math.max(0, Math.min(1.2, 0.65 + delta / 20));
      if (delta >= 0.25) {
        confidenceLevel = "muy_alta";
        strategicMessage = `Alta oportunidad: tu puntaje (${puntajeUsuario.toFixed(2)}) supera al primero visible (${puntajePrimero.toFixed(2)}).`;
      } else if (delta >= -0.5) {
        confidenceLevel = "alta";
        strategicMessage = `Buena oportunidad: tu puntaje (${puntajeUsuario.toFixed(2)}) está muy cerca del primero visible (${puntajePrimero.toFixed(2)}).`;
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
      match_type: score >= 0.9 ? "exacto" : score >= 0.75 ? "fuerte" : "parcial",
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
    strategic_message: "No encontramos habilitación compatible en tus listados cargados."
  };
}

function pdBuildAbcSyncUrl(dni, start = 0, rows = 200) {
  const params = new URLSearchParams();
  params.set("q", `busqueda=${dni}`);
  params.set("wt", "json");
  params.set("rows", String(rows));
  params.set("start", String(start));
  params.set("sort", "orden asc");
  params.set("facet", "true");
  params.set("facet.mincount", "1");
  params.set("json.nl", "map");
  params.append("facet.field", "distrito");
  params.append("facet.field", "rama");
  params.append("facet.field", "cargo_area");
  params.append("facet.field", "aniolistado");
  return `${PD_ABC_LISTADO_SELECT_URL}?${params.toString()}`;
}

async function pdFetchAbcListadoPublic(dni) {
  const normalizedDni = pdNormalizeDni(dni);
  if (normalizedDni.length < 7 || normalizedDni.length > 9) {
    throw new Error("Ingresá un DNI válido antes de sincronizar");
  }

  const pageSize = 200;
  const maxPages = 6;
  const baseUrls = [
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
            "Origin": "https://abc.gob.ar"
          }
        });

        const text = await res.text();
        const trimmed = String(text || "").trim();
        const contentType = res.headers.get("content-type") || "";

        if (!trimmed) {
          throw new Error(`ABC devolvió respuesta vacía | status=${res.status} | url=${url}`);
        }

        if (
          trimmed.startsWith("<!DOCTYPE") ||
          trimmed.startsWith("<html") ||
          trimmed.startsWith("<!doctype")
        ) {
          throw new Error(
            `ABC devolvió HTML | status=${res.status} | content-type=${contentType} | url=${url} | snippet=${trimmed.slice(0, 220)}`
          );
        }

        let data = null;
        try {
          data = JSON.parse(trimmed);
        } catch {
          throw new Error(
            `ABC devolvió algo no JSON | status=${res.status} | content-type=${contentType} | url=${url} | snippet=${trimmed.slice(0, 220)}`
          );
        }

        if (!res.ok || Number(data?.responseHeader?.status ?? 1) !== 0) {
          throw new Error(
            `ABC respondió error JSON | status=${res.status} | url=${url} | body=${trimmed.slice(0, 220)}`
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
function pdBuildListadoSummary(rows) {
  const distritos = [...new Set(rows.map(row => pdNorm(row?.distrito || "")).filter(Boolean))].sort();
  const anios = [...new Set(rows.map(row => Number(row?.anio || 0)).filter(Boolean))].sort((a, b) => b - a);
  const tipos = [...new Set(rows.map(row => String(row?.tipo_listado || "").trim()).filter(Boolean))].sort();
  return {
    total_rows: rows.length,
    distritos,
    anios,
    tipos
  };
}

function pdMapAbcDocToListadoRow(doc, dni) {
  const cargoArea = String(doc?.cargo_area || "").trim();
  const rama = String(doc?.rama || "").trim();
  const tipoListado = pdNormalizeListadoType(doc?.tipo_listado || doc?.listado || "OFICIAL");
  const anio = Number(doc?.aniolistado || new Date().getFullYear()) || new Date().getFullYear();
  const distrito = pdNorm(doc?.distrito || "");
  const rawPayload = {
    source: "abc_public",
    dni,
    documento: String(doc?.documento || ""),
    nombre: String(doc?.nombre || ""),
    apellido: String(doc?.apellido || ""),
    distrito: String(doc?.distrito || ""),
    rama: rama,
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

async function pdDeleteUserAutoSyncedListados(env, userId) {
  await pdSupabaseRequest(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&fuente=eq.${encodeURIComponent(PD_ABC_SYNC_SOURCE)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
}

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
      updated_at: new Date().toISOString()
    }],
    "user_id"
  ).catch(() => null);

  return Array.isArray(rows) ? rows[0] || null : rows;
}

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
  const autoRows = items.filter(x => String(x?.fuente || "").trim() === PD_ABC_SYNC_SOURCE);
  const manualRows = items.filter(x => String(x?.fuente || "").trim() !== PD_ABC_SYNC_SOURCE);
  const syncSummary = pdBuildListadoSummary(autoRows);

  return pdJson({
    ok: true,
    profile: Array.isArray(profileRows) ? profileRows[0] || null : null,
    stats: {
      listados_total: items.length,
      listados_validados: items.filter(x => x.validado === true).length,
      listados_sync_abc: autoRows.length,
      listados_manual: manualRows.length
    },
    sync_summary: syncSummary
  });
}

async function handleSaveDni(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);

  const user = await pdGetUserById(env, userId);
  if (!user) return pdJson({ ok: false, message: "Usuario no encontrado" }, 404);

  const dni = pdNormalizeDni(body?.dni);
  const consentimiento = body?.consentimiento_datos === true;
  if (dni.length < 7 || dni.length > 9) return pdJson({ ok: false, message: "Ingresá un DNI válido" }, 400);
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
      updated_at: new Date().toISOString()
    }],
    "user_id"
  );

  return pdJson({ ok: true, message: "DNI guardado", profile: Array.isArray(rows) ? rows[0] || null : null });
}

async function handleMisListados(request, env, url) {
  const userId = pdGetAuthedUserId(request, null, url);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);

  const rows = await pdSupabaseSelect(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&select=*&order=updated_at.desc`
  ).catch(err => {
    throw new Error(`No se pudieron leer tus listados: ${err?.message || err}`);
  });

  const items = Array.isArray(rows) ? rows : [];
  return pdJson({
    ok: true,
    items,
    summary: {
      total: items.length,
      sync_abc: items.filter(row => String(row?.fuente || "").trim() === PD_ABC_SYNC_SOURCE).length,
      manual: items.filter(row => String(row?.fuente || "").trim() !== PD_ABC_SYNC_SOURCE).length
    }
  });
}

async function handleImportManual(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);

  const sourceRows = Array.isArray(body?.rows) ? body.rows : [body];
  const rows = sourceRows
    .map(row => pdNormalizeListadoRow(row, { fuente: "manual" }))
    .filter(row => row.cargo_materia_normalizado);

  if (!rows.length) return pdJson({ ok: false, message: "No hay filas válidas para guardar" }, 400);

  const payload = rows.map(row => ({ ...row, user_id: userId, updated_at: new Date().toISOString() }));
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

async function handleImportPaste(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);

  const rawText = String(body?.raw_text || "").trim();
  if (!rawText) return pdJson({ ok: false, message: "Pegá algún texto del listado" }, 400);

  const parsedRows = pdParseListadoText(rawText, {
    anio: body?.anio,
    tipo_listado: body?.tipo_listado,
    distrito: body?.distrito,
    fuente: "paste",
    raw_text: rawText
  });

  if (!parsedRows.length) {
    return pdJson({ ok: false, message: "No pudimos interpretar filas válidas desde el texto pegado" }, 400);
  }

  const payload = parsedRows.map(row => ({ ...row, user_id: userId, updated_at: new Date().toISOString() }));
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
    return pdJson({ ok: false, message: "Primero guardá tu DNI en el perfil docente" }, 400);
  }
  if (profile?.consentimiento_datos !== true) {
    return pdJson({ ok: false, message: "Primero aceptá el consentimiento de datos" }, 400);
  }

  await pdUpdateIdentityProfileSync(env, userId, { sync_status: "running" }).catch(() => null);

  try {
    const fetched = await pdFetchAbcListadoPublic(profile.dni);
    const normalizedRows = fetched.docs
      .map(doc => pdMapAbcDocToListadoRow(doc, fetched.dni))
      .filter(row => row.cargo_materia_normalizado);

    await pdDeleteUserAutoSyncedListados(env, userId);

    let inserted = [];
    if (normalizedRows.length) {
      const payload = normalizedRows.map(row => ({
        ...row,
        user_id: userId,
        updated_at: new Date().toISOString()
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
      source_name: "ABC público por DNI",
      raw_content: JSON.stringify({
        dni: fetched.dni,
        total_docs: fetched.docs.length,
        facets: fetched.facets || null
      }),
      parse_status: "ok",
      parse_message: `ABC público sincronizado. Registros: ${normalizedRows.length}`,
      imported_rows: normalizedRows.length
    }).catch(() => null);

    await pdUpdateIdentityProfileSync(env, userId, {
      last_sync_at: new Date().toISOString(),
      sync_status: normalizedRows.length ? "ok" : "empty"
    }).catch(() => null);

    return pdJson({
      ok: true,
      message: normalizedRows.length
        ? `Sincronización completada. Registros traídos: ${normalizedRows.length}`
        : "La consulta a ABC no devolvió registros para ese DNI",
      imported: normalizedRows.length,
      items: Array.isArray(inserted) ? inserted : [],
      summary,
      facets: fetched.facets || null
    });
  } catch (err) {
    await pdSupabaseInsertReturning(env, "user_listados_imports", {
      user_id: userId,
      source_type: "abc_public",
      source_name: "ABC público por DNI",
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

async function fetchStoredOffers(env, userId) {
  const rows = await pdSupabaseSelect(
    env,
    `user_offer_state?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=offer_id,offer_payload&order=last_seen_at.desc&limit=200`
  ).catch(() => []);
  return (Array.isArray(rows) ? rows : []).map(row => ({
    ...(row.offer_payload || {}),
    offer_id: row.offer_id || row.offer_payload?.offer_id || ""
  }));
}

async function handleEligibilityRecompute(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = pdGetAuthedUserId(request, body, null);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);

  const listados = await pdSupabaseSelect(
    env,
    `user_listados?user_id=eq.${encodeURIComponent(userId)}&select=id,tipo_listado,distrito,cargo,materia,cargo_materia_normalizado,puntaje,validado&order=updated_at.desc`
  ).catch(err => {
    throw new Error(`No se pudieron leer tus listados: ${err?.message || err}`);
  });

  if (!Array.isArray(listados) || !listados.length) {
    return pdJson({ ok: true, items: [], summary: { compatibles: 0, total: 0 }, message: "Todavía no cargaste listados." });
  }

  const sourceOffers = Array.isArray(body?.offers) && body.offers.length ? body.offers : await fetchStoredOffers(env, userId);
  const offers = sourceOffers.filter(item => pdSafeOfferId(item));
  const computed = offers.map(offer => ({
    user_id: userId,
    ...pdComputeEligibilityForOffer(offer, listados),
    computed_at: new Date().toISOString()
  }));

  if (computed.length) {
    await pdSupabaseUpsert(
      env,
      "offer_eligibility",
      computed.map(item => ({
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
      compatibles: computed.filter(item => item.compatible).length,
      muy_altas: computed.filter(item => item.confidence_level === "muy_alta").length,
      altas: computed.filter(item => item.confidence_level === "alta").length
    }
  });
}

async function handleEligibilityList(request, env, url) {
  const userId = pdGetAuthedUserId(request, null, url);
  if (!userId) return pdJson({ ok: false, message: "No autenticado" }, 401);

  const rows = await pdSupabaseSelect(
    env,
    `offer_eligibility?user_id=eq.${encodeURIComponent(userId)}&select=*&order=computed_at.desc&limit=200`
  ).catch(() => []);

  return pdJson({ ok: true, items: Array.isArray(rows) ? rows : [] });
}

export async function handleProfileListadosRoute(request, env) {
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

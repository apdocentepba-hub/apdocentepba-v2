import { handleProfileListadosRoute } from "./profile_listados_api.js";
import originalWorker from "./worker.js";

const API_URL_PREFIX = "/api";
const LEGACY_GAS_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
const HOTFIX_VERSION = "2026-04-01-hotfix-1";
const ALERT_ROWS_PER_PAGE = 150;
const ALERT_MAX_PAGES = 6;

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders() });
}

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeText(v) {
  return String(v || "").trim();
}

function norm(v) {
  return String(v || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s/().,-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}

function sanitizeSolrNumber(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function mapTurnoAPD(turno) {
  const x = norm(turno);
  if (x === "M" || x === "MANANA") return "MANANA";
  if (x === "T" || x === "TARDE") return "TARDE";
  if (x === "V" || x === "VESPERTINO") return "VESPERTINO";
  if (x === "N" || x === "NOCHE") return "NOCHE";
  if (x === "A" || x === "ALTERNADO") return "ALTERNADO";
  return x;
}

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

function nivelOfertaKeys(texto) {
  const t = norm(texto);
  const out = new Set();
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

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

function buildSourceOfferKeyFromOferta(oferta) {
  const detalle = sanitizeSolrNumber(oferta?.iddetalle || oferta?.id || "");
  if (detalle) return `D_${detalle}`;
  const ofertaId = sanitizeSolrNumber(oferta?.idoferta || "");
  if (ofertaId) return `O_${ofertaId}`;
  return [norm(oferta?.descdistrito || ""), norm(oferta?.escuela || oferta?.nombreestablecimiento || ""), norm(oferta?.descripcioncargo || oferta?.cargo || ""), norm(oferta?.descripcionarea || "")].filter(Boolean).join("_").slice(0, 220);
}

function buildAbcPostulantesUrl(ofertaId, detalleId) {
  const params = new URLSearchParams();
  const ofertaSafe = sanitizeSolrNumber(ofertaId);
  const detalleSafe = sanitizeSolrNumber(detalleId);
  if (ofertaSafe) params.set("oferta", ofertaSafe);
  if (detalleSafe) params.set("detalle", detalleSafe);
  return `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?${params.toString()}`;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(item => item.toString(16).padStart(2, "0")).join("");
}

async function passwordMatches(storedPassword, plainPassword) {
  const stored = String(storedPassword || "");
  const plain = String(plainPassword || "");
  if (!stored || !plain) return false;
  if (stored === plain) return true;
  const hashed = await sha256Hex(plain);
  return stored === hashed;
}

async function supabaseRequest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

async function supabaseSelect(env, query) {
  return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}

async function supabaseInsertReturning(env, table, data) {
  const rows = await supabaseRequest(env, table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function supabasePatch(env, table, filter, data) {
  return await supabaseRequest(env, `${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
}

async function findUserByEmail(env, email) {
  const rows = await supabaseSelect(env, `users?email=ilike.${encodeURIComponent(email)}&select=id,nombre,apellido,email,celular,password_hash,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,ultimo_login&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function ensureTrialIfNoSubscriptions(env, userId, email, source = "trial_auto_hotfix") {
  const existing = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`).catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) return { ok: true, created: false };
  await supabaseInsertReturning(env, "user_subscriptions", { user_id: userId, plan_code: "TRIAL_7D", status: "ACTIVE", source, started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), current_period_ends_at: null, mercadopago_preapproval_id: null, mercadopago_payer_email: email || null, external_reference: `${userId}:TRIAL_7D:${Date.now()}` }).catch(() => null);
  return { ok: true, created: true };
}

async function touchUltimoLogin(env, userId) {
  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(userId)}`, { ultimo_login: new Date().toISOString() }).catch(() => null);
}

async function verifyGoogleCredential(idToken, expectedAud) {
  if (!expectedAud) throw new Error("Falta GOOGLE_CLIENT_ID en Cloudflare");
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("Google no devolvio una respuesta valida"); }
  if (!res.ok) throw new Error(data?.error_description || data?.error || "Google no valido el token");
  if (String(data.aud || "") !== String(expectedAud)) throw new Error("Google Client ID no coincide");
  if (!(data.email_verified === true || data.email_verified === "true")) throw new Error("El email de Google no esta verificado");
  const parts = String(data.name || "").trim().split(/\s+/).filter(Boolean);
  const nombre = String(data.given_name || parts.shift() || "Docente").trim() || "Docente";
  const apellido = String(data.family_name || parts.join(" ") || "-").trim() || "-";
  return { sub: String(data.sub || ""), email: normalizeEmail(data.email || ""), nombre, apellido };
}

async function ensureLocalUser(env, payload) {
  const email = normalizeEmail(payload?.email || "");
  if (!email) throw new Error("Falta email");
  const existing = await findUserByEmail(env, email);
  if (existing?.id) {
    const patch = {};
    if (!existing.nombre && payload?.nombre) patch.nombre = normalizeText(payload.nombre);
    if (!existing.apellido && payload?.apellido) patch.apellido = normalizeText(payload.apellido);
    if (!existing.celular && payload?.celular) patch.celular = normalizeText(payload.celular);
    if (existing.activo === false) patch.activo = true;
    if (!existing.password_hash && payload?.password) patch.password_hash = String(payload.password);
    if (Object.keys(patch).length) {
      const patched = await supabasePatch(env, "users", `id=eq.${encodeURIComponent(existing.id)}`, patch).catch(() => null);
      return Array.isArray(patched) ? patched[0] || { ...existing, ...patch } : { ...existing, ...patch };
    }
    return existing;
  }
  return await supabaseInsertReturning(env, "users", { nombre: normalizeText(payload?.nombre || "Docente"), apellido: normalizeText(payload?.apellido || "-") || "-", email, celular: normalizeText(payload?.celular || ""), password_hash: payload?.password ? String(payload.password) : null, activo: true });
}

async function tryLegacyPasswordLogin(email, password) {
  const payloads = [{ action: "login_password", email, password }, { action: "login", email, password }];
  for (const payload of payloads) {
    try {
      const res = await fetch(LEGACY_GAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (data?.ok || data?.success) return { ok: true, data };
    } catch {}
  }
  return { ok: false };
}

async function handleLoginHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");
  if (!email || !password) return json({ ok: false, message: "Faltan datos" }, 400);
  let user = await findUserByEmail(env, email);
  if (user?.id && user.activo === false) return json({ ok: false, message: "Usuario inactivo" }, 403);
  if (user?.id) {
    const okPassword = await passwordMatches(user.password_hash, password);
    if (okPassword) {
      await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_login_hotfix");
      await touchUltimoLogin(env, user.id);
      return json({ ok: true, token: String(user.id), user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
    }
  }
  const legacy = await tryLegacyPasswordLogin(email, password);
  if (legacy.ok) {
    const legacyUser = legacy.data?.user || legacy.data?.data || {};
    user = await ensureLocalUser(env, { email, password, nombre: legacyUser?.nombre || legacyUser?.name || "", apellido: legacyUser?.apellido || legacyUser?.last_name || "", celular: legacyUser?.celular || legacyUser?.phone || "" });
    if (!user?.id) return json({ ok: false, message: "No se pudo migrar la cuenta existente" }, 500);
    await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_login_legacy");
    await touchUltimoLogin(env, user.id);
    return json({ ok: true, migrated_legacy: true, token: String(user.id), user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
  }
  if (user?.id) return json({ ok: false, message: "Password incorrecto" }, 401);
  return json({ ok: false, message: "Usuario no encontrado o credenciales incorrectas" }, 401);
}

async function handleGoogleAuthHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const credential = String(body?.credential || "").trim();
  if (!credential) return json({ ok: false, message: "Falta credential de Google" }, 400);
  const googleUser = await verifyGoogleCredential(credential, env.GOOGLE_CLIENT_ID);
  const user = await ensureLocalUser(env, googleUser);
  if (!user?.id) return json({ ok: false, message: "No se pudo crear o vincular el usuario con Google" }, 500);
  await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_google_hotfix");
  await touchUltimoLogin(env, user.id);
  return json({ ok: true, mode: "login", token: String(user.id), user: { id: user.id, nombre: user.nombre || googleUser.nombre || "", apellido: user.apellido || googleUser.apellido || "", email: user.email || googleUser.email || "" } });
}

function adaptarPreferenciasRow(row) {
  const arrNorm = value => {
    if (Array.isArray(value)) return value.map(item => norm(item)).filter(Boolean);
    if (typeof value === "string" && value.trim()) return value.split(",").map(item => norm(item)).filter(Boolean);
    return [];
  };
  return { user_id: row.user_id || "", distrito_principal: norm(row.distrito_principal || ""), otros_distritos: unique(arrNorm(row.otros_distritos)), cargos: unique(arrNorm(row.cargos)), materias: unique(arrNorm(row.materias)), niveles: unique(arrNorm(row.niveles)), turnos: unique(arrNorm(row.turnos)), alertas_activas: !!row.alertas_activas, alertas_email: !!row.alertas_email, alertas_whatsapp: !!row.alertas_whatsapp };
}

async function getUserPrefs(env, userId) {
  const rows = await supabaseSelect(env, `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`).catch(() => []);
  return rows?.[0] ? adaptarPreferenciasRow(rows[0]) : null;
}

async function getCatalogDistricts(env) {
  const rows = await supabaseSelect(env, "catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function resolveDistrictsForQuery(prefs, catalog) {
  const raw = [prefs?.distrito_principal || "", ...(Array.isArray(prefs?.otros_distritos) ? prefs.otros_distritos : [])].map(norm).filter(Boolean);
  const out = [];
  for (const item of raw) {
    const hit = (catalog || []).find(row => {
      const a = norm(row?.nombre || "");
      const b = norm(row?.apd_nombre || "");
      return a === item || b === item || item.includes(a) || a.includes(item) || item.includes(b) || b.includes(item);
    });
    out.push(norm(hit?.apd_nombre || hit?.nombre || item));
  }
  return unique(out);
}

function matchesCargo(oferta, prefs) {
  const filtros = unique([...(prefs?.cargos || []), ...(prefs?.materias || [])].map(norm).filter(Boolean));
  if (!filtros.length) return true;
  const textoOferta = norm([oferta?.descripcioncargo, oferta?.cargo, oferta?.descripcionarea, oferta?.materia, oferta?.asignatura].filter(Boolean).join(" "));
  if (!textoOferta) return false;
  return filtros.some(item => textoOferta.includes(item) || item.includes(textoOferta));
}

function matchesTurno(oferta, prefs) {
  const turnos = unique((prefs?.turnos || []).map(item => mapTurnoAPD(item)).filter(Boolean));
  if (!turnos.length) return true;
  return turnos.includes(mapTurnoAPD(oferta?.turno || ""));
}

function matchesNivel(oferta, prefs) {
  const niveles = unique((prefs?.niveles || []).map(canonicalizarNivelPreferencia).filter(Boolean));
  if (!niveles.length) return true;
  const ofertaKeys = nivelOfertaKeys(oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "");
  return niveles.some(item => ofertaKeys.has(item));
}

function ofertaVigente(oferta) {
  const estado = norm(oferta?.estado || "");
  if (["ANULADA", "DESIGNADA", "DESIERTA", "CERRADA", "FINALIZADA", "NO VIGENTE"].includes(estado)) return false;
  const cierre = parseFechaFlexible(oferta?.finoferta || oferta?.fecha_cierre || "");
  if (cierre && cierre.getTime() < Date.now()) return false;
  return true;
}

function adaptOffer(oferta) {
  const cargo = oferta?.descripcioncargo || oferta?.cargo || "";
  const area = oferta?.descripcionarea || oferta?.area || oferta?.materia || "";
  const finoferta = oferta?.finoferta || "";
  return { source_offer_key: buildSourceOfferKeyFromOferta(oferta), iddetalle: oferta?.iddetalle || oferta?.id || null, idoferta: oferta?.idoferta || null, distrito: norm(oferta?.descdistrito || oferta?.distrito || ""), cargo, materia: area, area, turno: mapTurnoAPD(oferta?.turno || ""), nivel_modalidad: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", nivel: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", modalidad: oferta?.descnivelmodalidad || oferta?.nivel || oferta?.nivel_modalidad || "", escuela: oferta?.escuela || oferta?.nombreestablecimiento || "", cursodivision: oferta?.cursodivision || oferta?.curso_division || "", curso_division: oferta?.cursodivision || oferta?.curso_division || "", jornada: oferta?.jornada || "", hsmodulos: oferta?.hsmodulos || oferta?.modulos || "", modulos: oferta?.hsmodulos || oferta?.modulos || "", supl_desde: oferta?.supl_desde || "", supl_hasta: oferta?.supl_hasta || "", desde: formatearFechaAbc(oferta?.supl_desde || "", "date"), hasta: formatearFechaAbc(oferta?.supl_hasta || "", "date"), revista: oferta?.revista || oferta?.supl_revista || "", situacion_revista: oferta?.revista || oferta?.supl_revista || "", revista_codigo: "", finoferta, finoferta_label: formatearFechaAbc(finoferta, "datetime") || finoferta, fecha_cierre: formatearFechaAbc(finoferta, "datetime") || finoferta, cierre: formatearFechaAbc(finoferta, "datetime") || finoferta, dias_horarios: String(oferta?.dias_horarios || oferta?.diashorarios || oferta?.horario || "").trim(), horario: String(oferta?.dias_horarios || oferta?.diashorarios || oferta?.horario || "").trim(), observaciones: oferta?.observaciones || "", abc_postulantes_url: buildAbcPostulantesUrl(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), abc_url: buildAbcPostulantesUrl(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), link: buildAbcPostulantesUrl(oferta?.idoferta || "", oferta?.iddetalle || oferta?.id || ""), estado: oferta?.estado || "", raw: oferta };
}

async function fetchOffersForDistrict(distritoAPD) {
  const docs = [];
  for (let i = 0; i < ALERT_MAX_PAGES; i += 1) {
    const start = i * ALERT_ROWS_PER_PAGE;
    const q = `descdistrito:"${String(distritoAPD || "").replace(/(["\\])/g, "\\$1")}"`;
    const url = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${ALERT_ROWS_PER_PAGE}&start=${start}&wt=json&sort=ult_movimiento%20desc`;
    const res = await fetch(url);
    if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error(`APD respondio ${res.status}: ${text}`); }
    const data = await res.json().catch(() => ({}));
    const pageDocs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    if (!pageDocs.length) break;
    docs.push(...pageDocs.filter(doc => norm(doc?.descdistrito || "") === norm(distritoAPD)));
    if (pageDocs.length < ALERT_ROWS_PER_PAGE) break;
  }
  return docs;
}

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
  const seenDocs = new Set();
  for (const distrito of distritos) {
    const docs = await fetchOffersForDistrict(distrito).catch(() => []);
    debug.push({ distrito_apd: distrito, query_usada: `descdistrito:"${distrito}"`, total_apd_bruto: docs.length, total_apd_filtrado: docs.length });
    for (const doc of docs) {
      const key = buildSourceOfferKeyFromOferta(doc);
      if (!key || seenDocs.has(key)) continue;
      seenDocs.add(key);
      allDocs.push(doc);
    }
  }
  const descartadas = [];
  const resultados = [];
  const seenAlerts = new Set();
  for (const oferta of allDocs) {
    if (!ofertaVigente(oferta)) { descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "oferta_no_vigente" }); continue; }
    if (!matchesCargo(oferta, prefs)) { descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "cargo_no_compatible" }); continue; }
    if (!matchesTurno(oferta, prefs)) { descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "turno_no_compatible" }); continue; }
    if (!matchesNivel(oferta, prefs)) { descartadas.push({ iddetalle: oferta?.iddetalle || oferta?.id || null, motivo: "nivel_no_compatible" }); continue; }
    const item = adaptOffer(oferta);
    const key = `${item.source_offer_key}|${item.escuela}|${item.turno}`;
    if (seenAlerts.has(key)) continue;
    seenAlerts.add(key);
    resultados.push(item);
  }
  resultados.sort((a, b) => (parseFechaFlexible(b?.finoferta)?.getTime() || 0) - (parseFechaFlexible(a?.finoferta)?.getTime() || 0));
  return { ok: true, user, preferencias_originales: prefs, preferencias_canonizadas: prefs, total_fuente: allDocs.length, total: resultados.length, descartadas_total: descartadas.length, descartadas_preview: descartadas.slice(0, 20), debug_distritos: debug, resultados };
}

async function delegateJson(originalWorker, request, env, ctx) {
  const response = await originalWorker.fetch(request, env, ctx);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data, text };
}

function safeProvinciaBackfillStatus(message = null) {
  return { ok: true, scope: "PROVINCIA_FULL", status: "idle", district_index: 0, district_name: null, next_page: 0, pages_processed: 0, districts_completed: 0, offers_processed: 0, last_batch_count: 0, total_districts: 0, progress_pct: 0, started_at: null, finished_at: null, last_run_at: null, updated_at: null, last_error: message || null, retryable: false, stale_running: false, failed_page: 0 };
}

function safeProvinciaResumen(message = null) {
  return { ok: true, empty: true, ventana_dias: 30, total_ofertas: 0, activas_estimadas: 0, cerradas_estimadas: 0, districts_with_activity: 0, coverage_hint: null, nuevas_7d: 0, top_distritos: [], top_cargos: [], top_turnos: [], top_escuelas: [], state_breakdown: { activas: 0, designadas: 0, anuladas: 0, desiertas: 0, cerradas: 0 }, leaders: { matematica: null, ingles: null }, latest_rows: [], banner_items: [{ title: "Radar provincial", text: message || "Todavia no hay suficiente historial provincial para construir insights serios." }], scan_state: null };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === `${API_URL_PREFIX}/version` && request.method === "GET") return json({ ok: true, version: HOTFIX_VERSION, worker_version: env.WORKER_URL || "ancient-wildflower-cd37" });
    if (path === `${API_URL_PREFIX}/login` && request.method === "POST") {
      try { return await handleLoginHotfix(request, env); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo iniciar sesion" }, 500); }
    }
    if (path === `${API_URL_PREFIX}/google-auth` && request.method === "POST") {
      try { return await handleGoogleAuthHotfix(request, env); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo ingresar con Google" }, 400); }
    }
    if (path === `${API_URL_PREFIX}/mis-alertas` && request.method === "GET") {
      try {
        const delegated = await delegateJson(originalWorker, request, env, ctx);
        if (delegated.response.ok && delegated.data?.ok && Array.isArray(delegated.data?.resultados) && delegated.data.resultados.length > 0) return json(delegated.data, delegated.response.status);
      } catch {}
      try {
        const userId = String(url.searchParams.get("user_id") || "").trim();
        if (!userId) return json({ ok: false, message: "Falta user_id" }, 400);
        const fallback = await buildAlertResultsFallback(env, userId);
        return json(fallback, fallback.ok ? 200 : 400);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudieron cargar las alertas" }, 500);
      }
    }
    if (path === `${API_URL_PREFIX}/provincia/backfill-status` && request.method === "GET") {
      try {
        const delegated = await delegateJson(originalWorker, request, env, ctx);
        if (delegated.response.ok && delegated.data?.ok) return json(delegated.data, delegated.response.status);
        return json(safeProvinciaBackfillStatus(delegated.data?.error || delegated.data?.message || "No se pudo leer el backfill provincial"));
      } catch (err) {
        return json(safeProvinciaBackfillStatus(err?.message || "No se pudo leer el backfill provincial"));
      }
    }
    if (path === `${API_URL_PREFIX}/provincia/resumen` && request.method === "GET") {
      try {
        const delegated = await delegateJson(originalWorker, request, env, ctx);
        if (delegated.response.ok && delegated.data?.ok) return json(delegated.data, delegated.response.status);
        return json(safeProvinciaResumen(delegated.data?.error || delegated.data?.message || "No se pudo leer el radar provincial"));
      } catch (err) {
        return json(safeProvinciaResumen(err?.message || "No se pudo leer el radar provincial"));
      }
    }
    if (path === `${API_URL_PREFIX}/provincia/insights` && request.method === "GET") {
      try {
        const delegated = await delegateJson(originalWorker, request, env, ctx);
        if (delegated.response.ok && delegated.data?.ok) return json(delegated.data, delegated.response.status);
        return json({ ok: true, days: 30, generated_at: new Date().toISOString(), items: [] });
      } catch {
        return json({ ok: true, days: 30, generated_at: new Date().toISOString(), items: [] });
      }
    }
    if (
  path.startsWith("/api/profile/") ||
  path.startsWith("/api/listados/") ||
  path.startsWith("/api/eligibility/")
) {
  const routed = await handleProfileListadosRoute(request, env);
  if (routed) return routed;
}
    return await originalWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof originalWorker?.scheduled === "function") return await originalWorker.scheduled(controller, env, ctx);
  }
};

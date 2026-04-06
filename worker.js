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
    throw new Error(`Respuesta inválida de Supabase insert returning: ${text}`);
  }
}

const API_VERSION = "2026-03-27";
const API_URL_PREFIX = "/api";
const HISTORICO_DAYS_DEFAULT = 30;
const HISTORICO_INSERT_BATCH = 150;
const HISTORICO_POSTULANTES_LIMIT = 8;
const USER_CAPTURE_ROWS_PER_PAGE = 150;
const USER_CAPTURE_MAX_PAGES = 25;
const PROVINCIA_SCOPE = "PROVINCIA_FULL";
const PROVINCIA_CAPTURE_ROWS_PER_PAGE = 150;
const PROVINCIA_STEP_PAGES = 4;
const PROVINCIA_SUMMARY_LIMIT = 20000;
const PROVINCIA_DAYS_DEFAULT = 30;
const PROVINCIA_AUTORUN_MAX_STEPS = 8;
const PROVINCIA_AUTORUN_MAX_MS = 20000;
const PROVINCIA_RUNNING_STALE_MS = 10 * 60 * 1000;
const WHATSAPP_ALERT_SWEEP_MAX_USERS = 20;
const WHATSAPP_ALERTS_PER_USER_MAX = 3;
const WHATSAPP_ALERT_LOG_LOOKBACK = 200;

// ===============================
// HELPERS - worker.js
// ===============================

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}


function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function normalizeText(v) {
  return String(v || '').trim();
}

function parseFechaArgentina(fechaStr) {
  if (!fechaStr) return null;

  const s = String(fechaStr).trim();

  // dd/MM/yyyy HH:mm
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4] || 23);
    const min = Number(m[5] || 59);
    return new Date(Date.UTC(yyyy, mm, dd, hh + 3, min, 0)); // ajuste simple AR
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function estaVencida(fechaCierreRaw) {
  const f = parseFechaArgentina(fechaCierreRaw);
  if (!f) return false;
  return f.getTime() < Date.now();
}

async function fetchConTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

async function fetchConReintentos(url, options = {}, intentos = 3, timeoutMs = 25000) {
  let ultimoError;

  for (let i = 0; i < intentos; i++) {
    try {
      const resp = await fetchConTimeout(url, options, timeoutMs);
      if (resp.ok) return resp;

      const txt = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} - ${txt.slice(0, 300)}`);
    } catch (e) {
      ultimoError = e;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }

  throw ultimoError;
}
async function createTrialSubscriptionForUser(env, userId, email) {
  return await supabaseInsert(env, "user_subscriptions", {
    user_id: userId,
    plan_code: "TRIAL_7D",
    status: "ACTIVE",
    source: "trial_auto",
    started_at: new Date().toISOString(),
    trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    current_period_ends_at: null,
    mercadopago_preapproval_id: null,
    mercadopago_payer_email: email || null,
    external_reference: `${userId}:TRIAL_7D:${Date.now()}`
  });
}
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
    started_at: new Date().toISOString(),
    trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
// ===============================
// FIX REGISTRO - worker.js
// ===============================
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
      return jsonResponse({ ok: false, error: "La contraseña debe tener al menos 6 caracteres" }, 400);
    }

    const existingUser = await findUserByEmail(env, email);

    if (existingUser?.id) {
      return jsonResponse({ ok: false, error: "Ese email ya está registrado" }, 409);
    }

    const nuevoUsuarioRaw = await supabaseInsertReturning(env, "users", {
      nombre,
      apellido,
      email,
      celular,
      password_hash: password,
      activo: true
    });

    const nuevoUsuario = Array.isArray(nuevoUsuarioRaw)
      ? nuevoUsuarioRaw[0]
      : nuevoUsuarioRaw;

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

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function startOfTodayISO() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

function sevenDaysAgoISO() {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - 6);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString();
}

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

/* ===== ADMIN HANDLERS ===== */
async function handleAdminMe(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;

  return adminJson({
    ok: true,
    user: auth.user
  });
}

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

async function handleAdminUsuarios(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;

  const rows = await supabaseSelect(
    env,
    "users?select=id,nombre,apellido,email,celular,activo,es_admin,created_at,ultimo_login&order=created_at.desc&limit=1000"
  ).catch(err => {
    throw new Error(err?.message || "No se pudieron leer usuarios");
  });

  const total = rows?.length || 0;
  const activos = (rows || []).filter(x => x.activo === true).length;
  const admins = (rows || []).filter(x => x.es_admin === true).length;

  return adminJson({
    ok: true,
    total,
    activos,
    admins,
    items: rows || []
  });
}

async function handleAdminSesiones(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;

  const rows = await supabaseSelect(
    env,
    "sessions?select=token,user_id,metodo,created_at,expires_at,activo&order=created_at.desc&limit=300"
  ).catch(err => {
    throw new Error(err?.message || "No se pudieron leer sesiones");
  });

  const activas = (rows || []).filter(x => x.activo === true).length;
  const vencidas = (rows || []).filter(
    x => x.expires_at && new Date(x.expires_at).getTime() < Date.now()
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
    por_metodo: Object.entries(porMetodo)
      .map(([metodo, total]) => ({ metodo, total }))
      .sort((a, b) => b.total - a.total),
    items: rows || []
  });
}

async function handleAdminAlertas(request, env) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;

  const desde = sevenDaysAgoISO();

  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?created_at=gte.${encodeURIComponent(desde)}&select=id,user_id,channel,template_code,destination,status,provider_message_id,payload,provider_response,created_at&order=created_at.desc&limit=1000`
  ).catch(err => {
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
    por_dia: Object.entries(porDia)
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    por_estado: Object.entries(porEstado)
      .map(([estado, total]) => ({ estado, total }))
      .sort((a, b) => b.total - a.total),
    por_canal: Object.entries(porCanal)
      .map(([canal, total]) => ({ canal, total }))
      .sort((a, b) => b.total - a.total),
    items: rows || []
  });
}
async function enviarMailBrevo(destinatario, nombre, asunto, html, env) {

  const API_KEY = env.BREVO_API_KEY;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        email: 'apdocentepba@gmail.com',
        name: 'APDocentePBA'
      },
      to: [
        {
          email: destinatario,
          name: nombre || ''
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
function getOfferId(offer) {
  return String(
    offer.offer_id ||
    offer.id ||
    offer.codigo ||
    offer.identity_key ||
    ''
  ).trim();
}

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
      offer.listado_origen_primero || ""
  };
}
function escHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function digestRow(label, value) {
  if (!value && value !== 0) return "";
  return `
    <div style="margin:2px 0;">
      <b>${escHtml(label)}:</b> ${escHtml(value)}
    </div>
  `;
}
async function syncUserOfferState(env, userId, offers) {
  const now = new Date().toISOString();
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
  const map = new Map(existingRows.map(x => [String(x.offer_id || ""), x]));

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

  const toDisable = existingRows
    .filter(x => !uniqueActiveIds.includes(String(x.offer_id || "")))
    .map(x => x.id)
    .filter(Boolean);

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
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // ===============================
      // TESTS Y UTILIDADES
      // ===============================
      if (path === "/test-mail" && request.method === "GET") {
        const r = await enviarMailBrevo(
          "martin.nicolas.podubinio@gmail.com",
          "Martin",
          "PRUEBA APDocentePBA 🚀",
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

      if (path === `${API_URL_PREFIX}/test-db` && request.method === "GET") {
        return json({ ok: true, version: API_VERSION });
      }

      // ===============================
      // AUTH
      // ===============================
      if (path === `${API_URL_PREFIX}/login` && request.method === "POST") {
        return await handleLogin(request, env);
      }

      if (path === `${API_URL_PREFIX}/register` && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return await handleRegister(body, env);
      }

      if (path === `${API_URL_PREFIX}/google-auth` && request.method === "POST") {
        return await handleGoogleAuth(request, env);
      }

      // ===============================
      // PLANES Y PREFERENCIAS
      // ===============================
      if (path === `${API_URL_PREFIX}/planes` && request.method === "GET") {
        return await handlePlanes(env);
      }

      if (path === `${API_URL_PREFIX}/mi-plan` && request.method === "GET") {
        return await handleMiPlan(url, env);
      }

      if (path === `${API_URL_PREFIX}/guardar-preferencias` && request.method === "POST") {
        return await handleGuardarPreferencias(request, env);
      }

      // ===============================
      // ALERTAS USUARIO
      // ===============================
      if (path === `${API_URL_PREFIX}/mis-alertas` && request.method === "GET") {
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

      if (path === `${API_URL_PREFIX}/postulantes-resumen` && request.method === "GET") {
        return await handlePostulantesResumen(url);
      }

      // ===============================
      // HISTORICO USUARIO
      // ===============================
      if (path === `${API_URL_PREFIX}/capturar-historico-apd` && request.method === "POST") {
        return await handleCapturarHistoricoAPD(request, env);
      }

      if (path === `${API_URL_PREFIX}/historico-resumen` && request.method === "GET") {
        return await handleHistoricoResumen(url, env);
      }
      if (path === `${API_URL_PREFIX}/historico-radar-personal` && request.method === "GET") {
  return await handleHistoricoRadarPersonal(url, env);
}

      // ===============================
      // PROVINCIA
      // ===============================
      if (path === `${API_URL_PREFIX}/provincia/backfill-status` && request.method === "GET") {
        return await handleProvinciaBackfillStatus(env);
      }

      if (path === `${API_URL_PREFIX}/provincia/backfill-step` && request.method === "POST") {
        return await handleProvinciaBackfillStep(request, env);
      }

      if (path === `${API_URL_PREFIX}/provincia/backfill-reset` && request.method === "POST") {
        return await handleProvinciaBackfillReset(env);
      }

      if (path === `${API_URL_PREFIX}/provincia/backfill-kick` && request.method === "POST") {
        return await handleProvinciaBackfillKick(request, env, ctx);
      }

      if (path === `${API_URL_PREFIX}/provincia/resumen` && request.method === "GET") {
        return await handleProvinciaResumen(url, env);
      }

      if (path === `${API_URL_PREFIX}/provincia/insights` && request.method === "GET") {
        return await handleProvinciaInsights(url, env);
      }

      // ===============================
      // MERCADO PAGO
      // ===============================
      if (path === `${API_URL_PREFIX}/mercadopago/create-checkout-link` && request.method === "POST") {
        return await handleMercadoPagoCreateCheckoutLink(request, env);
      }

      if (path === `${API_URL_PREFIX}/mercadopago/webhook` && request.method === "POST") {
        return await handleMercadoPagoWebhook(request, env);
      }

      // ===============================
      // WHATSAPP
      // ===============================
      if (path === `${API_URL_PREFIX}/whatsapp/health` && request.method === "GET") {
        return await handleWhatsAppHealth(env);
      }

      if (path === `${API_URL_PREFIX}/whatsapp/test-send` && request.method === "POST") {
        return await handleWhatsAppTestSend(request, env);
      }

      // ===============================
      // CATALOGOS
      // ===============================
      if (path === `${API_URL_PREFIX}/importar-catalogo-cargos` && request.method === "GET") {
        return await handleImportarCatalogoCargos(url, env);
      }

      // ===============================
      // ADMIN
      // ===============================
      if (path === `${API_URL_PREFIX}/admin/me` && request.method === "GET") {
        return await handleAdminMe(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/resumen` && request.method === "GET") {
        return await handleAdminResumen(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/usuarios` && request.method === "GET") {
        return await handleAdminUsuarios(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/sesiones` && request.method === "GET") {
        return await handleAdminSesiones(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/alertas` && request.method === "GET") {
        return await handleAdminAlertas(request, env);
      }

      return json({ ok: false, error: "Ruta no encontrada" }, 404);
    } catch (err) {
      return json({ ok: false, error: err?.message || "Error interno" }, 500);
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runProvinciaBackfillStep(env, { source: "cron", force: false }).catch(err => {
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

  const alerts = await Promise.all(
    items.map(async item => {
      const merged = { ...(item || {}) };

      const ofertaId = String(item?.idoferta || "").trim();
      const detalleId = String(item?.iddetalle || "").trim();

      if (ofertaId || detalleId) {
        try {
          const resumen = await obtenerResumenPostulantesABC(ofertaId, detalleId);
          merged.total_postulantes = resumen.total_postulantes ?? item?.total_postulantes ?? null;
          merged.puntaje_primero = resumen.puntaje_primero ?? item?.puntaje_primero ?? null;
          merged.listado_origen_primero = resumen.listado_origen_primero || item?.listado_origen_primero || "";
        } catch (_) {
          merged.total_postulantes = item?.total_postulantes ?? null;
          merged.puntaje_primero = item?.puntaje_primero ?? null;
          merged.listado_origen_primero = item?.listado_origen_primero || "";
        }
      }

      return {
        offer_payload: normalizeOfferPayload(merged)
      };
    })
  );

  const html = buildDigestHtml(alerts, user);
  const asunto = `APDocentePBA: ${alerts.length} alerta${alerts.length === 1 ? "" : "s"} inicial${alerts.length === 1 ? "" : "es"} para vos`;

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
      total_alerts: alerts.length
    },
    provider_response: send || null
  }).catch(() => null);

  return {
    ok: !!send?.ok,
    skipped: false,
    total_alerts: alerts.length
  };
}
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
    return json({
      ok: false,
      message: "Tu plan está vencido. Suscribite para seguir usando el servicio.",
      plan: resolved.plan,
      subscription: resolved.subscription
    }, 403);
  }

  const limpias = sanitizarPreferenciasEntrada(preferencias, resolved.plan);
  const ajustesPlan = limpias._plan_ajuste || { distritos_recortados: 0, cargos_recortados: 0 };

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
    }).catch(err => ({
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
      message: "Tu plan está vencido. Activá una suscripción para volver a ver alertas.",
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
  const capturedAt = new Date().toISOString();

  const rowsOfertas = [];
  const rowsPostulantes = [];
  let erroresPostulantes = 0;

  for (let i = 0; i < capturable.length; i += 5) {
    const chunk = capturable.slice(i, i + 5);
    const results = await Promise.all(
      chunk.map((oferta, offset) =>
        buildHistoricoCaptureRows(
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

  const globalRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_global_snapshots", distritos, days, 8000);
  const localRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_historial", distritos, days, 8000);
  const rawRows = globalRows.length ? globalRows : localRows;

  if (!rawRows.length) {
    return json(emptyHistoricoPayload(days, "Todavia no hay historico suficiente."));
  }

  const matchedRows = rawRows.filter(row =>
    coincideOfertaConPreferencias(historicoRowToOferta(row), prefsCanon).match
  );

  if (!matchedRows.length) {
    return json(emptyHistoricoPayload(days, "Todavia no hay historico compatible con tus filtros."));
  }

  return json(buildHistoricoResumenPayload(matchedRows, days));
}
async function handleHistoricoRadarPersonal(url, env) {
  const userId = String(url.searchParams.get("user_id") || "").trim();
  const days = clampInt(url.searchParams.get("days"), 7, 120, HISTORICO_DAYS_DEFAULT);

  if (!userId) {
    return json({ ok: false, message: "Falta user_id" }, 400);
  }

  const prefs = await obtenerPreferenciasUsuario(env, userId);
  if (!prefs || !prefs.alertas_activas) {
    return json(emptyHistoricoRadarPersonalPayload(days, "Activa alertas y guarda tus preferencias."));
  }

  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const distritos = distritosPrefsAPD(prefsCanon);

  if (!distritos.length) {
    return json(emptyHistoricoRadarPersonalPayload(days, "Configura al menos un distrito."));
  }

  const globalRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_global_snapshots", distritos, days, 8000);
  const localRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_historial", distritos, days, 8000);
  const rawRows = globalRows.length ? globalRows : localRows;

  if (!rawRows.length) {
    return json(emptyHistoricoRadarPersonalPayload(days, "Todavia no hay historico suficiente."));
  }

  const matchedRows = rawRows.filter(row =>
    coincideOfertaConPreferencias(historicoRowToOferta(row), prefsCanon).match
  );

  if (!matchedRows.length) {
    return json(emptyHistoricoRadarPersonalPayload(days, "Todavia no hay historico compatible con tus filtros."));
  }

  const provinciaRows = await fetchProvinciaCurrentRows(env, days).catch(() => []);

  return json(buildHistoricoRadarPersonalPayload(matchedRows, provinciaRows, prefsCanon, days));
}

function buildHistoricoRadarPersonalPayload(rows, provinciaRows, prefsCanon, days) {
  const groupedRows = new Map();

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

  const nuevas7d = firstSeenRows.filter(row => {
    const ts = parseFechaFlexible(row.captured_at)?.getTime() || 0;
    return ts >= nowTs - 7 * 24 * 60 * 60 * 1000;
  }).length;

  const provinciaActivas = Array.isArray(provinciaRows)
    ? provinciaRows.filter(ofertaHistoricaActiva)
    : [];

  const shareVsProvincia = provinciaActivas.length
    ? Math.round((activeRows.length / provinciaActivas.length) * 1000) / 10
    : null;

  const indiceMovimiento = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (latestRows.length >= 20 ? 35 : latestRows.length >= 8 ? 20 : latestRows.length * 2) +
        (activeRows.length >= 5 ? 30 : activeRows.length >= 2 ? 18 : activeRows.length * 5) +
        (nuevas7d >= 4 ? 25 : nuevas7d >= 1 ? 12 : nuevas7d * 4) +
        (cambios.length >= 4 ? 10 : cambios.length >= 1 ? 5 : 0)
      )
    )
  );

  return {
    ok: true,
    empty: false,
    personal: true,
    ventana_dias: days,
    ultima_captura: latestRows[0]?.captured_at || null,
    filtros_aplicados: {
      distritos: unique([prefsCanon?.distrito_principal, ...(prefsCanon?.otros_distritos || [])].filter(Boolean)),
      cargos: unique([...(prefsCanon?.cargos || []), ...(prefsCanon?.materias || [])].filter(Boolean)),
      turnos: unique((prefsCanon?.turnos || []).filter(Boolean)),
      niveles: unique((prefsCanon?.niveles || []).filter(Boolean))
    },
    capturas_filtradas: rows.length,
    ofertas_unicas: latestRows.length,
    activas_estimadas: activeRows.length,
    designadas_estimadas: latestRows.filter(row => estadoHistoricoKey(row) === "DESIGNADA").length,
    anuladas_estimadas: latestRows.filter(row => estadoHistoricoKey(row) === "ANULADA").length,
    desiertas_estimadas: latestRows.filter(row => estadoHistoricoKey(row) === "DESIERTA").length,
    nuevas_7d: nuevas7d,
    cambios_estado_recientes: cambios.length,
    promedio_postulantes: promedioNumerico(latestRows.map(row => row.total_postulantes), 1),
    promedio_puntaje_primero: promedioNumerico(latestRows.map(row => row.puntaje_primero), 2),
    top_distritos: topCountItems(latestRows.map(row => row.distrito), 4),
    top_cargos: topCountItems(latestRows.map(tituloHistoricoRow), 5),
    top_turnos: topCountItems(activeRows.map(row => mapTurnoAPD(row.turno || "")), 4),
    top_niveles: topCountItems(latestRows.map(row => row.nivel_modalidad), 4),
    ultimos_cambios: cambios.slice(0, 6),
    ultimas_ofertas: latestRows.slice(0, 6).map(row => ({
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
    })),
    comparativa: {
      activas_provincia: provinciaActivas.length,
      share_vs_provincia_pct: shareVsProvincia,
      indice_movimiento: indiceMovimiento
    }
  };
}

function emptyHistoricoRadarPersonalPayload(days, message) {
  return {
    ok: true,
    empty: true,
    personal: true,
    message,
    ventana_dias: days,
    ultima_captura: null,
    filtros_aplicados: {
      distritos: [],
      cargos: [],
      turnos: [],
      niveles: []
    },
    capturas_filtradas: 0,
    ofertas_unicas: 0,
    activas_estimadas: 0,
    designadas_estimadas: 0,
    anuladas_estimadas: 0,
    desiertas_estimadas: 0,
    nuevas_7d: 0,
    cambios_estado_recientes: 0,
    promedio_postulantes: null,
    promedio_puntaje_primero: null,
    top_distritos: [],
    top_cargos: [],
    top_turnos: [],
    top_niveles: [],
    ultimos_cambios: [],
    ultimas_ofertas: [],
    comparativa: {
      activas_provincia: 0,
      share_vs_provincia_pct: null,
      indice_movimiento: 0
    }
  };
}
async function handleProvinciaBackfillStatus(env) {
  const state = await obtenerScanState(env);
  const staleRunning = isStaleProvinciaBackfill(state);
  const catalogRows = await obtenerDistritosProvincia(env);
  const districtName =
    catalogRows[state.district_index]?.apd_nombre ||
    catalogRows[state.district_index]?.nombre ||
    null;
  const totalDistricts = catalogRows.length;
  const lastError = state?.notes?.last_error || (
    staleRunning
      ? "El proceso provincial quedo trabado en segundo plano. Podes relanzarlo desde el mismo punto."
      : null
  );

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
    progress_pct: totalDistricts
      ? Math.round(((state.districts_completed || 0) / totalDistricts) * 1000) / 10
      : 0,
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
    }).catch(err => {
      console.error("PROVINCIA BACKFILL KICK STEP ERROR:", err);
    })
  );

  return json({
    ok: true,
    forced: force,
    stale_recovered: staleRunning,
    message: staleRunning
      ? "Se relanzo un lote provincial desde el punto que habia quedado trabado."
      : state.status === "error"
        ? "Se relanzo un lote provincial desde el ultimo punto con error."
        : "Lote provincial lanzado en segundo plano"
  });
}

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

async function handleProvinciaBackfillStep(request, env) {
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  const result = await runProvinciaBackfillStep(env, { source: "manual", force });
  return json({ ok: true, ...result });
}

async function handleProvinciaResumen(url, env) {
  const days = clampInt(url.searchParams.get("days"), 7, 120, PROVINCIA_DAYS_DEFAULT);
  const rows = await fetchProvinciaCurrentRows(env, days);
  const state = await obtenerScanState(env);
  return json(buildProvinciaResumenPayload(rows, days, state));
}

async function handleProvinciaInsights(url, env) {
  const days = clampInt(url.searchParams.get("days"), 7, 120, PROVINCIA_DAYS_DEFAULT);
  const rows = await fetchProvinciaCurrentRows(env, days);
  const payload = buildProvinciaResumenPayload(rows, days, null);
  return json({
    ok: true,
    days,
    generated_at: new Date().toISOString(),
    items: payload.banner_items || []
  });
}

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
  const webhookUrl = env.MERCADOPAGO_WEBHOOK_URL || new URL(`${API_URL_PREFIX}/mercadopago/webhook`, request.url).toString();
  const mpPreference = await createMercadoPagoCheckoutPreference(env, {
    user,
    plan,
    externalReference,
    webhookUrl
  }).catch(err => {
    console.warn("Mercado Pago checkout fallback:", err?.message || err);
    return null;
  });

  const checkoutUrl = mpPreference?.checkout_url || (
    env.MERCADOPAGO_CHECKOUT_FALLBACK_URL
      ? `${env.MERCADOPAGO_CHECKOUT_FALLBACK_URL}?plan=${encodeURIComponent(planCode)}&ref=${encodeURIComponent(externalReference)}`
      : null
  );
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
    message: checkoutConfigured
      ? (mpPreference?.mode === "mercadopago_preference"
          ? "Checkout real de Mercado Pago preparado"
          : "Checkout preparado")
      : "Se registro la sesion, pero todavia falta configurar el checkout real de Mercado Pago.",
    session_id: session?.id || null,
    checkout_url: checkoutUrl,
    sandbox_init_point: mpPreference?.sandbox_init_point || null,
    preference_id: mpPreference?.preference_id || null,
    external_reference: externalReference,
    plan: normalizePlanOut(plan)
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
    received_at: new Date().toISOString()
  }).catch(err => {
    console.warn("No se pudo guardar el webhook de Mercado Pago:", err?.message || err);
  });

  const sync = await syncMercadoPagoWebhook(env, { topic, action, resourceId, payload }).catch(err => {
    console.warn("No se pudo sincronizar el pago de Mercado Pago:", err?.message || err);
    return {
      processed: false,
      reason: "sync_error",
      message: err?.message || "Error sincronizando Mercado Pago"
    };
  });

  return json({ ok: true, sync });
}

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
  const paymentDate =
    payment?.date_approved ||
    payment?.date_last_updated ||
    payment?.date_created ||
    new Date().toISOString();
  const currentPeriodEndsAt =
    subscriptionStatus === "ACTIVE" || subscriptionStatus === "AUTHORIZED"
      ? addDaysIso(paymentDate, clampInt(env.MERCADOPAGO_SUBSCRIPTION_PERIOD_DAYS, 1, 365, 30))
      : null;

  if (session) {
    await supabasePatch(
      env,
      "mercadopago_checkout_sessions",
      `id=eq.${encodeURIComponent(session.id)}`,
      {
        status: sessionStatus,
        provider_payload: {
          ...((typeof session.provider_payload === "object" && session.provider_payload) ? session.provider_payload : {}),
          payment_id: payment?.id || null,
          payment_status: payment?.status || null,
          payment_status_detail: payment?.status_detail || null,
          payment_type_id: payment?.payment_type_id || null,
          payer_email: payment?.payer?.email || null,
          processed_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      }
    ).catch(err => {
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
    updated_at: new Date().toISOString()
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

async function findCheckoutSessionByExternalReference(env, externalReference) {
  const rows = await supabaseSelect(
    env,
    `mercadopago_checkout_sessions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,user_id,plan_code,status,provider_payload&order=created_at.desc&limit=1`
  ).catch(() => []);

  return rows?.[0] || null;
}

async function findSubscriptionByExternalReference(env, externalReference) {
  const rows = await supabaseSelect(
    env,
    `user_subscriptions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,status,external_reference&order=created_at.desc&limit=1`
  ).catch(() => []);

  return rows?.[0] || null;
}

function parseMercadoPagoExternalReference(value) {
  const raw = String(value || "").trim();
  if (!raw) return { user_id: "", plan_code: "" };

  const [userId = "", planCode = ""] = raw.split(":");
  return {
    user_id: String(userId || "").trim(),
    plan_code: String(planCode || "").trim().toUpperCase()
  };
}

function mapMercadoPagoSubscriptionStatus(status) {
  const key = String(status || "").trim().toUpperCase();

  if (key === "APPROVED") return "ACTIVE";
  if (key === "AUTHORIZED") return "AUTHORIZED";
  if (key === "PENDING" || key === "IN_PROCESS" || key === "PENDING_CONTINGENCY") return "PENDING";
  if (key === "IN_MEDIATION") return "PAUSED";
  if (key === "REFUNDED" || key === "CHARGED_BACK" || key === "CANCELLED" || key === "REJECTED") return "CANCELLED";
  return key || "PENDING";
}

function mapMercadoPagoCheckoutStatus(status) {
  const key = String(status || "").trim().toUpperCase();

  if (key === "APPROVED") return "approved";
  if (key === "AUTHORIZED") return "authorized";
  if (key === "PENDING" || key === "IN_PROCESS" || key === "PENDING_CONTINGENCY") return "pending";
  if (key === "REJECTED" || key === "CANCELLED") return "rejected";
  if (key === "REFUNDED" || key === "CHARGED_BACK") return "refunded";
  return key.toLowerCase() || "pending";
}

function addDaysIso(baseIso, days) {
  const baseDate = parseFechaFlexible(baseIso) || new Date();
  const next = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
}
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

async function handleWhatsAppHealth(env) {
  const templateName = String(env.WHATSAPP_TEMPLATE_ALERTA || "hello_world").trim();
  const templateLang = String(env.WHATSAPP_TEMPLATE_LANG || "en_US").trim();
  const configured =
    !!env.WHATSAPP_PHONE_NUMBER_ID &&
    !!env.WHATSAPP_ACCESS_TOKEN &&
    !!env.WHATSAPP_TEMPLATE_ALERTA;

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
    note: configured
      ? (
          isHelloWorldTemplate(templateName)
            ? "WhatsApp listo para pruebas controladas. Para alertas reales conviene una plantilla propia."
            : "WhatsApp listo para pruebas controladas y despachos programados."
        )
      : "Todavia faltan variables para habilitar envios reales por WhatsApp."
  });
}

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

  const configured =
    !!env.WHATSAPP_PHONE_NUMBER_ID &&
    !!env.WHATSAPP_ACCESS_TOKEN &&
    !!env.WHATSAPP_TEMPLATE_ALERTA;

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
  }).catch(err => {
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
        description: String(context?.plan?.descripcion || "").trim() || undefined,
        quantity: 1,
        currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS",
        unit_price: amount
      }
    ],
    payer: {
      email: String(context?.user?.email || "").trim().toLowerCase() || undefined,
      name: String(context?.user?.nombre || "").trim() || undefined,
      surname: String(context?.user?.apellido || "").trim() || undefined
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

function whatsappTestDestinations(value) {
  const primary = normalizeWhatsappDestination(value);
  if (!primary) return [];

  const variants = unique([
    primary,
    whatsappAllowedListVariant(primary)
  ]);

  return variants.filter(Boolean);
}

function whatsappAllowedListVariant(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return `54${digits.slice(3)}`;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  return "";
}

function isHelloWorldTemplate(templateName) {
  return String(templateName || "").trim().toLowerCase() === "hello_world";
}

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

function isMetaAllowedListError(data) {
  const message = String(data?.error?.message || data?.message || "").toLowerCase();
  const code = Number(data?.error?.error_subcode || data?.error?.code || 0);

  return code === 131030 || message.includes("allowed list");
}
async function getRecentSentEmailAlertKeysForUser(env, userId) {
  const limit = 200;

  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?user_id=eq.${encodeURIComponent(userId)}&channel=eq.email&select=payload,status,created_at&order=created_at.desc&limit=${limit}`
  ).catch(() => []);

  const keys = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (!status.startsWith("sent")) continue;

    const key = String(row?.payload?.alert_key || "").trim();
    if (key) keys.add(key);
  }

  return keys;
}

function buildEmailAlertKey(userId, alertItem) {

  const key = String(
    alertItem?.source_offer_key ||
    alertItem?.iddetalle ||
    alertItem?.idoferta ||
    alertItem?.codigo ||
    JSON.stringify(alertItem)
  ).trim();

  return key ? `${userId}:${key}` : "";
}

function buildEmailAlertHtml(alertItem, user) {
  return `
  <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto;">

    <h2 style="color:#2b6cb0;">APDocentePBA</h2>
    <h3>Resumen de ofertas</h3>

    <p>Hola ${user?.nombre || ""},</p>

    <p>Se encontró una nueva oferta que coincide con tus preferencias:</p>

    <div style="border-top:1px solid #ccc; margin:15px 0;"></div>

    <p><strong>${alertItem?.cargo || "Cargo"}</strong></p>
    <p>${alertItem?.nivel || ""}</p>

    <p>🏫 ${alertItem?.escuela || "-"}</p>
    <p>📍 ${alertItem?.distrito || "-"}</p>

    <p>🕐 Turno: ${alertItem?.turno || "-"}</p>
    <p>📦 Módulos: ${alertItem?.modulos || "-"}</p>

    <p>📅 Desde: ${alertItem?.desde || "-"}</p>
    <p>📅 Hasta: ${alertItem?.hasta || "-"}</p>

    <p>⏳ Cierre: ${alertItem?.cierre || "-"}</p>

    <p>👥 Postulados: ${alertItem?.postulados || "-"}</p>
    <p>🥇 Primero: ${alertItem?.primero_puntaje || "-"} puntos</p>

    <div style="margin:20px 0;">
      <a href="${alertItem?.abc_url || "#"}" 
         style="background:#3182ce; color:white; padding:10px 15px; text-decoration:none; border-radius:5px;">
         Ir a ABC para postularme
      </a>
    </div>

    <div style="margin:20px 0;">
      <a href="https://apdocentepba.com" 
         style="background:#38a169; color:white; padding:10px 15px; text-decoration:none; border-radius:5px;">
         Ver todas en APDocentePBA
      </a>
    </div>

    <div style="border-top:1px solid #ccc; margin:15px 0;"></div>

    <p style="font-size:12px; color:#666;">
      ⚠️ Las ofertas suelen cerrar de madrugada<br><br>
      Podés ajustar tus preferencias desde el panel
    </p>

  </div>
  `;
}

async function sendEmailAlertForUser(env, user, alertItem, options = {}) {
  const alertKey = buildEmailAlertKey(user?.id, alertItem);

  const payload = {
    alert_key: alertKey || null,
    source: options.source || "cron",
    alert: {
  source_offer_key: alertItem?.source_offer_key || null,
  iddetalle: alertItem?.iddetalle || null,
  idoferta: alertItem?.idoferta || null,
  distrito: alertItem?.distrito || "",
  cargo: alertItem?.cargo || "",
  escuela: alertItem?.escuela || "",
  turno: alertItem?.turno || "",
  modulos: alertItem?.modulos || "",
  desde: alertItem?.desde || "",
  hasta: alertItem?.hasta || "",
  nivel: alertItem?.nivel || alertItem?.modalidad || "",
  finoferta_label: alertItem?.finoferta_label || "",
  cierre: alertItem?.cierre || "",
  postulados: alertItem?.postulados || "",
  primero_puntaje: alertItem?.primero_puntaje || "",
  abc_url: alertItem?.abc_url || null
}
  };

  if (!user?.email) {
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
      payload,
      provider_response: { message: "Alerta duplicada ignorada por constraint unique_alert_user" }
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
    payload,
    provider_response: { message: msg || "Error al encolar alerta" }
  }).catch(() => null);

  return { ok: false, reason: "enqueue_error", alert_key: alertKey };
}
}

async function runEmailAlertsSweep(env, options = {}) {

  const BATCH_SIZE = 2;

  let cursorRaw = await env.EMAIL_SWEEP_STATE.get("cursor");
  let cursor = Number.parseInt(String(cursorRaw || "0"), 10);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const prefRows = await supabaseSelect(
    env,
    `user_preferences?alertas_activas=is.true&alertas_email=is.true&select=user_id&order=user_id.asc`
  ).catch(() => []);

  const total = Array.isArray(prefRows) ? prefRows.length : 0;

  if (!total) {
    return {
      ok: true,
      processed_users: 0,
      sent_count: 0,
      skipped_count: 0,
      failed_count: 0,
      cursor_from: 0,
      cursor_to: 0,
      total_users: 0,
      message: "No hay usuarios con alertas por email activas"
    };
  }

  const rowsToProcess = options?.target_user_id
    ? prefRows.filter(r => String(r?.user_id || "").trim() === String(options.target_user_id).trim())
    : prefRows.slice(cursor, cursor + BATCH_SIZE);

  let processedUsers = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rowsToProcess) {
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

   for (const alertItem of items) {
  const alertKey = buildEmailAlertKey(userId, alertItem);

  if (alertKey && sentKeys.has(alertKey)) {
    skippedCount += 1;
    continue;
  }

  const result = await sendEmailAlertForUser(env, user, alertItem, {
    source: options.source || "cron"
  });

  if (result.ok) {
    sentCount += 1;
    if (alertKey) sentKeys.add(alertKey);
  } else {
    failedCount += 1;
  }
}
  }

  let newCursor = cursor;

  if (!options?.target_user_id) {
    newCursor = cursor + BATCH_SIZE;
    if (newCursor >= total) newCursor = 0;
    await env.EMAIL_SWEEP_STATE.put("cursor", String(newCursor));
  }

  return {
    ok: true,
    processed_users: processedUsers,
    sent_count: sentCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    cursor_from: cursor,
    cursor_to: newCursor,
    total_users: total
  };
}

function parseWhatsAppBodyParameters(raw) {
  if (!raw) return [];

  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];

    return data
      .map(item => ({ type: "text", text: String(item ?? "").trim() }))
      .filter(item => item.text);
  } catch {
    return [];
  }
}

async function runWhatsAppAlertsSweep(env, options = {}) {
  const templateName = String(env.WHATSAPP_TEMPLATE_ALERTA || "").trim();
  const templateLang = String(env.WHATSAPP_TEMPLATE_LANG || "en_US").trim();
  const configured =
    !!env.WHATSAPP_PHONE_NUMBER_ID &&
    !!env.WHATSAPP_ACCESS_TOKEN &&
    !!templateName;

  if (!configured) {
    return { ok: true, skipped: true, reason: "missing_config" };
  }

  if (isHelloWorldTemplate(templateName)) {
    return { ok: true, skipped: true, reason: "hello_world_template" };
  }

  const maxUsers = clampInt(
    env.WHATSAPP_ALERT_SWEEP_MAX_USERS,
    1,
    200,
    WHATSAPP_ALERT_SWEEP_MAX_USERS
  );
  const maxAlertsPerUser = clampInt(
    env.WHATSAPP_ALERTS_PER_USER_MAX,
    1,
    10,
    WHATSAPP_ALERTS_PER_USER_MAX
  );

  const prefRows = await supabaseSelect(
    env,
    `user_preferences?alertas_activas=is.true&alertas_whatsapp=is.true&select=user_id&limit=${maxUsers}`
  ).catch(() => []);

  let usersVisited = 0;
  let usersEligible = 0;
  let alertsSent = 0;
  let alertsFailed = 0;

  for (const row of Array.isArray(prefRows) ? prefRows : []) {
    const userId = String(row?.user_id || "").trim();
    if (!userId) continue;
    usersVisited += 1;

    const resolved = await resolverPlanUsuario(env, userId).catch(() => null);
    if (!resolved?.plan?.feature_flags?.whatsapp) continue;

    const user = await obtenerUsuario(env, userId).catch(() => null);
    if (!user?.activo || !String(user?.celular || "").trim()) continue;

    const alertData = await construirAlertasParaUsuario(env, userId).catch(err => ({
      ok: false,
      message: err?.message || "No se pudieron construir alertas"
    }));
    if (!alertData?.ok || !Array.isArray(alertData?.resultados) || !alertData.resultados.length) continue;

    const recentKeys = await loadRecentSentWhatsAppAlertKeys(env, userId);
    const pendingAlerts = alertData.resultados.filter(item => {
      const key = buildWhatsAppAlertKey(userId, item);
      return key && !recentKeys.has(key);
    });

    if (!pendingAlerts.length) continue;
    usersEligible += 1;

    for (const alertItem of pendingAlerts.slice(0, maxAlertsPerUser)) {
      const result = await sendWhatsAppAlertForUser(env, user, alertItem, {
        templateName,
        templateLang,
        source: options.source || "cron"
      });

      if (result.ok) {
        alertsSent += 1;
        if (result.alert_key) recentKeys.add(result.alert_key);
      } else {
        alertsFailed += 1;
      }
    }
  }

  return {
    ok: true,
    users_visited: usersVisited,
    users_eligible: usersEligible,
    alerts_sent: alertsSent,
    alerts_failed: alertsFailed
  };
}

async function loadRecentSentWhatsAppAlertKeys(env, userId) {
  const limit = clampInt(
    env.WHATSAPP_ALERT_LOG_LOOKBACK,
    20,
    1000,
    WHATSAPP_ALERT_LOG_LOOKBACK
  );
  const rows = await supabaseSelect(
    env,
    `notification_delivery_logs?user_id=eq.${encodeURIComponent(userId)}&channel=eq.whatsapp&select=payload,status,created_at&order=created_at.desc&limit=${limit}`
  ).catch(() => []);

  const keys = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (!status.startsWith("sent_")) continue;
    const key = String(row?.payload?.alert_key || "").trim();
    if (key) keys.add(key);
  }
  return keys;
}

function buildWhatsAppAlertKey(userId, alertItem) {
  const sourceKey = String(
    alertItem?.source_offer_key ||
    alertItem?.iddetalle ||
    alertItem?.idoferta ||
    ""
  ).trim();
  return sourceKey ? `${String(userId || "").trim()}:${sourceKey}` : "";
}

function buildWhatsAppAlertBodyParameters(alertItem) {
  const values = [
    alertItem?.cargo || alertItem?.area || "Oferta APD",
    alertItem?.distrito || "-",
    alertItem?.escuela || "Sin escuela",
    alertItem?.finoferta_label || formatearFechaAbc(alertItem?.finoferta || "", "datetime") || "-"
  ];

  return values.map(value => ({
    type: "text",
    text: String(value || "").trim() || "-"
  }));
}

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

async function runProvinciaBackfillStep(env, options = {}) {
  const state = await obtenerScanState(env);
  const staleRunning = isStaleProvinciaBackfill(state);

  if (state.status === "running" && options.force !== true && !staleRunning) {
    return { ok: true, skipped: true, reason: "already_running" };
  }

  const catalogRows = await obtenerDistritosProvincia(env);
  const distritos = unique(
    catalogRows.map(row => norm(row.apd_nombre || row.nombre || "")).filter(Boolean)
  );

  if (!distritos.length) {
    throw new Error("No hay catalogo de distritos para el backfill provincial");
  }

  let districtIndex = clampInt(state.district_index, 0, Math.max(distritos.length - 1, 0), 0);
  let nextPage = clampInt(state.next_page, 0, 999999, 0);
  let pagesProcessed = Number(state.pages_processed || 0);
  let districtsCompleted = Number(state.districts_completed || 0);
  let offersProcessed = Number(state.offers_processed || 0);
  const startedAt = state.started_at || new Date().toISOString();
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
    last_run_at: new Date().toISOString(),
    notes: {
      ...(state.notes || {}),
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

    const capturedAt = new Date().toISOString();
    const rows = batchInfo.docs.map(doc => buildGlobalSnapshotRow(doc, capturedAt));
    const currentMap = await loadCurrentRowsMap(env, rows.map(row => row.source_offer_key));
    const currentRows = rows.map(row => buildGlobalCurrentRow(row, currentMap.get(row.source_offer_key), capturedAt));

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
      finished_at: finished ? new Date().toISOString() : null,
      last_run_at: new Date().toISOString(),
      notes: {
        ...(state.notes || {}),
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
      last_run_at: new Date().toISOString(),
      notes: {
        ...(state.notes || {}),
        retryable: false,
        last_error: err?.message || "Error en backfill provincial",
        failed_page: nextPage
      }
    });

    throw err;
  }
}

async function runProvinciaBackfillLoop(env, options = {}) {
  const maxSteps = clampInt(options.max_steps, 1, 40, PROVINCIA_AUTORUN_MAX_STEPS);
  const maxMs = clampInt(options.max_ms, 3000, 120000, PROVINCIA_AUTORUN_MAX_MS);
  const started = Date.now();
  let stepsCompleted = 0;
  let lastResult = null;

  while (stepsCompleted < maxSteps && Date.now() - started < maxMs) {
    const current = await obtenerScanState(env);
    const staleRunning = isStaleProvinciaBackfill(current);

    if (current.status === "finished") {
      break;
    }

    if (current.status === "running" && options.force !== true && !staleRunning && stepsCompleted === 0) {
      return { ok: true, skipped: true, reason: "already_running", steps_completed: 0 };
    }

    lastResult = await runProvinciaBackfillStep(env, {
      ...options,
      force: stepsCompleted > 0 ? true : options.force === true || staleRunning
    });

    stepsCompleted += 1;

    if (lastResult?.finished || lastResult?.skipped) {
      break;
    }
  }

  const finalState = await obtenerScanState(env);

  return {
    ok: true,
    steps_completed: stepsCompleted,
    finished: finalState.status === "finished",
    status: finalState.status || "idle",
    district_name: finalState.district_name || null,
    districts_completed: Number(finalState.districts_completed || 0),
    total_districts: Number(finalState.total_districts || 0),
    offers_processed: Number(finalState.offers_processed || 0),
    last_result: lastResult
  };
}

async function fetchHistoricoRowsByDistritos(env, table, distritos, days, limit = 8000) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const filters = distritos.map(item => `distrito.eq.${encodeURIComponent(item)}`).join(",");
  const rows = await supabaseSelect(
    env,
    `${table}?captured_at=gte.${encodeURIComponent(sinceIso)}&select=iddetalle,idoferta,source_offer_key,estado,distrito,escuela,cargo,area,nivel_modalidad,turno,jornada,hsmodulos,cursodivision,finoferta,total_postulantes,puntaje_primero,listado_origen_primero,captured_at&or=(${filters})&order=captured_at.desc&limit=${limit}`
  ).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function buildHistoricoResumenPayload(rows, days) {
  const groupedRows = new Map();

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

  const nuevas7d = firstSeenRows.filter(row => {
    const ts = parseFechaFlexible(row.captured_at)?.getTime() || 0;
    return ts >= nowTs - 7 * 24 * 60 * 60 * 1000;
  }).length;

  const cierran72h = activeRows.filter(row => {
    const fin = parseFechaFlexible(row.finoferta)?.getTime() || 0;
    return fin && fin >= nowTs && fin <= nowTs + 72 * 60 * 60 * 1000;
  }).length;

  return {
    ok: true,
    empty: false,
    ventana_dias: days,
    ultima_captura: latestRows[0]?.captured_at || null,
    capturas_filtradas: rows.length,
    ofertas_unicas: latestRows.length,
    activas_estimadas: activeRows.length,
    designadas_estimadas: latestRows.filter(row => estadoHistoricoKey(row) === "DESIGNADA").length,
    anuladas_estimadas: latestRows.filter(row => estadoHistoricoKey(row) === "ANULADA").length,
    desiertas_estimadas: latestRows.filter(row => estadoHistoricoKey(row) === "DESIERTA").length,
    nuevas_7d: nuevas7d,
    cierran_72h: cierran72h,
    cambios_estado_recientes: cambios.length,
    promedio_postulantes: promedioNumerico(latestRows.map(row => row.total_postulantes), 1),
    promedio_puntaje_primero: promedioNumerico(latestRows.map(row => row.puntaje_primero), 2),
    top_distritos: topCountItems(latestRows.map(row => row.distrito), 4),
    top_cargos: topCountItems(latestRows.map(tituloHistoricoRow), 5),
    top_turnos: topCountItems(activeRows.map(row => mapTurnoAPD(row.turno || "")), 4),
    top_escuelas: topCountItems(latestRows.map(row => row.escuela), 5),
    ultimos_cambios: cambios.slice(0, 6),
    ultimas_ofertas: latestRows.slice(0, 6).map(row => ({
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

async function fetchProvinciaCurrentRows(env, days) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseSelect(
    env,
    `apd_ofertas_global_current?last_seen_at=gte.${encodeURIComponent(sinceIso)}&select=source_offer_key,idoferta,iddetalle,estado,distrito,escuela,cargo,area,nivel_modalidad,turno,jornada,hsmodulos,cursodivision,supl_desde,supl_hasta,finoferta,ult_movimiento,first_seen_at,last_seen_at,last_state_change_at,times_seen,state_changes&order=last_seen_at.desc&limit=${PROVINCIA_SUMMARY_LIMIT}`
  ).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function buildProvinciaResumenPayload(rows, days, state) {
  const activeRows = rows.filter(ofertaHistoricaActiva);
  const closedRows = rows.filter(row => !ofertaHistoricaActiva(row));
  const nowTs = Date.now();
  const districtsWithActivity = unique(activeRows.map(row => row.distrito).filter(Boolean)).length;
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
    nuevas_7d: rows.filter(row => {
      const ts = parseFechaFlexible(row.first_seen_at)?.getTime() || 0;
      return ts >= nowTs - 7 * 24 * 60 * 60 * 1000;
    }).length,
    top_distritos: topCountItems(activeRows.map(row => row.distrito), 8),
    top_cargos: topCountItems(activeRows.map(tituloHistoricoRow), 8),
    top_turnos: topCountItems(activeRows.map(row => mapTurnoAPD(row.turno || "")), 5),
    top_escuelas: topCountItems(activeRows.map(row => row.escuela), 6),
    state_breakdown: {
      activas: activeRows.length,
      designadas: rows.filter(row => estadoHistoricoKey(row) === "DESIGNADA").length,
      anuladas: rows.filter(row => estadoHistoricoKey(row) === "ANULADA").length,
      desiertas: rows.filter(row => estadoHistoricoKey(row) === "DESIERTA").length,
      cerradas: rows.filter(row => estadoHistoricoKey(row) === "CERRADA").length
    },
    leaders: {
      matematica: findSubjectLeader(activeRows, ["MATEMATICA"]),
      ingles: findSubjectLeader(activeRows, ["INGLES"])
    },
    latest_rows: rows.slice(0, 8).map(row => ({
      distrito: row.distrito || "",
      cargo: row.cargo || "",
      area: row.area || "",
      escuela: row.escuela || "",
      estado: estadoHistoricoLabel(row),
      turno: mapTurnoAPD(row.turno || ""),
      last_seen_at: row.last_seen_at || null
    })),
    banner_items: buildProvincialInsightCards(rows, activeRows, closedRows, state),
    scan_state: state
      ? {
          status: state.status || "idle",
          district_index: state.district_index || 0,
          districts_completed: state.districts_completed || 0,
          total_districts: state.total_districts || 0,
          offers_processed: Number(state.offers_processed || 0),
          last_run_at: state.last_run_at || null
        }
      : null
  };
}

function buildProvincialInsightCards(rows, activeRows, closedRows, state) {
  const items = [];
  const seenTexts = new Set();
  const rankedDistricts = topCountItems(activeRows.map(row => row.distrito), 5);
  const rankedCargos = topCountItems(activeRows.map(tituloHistoricoRow), 4);
  const rankedTurnos = topCountItems(activeRows.map(row => mapTurnoAPD(row.turno || "")), 3);
  const rankedSchools = topCountItems(activeRows.map(row => row.escuela), 3);
  const matem = findSubjectLeader(activeRows, ["MATEMATICA"]);
  const ingles = findSubjectLeader(activeRows, ["INGLES"]);

  function pushCard(title, text, tone) {
    const cleanText = String(text || "").trim();
    if (!cleanText || seenTexts.has(cleanText)) return;
    seenTexts.add(cleanText);
    items.push({ title, text: cleanText, tone });
  }

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

function findSubjectLeader(rows, keywords) {
  const subset = rows.filter(row => {
    const title = norm(`${row.cargo || ""} ${row.area || ""}`);
    return keywords.some(keyword => title.includes(norm(keyword)));
  });
  return topCountItems(subset.map(row => row.distrito), 1)[0] || null;
}

function buildProvinciaCoverageHint(state, districtsWithActivity, activeRows) {
  const rankedDistricts = topCountItems(activeRows.map(row => row.distrito), 2);
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
        updated_at: new Date().toISOString(),
        notes: state.notes || {}
      }
    ],
    "scope"
  );
}

function isStaleProvinciaBackfill(state) {
  if (String(state?.status || "").trim().toLowerCase() !== "running") return false;
  const ts = parseFechaFlexible(state?.updated_at || state?.last_run_at)?.getTime() || 0;
  if (!ts) return false;
  return Date.now() - ts > PROVINCIA_RUNNING_STALE_MS;
}

function isRetryableBackfillError(err) {
  const message = String(err?.message || err || "").toUpperCase();
  return (
    message.includes("SUPABASE 429") ||
    message.includes("SUPABASE 500") ||
    message.includes("SUPABASE 502") ||
    message.includes("SUPABASE 503") ||
    message.includes("SUPABASE 504") ||
    message.includes("BAD GATEWAY") ||
    message.includes("GATEWAY") ||
    message.includes("TIMEOUT") ||
    message.includes("FETCH")
  );
}

async function obtenerDistritosProvincia(env) {
  const rows = await supabaseSelect(
    env,
    "catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc"
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchAPDDistrictBatch(distritoAPD, startPage, pagesToRead, rowsPerPage) {
  const docs = [];
  let pagesRead = 0;
  let hasMore = false;

  for (let offset = 0; offset < pagesToRead; offset += 1) {
    const pageIndex = startPage + offset;
    const start = pageIndex * rowsPerPage;
    const q = `descdistrito:"${escaparSolr(distritoAPD)}"`;
    const url =
      `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select` +
      `?q=${encodeURIComponent(q)}&rows=${rowsPerPage}&start=${start}&wt=json&sort=ult_movimiento%20desc`;

    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`APD respondio ${res.status}: ${txt}`);
    }

    const data = await res.json();
    const pageDocs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    const filtered = pageDocs.filter(doc => norm(doc?.descdistrito || "") === norm(distritoAPD));

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

async function loadCurrentRowsMap(env, keys) {
  const map = new Map();
  const uniqueKeys = unique(keys).filter(Boolean);

  for (let i = 0; i < uniqueKeys.length; i += 70) {
    const slice = uniqueKeys.slice(i, i + 70);
    const filters = slice.map(key => `source_offer_key.eq.${encodeURIComponent(key)}`).join(",");
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
    last_state_change_at: stateChanged
      ? capturedAt
      : prevRow?.last_state_change_at || prevRow?.last_seen_at || capturedAt,
    times_seen: prevRow ? Number(prevRow.times_seen || 0) + 1 : 1,
    state_changes: prevRow ? Number(prevRow.state_changes || 0) + (stateChanged ? 1 : 0) : 0,
    raw: snapshotRow.raw,
    updated_at: capturedAt
  };
}

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

  const resultados = [];
  const descartadas = [];
  const vistos = new Set();

  for (const oferta of ofertas) {
    if (!ofertaEsVisibleParaAlerta(oferta)) {
      descartadas.push({ iddetalle: oferta.iddetalle || oferta.id || null, motivo: "oferta_no_usable" });
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
    const item = buildAlertItem(oferta, evaluacion);

    if (evaluacion.match) resultados.push(item);
    else descartadas.push({ ...item, motivo: "no_coincide_preferencias" });
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
function formatearDiasHorariosOferta(oferta) {
  const directo = String(
    oferta?.dias_horarios ||
    oferta?.diashorarios ||
    oferta?.horario ||
    ""
  ).trim();

  if (directo) return directo;

  const dias = [
    ["Lunes", oferta?.lunes],
    ["Martes", oferta?.martes],
    ["Miércoles", oferta?.miercoles],
    ["Jueves", oferta?.jueves],
    ["Viernes", oferta?.viernes],
    ["Sábado", oferta?.sabado]
  ]
    .map(([dia, valor]) => [dia, String(valor || "").trim()])
    .filter(([, valor]) => !!valor);

  if (!dias.length) return "";

  const valoresUnicos = [...new Set(dias.map(([, valor]) => valor))];

  if (valoresUnicos.length === 1) {
    const mismoHorario = valoresUnicos[0];
    const nombres = dias.map(([dia]) => dia);

    const esLunAVie =
      nombres.length === 5 &&
      nombres.join("|") === "Lunes|Martes|Miércoles|Jueves|Viernes";

    if (esLunAVie) {
      return `Lunes a Viernes: ${mismoHorario}`;
    }

    return `${nombres.join(", ")}: ${mismoHorario}`;
  }

  return dias.map(([dia, valor]) => `${dia}: ${valor}`).join(" · ");
}
function resolverTipoRevistaOferta(oferta) {
  const revistaRaw = norm(
    oferta?.supl_revista ||
    oferta?.revista ||
    oferta?.situacion_revista ||
    ""
  );

  if (
    revistaRaw === "S" ||
    revistaRaw.includes("SUPLENCIA") ||
    revistaRaw.includes("SUPL")
  ) {
    return {
      codigo: "S",
      label: "Suplencia"
    };
  }

  if (
    revistaRaw === "P" ||
    revistaRaw.includes("PROVISIONAL") ||
    revistaRaw.includes("PROVIS")
  ) {
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
    label: (desdeReal && hastaReal) ? "Suplencia" : "Provisional"
  };
}
function buildAlertItem(oferta, evaluacion) {
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

    raw: oferta
  };
}

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
  filters.forEach(fq => qs.append("fq", fq));
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

function buildAbcPostulantesUrl(ofertaId, detalleId) {
  const params = new URLSearchParams();
  const ofertaSafe = sanitizeSolrNumber(ofertaId);
  const detalleSafe = sanitizeSolrNumber(detalleId);
  if (ofertaSafe) params.set("oferta", ofertaSafe);
  if (detalleSafe) params.set("detalle", detalleSafe);
  return `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?${params.toString()}`;
}



async function obtenerPlanPorCode(env, planCode) {
  const candidates = uniqueUpper([planCode, canonicalPlanCode(planCode)]);

  for (const code of candidates) {
    const rows = await supabaseSelect(
      env,
      `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags&limit=1`
    ).catch(() => []);

    if (rows?.[0]) return rows[0];
  }

  return (
    defaultPlansCatalog().find(
      plan => canonicalPlanCode(plan.code) === canonicalPlanCode(planCode)
    ) || null
  );
}

async function findUserByEmail(env, email) {
  const rows = await supabaseSelect(
    env,
    `users?email=ilike.${encodeURIComponent(email)}&select=id,nombre,apellido,email,password_hash,google_sub,activo&limit=1`
  );
  return rows?.[0] || null;
}

async function findUserByGoogleSub(env, sub) {
  const rows = await supabaseSelect(
    env,
    `users?google_sub=eq.${encodeURIComponent(sub)}&select=id,nombre,apellido,email,password_hash,google_sub,activo&limit=1`
  );
  return rows?.[0] || null;
}

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

async function obtenerUsuario(env, userId) {
  const rows = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo,celular,ultimo_login&limit=1`
  );
  return rows?.[0] || null;
}

async function touchUltimoLogin(env, userId) {
  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(userId)}`, {
    ultimo_login: new Date().toISOString()
  });
}

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

function splitGoogleName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const nombre = parts.shift() || "Docente";
  const apellido = parts.join(" ") || "-";
  return { nombre, apellido };
}

async function passwordMatches(storedPassword, plainPassword) {
  const stored = String(storedPassword || "");
  const plain = String(plainPassword || "");
  if (!stored || !plain) return false;
  if (stored === plain) return true;
  const hashed = await sha256Hex(plain);
  return stored === hashed;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(item => item.toString(16).padStart(2, "0"))
    .join("");
}

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

async function supabaseUpdate(env, table, match, values) {
  const baseUrl = `${env.SUPABASE_URL}/rest/v1/${table}`;

  // 👇 FORMATO CORRECTO PARA SUPABASE
  const query = Object.entries(match)
    .map(([k, v]) => `${k}=eq.${v}`)
    .join("&");

  const res = await fetch(`${baseUrl}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(values)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`supabaseUpdate error: ${text}`);
  }

  return true;
}

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

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

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

function shouldRetrySupabaseStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(Number(status));
}

function shouldRetrySupabaseErrorMessage(message) {
  const text = String(message || "").toUpperCase();
  return (
    text.includes("SUPABASE 429") ||
    text.includes("SUPABASE 500") ||
    text.includes("SUPABASE 502") ||
    text.includes("SUPABASE 503") ||
    text.includes("SUPABASE 504") ||
    text.includes("BAD GATEWAY") ||
    text.includes("TIMEOUT") ||
    text.includes("ECONNRESET") ||
    text.includes("FETCH") ||
    text.includes("NETWORK")
  );
}

async function obtenerPreferenciasUsuario(env, userId) {
  const rows = await supabaseSelect(
    env,
    `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`
  ).catch(() => []);
  const row = rows?.[0];
  return row ? adaptarPreferenciasRow(row) : null;
}

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
function canonicalPlanCode(code) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return "PLUS";
  if (key === "PRO") return "PREMIUM";
  return key;
}

function getPlanPreset(code) {
  const key = canonicalPlanCode(code);

  const presets = {
    TRIAL_7D: {
      code: "TRIAL_7D",
      nombre: "Prueba gratis 7 días",
      descripcion: "Probá APDocentePBA durante 7 días con 1 distrito, hasta 2 materias/cargos y todos los filtros esenciales. Todos los avisos llegan por email.",
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
        telegram: false,
        telegram_coming_soon: false,
        whatsapp_coming_soon: false,
        provincia: false,
        insights_plus: false
      }
    },

    PLUS: {
      code: "PLUS",
      nombre: "Plan Plus",
      descripcion: "Más alcance sin irte de presupuesto: 2 distritos, hasta 4 materias/cargos, filtros completos y alertas por email. Próximamente Telegram.",
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
        telegram: false,
        telegram_coming_soon: true,
        whatsapp_coming_soon: false,
        provincia: true,
        insights_plus: false
      }
    },

    PREMIUM: {
      code: "PREMIUM",
      nombre: "Plan Pro",
      descripcion: "Cobertura fuerte para multiplicar oportunidades: 3 distritos, hasta 6 materias/cargos, filtros completos y alertas por email. Próximamente Telegram.",
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
        telegram: false,
        telegram_coming_soon: true,
        whatsapp_coming_soon: false,
        provincia: true,
        insights_plus: true
      }
    },

    INSIGNE: {
      code: "INSIGNE",
      nombre: "Plan Insigne",
      descripcion: "Cobertura máxima para no perder actos clave: 3 distritos principales + 2 distritos de emergencia/chusmeo, hasta 10 materias/cargos y alertas por email. Próximamente WhatsApp.",
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
        whatsapp: false,
        telegram: false,
        telegram_coming_soon: false,
        whatsapp_coming_soon: true,
        provincia: true,
        insights_plus: true,
        emergency_districts: true
      }
    }
  };

  return presets[key] || presets.PLUS;
}

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

async function resolverPlanUsuario(env, userId) {
  const catalogo = await cargarPlanesCatalogo(env);

  const planMap = new Map(
    catalogo.map(plan => {
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

  const trialPlan =
    planMap.get("TRIAL_7D") || normalizePlanOut(planPorCode("TRIAL_7D"));

  return {
    plan: trialPlan,
    subscription: {
      id: null,
      user_id: userId,
      plan_code: "TRIAL_7D",
      status: "available",
      source: "catalogo_default",
      started_at: new Date().toISOString(),
      trial_ends_at: null,
      current_period_ends_at: null,
      mercadopago_preapproval_id: null
    }
  };
}


function elegirSuscripcionVigente(rows) {
  const permitidos = new Set(["ACTIVE", "TRIALING", "AUTHORIZED", "PENDING", "PAUSED", "BETA"]);
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

async function cargarPlanesCatalogo(env) {
  try {
    const rows = await supabaseSelect(
      env,
      "subscription_plans?select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,is_active,public_visible,sort_order,mercadopago_plan_id,feature_flags"
    );
    if (Array.isArray(rows) && rows.length) return rows;
  } catch {}
  return defaultPlansCatalog();
}


function defaultPlansCatalog() {
  return ["TRIAL_7D", "PLUS", "PREMIUM", "INSIGNE"].map(code => {
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



function planPorCode(code) {
  const key = canonicalPlanCode(code);
  return (
    defaultPlansCatalog().find(plan => canonicalPlanCode(plan.code) === key) ||
    defaultPlansCatalog().find(plan => plan.code === "PLUS") ||
    defaultPlansCatalog()[0]
  );
}



function normalizePlanOut(plan) {
  const originalCode = String(plan?.code || "PLUS").trim().toUpperCase();
  const internalCode = canonicalPlanCode(originalCode);
  const preset = getPlanPreset(internalCode);

  const rawFlags =
    typeof plan?.feature_flags === "object" && plan?.feature_flags
      ? plan.feature_flags
      : {};

  const featureFlags = {
    ...rawFlags,
    ...(preset.feature_flags || {})
  };

  const maxDistritosNormales = clampPlanLimit(
    preset.max_distritos_normales ??
      plan?.max_distritos_normales ??
      plan?.max_distritos_base ??
      plan?.max_distritos,
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
    preset.max_distritos ??
      plan?.max_distritos_total ??
      plan?.max_distritos ??
      (maxDistritosNormales + maxDistritosEmergencia),
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
    price_ars:
      plan?.price_ars != null
        ? Number(plan.price_ars)
        : preset?.price_ars != null
          ? Number(preset.price_ars)
          : null,
    trial_days: clampPlanLimit(plan?.trial_days ?? preset.trial_days, 0, 365, 0),
    max_distritos: maxDistritosTotal,
    max_distritos_total: maxDistritosTotal,
    max_distritos_normales: maxDistritosNormales,
    max_distritos_emergencia: maxDistritosEmergencia,
    max_cargos: maxCargosTotal,
    max_cargos_total: maxCargosTotal,
    public_visible:
      plan?.public_visible != null ? !!plan.public_visible : !!preset.public_visible,
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



function buildPlanFeatures(plan) {
  const flags =
    typeof plan?.feature_flags === "object" && plan?.feature_flags
      ? plan.feature_flags
      : {};

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
  items.push("Turno, nivel y modalidad");

  if (plan?.trial_days) {
    items.push(`${plan.trial_days} días de prueba`);
  }

  if (flags.telegram_coming_soon) {
    items.push("Telegram próximamente");
  }

  if (flags.whatsapp_coming_soon) {
    items.push("WhatsApp próximamente");
  }

  return items;
}

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



function sanitizarPreferenciasEntrada(raw, plan) {
  const distritos = uniqueUpper([
    raw?.distrito_principal,
    ...(Array.isArray(raw?.otros_distritos) ? raw.otros_distritos : [])
  ]);

  const cargos = uniqueUpper([
    ...(Array.isArray(raw?.cargos) ? raw.cargos : []),
    ...(Array.isArray(raw?.materias) ? raw.materias : [])
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
    alertas_whatsapp: !!raw?.alertas_whatsapp,
    _plan_ajuste: {
      distritos_recortados: distritosRecortados,
      cargos_recortados: cargosRecortados,
      max_distritos: maxDistritos,
      max_cargos: maxCargos
    }
  };
}

function canonicalizarNivelPreferencia(value) { const s = norm(value); if (!s) return ""; if (s.includes("SUPERIOR") || s.includes("FORMACION DOCENTE") || s.includes("DOCENTE")) return "SUPERIOR"; if (s.includes("INICIAL")) return "INICIAL"; if (s.includes("PRIMARIA") || s.includes("PRIMARIO")) return "PRIMARIO"; if (s.includes("SECUNDARIA") || s.includes("SECUNDARIO")) return "SECUNDARIO"; if (s.includes("ESPECIAL")) return "EDUCACION ESPECIAL"; if (s.includes("JOVENES") || s.includes("ADULTOS") || s.includes("CENS")) return "ADULTOS"; if (s.includes("FISICA")) return "EDUCACION FISICA"; if (s.includes("PSICOLOGIA") || s.includes("COMUNITARIA")) return "PSICOLOGIA"; if (s.includes("ARTISTICA") || s.includes("ARTE")) return "EDUCACION ARTISTICA"; if (s.includes("TECNICO")) return "TECNICO PROFESIONAL"; return s; }
function canonicalizarTurnoPreferencia(value) { const x = norm(value); if (!x) return ""; if (x === "M" || x === "MANANA") return "M"; if (x === "T" || x === "TARDE") return "T"; if (x === "V" || x === "VESPERTINO") return "V"; if (x === "N" || x === "NOCHE") return "N"; if (x === "A" || x === "ALTERNADO") return "ALTERNADO"; return x; }
function uniqueUpper(items) { const out = []; const seen = new Set(); for (const item of Array.isArray(items) ? items : []) { const value = String(item || "").trim().toUpperCase(); if (!value || seen.has(value)) continue; seen.add(value); out.push(value); } return out; }
function clampPlanLimit(raw, min, max, fallback) { const n = Number(raw); if (!Number.isFinite(n)) return fallback; return Math.max(min, Math.min(max, Math.trunc(n))); }
function parsearCargosDesdeHTML(html) { const limpio = String(html || "").replace(/<[^>]+>/g, "\n"); const lineas = limpio.split("\n").map(item => item.trim()).filter(item => item.length > 10 && item.includes(",")); const items = []; const vistos = new Set(); for (const linea of lineas) { const partes = linea.split(","); if (partes.length < 2) continue; const codigo = String(partes[0] || "").replace("*", "").trim(); const nombre = String(partes[1] || "").trim(); if (!nombre) continue; const nombreNorm = norm(nombre); if (!nombreNorm || vistos.has(nombreNorm)) continue; vistos.add(nombreNorm); items.push({ codigo: codigo || null, nombre, nombre_norm: nombreNorm, apd_nombre: nombre, apd_nombre_norm: nombreNorm, fuente: "abc" }); } return items; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function clampInt(raw, min, max, fallback) { const n = Number.parseInt(String(raw || ""), 10); if (!Number.isFinite(n)) return fallback; return Math.max(min, Math.min(max, n)); }
function buscarEnCatalogo(lista, valor) { const v = norm(valor); if (!v) return null; const exacto = lista.find(item => norm(item.nombre_norm || item.nombre || "") === v || norm(item.apd_nombre_norm || item.apd_nombre || "") === v); if (exacto) return exacto; return lista.find(item => { const n1 = norm(item.nombre_norm || item.nombre || ""); const n2 = norm(item.apd_nombre_norm || item.apd_nombre || ""); return n1 === v || n2 === v || v.includes(n1) || n1.includes(v) || v.includes(n2) || n2.includes(v); }) || null; }
function canonizarListaDistritos(lista, catalogo) { const humanos = []; const apd = []; for (const item of lista || []) { const hit = buscarEnCatalogo(catalogo, item); if (hit) { humanos.push(norm(hit.nombre || item)); apd.push(norm(hit.apd_nombre || hit.nombre || item)); } else { const value = norm(item); if (value) { humanos.push(value); apd.push(value); } } } return { humanos: unique(humanos), apd: unique(apd) }; }
function canonizarListaCargosOMaterias(lista, catalogo) { const humanos = []; const apd = []; for (const item of lista || []) { const hit = buscarEnCatalogo(catalogo, item); if (hit) { humanos.push(norm(hit.nombre || item)); apd.push(norm(hit.apd_nombre || hit.nombre || item)); } else { const value = norm(item); if (value) { humanos.push(value); apd.push(value); } } } return { humanos: unique(humanos), apd: unique(apd) }; }
function canonizarPreferenciasConCatalogo(prefs, catalogos) { const principal = canonizarListaDistritos([prefs.distrito_principal || ""], catalogos.distritos); const otros = canonizarListaDistritos(prefs.otros_distritos || [], catalogos.distritos); const cargosCanon = canonizarListaCargosOMaterias(prefs.cargos || [], catalogos.cargos); const materiasCanon = canonizarListaCargosOMaterias(prefs.materias || [], catalogos.cargos); return { ...prefs, distrito_principal: principal.humanos[0] || norm(prefs.distrito_principal || ""), distrito_principal_apd: principal.apd[0] || norm(prefs.distrito_principal || ""), otros_distritos: otros.humanos, otros_distritos_apd: otros.apd, cargos: cargosCanon.humanos, cargos_apd: cargosCanon.apd, materias: materiasCanon.humanos, materias_apd: materiasCanon.apd }; }
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

        for (const doc of info.docs) {
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

      for (const doc of info.docs) {
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
async function traerOfertasAPDDeUnDistrito(distritoAPD) { const distritoNorm = norm(distritoAPD); const docsTotales = []; for (let i = 0; i < USER_CAPTURE_MAX_PAGES; i += 1) { const start = i * USER_CAPTURE_ROWS_PER_PAGE; const q = `descdistrito:"${escaparSolr(distritoAPD)}"`; const consultaUrl = `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select?q=${encodeURIComponent(q)}&rows=${USER_CAPTURE_ROWS_PER_PAGE}&start=${start}&wt=json&sort=ult_movimiento%20desc`; const res = await fetch(consultaUrl); if (!res.ok) { const txt = await res.text(); throw new Error(`APD respondio ${res.status}: ${txt}`); } const data = await res.json(); const docs = data?.response?.docs || []; if (!docs.length) break; docsTotales.push(...docs); if (docs.length < USER_CAPTURE_ROWS_PER_PAGE) break; } const docsFiltrados = docsTotales.filter(doc => norm(doc?.descdistrito || "") === distritoNorm); return { docs: docsFiltrados, query: `descdistrito:"${distritoAPD}"`, totalBruto: docsTotales.length, totalFiltrado: docsFiltrados.length }; }
async function traerOfertasAPDDeUnDistritoYCargo(distritoAPD, cargoMateria) {
  const distritoNorm = norm(distritoAPD);
  const cargoNorm = norm(cargoMateria);

  const docsTotales = [];

  for (let i = 0; i < USER_CAPTURE_MAX_PAGES; i += 1) {
    const start = i * USER_CAPTURE_ROWS_PER_PAGE;

    const q = [
      `descdistrito:"${escaparSolr(distritoAPD)}"`,
      `(` +
        [
          `descripcioncargo:"${escaparSolr(cargoMateria)}"`,
          `descripcionarea:"${escaparSolr(cargoMateria)}"`,
          `cargo:"${escaparSolr(cargoMateria)}"`
        ].join(" OR ") +
      `)`
    ].join(" AND ");

    const consultaUrl =
      `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select` +
      `?q=${encodeURIComponent(q)}&rows=${USER_CAPTURE_ROWS_PER_PAGE}&start=${start}&wt=json&sort=ult_movimiento%20desc`;

    const res = await fetch(consultaUrl);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`APD respondio ${res.status}: ${txt}`);
    }

    const data = await res.json();
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    if (!docs.length) break;

    const docsFiltrados = docs.filter(doc => {
      const distritoOk = norm(doc?.descdistrito || "") === distritoNorm;

      const textoCargo = norm([
        doc?.descripcioncargo,
        doc?.descripcionarea,
        doc?.cargo,
        doc?.materia,
        doc?.asignatura
      ].filter(Boolean).join(" "));

      const cargoOk =
        textoCargo.includes(cargoNorm) ||
        cargoNorm.includes(textoCargo);

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
function buildSourceOfferKeyFromOferta(oferta) { const detalle = sanitizeSolrNumber(oferta?.iddetalle || oferta?.id || ""); if (detalle) return `D_${detalle}`; const ofertaId = sanitizeSolrNumber(oferta?.idoferta || ""); if (ofertaId) return `O_${ofertaId}`; return [norm(oferta?.descdistrito || ""), norm(oferta?.escuela || oferta?.nombreestablecimiento || ""), norm(oferta?.descripcioncargo || oferta?.cargo || ""), norm(oferta?.descripcionarea || ""), sanitizeKeyText(oferta?.finoferta || "")].filter(Boolean).join("_").slice(0, 220); }
function sanitizeKeyText(value) { return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function escaparSolr(text) { return String(text || "").replace(/(["\\])/g, "\\$1"); }
function ofertaEsVisibleParaAlerta(oferta) { const estado = norm(oferta?.estado || ""); const fin = parseFechaFlexible(oferta?.finoferta)?.getTime() || 0; const ahora = Date.now(); if (estado.includes("ANULADA")) return false; if (estado.includes("DESIGNADA")) return false; if (fin && fin < ahora - 48 * 60 * 60 * 1000) return false; return true; }
function ofertaEsVisibleParaHistoricoUsuario(oferta) { const fin = parseFechaFlexible(oferta?.finoferta)?.getTime() || 0; const ahora = Date.now(); if (fin && fin < ahora - 180 * 24 * 60 * 60 * 1000) return false; return true; }
function norm(value) { return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s/().,-]/gu, " ").replace(/\s+/g, " ").trim(); }
function arrNorm(value) { if (Array.isArray(value)) return value.map(item => norm(item)).filter(Boolean); if (typeof value === "string" && value.trim()) return value.split(",").map(item => norm(item)).filter(Boolean); return []; }
function unique(arr) { return [...new Set((arr || []).filter(Boolean))]; }
function adaptarPreferenciasRow(row) { return { user_id: row.user_id || "", distrito_principal: norm(row.distrito_principal || ""), otros_distritos: unique(arrNorm(row.otros_distritos)), cargos: unique(arrNorm(row.cargos)), materias: unique(arrNorm(row.materias)), niveles: unique(arrNorm(row.niveles)), turnos: unique(arrNorm(row.turnos)), alertas_activas: !!row.alertas_activas, alertas_email: !!row.alertas_email, alertas_whatsapp: !!row.alertas_whatsapp }; }
function distritosPrefsAPD(prefs) { return unique([norm(prefs?.distrito_principal_apd || prefs?.distrito_principal || ""), ...(prefs?.otros_distritos_apd || [])].filter(Boolean)); }
function cargosMateriasPrefsAPD(prefs) { return unique([...(prefs?.cargos_apd || []), ...(prefs?.materias_apd || [])]); }
function turnosPrefs(prefs) { return unique((prefs?.turnos || []).map(item => { const x = norm(item); if (!x) return ""; if (x === "CUALQUIERA" || x === "CUALQUIER TURNO") return ""; if (x === "M" || x === "MANANA") return "MANANA"; if (x === "T" || x === "TARDE") return "TARDE"; if (x === "V" || x === "VESPERTINO") return "VESPERTINO"; if (x === "N" || x === "NOCHE") return "NOCHE"; if (x === "A" || x === "ALTERNADO") return "ALTERNADO"; return x; }).filter(Boolean)); }
function categoriasNivel(texto) { const t = norm(texto); const out = new Set(); if (!t) return out; if (t.includes("INICIAL")) out.add("INICIAL"); if (t.includes("PRIMARIA") || t.includes("PRIMARIO")) out.add("PRIMARIO"); if (t.includes("SECUNDARIA") || t.includes("SECUNDARIO")) out.add("SECUNDARIO"); if (t.includes("SUPERIOR")) out.add("SUPERIOR"); if (t.includes("FORMACION DOCENTE")) out.add("SUPERIOR"); if (t.includes("DOCENTE")) out.add("SUPERIOR"); if (t.includes("ESPECIAL")) out.add("EDUCACION ESPECIAL"); if (t.includes("JOVENES") || t.includes("ADULTOS") || t.includes("CENS")) out.add("ADULTOS"); if (t.includes("FISICA")) out.add("EDUCACION FISICA"); if (t.includes("PSICOLOGIA") || t.includes("COMUNITARIA")) out.add("PSICOLOGIA"); if (t.includes("ARTISTICA") || t.includes("ARTE")) out.add("EDUCACION ARTISTICA"); if (t.includes("TECNICO")) out.add("TECNICO PROFESIONAL"); return out; }
function matchDistritos(oferta, prefs) { const prefsD = distritosPrefsAPD(prefs); if (!prefsD.length) return { ok: true, motivo: "Sin filtro de distrito" }; const distritoOferta = norm(oferta?.descdistrito || oferta?.distrito || ""); if (!distritoOferta) return { ok: false, motivo: "La oferta no trae distrito" }; const ok = prefsD.includes(distritoOferta); return { ok, motivo: ok ? `Distrito compatible: ${distritoOferta}` : `Distrito no compatible: ${distritoOferta}` }; }
function matchCargosMaterias(oferta, prefs) { const prefsCM = cargosMateriasPrefsAPD(prefs); if (!prefsCM.length) return { ok: true, motivo: "Sin filtro de cargo o materia" }; const textoOferta = norm([oferta?.descripcioncargo, oferta?.cargo, oferta?.descripcionarea, oferta?.materia, oferta?.asignatura, oferta?.descripcionmateria].filter(Boolean).join(" ")); if (!textoOferta) return { ok: false, motivo: "La oferta no trae cargo o materia" }; const ok = prefsCM.some(pref => { const p = norm(pref); return textoOferta.includes(p) || p.includes(textoOferta) || textoOferta.split(" ").some(token => token === p); }); return { ok, motivo: ok ? "Cargo o materia compatible" : "Cargo o materia no compatible" }; }
function matchTurno(oferta, prefs) { const prefsT = turnosPrefs(prefs); if (!prefsT.length) return { ok: true, motivo: "Sin filtro de turno" }; const turnoOferta = norm(oferta?.turno || oferta?.descturno || ""); if (!turnoOferta) return { ok: false, motivo: "La oferta no trae turno" }; const ok = prefsT.includes(turnoOferta); return { ok, motivo: ok ? `Turno compatible: ${turnoOferta}` : `Turno no compatible: ${turnoOferta}` }; }
function matchNivelModalidad(oferta, prefs) { const prefsN = prefs?.niveles || []; if (!prefsN.length) return { ok: true, motivo: "Sin filtro de nivel o modalidad" }; const textoOferta = norm([oferta?.descnivelmodalidad, oferta?.nivel, oferta?.modalidad, oferta?.nivel_modalidad].filter(Boolean).join(" ")); if (!textoOferta) return { ok: false, motivo: "La oferta no trae nivel o modalidad" }; const catsOferta = categoriasNivel(textoOferta); const catsPrefs = new Set(); for (const pref of prefsN) { for (const cat of categoriasNivel(pref)) catsPrefs.add(cat); } if (!catsPrefs.size) return { ok: true, motivo: "Preferencia no reconocida" }; let ok = false; for (const cat of catsPrefs) { if (catsOferta.has(cat)) { ok = true; break; } } return { ok, motivo: ok ? "Nivel o modalidad compatible" : "Nivel o modalidad no compatible" }; }
function coincideOfertaConPreferencias(oferta, prefs) { const distrito = matchDistritos(oferta, prefs); if (!distrito.ok) return { match: false, detalle: { distrito } }; const cargosMaterias = matchCargosMaterias(oferta, prefs); if (!cargosMaterias.ok) return { match: false, detalle: { distrito, cargosMaterias } }; const turno = matchTurno(oferta, prefs); if (!turno.ok) return { match: false, detalle: { distrito, cargosMaterias, turno } }; const nivelModalidad = matchNivelModalidad(oferta, prefs); if (!nivelModalidad.ok) return { match: false, detalle: { distrito, cargosMaterias, turno, nivelModalidad } }; return { match: true, detalle: { distrito, cargosMaterias, turno, nivelModalidad } }; }
function mapTurnoAPD(turno) { const x = norm(turno); if (x === "M" || x === "MANANA") return "MANANA"; if (x === "T" || x === "TARDE") return "TARDE"; if (x === "V" || x === "VESPERTINO") return "VESPERTINO"; if (x === "N" || x === "NOCHE") return "NOCHE"; if (x === "MT") return "MANANA"; if (x === "TT") return "TARDE"; if (x === "A" || x === "ALTERNADO") return "ALTERNADO"; return x; }
function coincideOfertaConPreferenciasAPD(oferta, prefs) { return coincideOfertaConPreferencias({ descdistrito: oferta.descdistrito, descripcioncargo: oferta.descripcioncargo, cargo: oferta.cargo, descripcionarea: oferta.descripcionarea, materia: oferta.materia, asignatura: oferta.asignatura, descripcionmateria: oferta.descripcionmateria, turno: mapTurnoAPD(oferta.turno), descnivelmodalidad: oferta.descnivelmodalidad }, prefs); }
function historicoRowToOferta(row) { return { descdistrito: row?.distrito || "", descripcioncargo: row?.cargo || "", descripcionarea: row?.area || "", turno: row?.turno || "", descnivelmodalidad: row?.nivel_modalidad || "" }; }
function historicoRowKey(row) { const sourceKey = String(row?.source_offer_key || "").trim(); if (sourceKey) return sourceKey; const detalle = String(row?.iddetalle || "").trim(); if (detalle) return detalle; return [row?.idoferta || "", row?.distrito || "", row?.escuela || "", row?.cargo || "", row?.area || "", row?.finoferta || ""].map(value => norm(value)).join("|"); }
function estadoHistoricoKey(value) { const raw = typeof value === "string" ? value : value?.estado; const estado = norm(raw || ""); if (!estado) return "SIN ESTADO"; if (estado.includes("ANUL")) return "ANULADA"; if (estado.includes("DESIER")) return "DESIERTA"; if (estado.includes("DESIGN")) return "DESIGNADA"; if (estado.includes("FINAL")) return "FINALIZADA"; if (estado.includes("CERR")) return "CERRADA"; if (estado.includes("ACT") || estado.includes("ABIERT") || estado.includes("VIGENT")) return "ACTIVA"; return estado; }
function estadoHistoricoLabel(value) { switch (estadoHistoricoKey(value)) { case "ACTIVA": return "Activa"; case "DESIGNADA": return "Designada"; case "ANULADA": return "Anulada"; case "DESIERTA": return "Desierta"; case "CERRADA": return "Cerrada"; case "FINALIZADA": return "Finalizada"; default: return String(value?.estado || value || "").trim() || "Sin estado"; } }
function ofertaHistoricaActiva(row) { const estadoKey = estadoHistoricoKey(row); const fin = parseFechaFlexible(row?.finoferta)?.getTime() || 0; const ahora = Date.now(); if (estadoKey === "ANULADA" || estadoKey === "DESIGNADA" || estadoKey === "DESIERTA" || estadoKey === "CERRADA" || estadoKey === "FINALIZADA") return false; if (fin && fin < ahora - 48 * 60 * 60 * 1000) return false; return true; }
function tituloHistoricoRow(row) { return unique([row?.cargo || "", row?.area || ""].filter(Boolean)).join(" · ") || "Oferta APD"; }
function topCountItems(values, limit = 5) { const counts = new Map(); for (const raw of Array.isArray(values) ? values : []) { const label = String(raw || "").trim(); if (!label) continue; counts.set(label, (counts.get(label) || 0) + 1); } return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, limit).map(([label, value]) => ({ label, value })); }
function promedioNumerico(values, digits = 1) { const nums = (Array.isArray(values) ? values : []).map(value => Number(value)).filter(value => Number.isFinite(value)); if (!nums.length) return null; const avg = nums.reduce((acc, n) => acc + n, 0) / nums.length; const factor = 10 ** digits; return Math.round(avg * factor) / factor; }
function sortHistoricoDesc(a, b) { const ta = parseFechaFlexible(a?.captured_at || a?.last_seen_at)?.getTime() || 0; const tb = parseFechaFlexible(b?.captured_at || b?.last_seen_at)?.getTime() || 0; return tb - ta; }
function parseFechaFlexible(value) { const raw = String(value || "").trim(); if (!raw) return null; const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/); if (iso) { const [, yyyy, mm, dd, hh = "0", mi = "0", ss = "0"] = iso; return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)); } const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); if (dmy) { const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy; return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)); } const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : date; }
function parsePartesFechaAbc(raw) { const value = String(raw || "").trim(); if (!value || value.includes("9999")) return null; const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/); if (iso) { const [, yyyy, mm, dd, hh = "00", mi = "00", ss = "00"] = iso; return { yyyy, mm, dd, hh, mi, ss, hasTime: iso[4] != null }; } const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); if (dmy) { const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = dmy; return { yyyy, mm: String(mm).padStart(2, "0"), dd: String(dd).padStart(2, "0"), hh: String(hh).padStart(2, "0"), mi: String(mi).padStart(2, "0"), ss: String(ss).padStart(2, "0"), hasTime: dmy[4] != null }; } return null; }
function formatearFechaAbc(raw, mode = "auto") { const value = String(raw || "").trim(); if (!value) return ""; if (value.includes("9999")) return "Sin fecha"; const parts = parsePartesFechaAbc(value); if (!parts) return value; const dateStr = `${parts.dd}/${parts.mm}/${parts.yyyy}`; const hasRealTime = parts.hasTime && !(parts.hh === "00" && parts.mi === "00" && parts.ss === "00"); if (mode === "date") return dateStr; if (mode === "datetime") return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr; return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr; }
function normalizarCursoDivisionServidor(value) { let s = String(value || "").trim(); if (!s) return ""; s = s.replace(/Â°/g, "°").replace(/º/g, "°").replace(/Ş/g, "°").replace(/�/g, "°"); s = s.replace(/(\d)\s*°\s*(\d)\s*°?/g, "$1°$2°"); s = s.replace(/\s+/g, " ").trim(); return s; }
function sanitizeSolrNumber(value) { return String(value || "").replace(/[^\d]/g, ""); }
function json(data, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders() }); }
function escapeHtmlMail(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function renderMailOfferCard(row) {
  const p = row?.offer_payload || {};
  const titulo = p.cargo || p.materia || p.title || "Oferta APD";

  return `
    <div style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">
        ${escapeHtmlMail(titulo)}
      </div>

      ${p.distrito ? `<div><b>Distrito:</b> ${escapeHtmlMail(p.distrito)}</div>` : ""}
      ${p.escuela ? `<div><b>Escuela:</b> ${escapeHtmlMail(p.escuela)}</div>` : ""}
      ${p.turno ? `<div><b>Turno:</b> ${escapeHtmlMail(p.turno)}</div>` : ""}
      ${p.jornada ? `<div><b>Jornada:</b> ${escapeHtmlMail(p.jornada)}</div>` : ""}
      ${p.nivel ? `<div><b>Nivel:</b> ${escapeHtmlMail(p.nivel)}</div>` : ""}

      ${p.desde ? `<div><b>Desde:</b> ${escapeHtmlMail(p.desde)}</div>` : ""}
      ${p.hasta ? `<div><b>Hasta:</b> ${escapeHtmlMail(p.hasta)}</div>` : ""}

      ${p.tipo_cargo ? `<div><b>Tipo:</b> ${escapeHtmlMail(p.tipo_cargo)}</div>` : ""}
      ${p.revista ? `<div><b>Situación:</b> ${escapeHtmlMail(p.revista)}</div>` : ""}

      ${p.modulos ? `<div><b>Módulos:</b> ${escapeHtmlMail(String(p.modulos))}</div>` : ""}
      ${p.curso_division ? `<div><b>Curso/División:</b> ${escapeHtmlMail(p.curso_division)}</div>` : ""}
      ${p.dias_horarios ? `<div><b>Horario:</b> ${escapeHtmlMail(p.dias_horarios)}</div>` : ""}

      ${p.fecha_cierre ? `<div><b>Cierre:</b> ${escapeHtmlMail(p.fecha_cierre)}</div>` : ""}
      ${p.observaciones ? `<div><b>Observaciones:</b> ${escapeHtmlMail(p.observaciones)}</div>` : ""}

      ${p.total_postulantes != null ? `<div><b>Postulados:</b> ${escapeHtmlMail(String(p.total_postulantes))}</div>` : ""}
      ${p.puntaje_primero != null ? `<div><b>Puntaje más alto:</b> ${escapeHtmlMail(String(p.puntaje_primero))}</div>` : ""}
      ${p.listado_origen_primero ? `<div><b>Listado del más alto:</b> ${escapeHtmlMail(p.listado_origen_primero)}</div>` : ""}
    </div>
  `;
}

function buildPanelDigestHtml({ user, nuevas, viejas }) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:800px;margin:0 auto;color:#222;">
      <h1 style="font-size:22px;">Ofertas APD para vos</h1>
      <p>Hola ${escapeHtmlMail(user?.nombre || "")}, este correo se armó usando las ofertas activas que hoy ve tu panel.</p>

      ${
        viejas.length
          ? `
        <h2 style="margin-top:24px;">Ofertas ya visibles en tu panel</h2>
        <div>${viejas.map(renderMailOfferCard).join("")}</div>
      `
          : ""
      }

      ${
        nuevas.length
          ? `
        <h2 style="margin-top:24px;">Nuevas desde el último aviso</h2>
        <div>${nuevas.map(renderMailOfferCard).join("")}</div>
      `
          : ""
      }

      <hr style="margin:24px 0;">
      <p style="font-size:12px;color:#666;">APDocentePBA · Resumen automático</p>
    </div>
  `;
}
async function sendPendingEmailDigests(env, options = {}) {
  const users = await supabaseSelect(
    env,
    `users?select=id,nombre,apellido,email,activo&activo=eq.true&email=not.is.null`
  ).catch(() => []);

  let processedUsers = 0;
  let sent = 0;
  let failed = 0;

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
      `user_offer_state?user_id=eq.${encodeURIComponent(user.id)}&is_active=eq.true&select=id,offer_id,offer_payload,first_emailed_at,last_emailed_at`
    ).catch(() => []);

    if (!rows || !rows.length) continue;

    const nuevas = rows.filter(x => !x.first_emailed_at);
    const viejas = rows.filter(x => !!x.first_emailed_at);

    processedUsers++;

    const alerts = await Promise.all(
      rows.map(async row => {
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
          offer_payload: merged
        };
      })
    );

    const html = buildDigestHtml(alerts, user);

    const asunto =
      nuevas.length > 0
        ? `APDocentePBA: ${nuevas.length} nueva${nuevas.length === 1 ? "" : "s"} y ${viejas.length} ya visible${viejas.length === 1 ? "" : "s"}`
        : `APDocentePBA: ${viejas.length} oferta${viejas.length === 1 ? "" : "s"} visible${viejas.length === 1 ? "" : "s"} en tu panel`;

    const send = await enviarMailBrevo(
      user.email,
      user.nombre || "",
      asunto,
      html,
      env
    );

    if (send?.ok) {
      sent++;

      const nowIso = new Date().toISOString();

      await Promise.all(
        rows.map(row => {
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
      failed++;
    }
  }

  return {
    ok: true,
    processed_users: processedUsers,
    sent,
    failed
  };
}
function buildDigestHtml(alerts, user) {
  const panelUrl = "https://apdocentepba.github.io";

  const items = alerts.map(a => {
    const o = normalizeOfferPayload(a.offer_payload || {});

    const tipo = String(o.revista || "").trim() || (
      (
        o.desde &&
        String(o.desde).trim() &&
        String(o.desde).trim().toLowerCase() !== "sin fecha" &&
        o.hasta &&
        String(o.hasta).trim() &&
        String(o.hasta).trim().toLowerCase() !== "sin fecha"
      )
        ? "Suplencia"
        : "Provisional"
    );

    return `
      <tr>
        <td style="padding:0 0 16px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dbe3f0;border-radius:14px;background:#ffffff;">
            <tr>
              <td style="padding:16px 16px 14px 16px;">

                <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.25;font-weight:700;color:#0f3460;margin:0 0 10px 0;">
                  ${escHtml(o.cargo || o.materia || o.title || "Oferta APD")}
                </div>

                <div style="margin:0 0 12px 0;">
                  ${o.escuela ? `<span style="display:inline-block;background:#eef4ff;color:#1f4fa3;padding:6px 10px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🏫 ${escHtml(o.escuela)}</span>` : ""}
                  ${o.distrito ? `<span style="display:inline-block;background:#e8f0fe;color:#1a4f8a;padding:6px 10px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">📍 ${escHtml(o.distrito)}</span>` : ""}
                  ${o.turno ? `<span style="display:inline-block;background:#eefbf3;color:#0d7a3e;padding:6px 10px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🕒 ${escHtml(o.turno)}</span>` : ""}
                  ${o.jornada ? `<span style="display:inline-block;background:#f3f4f6;color:#374151;padding:6px 10px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🏫 ${escHtml(o.jornada)}</span>` : ""}
                  ${o.nivel ? `<span style="display:inline-block;background:#fff4e5;color:#9a6700;padding:6px 10px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">🎓 ${escHtml(o.nivel)}</span>` : ""}
                  ${tipo ? `<span style="display:inline-block;background:#f3e8ff;color:#7c3aed;padding:6px 10px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;margin:0 6px 6px 0;">📌 ${escHtml(tipo)}</span>` : ""}
                </div>

                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
                  ${digestRow("Curso / división", o.curso_division)}
                  ${digestRow("Tipo", tipo)}
                  ${digestRow("Desde", o.desde)}
                  ${digestRow("Hasta", o.hasta)}
                  ${digestRow("Módulos", o.modulos)}
                  ${digestRow("Días / horarios", o.dias_horarios)}
                  ${digestRow("Cierre", o.fecha_cierre)}
                </div>

                ${
                  o.observaciones
                    ? `
                      <div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#6b7280;margin-bottom:4px;">OBSERVACIONES</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#111827;">${escHtml(o.observaciones)}</div>
                      </div>
                    `
                    : ""
                }

                <div style="margin-top:12px;padding:10px 12px;background:#f7faff;border:1px solid #dbeafe;border-radius:10px;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:6px;">RESUMEN DE POSTULANTES</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#111827;">
                    ${digestRow("Cantidad", (o.total_postulantes != null && o.total_postulantes !== "") ? o.total_postulantes : "Sin postulados informados")}
${digestRow("Puntaje más alto", (o.puntaje_primero != null && o.puntaje_primero !== "") ? o.puntaje_primero : "Sin datos")}
${digestRow("Listado del más alto", o.listado_origen_primero ? o.listado_origen_primero : "Sin datos")}
                  </div>
                </div>

                <div style="margin-top:14px;">
                  ${
                    o.link
                      ? `<a href="${escHtml(o.link)}" target="_blank" style="display:inline-block;background:#1f66ff;color:#ffffff;padding:10px 14px;margin:4px 8px 0 0;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">Ir a ABC</a>`
                      : ""
                  }
                  <a href="${panelUrl}" target="_blank" style="display:inline-block;background:#0f3460;color:#ffffff;padding:10px 14px;margin:4px 8px 0 0;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">Ir a mi panel</a>
                </div>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div style="background:#f0f2f7;padding:20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">

            <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:620px;">
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
                    Ofertas APD para vos
                  </div>

                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#374151;margin:0 0 16px 0;">
                    Hola ${escHtml(user.nombre || "")}, estas son las ofertas actualmente visibles en tu panel.
                  </div>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${
                      items || `
                        <tr>
                          <td style="padding:16px;border:1px dashed #cbd5e1;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#475569;">
                            No hay ofertas para mostrar en este envío.
                          </td>
                        </tr>
                      `
                    }
                  </table>

                  <div style="margin-top:8px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
                    <a href="https://abc.gob.ar" target="_blank" style="display:inline-block;background:#374151;color:#ffffff;padding:10px 14px;margin:5px;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">
                      Ir a ABC
                    </a>
                    <a href="${panelUrl}" target="_blank" style="display:inline-block;background:#0f3460;color:#ffffff;padding:10px 14px;margin:5px;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">
                      Ir a mi panel
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

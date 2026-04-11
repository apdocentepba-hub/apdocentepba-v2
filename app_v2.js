'use strict';
console.log("APP_V2_CARGADO");

const API_URL = "https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const APD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
const APD_SUPABASE_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co";
const APD_SUPABASE_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";
const GOOGLE_CLIENT_ID = "650896364013-s3o36ckvoi42947v6ummmgdkdmsgondo.apps.googleusercontent.com";

const TOKEN_KEY = "apd_token_v2";
const AUTOCOMPLETE_DEBOUNCE_MS = 90;
const AUTOCOMPLETE_LIMIT = 12;
const HISTORICO_DAYS_DEFAULT = 30;

let tokenMem = null;
let googleInitDone = false;
let planActual = buildPlanFallback();

const alertasState = {
  items: [],
  index: 0
};
window.alertasState = alertasState;

/* ===== ADMIN ===== */
const ADMIN = {
  enabled: false
};

function getAdminToken() {
  return obtenerToken();
}

async function adminApiGet(path) {
  const token = getAdminToken();

  const res = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": token ? `Bearer ${token}` : ""
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }

  return data;
}

function adminSetOutput(data) {
  const pre = document.getElementById("admin-output");
  if (!pre) return;
  pre.textContent = JSON.stringify(data, null, 2);
}

function adminSetCards(resumen) {
  const box = document.getElementById("admin-cards");
  if (!box) return;

  if (!resumen) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <div class="admin-card"><strong>Usuarios</strong><span>${resumen.usuarios_total ?? 0}</span></div>
    <div class="admin-card"><strong>Activos</strong><span>${resumen.usuarios_activos ?? 0}</span></div>
    <div class="admin-card"><strong>Admins</strong><span>${resumen.admins_total ?? 0}</span></div>
    <div class="admin-card"><strong>Sesiones</strong><span>${resumen.sesiones_activas ?? 0}</span></div>
    <div class="admin-card"><strong>Alertas hoy</strong><span>${resumen.alertas_hoy ?? 0}</span></div>
    <div class="admin-card"><strong>Errores</strong><span>${resumen.errores_hoy ?? 0}</span></div>
  `;
}

async function adminCheckAccess() {
  try {
    const data = await adminApiGet("/api/admin/me");
    const isAdmin = !!data?.user?.es_admin;

    ADMIN.enabled = isAdmin;

    const card = document.getElementById("admin-panel-card");
    if (card) {
      card.classList.toggle("hidden", !isAdmin);
    }

    return isAdmin;
  } catch (e) {
    ADMIN.enabled = false;
    const card = document.getElementById("admin-panel-card");
    if (card) card.classList.add("hidden");
    return false;
  }
}

async function adminLoadResumen() {
  const data = await adminApiGet("/api/admin/resumen");
  adminSetCards(data.resumen || null);
  adminSetOutput(data);
}

async function adminLoadUsuarios() {
  const data = await adminApiGet("/api/admin/usuarios");
  adminSetOutput(data);
}

async function adminLoadSesiones() {
  const data = await adminApiGet("/api/admin/sesiones");
  adminSetOutput(data);
}

async function adminLoadAlertas() {
  const data = await adminApiGet("/api/admin/alertas");
  adminSetOutput(data);
}

function bindAdminEvents() {
  document.getElementById("admin-cargar-resumen")?.addEventListener("click", () =>
    adminLoadResumen().catch(err => adminSetOutput({ ok: false, error: err.message }))
  );

  document.getElementById("admin-cargar-usuarios")?.addEventListener("click", () =>
    adminLoadUsuarios().catch(err => adminSetOutput({ ok: false, error: err.message }))
  );

  document.getElementById("admin-cargar-sesiones")?.addEventListener("click", () =>
    adminLoadSesiones().catch(err => adminSetOutput({ ok: false, error: err.message }))
  );

  document.getElementById("admin-cargar-alertas")?.addEventListener("click", () =>
    adminLoadAlertas().catch(err => adminSetOutput({ ok: false, error: err.message }))
  );
}




const postulantesResumenCache = new Map();
const suggestionCache = new Map();
const autocompleteStates = new Map();

const catalogoAutocomplete = {
  distritos: {
    ready: false,
    loading: null,
    items: []
  }
};

function buildPlanFallback() {
  return {
    ok: true,
    subscription: {
      id: null,
      user_id: null,
      plan_code: "PLUS",
      status: "available",
      source: "fallback_frontend",
      started_at: new Date().toISOString(),
      trial_ends_at: null,
      current_period_ends_at: null,
      mercadopago_preapproval_id: null
    },
    plan: {
      code: "PLUS",
      nombre: "Plan Plus",
      descripcion: "Más alcance para combinar distritos y materias sin perder oportunidades. Alertas por email y Telegram próximamente.",
      price_ars: 0,
      trial_days: 0,
      max_distritos: 2,
      max_distritos_normales: 2,
      max_distritos_emergencia: 0,
      max_cargos: 4,
      feature_flags: {
        email: true,
        telegram_coming_soon: true,
        whatsapp_coming_soon: false
      },
      public_visible: true
    }
  };
}
const DISTRITO_INPUT_IDS = [
  "pref-distrito-principal",
  "pref-segundo-distrito",
  "pref-tercer-distrito",
  "pref-cuarto-distrito",
  "pref-quinto-distrito"
];

const DISTRITO_SUG_IDS = [
  "sug-distrito-1",
  "sug-distrito-2",
  "sug-distrito-3",
  "sug-distrito-4",
  "sug-distrito-5"
];

const CARGO_INPUT_IDS = [
  "pref-cargo-1",
  "pref-cargo-2",
  "pref-cargo-3",
  "pref-cargo-4",
  "pref-cargo-5",
  "pref-cargo-6",
  "pref-cargo-7",
  "pref-cargo-8",
  "pref-cargo-9",
  "pref-cargo-10"
];

const CARGO_SUG_IDS = [
  "sug-cargo-1",
  "sug-cargo-2",
  "sug-cargo-3",
  "sug-cargo-4",
  "sug-cargo-5",
  "sug-cargo-6",
  "sug-cargo-7",
  "sug-cargo-8",
  "sug-cargo-9",
  "sug-cargo-10"
];

function planCodeUI(plan, subscription) {
  return String(
    plan?.display_code ||
    plan?.code ||
    subscription?.plan_code ||
    ""
  ).trim().toUpperCase();
}

function getPlanLimits(planInfo = planActual) {
  const plan = planInfo?.plan || {};

  let maxDistritos = Number(plan.max_distritos_total ?? plan.max_distritos ?? 1);
  if (!Number.isFinite(maxDistritos) || maxDistritos < 1) maxDistritos = 1;
  if (maxDistritos > 5) maxDistritos = 5;

  let maxCargos = Number(plan.max_cargos_total ?? plan.max_cargos ?? 2);
  if (!Number.isFinite(maxCargos) || maxCargos < 1) maxCargos = 2;
  if (maxCargos > 10) maxCargos = 10;

  let maxDistritosNormales = Number(plan.max_distritos_normales);
  let maxDistritosEmergencia = Number(plan.max_distritos_emergencia);

  if (!Number.isFinite(maxDistritosNormales) || maxDistritosNormales < 0) {
    maxDistritosNormales = Math.min(maxDistritos, 3);
  }

  if (!Number.isFinite(maxDistritosEmergencia) || maxDistritosEmergencia < 0) {
    maxDistritosEmergencia = Math.max(0, maxDistritos - maxDistritosNormales);
  }

  if (maxDistritosNormales + maxDistritosEmergencia > maxDistritos) {
    maxDistritosEmergencia = Math.max(0, maxDistritos - maxDistritosNormales);
  }

  return {
    maxDistritos,
    maxCargos,
    maxDistritosNormales,
    maxDistritosEmergencia
  };
}

function setVisibleById(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function districtLabelForIndex(index, limits) {
  if (index === 1) return "Distrito principal";
  if (index <= limits.maxDistritosNormales) {
    if (index === 2) return "Segundo distrito";
    if (index === 3) return "Tercer distrito";
    if (index === 4) return "Cuarto distrito";
    if (index === 5) return "Quinto distrito";
    return `Distrito ${index}`;
  }

  return `Distrito de emergencia ${index - limits.maxDistritosNormales}`;
}

function applyPlanFieldVisibility(planInfo = planActual) {
  const limits = getPlanLimits(planInfo);

  DISTRITO_INPUT_IDS.forEach((_, idx) => {
    const index = idx + 1;
    setVisibleById(`field-distrito-${index}`, index <= limits.maxDistritos);

    const label = document.getElementById(`label-distrito-${index}`);
    if (label) {
      label.textContent = districtLabelForIndex(index, limits);
    }
  });

  CARGO_INPUT_IDS.forEach((_, idx) => {
    const index = idx + 1;
    setVisibleById(`field-cargo-${index}`, index <= limits.maxCargos);

    const label = document.getElementById(`label-cargo-${index}`);
    if (label) {
      label.textContent = `Cargo / Materia ${index}`;
    }
  });

  const districtsHint = document.getElementById("districts-hint");
  if (districtsHint) {
    districtsHint.textContent = limits.maxDistritosEmergencia > 0
      ? `(hasta ${limits.maxDistritos}: ${limits.maxDistritosNormales} principales + ${limits.maxDistritosEmergencia} de emergencia)`
      : `(hasta ${limits.maxDistritos})`;
  }

  const cargosHint = document.getElementById("cargos-hint");
  if (cargosHint) {
    cargosHint.textContent = `(hasta ${limits.maxCargos})`;
  }
}

function renderCanalesUI(plan, subscription) {
  const flags =
    typeof plan?.feature_flags === "object" && plan?.feature_flags
      ? plan.feature_flags
      : {};

  const code = planCodeUI(plan, subscription);

  const emailText = "Alertas por email para todos los planes.";
  const telegramText = flags.telegram_coming_soon
    ? "Telegram: próximamente disponible en este plan."
    : code === "TRIAL_7D"
      ? "Telegram no incluido en la prueba gratis."
      : "Telegram aún no disponible en este plan.";
  const whatsappText = flags.whatsapp_coming_soon
    ? "WhatsApp: próximamente disponible para este plan."
    : code === "INSIGNE"
      ? "WhatsApp en preparación."
      : "WhatsApp reservado para futuras mejoras.";

  setHTML("panel-canales", `
    <div class="plan-stack">
      <div class="plan-pill-row">
        <span class="plan-pill">📧 Email</span>
        <span class="plan-pill plan-pill-neutral">Incluido</span>
      </div>
      <p class="plan-note">${esc(emailText)}</p>

      <div class="plan-pill-row">
        <span class="plan-pill">📨 Telegram</span>
        <span class="plan-pill plan-pill-neutral">${flags.telegram_coming_soon ? "Próximamente" : "No incluido"}</span>
      </div>
      <p class="plan-note">${esc(telegramText)}</p>

      <div class="plan-pill-row">
        <span class="plan-pill">💬 WhatsApp</span>
        <span class="plan-pill plan-pill-neutral">${flags.whatsapp_coming_soon ? "Próximamente" : "En preparación"}</span>
      </div>
      <p class="plan-note">${esc(whatsappText)}</p>
    </div>
  `);
}

function initPlanAutocompleteFields() {
  [
    ...DISTRITO_INPUT_IDS.map((inputId, i) => [inputId, DISTRITO_SUG_IDS[i], "distrito"]),
    ...CARGO_INPUT_IDS.map((inputId, i) => [inputId, CARGO_SUG_IDS[i], "cargo_area"])
  ].forEach(([inputId, listaId, tipo]) => activarAC(inputId, listaId, tipo));
}
function mostrarSeccion(id) {
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  const dest = document.getElementById(id);
  if (dest) dest.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.mostrarSeccion = mostrarSeccion;

function esUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function guardarToken(token) {
  const limpio = String(token || "").trim();
  if (!limpio) return false;
  tokenMem = limpio;
  localStorage.setItem(TOKEN_KEY, limpio);
  return localStorage.getItem(TOKEN_KEY) === limpio;
}

function obtenerToken() {
  const ls = localStorage.getItem(TOKEN_KEY);

  if (ls && String(ls).trim()) {
    tokenMem = String(ls).trim();
    return tokenMem;
  }

  return tokenMem || null;
}

function borrarToken() {
  tokenMem = null;
  localStorage.removeItem(TOKEN_KEY);
}

function actualizarNav() {
  const ok = !!obtenerToken();
  document.getElementById("navPublico")?.classList.toggle("hidden", ok);
  document.getElementById("navPrivado")?.classList.toggle("hidden", !ok);
}

function logout() {
  borrarToken();
  actualizarNav();
  limpiarMsgs();
  mostrarSeccion("inicio");
}

function limpiarMsgs() {
  ["login-msg", "registro-msg", "preferencias-msg"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "";
      el.className = "msg";
    }
  });
}

function showMsg(id, texto, tipo = "info") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `msg msg-${tipo}`;
}

function authMsgTarget() {
  const registroVisible = !document.getElementById("registro")?.classList.contains("hidden");
  return registroVisible ? "registro-msg" : "login-msg";
}

function btnLoad(btn, txt) {
  if (!btn) return;
  btn.dataset.orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = txt;
}

function btnRestore(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = btn.dataset.orig || btn.textContent;
}

async function post(payload) {
  const action = String(payload?.action || "").trim();

  let url = API_URL + "/api";

  if (action === "login") {
    url += "/login";
  } else if (action === "register") {
    url += "/register";
  } else if (action === "google-auth") {
    url += "/google-auth";
  } else if (action === "backfill") {
    url += "/backfill";
  } else {
    // ⚠️ fallback: sigue usando Google para lo que no migramos
    const resp = await fetch(APD_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return await resp.json();
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await resp.text();

  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(text || "Respuesta inválida del servidor");
  }
}

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${APD_SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: APD_SUPABASE_KEY,
      Authorization: `Bearer ${APD_SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text}`);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Supabase devolvió JSON inválido");
  }
}

async function workerFetchJson(path, options = {}) {
 const headers = { ...(options.headers || {}) };
const token = obtenerToken();

if (token && !headers["Authorization"]) {
  headers["Authorization"] = `Bearer ${token}`;
}

if (options.body && !headers["Content-Type"]) {
  headers["Content-Type"] = "application/json";
}

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("El Worker no devolvió JSON válido");
  }

  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || data?.error || `Worker ${res.status}`);
  }

  return data;
}

async function obtenerDocentePorId(userId) {
  const rows = await supabaseFetch(
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,ultimo_login`
  );
  return rows?.[0] || null;
}

async function obtenerPreferenciasPorUserId(userId) {
  const rows = await supabaseFetch(
    `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`
  );
  return rows?.[0] || null;
}

async function obtenerMiPlan(userId) {
  try {
    return await workerFetchJson(`/api/mi-plan?user_id=${encodeURIComponent(userId)}`);
  } catch (err) {
    console.error("ERROR PLAN:", err);
    return buildPlanFallback();
  }
}

async function guardarPreferenciasServidor(userId, payload) {
  return workerFetchJson("/api/guardar-preferencias", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      preferencias: payload
    })
  });
}

async function obtenerHistoricoResumen(userId, days = HISTORICO_DAYS_DEFAULT) {
  return workerFetchJson(
    `/api/historico-resumen?user_id=${encodeURIComponent(userId)}&days=${encodeURIComponent(days)}`
  );
}

async function capturarHistoricoAPD(userId) {
  return workerFetchJson("/api/capturar-historico-apd", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      include_postulantes: false
    })
  });
}

function adaptarPreferencias(prefRaw) {
  if (!prefRaw) {
    return {
      distrito_principal: "",
      segundo_distrito: "",
      tercer_distrito: "",
      cuarto_distrito: "",
      quinto_distrito: "",
      otros_distritos_arr: [],
      cargos_csv: "",
      cargos_arr: [],
      materias_csv: "",
      materias_arr: [],
      nivel_modalidad: "",
      niveles_arr: [],
      turnos_csv: "",
      turnos_arr: [],
      alertas_activas: true,
      alertas_email: true,
      alertas_whatsapp: false
    };
  }

  const otros = Array.isArray(prefRaw.otros_distritos) ? prefRaw.otros_distritos : [];
  const cargos = Array.isArray(prefRaw.cargos) ? prefRaw.cargos : [];
  const materias = Array.isArray(prefRaw.materias) ? prefRaw.materias : [];
  const niveles = Array.isArray(prefRaw.niveles) ? prefRaw.niveles : [];
  const turnos = Array.isArray(prefRaw.turnos) ? prefRaw.turnos : [];

  return {
    distrito_principal: prefRaw.distrito_principal || "",
    segundo_distrito: otros[0] || "",
    tercer_distrito: otros[1] || "",
    cuarto_distrito: otros[2] || "",
    quinto_distrito: otros[3] || "",
    otros_distritos_arr: otros,
    cargos_csv: cargos.join(", "),
    cargos_arr: cargos,
    materias_csv: materias.join(", "),
    materias_arr: materias,
    nivel_modalidad: formatNivelesResumen(niveles),
    niveles_arr: niveles,
    turnos_csv: turnos.join(", "),
    turnos_arr: turnos,
    alertas_activas: !!prefRaw.alertas_activas,
    alertas_email: !!prefRaw.alertas_email,
    alertas_whatsapp: !!prefRaw.alertas_whatsapp
  };
}

function setPanelLoading(activo) {
  document.getElementById("panel-loading")?.classList.toggle("hidden", !activo);
  document.getElementById("panel-content")?.classList.toggle("hidden", activo);
}
function parseFechaAPD(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const normal = raw
    .replace("T", " ")
    .replace(/\.\d+Z$/, "")
    .replace(/Z$/, "");

  let m = normal.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(\d{2}):(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4] || 23);
    const min = Number(m[5] || 59);
    const d = new Date(yyyy, mm, dd, hh, min, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = normal.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const yyyy = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const dd = Number(m[3]);
    const hh = Number(m[4] || 23);
    const min = Number(m[5] || 59);
    const ss = Number(m[6] || 0);
    const d = new Date(yyyy, mm, dd, hh, min, ss, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function estadoOfertaInactiva(alerta) {
  const estado = String(
    alerta?.estado ||
    alerta?.estado_oferta ||
    alerta?.estado_actual ||
    ""
  ).trim().toUpperCase();

  if (!estado) return false;

  return [
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
    "CESE",
    "CESADA",
    "NO VIGENTE"
  ].includes(estado);
}

function ofertaVencidaPorFecha(alerta) {
  const fecha =
    alerta?.finoferta ||
    alerta?.finoferta_label ||
    alerta?.fecha_cierre_raw ||
    alerta?.fecha_cierre ||
    alerta?.cierre ||
    "";

  const d = parseFechaAPD(fecha);
  if (!d) return false;

  return d.getTime() < Date.now();
}

function filtrarAlertasVigentes(alertas) {
  return (Array.isArray(alertas) ? alertas : []).filter(alerta => {
    if (!alerta) return false;
    if (estadoOfertaInactiva(alerta)) return false;
    if (ofertaVencidaPorFecha(alerta)) return false;
    return true;
  });
}

async function registrarDocente(e) {
  e.preventDefault();

  const btn = e.submitter || document.querySelector('#form-registro button[type="submit"]');

  if (btn?.disabled) return;

  const nombre = val("reg-nombre").trim();
  const apellido = val("reg-apellido").trim();
  const email = val("reg-email").trim().toLowerCase();
  const celular = val("reg-celular").trim();
  const password = val("reg-password").trim();

  if (!nombre) {
    showMsg("registro-msg", "Ingresá el nombre", "error");
    return;
  }

  if (!apellido) {
    showMsg("registro-msg", "Ingresá el apellido", "error");
    return;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showMsg("registro-msg", "Ingresá un email válido", "error");
    return;
  }

  if (!password || password.length < 6) {
    showMsg("registro-msg", "La contraseña debe tener al menos 6 caracteres", "error");
    return;
  }

  btnLoad(btn, "Registrando...");
  showMsg("registro-msg", "Procesando...", "info");

  try {
    const resp = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        nombre,
        apellido,
        email,
        celular,
        password
      })
    });

    const text = await resp.text();
    let data = {};

    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(text || "Respuesta inválida del servidor");
    }

    if (data?.ok) {
      showMsg("registro-msg", data.message || "Registro exitoso", "ok");
      document.getElementById("form-registro")?.reset();
      setTimeout(() => mostrarSeccion("login"), 1200);
    } else {
      showMsg("registro-msg", data?.error || data?.message || "No se pudo registrar", "error");
    }
  } catch (err) {
    console.error("Error registro:", err);
    showMsg("registro-msg", err?.message || "Error al registrar", "error");
  } finally {
    btnLoad(btn, null);
  }
}

async function loginPassword(e) {
  e.preventDefault();

  const btn = e.submitter || document.querySelector("#form-login button[type='submit']");
  btnLoad(btn, "Ingresando...");
  showMsg("login-msg", "Verificando credenciales...", "info");

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: val("login-email").trim(),
        password: val("login-password")
      })
    });

    let data = null;

    try {
      data = await res.json();
    } catch {
      showMsg("login-msg", "El Worker no devolvió JSON válido", "error");
      return;
    }

    if (!res.ok || !data?.ok || !data?.token) {
      showMsg("login-msg", data?.message || "Login incorrecto", "error");
      return;
    }

    const token = String(data.token).trim();

    if (!esUUID(token)) {
      showMsg("login-msg", "El login devolvió un token inválido", "error");
      return;
    }

    if (!guardarToken(token)) {
      showMsg("login-msg", "No se pudo guardar la sesión en el navegador", "error");
      return;
    }

    actualizarNav();
    showMsg("login-msg", "Ingresando...", "ok");
    await cargarDashboard();
  } catch (err) {
    console.error(err);
    showMsg("login-msg", "Error de conexión. Intentá de nuevo.", "error");
  } finally {
    btnRestore(btn);
  }
}

function initGoogleAuth(retries = 20) {
  if (googleInitDone) return;

  if (!window.google?.accounts?.id) {
    if (retries > 0) {
      setTimeout(() => initGoogleAuth(retries - 1), 300);
    }
    return;
  }

  googleInitDone = true;

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential
  });

  const loginBox = document.getElementById("google-btn-login");
  const regBox = document.getElementById("google-btn-registro");

  if (loginBox) {
    google.accounts.id.renderButton(loginBox, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width: 320
    });
  }

  if (regBox) {
    google.accounts.id.renderButton(regBox, {
      theme: "outline",
      size: "large",
      text: "signup_with",
      shape: "pill",
      width: 320
    });
  }
}

async function handleGoogleCredential(response) {
  const target = authMsgTarget();
  showMsg(target, "Validando Google...", "info");

  try {
    const res = await fetch(`${API_URL}/api/google-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response?.credential || "" })
    });

    const data = await res.json();

    if (!res.ok || !data?.ok || !data?.token) {
      showMsg(target, data?.message || "No se pudo ingresar con Google", "error");
      return;
    }

    if (!guardarToken(data.token)) {
      showMsg(target, "No se pudo guardar la sesión", "error");
      return;
    }

    actualizarNav();
    showMsg(
      target,
      data?.mode === "register" ? "Cuenta creada con Google" : "Ingreso con Google correcto",
      "ok"
    );

    await cargarDashboard();
  } catch (err) {
    console.error(err);
    showMsg(target, "Error validando Google", "error");
  }
}

async function obtenerMisAlertas(userId) {
  const res = await fetch(`${API_URL}/api/mis-alertas?user_id=${encodeURIComponent(userId)}`);

  let data = null;

  try {
    data = await res.json();
  } catch {
    throw new Error("El Worker no devolvió JSON válido en /api/mis-alertas");
  }

  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || data?.error || "No se pudieron cargar las alertas");
  }

  return filtrarAlertasVigentes(Array.isArray(data.resultados) ? data.resultados : []);
}

function renderAlertasAPD(alertas) {
  alertasState.items = filtrarAlertasVigentes(alertas);
  alertasState.index = 0;
  renderAlertaActual();
}

function moverAlerta(step) {
  const total = alertasState.items.length;
  if (!total) return;
  alertasState.index = (alertasState.index + step + total) % total;
  renderAlertaActual();
}

function irAAlerta(index) {
  const total = alertasState.items.length;
  if (!total) return;
  if (!Number.isInteger(index)) return;
  if (index < 0 || index >= total) return;
  alertasState.index = index;
  renderAlertaActual();
}

function buildPostulantesUrl(alerta) {
  const params = new URLSearchParams();
  if (alerta?.idoferta) params.set("oferta", String(alerta.idoferta).trim());
  if (alerta?.iddetalle) params.set("detalle", String(alerta.iddetalle).trim());

  return params.toString()
    ? `http://servicios.abc.gov.ar/actos.publicos.digitales/postulantes/?${params.toString()}`
    : "";
}

function formatPuntaje(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";
}

function renderResumenPostulantes(box, data, alerta) {
  const total = Number(data?.total_postulantes || 0);
  const pidBox = document.getElementById("alerta-pid-box");

  if (pidBox) {
    pidBox.innerHTML = renderPidMatchBlock(alerta, data || null);
  }

  if (!total) {
    box.innerHTML = `
      <div class="alerta-meta-head">Referencia de postulantes</div>
      <div class="alerta-meta-empty">Todavía no hay postulantes visibles para esta oferta.</div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="alerta-meta-head">Referencia de postulantes</div>
    <div class="alerta-meta-grid">
      <div class="alerta-meta-item">
        <span class="alerta-meta-k">Postulantes</span>
        <strong class="alerta-meta-v">${total}</strong>
      </div>
      <div class="alerta-meta-item">
        <span class="alerta-meta-k">Puntaje del primero</span>
        <strong class="alerta-meta-v">${formatPuntaje(data.puntaje_primero)}</strong>
      </div>
      <div class="alerta-meta-item alerta-meta-item-wide">
        <span class="alerta-meta-k">Listado del primero</span>
        <strong class="alerta-meta-v">${esc(data.listado_origen_primero || "-")}</strong>
      </div>
    </div>
  `;
}

async function cargarResumenPostulantes(alerta) {
  const box = document.getElementById("alerta-postulantes-meta");
  const pidBox = document.getElementById("alerta-pid-box");

  if (!box) return;

  if (pidBox) {
    pidBox.innerHTML = renderPidMatchBlock(alerta, null);
  }

  const oferta = String(alerta?.idoferta || "").trim();
  const detalle = String(alerta?.iddetalle || "").trim();

  if (!oferta && !detalle) {
    box.innerHTML = `
      <div class="alerta-meta-head">Referencia de postulantes</div>
      <div class="alerta-meta-empty">Esta oferta no trae identificadores para consultar postulantes.</div>
    `;

    if (pidBox) {
      pidBox.innerHTML = renderPidMatchBlock(alerta, null);
    }
    return;
  }

  const key = `${oferta}|${detalle}`;

  if (postulantesResumenCache.has(key)) {
    const cached = postulantesResumenCache.get(key);
    renderResumenPostulantes(box, cached, alerta);
    return;
  }

  box.innerHTML = `
    <div class="alerta-meta-head">Referencia de postulantes</div>
    <div class="alerta-meta-loading">Cargando postulantes...</div>
  `;

  if (pidBox) {
    pidBox.innerHTML = renderPidMatchBlock(alerta, null);
  }

  try {
    const res = await fetch(
      `${API_URL}/api/postulantes-resumen?oferta=${encodeURIComponent(oferta)}&detalle=${encodeURIComponent(detalle)}`
    );

    const data = await res.json();

    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || data?.error || "No se pudo consultar la lista");
    }

    postulantesResumenCache.set(key, data);

    const actual = alertasState.items[alertasState.index];
    const currentKey = `${String(actual?.idoferta || "").trim()}|${String(actual?.iddetalle || "").trim()}`;
    if (currentKey !== key) return;

    renderResumenPostulantes(box, data, alerta);
  } catch (err) {
    console.error("ERROR POSTULANTES:", err);

    if (pidBox) {
      pidBox.innerHTML = renderPidMatchBlock(alerta, null);
    }

    box.innerHTML = `
      <div class="alerta-meta-head">Referencia de postulantes</div>
      <div class="alerta-meta-error">No se pudo leer la lista de postulantes.</div>
    `;
  }
}
function tituloAlerta(alerta) {
  return [alerta?.cargo, alerta?.area]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(" · ") || "Oferta APD";
}

function renderWindowPreview(alerta, side, gotoIndex) {
  if (!alerta) return "";

  return `
    <button
      type="button"
      class="alerta-window-preview alerta-window-preview-${side}"
      data-goto-index="${gotoIndex}"
      aria-label="Ir a ${esc(tituloAlerta(alerta))}"
    >
      <div class="alerta-windowbar alerta-windowbar-mini">
        <span class="alerta-windowdot win-red"></span>
        <span class="alerta-windowdot win-yellow"></span>
        <span class="alerta-windowdot win-green"></span>
      </div>
      <div class="alerta-window-preview-side">${side === "left" ? "Anterior" : "Siguiente"}</div>
      <div class="alerta-window-preview-title">${esc(tituloAlerta(alerta))}</div>
      <div class="alerta-window-preview-sub">${esc(alerta.escuela || "Sin escuela")}</div>
      <div class="alerta-window-preview-meta">${esc(alerta.distrito || "-")} · ${esc(turnoTexto(alerta.turno) || "-")}</div>
    </button>
  `;
}

function renderProgress(total, current) {
  const pct = total > 0 ? ((current + 1) / total) * 100 : 0;

  return `
    <div class="alerta-progress">
      <span class="alerta-progress-bar" style="width:${pct}%"></span>
    </div>
  `;
}

function renderDots(total, current) {
  if (total <= 1) return "";

  return `
    <div class="alerta-dots" aria-label="Navegación de alertas">
      ${Array.from({ length: total }, (_, i) => `
        <button
          type="button"
          class="alerta-dot ${i === current ? "is-active" : ""}"
          data-dot-index="${i}"
          aria-label="Ir a oferta ${i + 1}"
          ${i === current ? 'aria-current="true"' : ""}
        ></button>
      `).join("")}
    </div>
  `;
}

function parsePidNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function buildPidChanceInfo(alerta, resumen) {
  if (!alerta?.pid_compatible) {
    return {
      tone: "warn",
      title: "No compatible con tu PID",
      text: alerta?.pid_reason || "Esta oferta sale por preferencias, pero no por compatibilidad real con tu PID."
    };
  }

  const miPuntaje = parsePidNumber(alerta?.pid_puntaje_total);
  const primero = Number(resumen?.puntaje_primero);

  if (!Number.isFinite(miPuntaje) || !Number.isFinite(primero)) {
    return {
      tone: "ok",
      title: "Compatible con tu PID",
      text: `Tu puntaje para esta oferta es ${alerta?.pid_puntaje_total || "-"}. Todavía no hay referencia suficiente para estimar chances.`
    };
  }

  const diff = miPuntaje - primero;

  if (diff > 0) {
    return {
      tone: "ok",
      title: "Tenés buenas chances",
      text: `Tu puntaje (${miPuntaje.toFixed(2)}) está por arriba del primero (${primero.toFixed(2)}).`
    };
  }

  if (diff === 0) {
    return {
      tone: "ok",
      title: "Estás muy competitivo",
      text: `Tu puntaje (${miPuntaje.toFixed(2)}) es igual al del primero (${primero.toFixed(2)}).`
    };
  }

  if (diff >= -1) {
    return {
      tone: "info",
      title: "Estás cerca",
      text: `Tu puntaje (${miPuntaje.toFixed(2)}) está apenas por debajo del primero (${primero.toFixed(2)}).`
    };
  }

  return {
    tone: "warn",
    title: "Hoy quedás abajo del primero",
    text: `Tu puntaje (${miPuntaje.toFixed(2)}) está por debajo del primero (${primero.toFixed(2)}).`
  };
}

function renderPidMatchBlock(alerta, resumen) {
  const info = buildPidChanceInfo(alerta, resumen);

  const toneClass =
    info.tone === "ok"
      ? "alerta-pid-ok"
      : info.tone === "info"
        ? "alerta-pid-info"
        : "alerta-pid-warn";

  return `
    <div class="alerta-meta-card alerta-pid-card ${toneClass}">
      <div class="alerta-meta-head">${info.title}</div>
      <div class="alerta-meta-grid">
        ${alertaRow("Motivo", alerta?.pid_reason || "-")}
        ${alertaRow("Área PID", alerta?.pid_area || "-")}
        ${alertaRow("Bloque PID", alerta?.pid_bloque || "-")}
        ${alertaRow("Tu puntaje", alerta?.pid_puntaje_total || "-")}
        ${alertaRow("Listado PID", alerta?.pid_listado || "-")}
        ${alertaRow("Año PID", alerta?.pid_anio || "-")}
      </div>
      <div class="alerta-meta-note">${info.text}</div>
    </div>
  `;
}
function renderAlertaActual() {
  const box = document.getElementById("panel-alertas");
  const badge = document.getElementById("alertas-badge");
  const items = alertasState.items;
  const total = items.length;

  if (!box) return;

  if (badge) {
    if (total) {
      badge.textContent = String(total);
      badge.classList.remove("hidden");
    } else {
      badge.textContent = "";
      badge.classList.add("hidden");
    }
  }

  if (!total) {
    box.innerHTML = `
      <div class="empty-state">
        <p>No hay alertas compatibles todavía.</p>
        <p class="empty-hint">Podés dejar distritos o cargos vacíos para no filtrar por esos campos.</p>
      </div>
    `;
    return;
  }

  const a = items[alertasState.index];
  const titulo = tituloAlerta(a);
  const horarioLabel = a.dias_horarios || a.horario || "";
  const desdeLabel = a.supl_desde_label || fmtFechaABC(a.supl_desde, "date");
  const hastaLabel = a.supl_hasta_label || fmtFechaABC(a.supl_hasta, "date");
  const vigenciaLabel =
    (desdeLabel || hastaLabel)
      ? `${desdeLabel || "—"} → ${hastaLabel || "—"}`
      : (a.revista || "Sin fecha informada");
  const abcUrl = buildPostulantesUrl(a);

  const prevIndex = total > 1 ? (alertasState.index - 1 + total) % total : -1;
  const nextIndex = total > 1 ? (alertasState.index + 1) % total : -1;

  const prev = total > 1 ? items[prevIndex] : null;
  const next = total > 1 ? items[nextIndex] : null;

  box.innerHTML = `
    <div class="alerta-carousel-shell">
      <div class="alerta-stage">
        ${prev ? renderWindowPreview(prev, "left", prevIndex) : ""}
        ${next ? renderWindowPreview(next, "right", nextIndex) : ""}

        <article class="alerta-floating alerta-main-card">
          <div class="alerta-windowbar">
            <span class="alerta-windowdot win-red"></span>
            <span class="alerta-windowdot win-yellow"></span>
            <span class="alerta-windowdot win-green"></span>
          </div>

          <div class="alerta-topbar">
            <button id="alerta-prev" class="alerta-nav" type="button" ${total < 2 ? "disabled" : ""} aria-label="Anterior">&larr;</button>
            <div class="alerta-counter">Oferta ${alertasState.index + 1} de ${total}</div>
            <button id="alerta-next" class="alerta-nav" type="button" ${total < 2 ? "disabled" : ""} aria-label="Siguiente">&rarr;</button>
          </div>

          ${renderProgress(total, alertasState.index)}

          <div class="alerta-tags">
            ${a.escuela ? `<span class="tag tag-escuela">${esc(a.escuela)}</span>` : ""}
            ${a.distrito ? `<span class="tag tag-distrito">${esc(a.distrito)}</span>` : ""}
            ${a.turno ? `<span class="tag tag-turno">${esc(a.turno)}</span>` : ""}
            ${a.jornada ? `<span class="tag tag-jornada">${esc(a.jornada)}</span>` : ""}
            ${a.nivel_modalidad ? `<span class="tag tag-nivel">${esc(a.nivel_modalidad)}</span>` : ""}
            ${a.revista ? `<span class="tag tag-revista">${esc(a.revista)}</span>` : ""}
            ${a.estado ? `<span class="tag tag-estado">${esc(a.estado)}</span>` : ""}
            ${a.pid_match ? `<span class="tag tag-revista">MATCH PID</span>` : ""}
          </div>

          <div class="alerta-title">${esc(titulo)}</div>

          <div class="alerta-grid alerta-grid-clean">
            ${alertaRow("Curso / Div.", a.cursodivision || normalizarCursoDivision(a.curso_division))}
            ${(a.hsmodulos || a.modulos) ? alertaRow("Módulos", a.hsmodulos || a.modulos) : ""}
            ${horarioLabel ? alertaRow("Días / horarios", horarioLabel) : ""}
            ${vigenciaLabel ? alertaRow("Vigencia", vigenciaLabel) : ""}
            ${alertaRow("Cierre", a.finoferta_label || fmtFechaABC(a.finoferta, "datetime"))}
            ${a.observaciones ? alertaRow("Observaciones", a.observaciones) : ""}
          </div>

          <div id="alerta-pid-box">
  ${renderPidMatchBlock(a, null)}
</div>

          <div id="alerta-postulantes-meta" class="alerta-meta-card">
            <div class="alerta-meta-head">Referencia de postulantes</div>
            <div class="alerta-meta-loading">Cargando postulantes...</div>
          </div>

          <div class="alerta-actions">
            ${abcUrl ? `<a class="btn btn-primary alerta-link" href="${esc(abcUrl)}" target="_blank" rel="noopener noreferrer">Abrir postulantes en ABC</a>` : ""}
          </div>
        </article>
      </div>

      ${renderDots(total, alertasState.index)}
    </div>
  `;

  box.querySelector("#alerta-prev")?.addEventListener("click", () => moverAlerta(-1));
  box.querySelector("#alerta-next")?.addEventListener("click", () => moverAlerta(1));

  box.querySelectorAll("[data-goto-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      irAAlerta(Number(btn.dataset.gotoIndex));
    });
  });

  box.querySelectorAll("[data-dot-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      irAAlerta(Number(btn.dataset.dotIndex));
    });
  });

  cargarResumenPostulantes(a);
}
function alertaRow(label, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return `
    <div class="alerta-row">
      <span class="alerta-key">${esc(label)}</span>
      <span class="alerta-val">${esc(v)}</span>
    </div>
  `;
}

function fmtNum(v, digits = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";

  return n.toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function tituloHistoricoCliente(item) {
  return [item?.cargo, item?.area]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(" · ") || "Oferta APD";
}

function renderHistoricoList(items, labelFn = item => item.label) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="ph">Todavía no hay datos suficientes.</p>`;
  }

  return `
    <ul class="historico-list">
      ${items.map(item => `
        <li class="historico-item">
          <span>${esc(labelFn(item))}</span>
          <strong class="historico-count">${fmtNum(item.value)}</strong>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderHistoricoCambios(cambios) {
  if (!Array.isArray(cambios) || !cambios.length) {
    return `<p class="ph">Todavía no detectamos cambios de estado entre snapshots.</p>`;
  }

  return `
    <div class="historico-latest">
      ${cambios.map(item => `
        <article class="historico-offer">
          <div class="historico-offer-title">${esc(tituloHistoricoCliente(item))}</div>
          <div class="historico-offer-sub">${esc(item.escuela || "Sin escuela")} · ${esc(item.distrito || "-")}</div>
          <div class="historico-competition">
            <span class="historico-chip">Antes: ${esc(item.estado_anterior || "-")}</span>
            <span class="historico-chip">Ahora: ${esc(item.estado_actual || "-")}</span>
          </div>
          <div class="historico-offer-aux">Detectado: ${esc(fmtFecha(item.captured_at || "-"))}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderHistoricoAPD(data) {
  const box = document.getElementById("panel-historico-apd");
  if (!box) return;

  if (!data || data.empty || !data.ofertas_unicas) {
    box.innerHTML = `
      <div class="empty-state">
        <p>${esc(data?.message || "Todavía no hay histórico APD para mostrar.")}</p>
        <p class="empty-hint">
          Tocá "Actualizar histórico" para guardar una primera foto de los APD actuales y empezar a ver tendencias.
        </p>
      </div>
    `;
    return;
  }

  const lecturaRapida = [
    data.capturas_filtradas
      ? `<span class="historico-chip">Capturas filtradas: ${fmtNum(data.capturas_filtradas)}</span>`
      : "",
    data.promedio_postulantes != null
      ? `<span class="historico-chip">Promedio postulantes: ${fmtNum(data.promedio_postulantes, 1)}</span>`
      : "",
    data.promedio_puntaje_primero != null
      ? `<span class="historico-chip">Puntaje del primero: ${fmtNum(data.promedio_puntaje_primero, 2)}</span>`
      : "",
    data.cierran_72h
      ? `<span class="historico-chip">Cierran en 72h: ${fmtNum(data.cierran_72h)}</span>`
      : ""
  ].filter(Boolean).join("");

  const ultimas = Array.isArray(data.ultimas_ofertas) ? data.ultimas_ofertas : [];
  const cambios = Array.isArray(data.ultimos_cambios) ? data.ultimos_cambios : [];

  box.innerHTML = `
    <div class="historico-head">
      <div class="historico-updated">Última captura: ${esc(fmtFecha(data.ultima_captura || "-"))}</div>
      <div class="historico-note">Ventana analizada: últimos ${fmtNum(data.ventana_dias)} días</div>
    </div>

    <div class="historico-grid">
      <div class="historico-stat">
        <span class="historico-stat-n">${fmtNum(data.ofertas_unicas)}</span>
        <span class="historico-stat-l">Ofertas únicas</span>
      </div>
      <div class="historico-stat">
        <span class="historico-stat-n">${fmtNum(data.activas_estimadas)}</span>
        <span class="historico-stat-l">Activas ahora</span>
      </div>
      <div class="historico-stat">
        <span class="historico-stat-n">${fmtNum(data.designadas_estimadas)}</span>
        <span class="historico-stat-l">Designadas</span>
      </div>
      <div class="historico-stat">
        <span class="historico-stat-n">${fmtNum(data.anuladas_estimadas)}</span>
        <span class="historico-stat-l">Anuladas</span>
      </div>
      <div class="historico-stat">
        <span class="historico-stat-n">${fmtNum(data.desiertas_estimadas)}</span>
        <span class="historico-stat-l">Desiertas</span>
      </div>
      <div class="historico-stat">
        <span class="historico-stat-n">${fmtNum(data.nuevas_7d)}</span>
        <span class="historico-stat-l">Nuevas en 7 días</span>
      </div>
      <div class="historico-stat">
        <span class="historico-stat-n">${fmtNum(data.cambios_estado_recientes)}</span>
        <span class="historico-stat-l">Cambios detectados</span>
      </div>
    </div>

    <div class="historico-columns">
      <div class="historico-box">
        <h4>Distritos con más movimiento</h4>
        ${renderHistoricoList(data.top_distritos)}
      </div>
      <div class="historico-box">
        <h4>Cargos / áreas más publicados</h4>
        ${renderHistoricoList(data.top_cargos)}
      </div>
      <div class="historico-box">
        <h4>Turnos más frecuentes</h4>
        ${renderHistoricoList(data.top_turnos, item => turnoTexto(item.label) || item.label)}
      </div>
    </div>

    <div class="historico-box">
      <h4>Lectura rápida</h4>
      <div class="historico-competition">
        ${lecturaRapida || '<span class="historico-chip">Todavía no tenemos lectura estadística suficiente.</span>'}
      </div>
    </div>

    <div class="historico-box historico-box-latest">
      <h4>Cambios recientes de estado</h4>
      ${renderHistoricoCambios(cambios)}
    </div>

    <div class="historico-box historico-box-latest">
      <h4>Último movimiento relevante</h4>
      <div class="historico-latest">
        ${ultimas.length ? ultimas.map(item => `
          <article class="historico-offer">
            <div class="historico-offer-title">${esc(tituloHistoricoCliente(item))}</div>
            <div class="historico-offer-sub">${esc(item.escuela || "Sin escuela")} · ${esc(item.distrito || "-")}</div>
            <div class="historico-offer-meta">
              <span>${esc(turnoTexto(item.turno) || "-")}</span>
              <span>Estado: ${esc(item.estado || "-")}</span>
            </div>
            <div class="historico-offer-aux">
              Vista en histórico: ${esc(fmtFecha(item.captured_at || "-"))}
            </div>
          </article>
        `).join("") : '<p class="ph">Todavía no hay movimiento reciente para mostrar.</p>'}
      </div>
    </div>
  `;
}

async function cargarHistoricoPanel(userId, days = HISTORICO_DAYS_DEFAULT) {
  const box = document.getElementById("panel-historico-apd");
  if (box) {
    box.innerHTML = `<p class="ph">Cargando histórico APD...</p>`;
  }

  try {
    const data = await obtenerHistoricoResumen(userId, days);
    renderHistoricoAPD(data);
    return data;
  } catch (err) {
    console.error("ERROR HISTORICO APD:", err);

    if (box) {
      box.innerHTML = `
        <div class="empty-state">
          <p>No se pudo cargar el histórico APD.</p>
          <p class="empty-hint">${esc(err?.message || "Intentá de nuevo en un rato.")}</p>
        </div>
      `;
    }

    return null;
  }
}

async function cargarDashboard() {
  const token = obtenerToken();

  if (!token) {
    actualizarNav();
    mostrarSeccion("inicio");
    return;
  }

  mostrarSeccion("panel-docente");
  setPanelLoading(true);

  try {
    const [docente, prefRaw, planInfo, alertasResult] = await Promise.all([
      obtenerDocentePorId(token),
      obtenerPreferenciasPorUserId(token),
      obtenerMiPlan(token),
      obtenerMisAlertas(token).catch(err => {
        console.error("ERROR ALERTAS:", err);
        return [];
      })
    ]);

    if (!docente) {
      alert("Usuario no encontrado en Supabase");
      logout();
      return;
    }

    const preferencias = adaptarPreferencias(prefRaw);
    planActual = planInfo || buildPlanFallback();
const alertasPanel = Array.isArray(alertasResult)
  ? alertasResult
  : [];

console.log("ALERTAS PANEL:", alertasPanel.length, alertasPanel);
renderDashboard({
  docente,
  preferencias,
  alertas: alertasPanel,
  historial: [],
  planInfo: planActual,
  estadisticas: {
    total_alertas: Array.isArray(alertasResult) ? alertasResult.length : 0,
    alertas_leidas: 0,
    alertas_no_leidas: Array.isArray(alertasResult) ? alertasResult.length : 0,
    ultimo_acceso: docente.ultimo_login || new Date().toISOString()
  }
});

workerFetchJson('/api/sync-offers', {
  method: 'POST',
  body: JSON.stringify({
    offers: alertasPanel.map(o => ({
      ...o,
      id: String(o.idoferta || o.iddetalle || o.id || ""),
      offer_id: String(o.idoferta || o.iddetalle || o.id || ""),

      cargo: o.cargo || o.descripcioncargo || "",
      materia: o.materia || o.area || o.descripcionarea || "",
      nivel: o.nivel || o.nivel_modalidad || o.descnivelmodalidad || "",
      distrito: o.distrito || o.descdistrito || "",
      escuela: o.escuela || o.nombreestablecimiento || "",
      turno: o.turno || "",

      modulos: o.modulos || o.hsmodulos || "",
      dias_horarios: o.dias_horarios || [
        o.lunes, o.martes, o.miercoles, o.jueves, o.viernes, o.sabado
      ].filter(Boolean).join(" "),

      desde: o.desde || o.supl_desde_label || o.supl_desde || "",
      hasta: o.hasta || o.supl_hasta_label || o.supl_hasta || "",

      tipo_cargo: o.tipo_cargo || o.tipooferta || "",
      revista: o.revista || o.supl_revista || "",

      curso_division: o.curso_division || o.cursodivision || "",
      jornada: o.jornada || "",

      observaciones: o.observaciones || "",
      fecha_cierre: o.fecha_cierre || o.fecha_cierre_fmt || o.finoferta_label || o.finoferta || "",

      link_postular: o.link_postular || o.abc_postulantes_url || "",
      source_offer_key: o.source_offer_key || "",

      total_postulantes: o.total_postulantes ?? null,
      puntaje_primero: o.puntaje_primero ?? null,
      listado_origen_primero: o.listado_origen_primero || ""
    }))
  })
}).catch(err => {
  console.warn('ERROR SYNC OFFERS:', err);
});
 cargarPrefsEnFormulario({ preferencias });
renderPlanUI(planActual);
actualizarNav();

if (typeof cargarHistoricoPanel === "function") {
  cargarHistoricoPanel(token).catch(err => {
    console.error("ERROR CARGANDO HISTORICO PANEL:", err);
  });
}

if (typeof window.cargarExtrasProvincia === "function") {
  window.cargarExtrasProvincia().catch(err => {
    console.error("ERROR EXTRAS PROVINCIA:", err);
  });
}

await adminCheckAccess();
bindAdminEvents();
  } catch (err) {
    console.error("ERROR CARGANDO PANEL:", err);
    alert("Error cargando panel");
    logout();
  } finally {
    setPanelLoading(false);
  }
}

function renderDashboard(data) {
  const doc = data.docente || {};
  const pref = data.preferencias || {};
  const planInfo = data.planInfo || buildPlanFallback();
  const plan = planInfo.plan || {};
  const subscription = planInfo.subscription || {};
  const nombre = `${doc.nombre || ""} ${doc.apellido || ""}`.trim();

  const distritos = [pref.distrito_principal, ...(pref.otros_distritos_arr || [])]
    .filter(Boolean)
    .join(" / ") || "(sin filtro)";

  const cargosLista = [
    ...(Array.isArray(pref.cargos_arr) ? pref.cargos_arr : []),
    ...(Array.isArray(pref.materias_arr) ? pref.materias_arr : [])
  ].filter(Boolean);

  const cargos = cargosLista.join(", ") || pref.cargos_csv || pref.materias_csv || "(sin filtro)";
  const niveles = pref.nivel_modalidad || "(cualquiera)";
  const turnos = turnoTexto(pref.turnos_csv) || "(cualquiera)";
  const planNombre = planNombreHumano(plan, subscription);

  setText("panel-bienvenida", nombre ? `Bienvenido/a, ${nombre}` : "Bienvenido/a");
  setText("panel-subtitulo", doc.email ? `Sesión: ${doc.email}` : "Panel docente");

  setHTML("panel-datos-docente", `
    <p><strong>ID:</strong> ${esc(doc.id || "-")}</p>
    <p><strong>Nombre:</strong> ${esc(nombre || "-")}</p>
    <p><strong>Email:</strong> ${esc(doc.email || "-")}</p>
    <p><strong>Celular:</strong> ${esc(doc.celular || "-")}</p>
    <p><strong>Estado:</strong> ${doc.activo ? "Activo" : "Inactivo"}</p>
  `);

  setHTML("panel-preferencias-resumen", `
    <p><strong>Distritos:</strong> ${esc(distritos)}</p>
    <p><strong>Cargos/Materias:</strong> ${esc(cargos)}</p>
    <p><strong>Nivel:</strong> ${esc(niveles)}</p>
    <p><strong>Turno:</strong> ${esc(turnos)}</p>
    <p><strong>Plan:</strong> ${esc(planNombre)}</p>
    <p><strong>Alertas:</strong> ${pref.alertas_activas ? "Activas" : "Pausadas"}</p>
    <p><strong>Email:</strong> ${pref.alertas_email ? "Sí" : "No"}</p>
  `);

  setHTML("panel-estadisticas", `
    <div class="stats-row">
      <div class="stat-box"><span class="stat-n">${data.estadisticas?.total_alertas ?? 0}</span><span class="stat-l">Alertas</span></div>
      <div class="stat-box"><span class="stat-n">${data.estadisticas?.alertas_leidas ?? 0}</span><span class="stat-l">Vistas</span></div>
      <div class="stat-box"><span class="stat-n">${data.estadisticas?.alertas_no_leidas ?? 0}</span><span class="stat-l">Sin ver</span></div>
    </div>
    <p class="stat-acceso">Último acceso: ${esc(fmtFecha(data.estadisticas?.ultimo_acceso || "-"))}</p>
  `);

  renderAlertasAPD(data.alertas || []);
  setHTML("panel-historial", `<p class="ph">Sin historial todavía.</p>`);
  setHTML("panel-historico-apd", `<p class="ph">Cargando histórico APD...</p>`);
}

function renderPlanUI(planInfo) {
  const info = planInfo || buildPlanFallback();
  const plan = info.plan || {};
  const subscription = info.subscription || {};
  const nombre = planNombreHumano(plan, subscription);
  const estado = planEstadoHumano(subscription);
  const precio = planPrecioHumano(plan, subscription);
  const descripcion = planDescripcionHumana(plan, subscription);
  const limits = getPlanLimits(info);

  const distritosText = limits.maxDistritosEmergencia > 0
    ? `${limits.maxDistritosNormales} principales + ${limits.maxDistritosEmergencia} de emergencia`
    : `Hasta ${limits.maxDistritos} distrito(s)`;

  setHTML("panel-plan", `
    <div class="plan-stack">
      <div class="plan-title">${esc(nombre)}</div>
      <div class="plan-pill-row">
        <span class="plan-pill">${esc(estado)}</span>
        <span class="plan-pill plan-pill-neutral">${esc(precio)}</span>
      </div>
      <div class="plan-pill-row">
        <span class="plan-pill">${esc(distritosText)}</span>
        <span class="plan-pill">Hasta ${limits.maxCargos} cargo(s)/materia(s)</span>
      </div>
      <p class="plan-note">${esc(descripcion)}</p>
    </div>
  `);

  const hint = document.getElementById("prefs-plan-hint");
  if (hint) {
    hint.textContent = limits.maxDistritosEmergencia > 0
      ? `${nombre}: ${limits.maxDistritosNormales} distrito(s) principal(es), ${limits.maxDistritosEmergencia} de emergencia y hasta ${limits.maxCargos} cargo(s)/materia(s).`
      : `${nombre}: hasta ${limits.maxDistritos} distrito(s) y ${limits.maxCargos} cargo(s)/materia(s).`;
  }

  renderCanalesUI(plan, subscription);
  applyPlanFieldVisibility(info);
}
function planNombreHumano(plan, subscription) {
  if (plan?.display_name) {
    return String(plan.display_name).trim();
  }

  const code = planCodeUI(plan, subscription);

  if (subscription?.status === "beta" || plan?.beta) return "Plan Plus (Beta)";
  if (code === "TRIAL_7D") return "Prueba gratis 7 días";
  if (code === "BASIC") return "Plan Básico";
  if (code === "PLUS") return "Plan Plus";
  if (code === "PREMIUM" || code === "PRO") return "Plan Pro";
  if (code === "INSIGNE") return "Plan Insigne";

  return String(plan?.nombre || "Plan").trim() || "Plan";
}


function planEstadoHumano(subscription) {
  const status = String(subscription?.status || "").trim().toLowerCase();

  if (status === "beta") return "Beta abierta";
  if (status === "trialing") return "En prueba";
  if (status === "active" || status === "authorized") return "Activo";
  if (status === "paused") return "Pausado";
  if (status === "pending") return "Pendiente";
  if (status === "cancelled" || status === "canceled") return "Cancelado";

  return "Disponible";
}

function planPrecioHumano(plan, subscription) {
  if (subscription?.status === "beta" || plan?.beta) return "Gratis por ahora";
  if (String(plan?.code || "").toUpperCase() === "TRIAL_7D") return "Gratis";
  const n = Number(plan?.price_ars);
  if (Number.isFinite(n) && n > 0) {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    });
  }
  return "Precio a definir";
}


function planDescripcionHumana(plan, subscription) {
  if (subscription?.status === "beta" || plan?.beta) {
    return "Durante la beta te dejamos con capacidad Plus mientras terminamos pagos, email y automatizaciones.";
  }

  const descripcionPlan = String(plan?.descripcion || "").trim();
  if (descripcionPlan) return descripcionPlan;

  const code = planCodeUI(plan, subscription);

  if (code === "TRIAL_7D") {
    return "Probá APDocentePBA durante 7 días con 1 distrito, hasta 2 materias/cargos y todos los filtros esenciales. Todos los avisos llegan por email.";
  }

  if (code === "PLUS") {
    return "Más alcance sin irte de presupuesto: 2 distritos, hasta 4 materias/cargos y alertas por email. Próximamente Telegram.";
  }

  if (code === "PREMIUM" || code === "PRO") {
    return "Cobertura fuerte para multiplicar oportunidades: 3 distritos, hasta 6 materias/cargos y alertas por email. Próximamente Telegram.";
  }

  if (code === "INSIGNE") {
    return "Cobertura máxima: 3 distritos principales + 2 de emergencia/chusmeo, hasta 10 materias/cargos y alertas por email. Próximamente WhatsApp.";
  }

  return "Plan configurado para alertas APD.";
}

function getNivelArray() {
  return Array.from(document.querySelectorAll('input[name="pref-nivel-modalidad"]:checked'))
    .map(el => String(el.value || "").trim())
    .filter(Boolean);
}

async function guardarPreferencias(e) {
  e.preventDefault();

  const token = obtenerToken();
  if (!token) {
    showMsg("preferencias-msg", "Sesión no válida", "error");
    return;
  }

  const btn = e.submitter || document.querySelector("#form-preferencias button[type='submit']");
  btnLoad(btn, "Guardando...");
  showMsg("preferencias-msg", "Guardando preferencias...", "info");

  const payload = buildPreferenciasPayload();

  try {
    const data = await guardarPreferenciasServidor(token, payload);
    if (data?.plan || data?.subscription) {
      planActual = {
        ok: true,
        plan: data.plan || planActual.plan,
        subscription: data.subscription || planActual.subscription
      };
      renderPlanUI(planActual);
    }
    showMsg("preferencias-msg", data?.message || "Preferencias guardadas", "ok");
    await cargarDashboard();
  } catch (err) {
    console.error("ERROR GUARDANDO PREFERENCIAS:", err);
    showMsg("preferencias-msg", err?.message || "Error guardando preferencias", "error");
  } finally {
    btnRestore(btn);
  }
}

function buildPreferenciasPayload() {
  const limits = getPlanLimits(planActual);

  const distritoPrincipal = val("pref-distrito-principal").toUpperCase().trim() || null;

  const otrosDistritos = DISTRITO_INPUT_IDS
    .slice(1, limits.maxDistritos)
    .map(id => val(id).toUpperCase().trim())
    .filter(Boolean);

  const cargos = CARGO_INPUT_IDS
    .slice(0, limits.maxCargos)
    .map(id => val(id).toUpperCase().trim())
    .filter(Boolean);

  const turno = val("pref-turnos").trim();

  return {
    distrito_principal: distritoPrincipal,
    otros_distritos: otrosDistritos,
    cargos,
    materias: [],
    niveles: getNivelArray(),
    turnos: turno ? [turno] : [],
    alertas_activas: checked("pref-alertas-activas"),
    alertas_email: checked("pref-alertas-email"),
    alertas_whatsapp: checked("pref-alertas-whatsapp")
  };
}


function limpiarDistritos() {
  DISTRITO_INPUT_IDS.forEach(id => setVal(id, ""));
  DISTRITO_SUG_IDS.forEach(limpiarListaAC);
}

function limpiarCargos() {
  CARGO_INPUT_IDS.forEach(id => setVal(id, ""));
  CARGO_SUG_IDS.forEach(limpiarListaAC);
}

function limpiarListaAC(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  el.style.display = "none";
}

function turnoSelectValue(v) {
  const t = String(v || "").trim().toUpperCase();
  if (t === "MANANA") return "M";
  if (t === "TARDE") return "T";
  if (t === "VESPERTINO") return "V";
  if (t === "NOCHE") return "N";
  if (t === "ALTERNADO") return "ALTERNADO";
  return t;
}

function cargarPrefsEnFormulario(data) {
  const p = data.preferencias || {};

  document.querySelectorAll('input[name="pref-nivel-modalidad"]').forEach(c => {
    c.checked = false;
  });

  document.querySelectorAll(".ac-list").forEach(l => {
    l.innerHTML = "";
    l.style.display = "none";
  });

  const otrosDistritos = Array.isArray(p.otros_distritos_arr)
    ? p.otros_distritos_arr
    : [
        p.segundo_distrito,
        p.tercer_distrito,
        p.cuarto_distrito,
        p.quinto_distrito
      ].filter(Boolean);

  DISTRITO_INPUT_IDS.forEach((id, index) => {
    if (index === 0) {
      setVal(id, p.distrito_principal || "");
      return;
    }
    setVal(id, otrosDistritos[index - 1] || "");
  });

  const cargosGuardados = [
    ...(Array.isArray(p.cargos_arr) ? p.cargos_arr : []),
    ...(Array.isArray(p.materias_arr) ? p.materias_arr : [])
  ].filter(Boolean);

  const cargos = cargosGuardados.length
    ? cargosGuardados
    : splitCSV(p.cargos_csv || p.materias_csv || "");

  CARGO_INPUT_IDS.forEach((id, index) => {
    setVal(id, cargos[index] || "");
  });

  const turno = (Array.isArray(p.turnos_arr) ? p.turnos_arr[0] : "") || splitCSV(p.turnos_csv || "")[0] || "";
  setVal("pref-turnos", turnoSelectValue(turno));

  const nivelesGuardados = Array.isArray(p.niveles_arr) && p.niveles_arr.length
    ? p.niveles_arr
    : splitCSV(p.nivel_modalidad || "");

  document.querySelectorAll('input[name="pref-nivel-modalidad"]').forEach(cb => {
    cb.checked = nivelesGuardados.some(nivel => nivelCoincideConCheckbox(nivel, cb.value));
  });

  setCheck("pref-alertas-activas", !!p.alertas_activas);
  setCheck("pref-alertas-email", !!p.alertas_email);
  setCheck("pref-alertas-whatsapp", !!p.alertas_whatsapp);

  applyPlanFieldVisibility(planActual);
}

const val = id => (document.getElementById(id)?.value || "").trim();

const setVal = (id, v) => {
  const el = document.getElementById(id);
  if (el) el.value = v;
};

const checked = id => !!document.getElementById(id)?.checked;

const setCheck = (id, v) => {
  const el = document.getElementById(id);
  if (el) el.checked = !!v;
};

const setText = (id, t) => {
  const el = document.getElementById(id);
  if (el) el.textContent = t;
};

const setHTML = (id, h) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = h;
};

function splitCSV(s) {
  return String(s || "").split(",").map(x => x.trim()).filter(Boolean);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizarCursoDivision(v) {
  let s = String(v || "").trim();
  if (!s) return "-";
  s = s.replace(/Â°/g, "°").replace(/º/g, "°").replace(/Ş/g, "°").replace(/�/g, "°");
  s = s.replace(/(\d)\s*°\s*(\d)\s*°?/g, "$1°$2°");
  s = s.replace(/\s+/g, " ").trim();
  return s || "-";
}

function turnoTexto(v) {
  const items = String(v || "").split(",").map(x => x.trim().toUpperCase()).filter(Boolean);

  if (!items.length) return "";

  return items.map(x => {
    if (x === "M" || x === "MANANA") return "Mañana";
    if (x === "T" || x === "TARDE") return "Tarde";
    if (x === "V" || x === "VESPERTINO") return "Vespertino";
    if (x === "N" || x === "NOCHE") return "Noche";
    if (x === "ALTERNADO" || x === "A") return "Alternado";
    return x;
  }).join(", ");
}

function normalizarNivelKey(v) {
  const s = String(v || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "";
  if (s.includes("SUPERIOR") || s.includes("FORMACION DOCENTE") || s.includes("DOCENTE")) return "SUPERIOR";
  if (s.includes("INICIAL")) return "INICIAL";
  if (s.includes("PRIMAR")) return "PRIMARIO";
  if (s.includes("SECUNDAR")) return "SECUNDARIO";
  if (s.includes("ESPECIAL")) return "EDUCACION ESPECIAL";
  if (s.includes("JOVEN") || s.includes("ADULTO") || s.includes("CENS")) return "ADULTOS";
  if (s.includes("FISICA")) return "EDUCACION FISICA";
  if (s.includes("PSICOLOGIA") || s.includes("COMUNITARIA")) return "PSICOLOGIA";
  if (s.includes("ARTISTICA") || s.includes("ARTE")) return "EDUCACION ARTISTICA";
  if (s.includes("TECNIC")) return "TECNICO PROFESIONAL";
  return s;
}

function nivelLabelHumana(v) {
  switch (normalizarNivelKey(v)) {
    case "INICIAL":
      return "Inicial";
    case "PRIMARIO":
      return "Primaria";
    case "SECUNDARIO":
      return "Secundaria";
    case "SUPERIOR":
      return "Superior";
    case "EDUCACION ESPECIAL":
      return "Educación Especial";
    case "ADULTOS":
      return "Jóvenes y Adultos";
    case "EDUCACION FISICA":
      return "Educación Física";
    case "PSICOLOGIA":
      return "Psicología";
    case "EDUCACION ARTISTICA":
      return "Educación Artística";
    case "TECNICO PROFESIONAL":
      return "Técnico Profesional";
    default:
      return String(v || "").trim();
  }
}

function formatNivelesResumen(source) {
  const items = Array.isArray(source) ? source : splitCSV(source || "");
  const out = [];
  const seen = new Set();

  items.forEach(item => {
    const key = normalizarNivelKey(item) || String(item || "").trim().toUpperCase();
    const label = nivelLabelHumana(item);

    if (!key || !label || seen.has(key)) return;
    seen.add(key);
    out.push(label);
  });

  return out.join(", ");
}

function nivelCoincideConCheckbox(savedValue, checkboxValue) {
  const savedRaw = String(savedValue || "").trim().toUpperCase();
  const checkboxRaw = String(checkboxValue || "").trim().toUpperCase();

  if (savedRaw && checkboxRaw && savedRaw === checkboxRaw) return true;

  const savedKey = normalizarNivelKey(savedValue);
  const checkboxKey = normalizarNivelKey(checkboxValue);

  return !!savedKey && !!checkboxKey && savedKey === checkboxKey;
}

function parseFechaFlexible(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;

  const dmy = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }

  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function pad2(v) {
  return String(v).padStart(2, "0");
}

function parseAbcLiteralDate(v) {
  const raw = String(v || "").trim();
  if (!raw || raw.includes("9999")) return null;

  const iso = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/
  );

  if (iso) {
    const [, yyyy, mm, dd, hh = "00", mi = "00", ss = "00"] = iso;
    return { dd, mm, yyyy, hh, mi, ss, hasTime: iso[4] != null };
  }

  const dmy = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (dmy) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = dmy;
    return {
      dd: pad2(dd),
      mm: pad2(mm),
      yyyy,
      hh: pad2(hh),
      mi: pad2(mi),
      ss: pad2(ss),
      hasTime: dmy[4] != null
    };
  }

  return null;
}

function fmtFechaABC(v, mode = "auto") {
  const raw = String(v || "").trim();
  if (!raw || raw === "-") return "-";
  if (raw.includes("9999")) return "Sin fecha";

  const parts = parseAbcLiteralDate(raw);
  if (!parts) return raw;

  const dateStr = `${parts.dd}/${parts.mm}/${parts.yyyy}`;
  const hasRealTime = parts.hasTime && !(parts.hh === "00" && parts.mi === "00" && parts.ss === "00");

  if (mode === "date") return dateStr;
  if (mode === "datetime") return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr;

  return hasRealTime ? `${dateStr}, ${parts.hh}:${parts.mi}` : dateStr;
}

function fmtFecha(v) {
  const raw = String(v || "").trim();
  if (!raw || raw === "-") return "-";
  if (raw.includes("9999")) return "Sin fecha";

  const d = parseFechaFlexible(raw);
  if (!d) return raw;
  if (d.getFullYear() >= 9999) return "Sin fecha";

  const onlyDate = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw) || /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const options = onlyDate
    ? { day: "2-digit", month: "2-digit", year: "numeric" }
    : { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

  return new Intl.DateTimeFormat("es-AR", options).format(d);
}

function debounce(fn, ms = AUTOCOMPLETE_DEBOUNCE_MS) {
  let timer = null;

  function wrapped(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }

  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };

  return wrapped;
}

function normalizarBusqueda(v) {
  return String(v || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function labelsUnicos(rows) {
  const out = [];
  const seen = new Set();

  (Array.isArray(rows) ? rows : []).forEach(row => {
    [row?.nombre, row?.apd_nombre].forEach(raw => {
      const label = String(raw || "").trim();
      const key = normalizarBusqueda(label);
      if (!label || !key || seen.has(key)) return;
      seen.add(key);
      out.push(label.toUpperCase());
    });
  });

  return out.sort((a, b) => a.localeCompare(b, "es"));
}

async function cargarCatalogoDistritosAutocomplete() {
  if (catalogoAutocomplete.distritos.ready) return catalogoAutocomplete.distritos;
  if (catalogoAutocomplete.distritos.loading) return catalogoAutocomplete.distritos.loading;

  catalogoAutocomplete.distritos.loading = (async () => {
    const distritosRows = await supabaseFetch("catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc");
    catalogoAutocomplete.distritos.items = labelsUnicos(distritosRows);
    catalogoAutocomplete.distritos.ready = true;
    return catalogoAutocomplete.distritos;
  })();

  try {
    return await catalogoAutocomplete.distritos.loading;
  } finally {
    catalogoAutocomplete.distritos.loading = null;
  }
}

async function fetchSugerenciasRemotas(tipo, q) {
  const url = `${APD_WEB_APP_URL}?accion=sugerencias&tipo=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : { ok: false, items: [] };
  } catch {
    return { ok: false, items: [] };
  }
}

function buscarSugerenciasLocalesDistritos(q) {
  const base = catalogoAutocomplete.distritos.items;
  const needle = normalizarBusqueda(q);

  if (!needle) return [];

  const starts = [];
  const includes = [];

  for (const label of base) {
    const hay = normalizarBusqueda(label);

    if (!hay) continue;

    if (hay.startsWith(needle)) {
      starts.push({ label });
      continue;
    }

    if (hay.includes(needle)) {
      includes.push({ label });
    }

    if (starts.length >= AUTOCOMPLETE_LIMIT) break;
    if (starts.length + includes.length >= AUTOCOMPLETE_LIMIT * 3) break;
  }

  return [...starts, ...includes].slice(0, AUTOCOMPLETE_LIMIT);
}

function normalizeCacheKey(tipo, q) {
  return `${tipo}|${normalizarBusqueda(q)}`;
}

function mergeSuggestionItems(...groups) {
  const out = [];
  const seen = new Set();

  groups.flat().forEach(item => {
    const label = String(item?.label || "").trim();
    const key = normalizarBusqueda(label);
    if (!label || !key || seen.has(key)) return;
    seen.add(key);
    out.push({ label });
  });

  return out;
}

async function buscarSugerenciasCargosSupabasePattern(pattern) {
  const orFilter = encodeURIComponent(
    `(nombre_norm.ilike.${pattern},apd_nombre_norm.ilike.${pattern})`
  );

  const rows = await supabaseFetch(
    `catalogo_cargos_areas?select=nombre,apd_nombre,nombre_norm,apd_nombre_norm&or=${orFilter}&order=nombre.asc&limit=${AUTOCOMPLETE_LIMIT}`
  );

  return labelsUnicos(rows).slice(0, AUTOCOMPLETE_LIMIT).map(label => ({ label }));
}

async function buscarSugerenciasCargosSupabase(q) {
  const needle = normalizarBusqueda(q);
  if (!needle || needle.length < 2) return [];

  const prefix = await buscarSugerenciasCargosSupabasePattern(`${needle}*`);

  if (prefix.length >= AUTOCOMPLETE_LIMIT || needle.length < 3) {
    return prefix;
  }

  const contains = await buscarSugerenciasCargosSupabasePattern(`*${needle}*`);
  return mergeSuggestionItems(prefix, contains).slice(0, AUTOCOMPLETE_LIMIT);
}

function hideAC(state) {
  state.items = [];
  state.activeIndex = -1;
  state.lista.innerHTML = "";
  state.lista.style.display = "none";
}

function renderACStatus(state, text) {
  state.items = [];
  state.activeIndex = -1;
  state.lista.innerHTML = `<div class="ac-status">${esc(text)}</div>`;
  state.lista.style.display = "block";
}

function setACActive(state, index) {
  state.activeIndex = index;
  state.lista.querySelectorAll(".ac-item").forEach((el, i) => {
    el.classList.toggle("is-active", i === index);
  });
}

function seleccionarAC(state, index) {
  const item = state.items[index];
  if (!item) return;
  state.input.value = String(item.label || "").trim();
  hideAC(state);
}

function renderACItems(state, items) {
  if (!items?.length) {
    renderACStatus(state, "Sin coincidencias");
    return;
  }

  state.items = items;
  state.activeIndex = 0;

  state.lista.innerHTML = items.map((it, i) => `
    <div class="ac-item ${i === 0 ? "is-active" : ""}" data-index="${i}">
      ${esc(it.label || "")}
    </div>
  `).join("");

  state.lista.style.display = "block";

  state.lista.querySelectorAll(".ac-item").forEach(el => {
    const idx = Number(el.dataset.index);

    el.addEventListener("mouseenter", () => {
      setACActive(state, idx);
    });

    el.addEventListener("mousedown", ev => {
      ev.preventDefault();
      seleccionarAC(state, idx);
    });
  });
}

async function buscarSugerenciasState(state) {
  const q = state.input.value.trim();

  if (!q) {
    hideAC(state);
    return;
  }

  const cacheKey = normalizeCacheKey(state.tipo, q);

  if (suggestionCache.has(cacheKey)) {
    renderACItems(state, suggestionCache.get(cacheKey));
    return;
  }

  renderACStatus(state, "Buscando...");
  const requestId = ++state.requestSeq;

  try {
    let items = [];

    if (state.tipo === "distrito") {
      try {
        await cargarCatalogoDistritosAutocomplete();
        items = buscarSugerenciasLocalesDistritos(q);
      } catch (err) {
        console.error("ERROR CARGANDO CATALOGO DISTRITOS:", err);
      }

      if (!items.length) {
        const data = await fetchSugerenciasRemotas(state.tipo, q);
        items = data.ok && Array.isArray(data.items) ? data.items : [];
      }
    } else {
      try {
        items = await buscarSugerenciasCargosSupabase(q);
      } catch (err) {
        console.error("ERROR BUSCANDO CARGOS EN SUPABASE:", err);
      }

      if (!items.length) {
        const data = await fetchSugerenciasRemotas(state.tipo, q);
        items = data.ok && Array.isArray(data.items) ? data.items : [];
      }
    }

    if (requestId !== state.requestSeq) return;
    if (state.input.value.trim() !== q) return;

    suggestionCache.set(cacheKey, items);
    renderACItems(state, items);
  } catch {
    if (requestId !== state.requestSeq) return;
    renderACStatus(state, "No se pudo cargar");
    setTimeout(() => {
      if (state.lista.textContent.includes("No se pudo")) {
        hideAC(state);
      }
    }, 900);
  }
}

function handleACKeydown(ev, state) {
  const visible = state.lista.style.display !== "none";

  if (ev.key === "ArrowDown") {
    ev.preventDefault();

    if (!visible || !state.items.length) {
      state.search.flush();
      return;
    }

    const next = Math.min(state.activeIndex + 1, state.items.length - 1);
    setACActive(state, next);
    return;
  }

  if (ev.key === "ArrowUp") {
    if (!visible || !state.items.length) return;
    ev.preventDefault();
    const next = Math.max(state.activeIndex - 1, 0);
    setACActive(state, next);
    return;
  }

  if (ev.key === "Enter") {
    if (!visible || !state.items.length) return;
    ev.preventDefault();
    seleccionarAC(state, state.activeIndex >= 0 ? state.activeIndex : 0);
    return;
  }

  if (ev.key === "Escape") {
    hideAC(state);
  }
}

function activarAC(inputId, listaId, tipo) {
  const input = document.getElementById(inputId);
  const lista = document.getElementById(listaId);

  if (!input || !lista) return;

  const state = {
    input,
    lista,
    tipo,
    items: [],
    activeIndex: -1,
    requestSeq: 0,
    search: null
  };

  state.search = debounce(() => buscarSugerenciasState(state), AUTOCOMPLETE_DEBOUNCE_MS);
  autocompleteStates.set(inputId, state);

  input.addEventListener("input", () => {
    state.search();
  });

  input.addEventListener("keydown", ev => {
    handleACKeydown(ev, state);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) {
      state.search.flush();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => hideAC(state), 180);
  });
}

function initPwToggles() {
  document.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;

      const show = target.type === "password";
      target.type = show ? "text" : "password";
      btn.textContent = show ? "🙈" : "👁";
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("form-registro")?.addEventListener("submit", registrarDocente);
  document.getElementById("form-login")?.addEventListener("submit", loginPassword);
  document.getElementById("form-preferencias")?.addEventListener("submit", guardarPreferencias);

  document.getElementById("btn-logout")?.addEventListener("click", logout);
  document.getElementById("btnCerrarSesion")?.addEventListener("click", logout);
  document.getElementById("btnLogin")?.addEventListener("click", () => mostrarSeccion("login"));
  document.getElementById("btnRegistro")?.addEventListener("click", () => mostrarSeccion("registro"));
  document.getElementById("btnMiPanel")?.addEventListener("click", () => cargarDashboard());
  document.getElementById("btn-clear-distritos")?.addEventListener("click", limpiarDistritos);
  document.getElementById("btn-clear-cargos")?.addEventListener("click", limpiarCargos);

  const btnRecargar = document.getElementById("btn-recargar-panel");
  if (btnRecargar) {
    btnRecargar.addEventListener("click", async () => {
      btnLoad(btnRecargar, "Recargando...");
      try {
        await cargarDashboard();
      } finally {
        btnRestore(btnRecargar);
      }
    });
  }

  const btnHistorico = document.getElementById("btn-refresh-historico");
  if (btnHistorico) {
    btnHistorico.addEventListener("click", async () => {
      const token = obtenerToken();
      if (!token) return;

      btnLoad(btnHistorico, "Actualizando...");
      setHTML("panel-historico-apd", `<p class="ph">Actualizando histórico APD...</p>`);

      try {
        await capturarHistoricoAPD(token);
        await cargarHistoricoPanel(token);
      } catch (err) {
        console.error("ERROR CAPTURANDO HISTORICO:", err);
        setHTML("panel-historico-apd", `
          <div class="empty-state">
            <p>No pudimos actualizar el histórico.</p>
            <p class="empty-hint">${esc(err?.message || "Intentá de nuevo en un rato.")}</p>
          </div>
        `);
      } finally {
        btnRestore(btnHistorico);
      }
    });
  }

 initPlanAutocompleteFields();
applyPlanFieldVisibility(planActual);
  
  cargarCatalogoDistritosAutocomplete().catch(err => {
    console.error("ERROR PRELOAD DISTRITOS:", err);
  });

  initPwToggles();
  initGoogleAuth();
  actualizarNav();

  if (obtenerToken()) {
    cargarDashboard();
  } else {
    mostrarSeccion("inicio");
  }
});

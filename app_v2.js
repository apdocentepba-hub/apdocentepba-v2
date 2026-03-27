'use strict';

const API_URL = "https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const APD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
const APD_SUPABASE_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co";
const APD_SUPABASE_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";
const GOOGLE_CLIENT_ID = "650896364013-s3o36ckvoi42947v6ummmgdkdmsgondo.apps.googleusercontent.com";

const TOKEN_KEY = "apd_token_v2";
const AUTOCOMPLETE_DEBOUNCE_MS = 120;

let tokenMem = null;
let googleInitDone = false;
let planActual = buildPlanFallback();

const alertasState = {
  items: [],
  index: 0
};

const postulantesResumenCache = new Map();
const suggestionCache = new Map();
const autocompleteStates = new Map();

function buildPlanFallback() {
  return {
    ok: true,
    subscription: {
      id: null,
      user_id: null,
      plan_code: "PLUS",
      status: "beta",
      source: "beta_abierta",
      started_at: new Date().toISOString(),
      trial_ends_at: null,
      current_period_ends_at: null,
      mercadopago_preapproval_id: null
    },
    plan: {
      code: "PLUS",
      nombre: "Plan Plus (Beta)",
      descripcion: "Hasta 5 distritos y 5 cargos/materias mientras terminamos pagos y automatizaciones.",
      price_ars: 0,
      trial_days: 0,
      max_distritos: 5,
      max_cargos: 5,
      beta: true,
      public_visible: true
    }
  };
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
  const res = await fetch(APD_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("El backend no devolvió JSON válido");
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

async function registrarDocente(e) {
  e.preventDefault();

  const btn = e.submitter || document.querySelector("#form-registro button[type='submit']");
  btnLoad(btn, "Registrando...");
  showMsg("registro-msg", "Procesando...", "info");

  try {
    const data = await post({
      action: "register",
      nombre: val("reg-nombre"),
      apellido: val("reg-apellido"),
      email: val("reg-email"),
      celular: val("reg-celular"),
      password: val("reg-password")
    });

    if (data.ok) {
      showMsg("registro-msg", data.message || "Registro exitoso", "ok");
      document.getElementById("form-registro")?.reset();
      setTimeout(() => mostrarSeccion("login"), 1200);
    } else {
      showMsg("registro-msg", data.message || "No se pudo registrar", "error");
    }
  } catch (err) {
    console.error(err);
    showMsg("registro-msg", "Error de conexión. Intentá de nuevo.", "error");
  } finally {
    btnRestore(btn);
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

  return Array.isArray(data.resultados) ? data.resultados : [];
}

function renderAlertasAPD(alertas) {
  alertasState.items = Array.isArray(alertas) ? alertas : [];
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

function renderResumenPostulantes(box, data) {
  const total = Number(data?.total_postulantes || 0);

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
  if (!box) return;

  const oferta = String(alerta?.idoferta || "").trim();
  const detalle = String(alerta?.iddetalle || "").trim();

  if (!oferta && !detalle) {
    box.innerHTML = `
      <div class="alerta-meta-head">Referencia de postulantes</div>
      <div class="alerta-meta-empty">Esta oferta no trae identificadores para consultar postulantes.</div>
    `;
    return;
  }

  const key = `${oferta}|${detalle}`;

  if (postulantesResumenCache.has(key)) {
    renderResumenPostulantes(box, postulantesResumenCache.get(key));
    return;
  }

  box.innerHTML = `
    <div class="alerta-meta-head">Referencia de postulantes</div>
    <div class="alerta-meta-loading">Cargando postulantes...</div>
  `;

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

    renderResumenPostulantes(box, data);
  } catch (err) {
    console.error("ERROR POSTULANTES:", err);
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
            ${a.turno ? `<span class="tag tag-turno">${esc(turnoTexto(a.turno))}</span>` : ""}
            ${a.nivel_modalidad ? `<span class="tag tag-nivel">${esc(a.nivel_modalidad)}</span>` : ""}
            <span class="tag tag-estado">Activa</span>
          </div>

          <div class="alerta-title">${esc(titulo)}</div>
          <div class="alerta-subtitle">${esc(a.escuela || "Sin escuela informada")}</div>

          <div class="alerta-grid">
            ${alertaRow("Distrito", a.distrito)}
            ${alertaRow("Turno", turnoTexto(a.turno))}
            ${alertaRow("Curso/Div.", a.cursodivision || normalizarCursoDivision(a.cursodivision))}
            ${alertaRow("Jornada", a.jornada)}
            ${alertaRow("Módulos", a.hsmodulos)}
            ${alertaRow("Desde", a.supl_desde_label || fmtFechaABC(a.supl_desde, "date"))}
            ${alertaRow("Hasta", a.supl_hasta_label || fmtFechaABC(a.supl_hasta, "date"))}
            ${alertaRow("Cierre", a.finoferta_label || fmtFechaABC(a.finoferta, "datetime"))}
            ${a.observaciones ? alertaRow("Observaciones", a.observaciones) : ""}
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

    renderDashboard({
      docente,
      preferencias,
      alertas: Array.isArray(alertasResult) ? alertasResult : [],
      historial: [],
      planInfo: planActual,
      estadisticas: {
        total_alertas: Array.isArray(alertasResult) ? alertasResult.length : 0,
        alertas_leidas: 0,
        alertas_no_leidas: Array.isArray(alertasResult) ? alertasResult.length : 0,
        ultimo_acceso: docente.ultimo_login || new Date().toISOString()
      }
    });

    cargarPrefsEnFormulario({ preferencias });
    renderPlanUI(planActual);
    actualizarNav();
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
}

function renderPlanUI(planInfo) {
  const info = planInfo || buildPlanFallback();
  const plan = info.plan || {};
  const subscription = info.subscription || {};
  const nombre = planNombreHumano(plan, subscription);
  const estado = planEstadoHumano(subscription);
  const precio = planPrecioHumano(plan, subscription);
  const maxDistritos = Number(plan.max_distritos || 5);
  const maxCargos = Number(plan.max_cargos || 5);
  const descripcion = planDescripcionHumana(plan, subscription);

  setHTML("panel-plan", `
    <div class="plan-stack">
      <div class="plan-title">${esc(nombre)}</div>
      <div class="plan-pill-row">
        <span class="plan-pill">${esc(estado)}</span>
        <span class="plan-pill plan-pill-neutral">${esc(precio)}</span>
      </div>
      <div class="plan-pill-row">
        <span class="plan-pill">Hasta ${maxDistritos} distrito(s)</span>
        <span class="plan-pill">Hasta ${maxCargos} cargo(s)</span>
      </div>
      <p class="plan-note">${esc(descripcion)}</p>
    </div>
  `);

  const hint = document.getElementById("prefs-plan-hint");
  if (hint) {
    hint.textContent = `${nombre}: hasta ${maxDistritos} distrito(s) y ${maxCargos} cargo(s)/materia(s).`;
  }
}

function planNombreHumano(plan, subscription) {
  const code = String(plan?.code || subscription?.plan_code || "").trim().toUpperCase();

  if (subscription?.status === "beta" || plan?.beta) return "Plan Plus (Beta)";
  if (code === "TRIAL_7D") return "Prueba gratis 7 días";
  if (code === "BASIC") return "Plan Básico";
  if (code === "PLUS") return "Plan Plus";
  if (code === "PREMIUM") return "Plan Premium";

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

  if (String(plan?.code || "").toUpperCase() === "TRIAL_7D") {
    return "Prueba gratis con 1 distrito y 1 cargo/materia por 7 días.";
  }

  return String(plan?.descripcion || "Plan configurado para alertas APD.").trim();
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
  const cargos = [
    val("pref-cargo-1"),
    val("pref-cargo-2"),
    val("pref-cargo-3"),
    val("pref-cargo-4"),
    val("pref-cargo-5")
  ].map(v => v.toUpperCase().trim()).filter(Boolean);

  const otrosDistritos = [
    val("pref-segundo-distrito"),
    val("pref-tercer-distrito"),
    val("pref-cuarto-distrito"),
    val("pref-quinto-distrito")
  ].map(v => v.toUpperCase().trim()).filter(Boolean);

  const turno = val("pref-turnos").trim();

  return {
    distrito_principal: val("pref-distrito-principal").toUpperCase().trim() || null,
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
  [
    "pref-distrito-principal",
    "pref-segundo-distrito",
    "pref-tercer-distrito",
    "pref-cuarto-distrito",
    "pref-quinto-distrito"
  ].forEach(id => setVal(id, ""));

  [
    "sug-distrito-1",
    "sug-distrito-2",
    "sug-distrito-3",
    "sug-distrito-4",
    "sug-distrito-5"
  ].forEach(id => limpiarListaAC(id));
}

function limpiarCargos() {
  [
    "pref-cargo-1",
    "pref-cargo-2",
    "pref-cargo-3",
    "pref-cargo-4",
    "pref-cargo-5"
  ].forEach(id => setVal(id, ""));

  [
    "sug-cargo-1",
    "sug-cargo-2",
    "sug-cargo-3",
    "sug-cargo-4",
    "sug-cargo-5"
  ].forEach(id => limpiarListaAC(id));
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

  setVal("pref-distrito-principal", p.distrito_principal || "");
  setVal("pref-segundo-distrito", p.segundo_distrito || "");
  setVal("pref-tercer-distrito", p.tercer_distrito || "");
  setVal("pref-cuarto-distrito", p.cuarto_distrito || "");
  setVal("pref-quinto-distrito", p.quinto_distrito || "");

  const cargosGuardados = [
    ...(Array.isArray(p.cargos_arr) ? p.cargos_arr : []),
    ...(Array.isArray(p.materias_arr) ? p.materias_arr : [])
  ].filter(Boolean);

  const cargos = cargosGuardados.length
    ? cargosGuardados
    : splitCSV(p.cargos_csv || p.materias_csv || "");

  setVal("pref-cargo-1", cargos[0] || "");
  setVal("pref-cargo-2", cargos[1] || "");
  setVal("pref-cargo-3", cargos[2] || "");
  setVal("pref-cargo-4", cargos[3] || "");
  setVal("pref-cargo-5", cargos[4] || "");

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

function autocompleteMinChars(tipo) {
  return tipo === "distrito" ? 1 : 2;
}

function normalizeCacheKey(tipo, q) {
  return `${tipo}|${String(q || "").trim().toUpperCase()}`;
}

async function fetchSugerencias(tipo, q) {
  const url = `${APD_WEB_APP_URL}?accion=sugerencias&tipo=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : { ok: false, items: [] };
  } catch {
    return { ok: false, items: [] };
  }
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
  state.input.value = String(item.label || item.value || "").trim();
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
    const index = Number(el.dataset.index);

    el.addEventListener("mouseenter", () => {
      setACActive(state, index);
    });

    el.addEventListener("mousedown", ev => {
      ev.preventDefault();
      seleccionarAC(state, index);
    });
  });
}

async function buscarSugerenciasState(state) {
  const q = state.input.value.trim();
  const minChars = autocompleteMinChars(state.tipo);

  if (q.length < minChars) {
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
    const data = await fetchSugerencias(state.tipo, q);

    if (requestId !== state.requestSeq) return;
    if (state.input.value.trim() !== q) return;

    const items = data.ok ? (Array.isArray(data.items) ? data.items : []) : [];
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
    const minChars = autocompleteMinChars(tipo);
    if (input.value.trim().length >= minChars) {
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

  [
    ["pref-distrito-principal", "sug-distrito-1", "distrito"],
    ["pref-segundo-distrito", "sug-distrito-2", "distrito"],
    ["pref-tercer-distrito", "sug-distrito-3", "distrito"],
    ["pref-cuarto-distrito", "sug-distrito-4", "distrito"],
    ["pref-quinto-distrito", "sug-distrito-5", "distrito"],
    ["pref-cargo-1", "sug-cargo-1", "cargo_area"],
    ["pref-cargo-2", "sug-cargo-2", "cargo_area"],
    ["pref-cargo-3", "sug-cargo-3", "cargo_area"],
    ["pref-cargo-4", "sug-cargo-4", "cargo_area"],
    ["pref-cargo-5", "sug-cargo-5", "cargo_area"]
  ].forEach(([inputId, listaId, tipo]) => activarAC(inputId, listaId, tipo));

  initPwToggles();
  initGoogleAuth();
  actualizarNav();

  if (obtenerToken()) {
    cargarDashboard();
  } else {
    mostrarSeccion("inicio");
  }
});

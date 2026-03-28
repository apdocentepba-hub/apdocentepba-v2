'use strict';

const API_URL = "https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const APD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
const APD_SUPABASE_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co";
const APD_SUPABASE_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";
const GOOGLE_CLIENT_ID = "650896364013-s3o36ckvoi42947v6ummmgdkdmsgondo.apps.googleusercontent.com";

const TOKEN_KEY = "apd_token_v3";
const AUTOCOMPLETE_LIMIT = 10;
const AUTOCOMPLETE_DEBOUNCE_MS = 100;
const HISTORICO_DAYS_DEFAULT = 30;
const PROVINCIA_DAYS_DEFAULT = 30;

let tokenMem = null;
let googleInitDone = false;
let planActual = null;
let radarTimer = null;
const suggestionCache = new Map();
const autocompleteStates = new Map();

function mostrarSeccion(id) {
  document.querySelectorAll("main section").forEach(section => section.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.mostrarSeccion = mostrarSeccion;

function guardarToken(token) {
  const limpio = String(token || "").trim();
  if (!limpio) return false;
  tokenMem = limpio;
  localStorage.setItem(TOKEN_KEY, limpio);
  return true;
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
  const logged = !!obtenerToken();
  document.getElementById("navPublico")?.classList.toggle("hidden", logged);
  document.getElementById("navPrivado")?.classList.toggle("hidden", !logged);
}

function logout() {
  borrarToken();
  actualizarNav();
  limpiarMsgs();
  stopRadarRotation();
  mostrarSeccion("inicio");
}

function limpiarMsgs() {
  ["login-msg", "registro-msg", "preferencias-msg"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = "";
    el.className = "msg";
  });
}

function showMsg(id, texto, tipo = "info") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `msg msg-${tipo}`;
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

async function postAppsScript(payload) {
  const res = await fetch(APD_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function workerFetchJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || data?.error || `Worker ${res.status}`);
  }

  return data;
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
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function obtenerDocentePorId(userId) {
  const rows = await supabaseFetch(
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,ultimo_login`
  );
  return rows?.[0] || null;
}

async function obtenerPreferenciasPorUserId(userId) {
  const rows = await supabaseFetch(`user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  return rows?.[0] || null;
}

async function obtenerMiPlan(userId) {
  return workerFetchJson(`/api/mi-plan?user_id=${encodeURIComponent(userId)}`);
}

async function obtenerMisAlertas(userId) {
  const data = await workerFetchJson(`/api/mis-alertas?user_id=${encodeURIComponent(userId)}`);
  return Array.isArray(data.resultados) ? data.resultados : [];
}

async function obtenerHistoricoResumen(userId, days = HISTORICO_DAYS_DEFAULT) {
  return workerFetchJson(`/api/historico-resumen?user_id=${encodeURIComponent(userId)}&days=${days}`);
}

async function capturarHistoricoAPD(userId) {
  return workerFetchJson("/api/capturar-historico-apd", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, include_postulantes: false })
  });
}

async function guardarPreferenciasServidor(userId, payload) {
  return workerFetchJson("/api/guardar-preferencias", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, preferencias: payload })
  });
}

async function obtenerProvinciaResumen(days = PROVINCIA_DAYS_DEFAULT) {
  return workerFetchJson(`/api/provincia/resumen?days=${days}`);
}

async function obtenerProvinciaBackfillStatus() {
  return workerFetchJson("/api/provincia/backfill-status");
}

async function procesarProvinciaBackfill(force = false) {
  return workerFetchJson("/api/provincia/backfill-step", {
    method: "POST",
    body: JSON.stringify({ force })
  });
}

async function resetearProvinciaBackfill() {
  return workerFetchJson("/api/provincia/backfill-reset", {
    method: "POST",
    body: JSON.stringify({})
  });
}

async function obtenerWhatsAppHealth() {
  return workerFetchJson("/api/whatsapp/health");
}

async function crearCheckoutMercadoPago(userId, planCode) {
  return workerFetchJson("/api/mercadopago/create-checkout-link", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, plan_code: planCode })
  });
}

function adaptarPreferencias(prefRaw) {
  const otros = Array.isArray(prefRaw?.otros_distritos) ? prefRaw.otros_distritos : [];
  const cargos = Array.isArray(prefRaw?.cargos) ? prefRaw.cargos : [];
  const materias = Array.isArray(prefRaw?.materias) ? prefRaw.materias : [];
  const niveles = Array.isArray(prefRaw?.niveles) ? prefRaw.niveles : [];
  const turnos = Array.isArray(prefRaw?.turnos) ? prefRaw.turnos : [];

  return {
    distrito_principal: prefRaw?.distrito_principal || "",
    segundo_distrito: otros[0] || "",
    tercer_distrito: otros[1] || "",
    cuarto_distrito: otros[2] || "",
    quinto_distrito: otros[3] || "",
    cargos_arr: cargos,
    materias_arr: materias,
    niveles_arr: niveles,
    turnos_arr: turnos,
    alertas_activas: !!prefRaw?.alertas_activas,
    alertas_email: !!prefRaw?.alertas_email,
    alertas_telegram: !!prefRaw?.alertas_telegram,
    alertas_whatsapp: !!prefRaw?.alertas_whatsapp,
    whatsapp_habilitado: prefRaw?.whatsapp_habilitado != null ? !!prefRaw.whatsapp_habilitado : !!prefRaw?.alertas_whatsapp,
    celular: ""
  };
}

async function registrarDocente(e) {
  e.preventDefault();
  const btn = e.submitter || document.querySelector("#form-registro button[type='submit']");
  btnLoad(btn, "Registrando...");
  showMsg("registro-msg", "Procesando...", "info");

  try {
    const data = await postAppsScript({
      action: "register",
      nombre: val("reg-nombre"),
      apellido: val("reg-apellido"),
      email: val("reg-email"),
      celular: val("reg-celular"),
      password: val("reg-password")
    });

    if (!data?.ok) {
      showMsg("registro-msg", data?.message || "No se pudo registrar", "error");
      return;
    }

    showMsg("registro-msg", data.message || "Registro exitoso", "ok");
    document.getElementById("form-registro")?.reset();
    setTimeout(() => mostrarSeccion("login"), 900);
  } catch (err) {
    console.error(err);
    showMsg("registro-msg", "Error de conexion", "error");
  } finally {
    btnRestore(btn);
  }
}

async function loginPassword(e) {
  e.preventDefault();
  const btn = e.submitter || document.querySelector("#form-login button[type='submit']");
  btnLoad(btn, "Ingresando...");
  showMsg("login-msg", "Validando credenciales...", "info");

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: val("login-email"), password: val("login-password") })
    });
    const data = await res.json();

    if (!res.ok || !data?.ok || !data?.token) {
      showMsg("login-msg", data?.message || "Login incorrecto", "error");
      return;
    }

    guardarToken(data.token);
    actualizarNav();
    showMsg("login-msg", "Ingreso correcto", "ok");
    await cargarDashboard();
  } catch (err) {
    console.error(err);
    showMsg("login-msg", "Error de conexion", "error");
  } finally {
    btnRestore(btn);
  }
}

function initGoogleAuth(retries = 20) {
  if (googleInitDone) return;

  if (!window.google?.accounts?.id) {
    if (retries > 0) setTimeout(() => initGoogleAuth(retries - 1), 300);
    return;
  }

  googleInitDone = true;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential
  });

  ["google-btn-login", "google-btn-registro"].forEach(id => {
    const box = document.getElementById(id);
    if (!box) return;
    google.accounts.id.renderButton(box, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: id.includes("registro") ? "signup_with" : "signin_with",
      width: 320
    });
  });
}

async function handleGoogleCredential(response) {
  const target = document.getElementById("registro")?.classList.contains("hidden") ? "login-msg" : "registro-msg";
  showMsg(target, "Validando Google...", "info");

  try {
    const data = await workerFetchJson("/api/google-auth", {
      method: "POST",
      body: JSON.stringify({ credential: response?.credential || "" })
    });
    guardarToken(data.token);
    actualizarNav();
    showMsg(target, data.mode === "register" ? "Cuenta creada con Google" : "Ingreso con Google correcto", "ok");
    await cargarDashboard();
  } catch (err) {
    console.error(err);
    showMsg(target, err?.message || "No se pudo ingresar con Google", "error");
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
    const [docente, prefRaw, planInfo, alertas, historico, provincia, backfill, whatsapp] = await Promise.all([
      obtenerDocentePorId(token),
      obtenerPreferenciasPorUserId(token),
      obtenerMiPlan(token),
      obtenerMisAlertas(token).catch(() => []),
      obtenerHistoricoResumen(token).catch(() => null),
      obtenerProvinciaResumen().catch(() => null),
      obtenerProvinciaBackfillStatus().catch(() => null),
      obtenerWhatsAppHealth().catch(() => null)
    ]);

    if (!docente) {
      logout();
      return;
    }

    const preferencias = adaptarPreferencias(prefRaw);
    preferencias.celular = docente?.celular || "";
    planActual = planInfo;

    renderCuenta(docente);
    renderPlan(planInfo, token);
    renderCanales(whatsapp, preferencias);
    renderPreferenciasResumen(preferencias, planInfo);
    renderAlertas(alertas);
    renderHistoricoUsuario(historico);
    renderProvincia(provincia);
    renderBackfill(backfill);
    cargarPrefsEnFormulario(preferencias);
  } catch (err) {
    console.error("ERROR PANEL:", err);
    logout();
  } finally {
    setPanelLoading(false);
    actualizarNav();
  }
}

function renderCuenta(docente) {
  setText("panel-bienvenida", `Bienvenido/a, ${[docente.nombre, docente.apellido].filter(Boolean).join(" ") || "docente"}`);
  setText("panel-subtitulo", docente.email || "Panel docente");
  setHTML("panel-datos-docente", `
    <div class="list-stack">
      <div><strong>ID:</strong> ${esc(docente.id || "-")}</div>
      <div><strong>Email:</strong> ${esc(docente.email || "-")}</div>
      <div><strong>Celular:</strong> ${esc(docente.celular || "-")}</div>
      <div><strong>Ultimo acceso:</strong> ${esc(fmtFecha(docente.ultimo_login || "-"))}</div>
    </div>
  `);
}

function renderPlan(planInfo, userId) {
  const plan = planInfo?.plan || {};
  const subscription = planInfo?.subscription || {};
  const features = Array.isArray(plan.features) ? plan.features : [];

  setHTML("panel-plan", `
    <div class="list-stack">
      <div class="soft-title">${esc(plan.nombre || "Plan")}</div>
      <div class="pill-row">
        <span class="pill">${esc(planEstado(subscription))}</span>
        <span class="pill">${esc(planPrecio(plan))}</span>
      </div>
      <div class="soft-sub">${esc(plan.descripcion || "Plan sin descripcion")}</div>
      <div class="chip-row">
        <span class="chip">Hasta ${esc(String(plan.max_distritos || 0))} distritos</span>
        <span class="chip">Hasta ${esc(String(plan.max_cargos || 0))} cargos</span>
        ${features.map(feature => `<span class="chip">${esc(feature)}</span>`).join("")}
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="button" id="btn-checkout-plan">Preparar checkout</button>
      </div>
    </div>
  `);

  setText("prefs-plan-hint", `${plan.nombre || "Plan"}: hasta ${plan.max_distritos || 0} distrito(s) y ${plan.max_cargos || 0} cargo(s) o materia(s).`);

  document.getElementById("btn-checkout-plan")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-checkout-plan");
    btnLoad(btn, "Preparando...");
    try {
      const data = await crearCheckoutMercadoPago(userId, plan.code || "PLUS");
      if (data.checkout_url) window.open(data.checkout_url, "_blank", "noopener");
      else alert(data.message);
    } catch (err) {
      alert(err?.message || "No se pudo preparar el checkout");
    } finally {
      btnRestore(btn);
    }
  });
}

function renderCanales(whatsapp, preferencias) {
  const waState = whatsapp?.configured ? "Listo para pruebas" : "Pendiente de configurar";
  setHTML("panel-canales", `
    <div class="list-stack">
      <div><strong>Email:</strong> ${preferencias.alertas_email ? "Activo" : "Pausado"}</div>
      <div><strong>WhatsApp:</strong> ${preferencias.alertas_whatsapp ? "Solicitado" : "Apagado"}</div>
      <div><strong>Backend WA:</strong> ${esc(waState)}</div>
      <div class="soft-meta">${esc(whatsapp?.note || "Sin diagnostico")}</div>
    </div>
  `);
}

function renderPreferenciasResumen(pref, planInfo) {
  const distritos = [pref.distrito_principal, pref.segundo_distrito, pref.tercer_distrito, pref.cuarto_distrito, pref.quinto_distrito].filter(Boolean).join(" / ") || "(sin filtro)";
  const cargos = [...(pref.cargos_arr || []), ...(pref.materias_arr || [])].filter(Boolean).join(", ") || "(sin filtro)";
  const niveles = (pref.niveles_arr || []).join(", ") || "(cualquiera)";
  const turnos = (pref.turnos_arr || []).join(", ") || "(cualquiera)";

  setHTML("panel-preferencias-resumen", `
    <div class="list-stack">
      <div><strong>Distritos:</strong> ${esc(distritos)}</div>
      <div><strong>Cargos:</strong> ${esc(cargos)}</div>
      <div><strong>Niveles:</strong> ${esc(niveles)}</div>
      <div><strong>Turnos:</strong> ${esc(turnos)}</div>
      <div><strong>Plan:</strong> ${esc(planInfo?.plan?.nombre || "-")}</div>
    </div>
  `);
}

function renderAlertas(alertas) {
  const badge = document.getElementById("alertas-badge");
  if (badge) {
    badge.textContent = String(alertas.length || 0);
    badge.classList.toggle("hidden", !alertas.length);
  }

  if (!alertas.length) {
    setHTML("panel-alertas", `<p class="ph">No hay alertas compatibles todavia.</p>`);
    return;
  }

  setHTML("panel-alertas", `
    <ul class="soft-list">
      ${alertas.slice(0, 10).map(item => `
        <li class="soft-item">
          <div class="soft-title">${esc([item.cargo, item.area].filter(Boolean).join(" · ") || "Oferta APD")}</div>
          <div class="soft-sub">${esc(item.escuela || "Sin escuela")} · ${esc(item.distrito || "-")}</div>
          <div class="soft-meta">${esc(item.turno || "-")} · Cierre ${esc(item.finoferta_label || "-")}</div>
        </li>
      `).join("")}
    </ul>
  `);
}

function renderHistoricoUsuario(data) {
  if (!data || data.empty) {
    setHTML("panel-historico-apd", `<p class="ph">${esc(data?.message || "Todavia no hay historico para tus distritos.")}</p>`);
    return;
  }

  setHTML("panel-historico-apd", `
    <div class="stats-grid">
      <div class="stat-box"><span class="stat-n">${fmtNum(data.ofertas_unicas)}</span><span class="stat-l">Ofertas unicas</span></div>
      <div class="stat-box"><span class="stat-n">${fmtNum(data.activas_estimadas)}</span><span class="stat-l">Activas</span></div>
      <div class="stat-box"><span class="stat-n">${fmtNum(data.designadas_estimadas)}</span><span class="stat-l">Designadas</span></div>
      <div class="stat-box"><span class="stat-n">${fmtNum(data.anuladas_estimadas)}</span><span class="stat-l">Anuladas</span></div>
      <div class="stat-box"><span class="stat-n">${fmtNum(data.desiertas_estimadas)}</span><span class="stat-l">Desiertas</span></div>
      <div class="stat-box"><span class="stat-n">${fmtNum(data.nuevas_7d)}</span><span class="stat-l">Nuevas 7d</span></div>
    </div>
    <div class="soft-meta" style="margin-top:12px">Ultima captura: ${esc(fmtFecha(data.ultima_captura || "-"))}</div>
  `);
}

function renderProvincia(data) {
  if (!data || data.empty) {
    setHTML("panel-radar-provincia", `<p class="ph">Todavia no hay radar provincial suficiente.</p>`);
    stopRadarRotation();
    return;
  }

  const items = Array.isArray(data.banner_items) ? data.banner_items : [];

  setHTML("panel-radar-provincia", `
    <div class="banner-rotator">
      <div id="radar-banner-host"></div>
      <div class="stats-grid">
        <div class="stat-box"><span class="stat-n">${fmtNum(data.total_ofertas)}</span><span class="stat-l">Radar total</span></div>
        <div class="stat-box"><span class="stat-n">${fmtNum(data.activas_estimadas)}</span><span class="stat-l">Activas</span></div>
        <div class="stat-box"><span class="stat-n">${fmtNum(data.nuevas_7d)}</span><span class="stat-l">Nuevas 7d</span></div>
      </div>
      <div class="chip-row">
        ${(data.top_distritos || []).slice(0, 5).map(item => `<span class="chip">${esc(item.label)} · ${fmtNum(item.value)}</span>`).join("")}
      </div>
    </div>
  `);

  startRadarRotation(items);
}

function renderBackfill(data) {
  if (!data) {
    setHTML("panel-backfill-provincia", `<p class="ph">No se pudo leer el backfill.</p>`);
    return;
  }

  setHTML("panel-backfill-provincia", `
    <div class="progress-wrap">
      <div><strong>Estado:</strong> ${esc(data.status || "idle")}</div>
      <div><strong>Distrito actual:</strong> ${esc(data.district_name || "-")}</div>
      <div><strong>Distritos completados:</strong> ${fmtNum(data.districts_completed)} / ${fmtNum(data.total_districts)}</div>
      <div><strong>Ofertas procesadas:</strong> ${fmtNum(data.offers_processed)}</div>
      <div class="progress"><div class="progress-bar" style="width:${Number(data.progress_pct || 0)}%"></div></div>
      <div class="soft-meta">Ultima corrida: ${esc(fmtFecha(data.last_run_at || "-"))}</div>
    </div>
  `);
}

function startRadarRotation(items) {
  stopRadarRotation();
  const host = document.getElementById("radar-banner-host");
  if (!host) return;

  const list = Array.isArray(items) && items.length ? items : [{
    title: "Radar provincial",
    text: "Todavia no hay suficiente historial provincial.",
    tone: "neutral"
  }];

  let index = 0;
  const paint = () => {
    const item = list[index % list.length];
    host.innerHTML = `
      <article class="banner-card">
        <div class="banner-title">${esc(item.title || "Radar provincial")}</div>
        <div class="banner-text">${esc(item.text || "")}</div>
      </article>
    `;
    index += 1;
  };

  paint();
  if (list.length > 1) radarTimer = setInterval(paint, 8000);
}

function stopRadarRotation() {
  if (radarTimer) clearInterval(radarTimer);
  radarTimer = null;
}

function setPanelLoading(active) {
  document.getElementById("panel-loading")?.classList.toggle("hidden", !active);
  document.getElementById("panel-content")?.classList.toggle("hidden", active);
}

function buildPreferenciasPayload() {
  return {
    distrito_principal: upperVal("pref-distrito-principal") || null,
    otros_distritos: [upperVal("pref-segundo-distrito"), upperVal("pref-tercer-distrito"), upperVal("pref-cuarto-distrito"), upperVal("pref-quinto-distrito")].filter(Boolean),
    cargos: [upperVal("pref-cargo-1"), upperVal("pref-cargo-2"), upperVal("pref-cargo-3"), upperVal("pref-cargo-4"), upperVal("pref-cargo-5")].filter(Boolean),
    materias: [],
    niveles: Array.from(document.querySelectorAll('input[name="pref-nivel-modalidad"]:checked')).map(el => el.value),
    turnos: val("pref-turnos") ? [val("pref-turnos")] : [],
    celular: val("pref-celular"),
    alertas_activas: checked("pref-alertas-activas"),
    alertas_email: checked("pref-alertas-email"),
    alertas_telegram: checked("pref-alertas-telegram"),
    alertas_whatsapp: checked("pref-alertas-whatsapp"),
    whatsapp_habilitado: checked("pref-whatsapp-habilitado") || checked("pref-alertas-whatsapp")
  };
}

async function guardarPreferencias(e) {
  e.preventDefault();
  const token = obtenerToken();
  if (!token) return;

  const btn = e.submitter || document.querySelector("#form-preferencias button[type='submit']");
  btnLoad(btn, "Guardando...");
  showMsg("preferencias-msg", "Guardando preferencias...", "info");

  try {
    await guardarPreferenciasServidor(token, buildPreferenciasPayload());
    showMsg("preferencias-msg", "Preferencias guardadas", "ok");
    await cargarDashboard();
  } catch (err) {
    console.error(err);
    showMsg("preferencias-msg", err?.message || "No se pudo guardar", "error");
  } finally {
    btnRestore(btn);
  }
}

function cargarPrefsEnFormulario(pref) {
  setVal("pref-celular", pref.celular || "");
  setVal("pref-distrito-principal", pref.distrito_principal || "");
  setVal("pref-segundo-distrito", pref.segundo_distrito || "");
  setVal("pref-tercer-distrito", pref.tercer_distrito || "");
  setVal("pref-cuarto-distrito", pref.cuarto_distrito || "");
  setVal("pref-quinto-distrito", pref.quinto_distrito || "");

  const cargos = [...(pref.cargos_arr || []), ...(pref.materias_arr || [])];
  setVal("pref-cargo-1", cargos[0] || "");
  setVal("pref-cargo-2", cargos[1] || "");
  setVal("pref-cargo-3", cargos[2] || "");
  setVal("pref-cargo-4", cargos[3] || "");
  setVal("pref-cargo-5", cargos[4] || "");
  setVal("pref-turnos", (pref.turnos_arr || [])[0] || "");

  document.querySelectorAll('input[name="pref-nivel-modalidad"]').forEach(input => {
    input.checked = (pref.niveles_arr || []).includes(input.value);
  });

  setCheck("pref-alertas-activas", !!pref.alertas_activas);
  setCheck("pref-alertas-email", !!pref.alertas_email);
  setCheck("pref-alertas-telegram", !!pref.alertas_telegram);
  setCheck("pref-alertas-whatsapp", !!pref.alertas_whatsapp);
  setCheck("pref-whatsapp-habilitado", !!pref.whatsapp_habilitado);
}

function initPwToggles() {
  document.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      target.type = target.type === "password" ? "text" : "password";
    });
  });
}

function debounce(fn, ms = AUTOCOMPLETE_DEBOUNCE_MS) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function normalizarBusqueda(value) {
  return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
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

async function buscarSugerenciasSupabase(tipo, q) {
  const needle = normalizarBusqueda(q);
  if (!needle || needle.length < 2) return [];

  if (tipo === "distrito") {
    const rows = await supabaseFetch(
      `catalogo_distritos?select=nombre,apd_nombre,nombre_norm,apd_nombre_norm&or=${encodeURIComponent(`(nombre_norm.ilike.*${needle}*,apd_nombre_norm.ilike.*${needle}*)`)}&limit=${AUTOCOMPLETE_LIMIT}`
    );
    return labelsUnicos(rows).slice(0, AUTOCOMPLETE_LIMIT).map(label => ({ label }));
  }

  const rows = await supabaseFetch(
    `catalogo_cargos_areas?select=nombre,apd_nombre,nombre_norm,apd_nombre_norm&or=${encodeURIComponent(`(nombre_norm.ilike.*${needle}*,apd_nombre_norm.ilike.*${needle}*)`)}&limit=${AUTOCOMPLETE_LIMIT}`
  );
  return labelsUnicos(rows).slice(0, AUTOCOMPLETE_LIMIT).map(label => ({ label }));
}

function activarAC(inputId, listaId, tipo) {
  const input = document.getElementById(inputId);
  const lista = document.getElementById(listaId);
  if (!input || !lista) return;

  const state = { input, lista, items: [], activeIndex: -1 };
  autocompleteStates.set(inputId, state);

  const doSearch = debounce(async () => {
    const q = input.value.trim();
    if (!q) {
      hideAC(state);
      return;
    }

    const cacheKey = `${tipo}|${normalizarBusqueda(q)}`;
    if (suggestionCache.has(cacheKey)) {
      renderACItems(state, suggestionCache.get(cacheKey));
      return;
    }

    renderACStatus(state, "Buscando...");
    try {
      const items = await buscarSugerenciasSupabase(tipo, q);
      suggestionCache.set(cacheKey, items);
      renderACItems(state, items);
    } catch {
      renderACStatus(state, "No se pudo cargar");
    }
  });

  input.addEventListener("input", doSearch);
  input.addEventListener("focus", doSearch);
  input.addEventListener("blur", () => setTimeout(() => hideAC(state), 120));
  input.addEventListener("keydown", ev => handleACKeydown(ev, state));
}

function renderACStatus(state, text) {
  state.lista.innerHTML = `<div class="ac-status">${esc(text)}</div>`;
  state.lista.style.display = "block";
  state.items = [];
  state.activeIndex = -1;
}

function renderACItems(state, items) {
  if (!items.length) {
    renderACStatus(state, "Sin coincidencias");
    return;
  }

  state.items = items;
  state.activeIndex = 0;
  state.lista.innerHTML = items.map((item, index) => `
    <div class="ac-item ${index === 0 ? "is-active" : ""}" data-index="${index}">
      ${esc(item.label)}
    </div>
  `).join("");
  state.lista.style.display = "block";

  state.lista.querySelectorAll(".ac-item").forEach(el => {
    const idx = Number(el.dataset.index);
    el.addEventListener("mouseenter", () => setACActive(state, idx));
    el.addEventListener("mousedown", ev => {
      ev.preventDefault();
      seleccionarAC(state, idx);
    });
  });
}

function handleACKeydown(ev, state) {
  if (state.lista.style.display === "none") return;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    setACActive(state, Math.min(state.activeIndex + 1, state.items.length - 1));
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    setACActive(state, Math.max(state.activeIndex - 1, 0));
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    seleccionarAC(state, state.activeIndex >= 0 ? state.activeIndex : 0);
  } else if (ev.key === "Escape") {
    hideAC(state);
  }
}

function setACActive(state, index) {
  state.activeIndex = index;
  state.lista.querySelectorAll(".ac-item").forEach((el, i) => el.classList.toggle("is-active", i === index));
}

function seleccionarAC(state, index) {
  const item = state.items[index];
  if (!item) return;
  state.input.value = item.label;
  hideAC(state);
}

function hideAC(state) {
  state.lista.innerHTML = "";
  state.lista.style.display = "none";
  state.items = [];
  state.activeIndex = -1;
}

function initEventos() {
  document.getElementById("form-registro")?.addEventListener("submit", registrarDocente);
  document.getElementById("form-login")?.addEventListener("submit", loginPassword);
  document.getElementById("form-preferencias")?.addEventListener("submit", guardarPreferencias);
  document.getElementById("btnLogin")?.addEventListener("click", () => mostrarSeccion("login"));
  document.getElementById("btnRegistro")?.addEventListener("click", () => mostrarSeccion("registro"));
  document.getElementById("btnMiPanel")?.addEventListener("click", () => cargarDashboard());
  document.getElementById("btnCerrarSesion")?.addEventListener("click", logout);
  document.getElementById("btn-logout")?.addEventListener("click", logout);
  document.getElementById("btn-recargar-panel")?.addEventListener("click", () => cargarDashboard());

  document.getElementById("btn-refresh-historico")?.addEventListener("click", async () => {
    const token = obtenerToken();
    if (!token) return;
    const btn = document.getElementById("btn-refresh-historico");
    btnLoad(btn, "Actualizando...");
    try {
      await capturarHistoricoAPD(token);
      await cargarDashboard();
    } catch (err) {
      alert(err?.message || "No se pudo actualizar el historico");
    } finally {
      btnRestore(btn);
    }
  });

  document.getElementById("btn-refresh-provincia")?.addEventListener("click", () => cargarDashboard());
  document.getElementById("btn-provincia-step")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-provincia-step");
    btnLoad(btn, "Procesando...");
    try {
      await procesarProvinciaBackfill();
      await cargarDashboard();
    } catch (err) {
      alert(err?.message || "No se pudo procesar el lote provincial");
    } finally {
      btnRestore(btn);
    }
  });

  document.getElementById("btn-provincia-reset")?.addEventListener("click", async () => {
    if (!window.confirm("Esto reinicia solo el cursor provincial. Queres seguir?")) return;
    const btn = document.getElementById("btn-provincia-reset");
    btnLoad(btn, "Reiniciando...");
    try {
      await resetearProvinciaBackfill();
      await cargarDashboard();
    } catch (err) {
      alert(err?.message || "No se pudo reiniciar el cursor");
    } finally {
      btnRestore(btn);
    }
  });

  [
    ["pref-distrito-principal", "sug-distrito-1", "distrito"],
    ["pref-segundo-distrito", "sug-distrito-2", "distrito"],
    ["pref-tercer-distrito", "sug-distrito-3", "distrito"],
    ["pref-cuarto-distrito", "sug-distrito-4", "distrito"],
    ["pref-quinto-distrito", "sug-distrito-5", "distrito"],
    ["pref-cargo-1", "sug-cargo-1", "cargo"],
    ["pref-cargo-2", "sug-cargo-2", "cargo"],
    ["pref-cargo-3", "sug-cargo-3", "cargo"],
    ["pref-cargo-4", "sug-cargo-4", "cargo"],
    ["pref-cargo-5", "sug-cargo-5", "cargo"]
  ].forEach(([inputId, listaId, tipo]) => activarAC(inputId, listaId, tipo));
}

const val = id => (document.getElementById(id)?.value || "").trim();
const upperVal = id => val(id).toUpperCase();
const checked = id => !!document.getElementById(id)?.checked;
const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
const setCheck = (id, value) => { const el = document.getElementById(id); if (el) el.checked = !!value; };
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const setHTML = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = value; };

function planEstado(subscription) { const status = String(subscription?.status || "").toLowerCase(); if (status === "beta") return "Beta"; if (status === "trialing") return "Prueba"; if (status === "active" || status === "authorized") return "Activo"; if (status === "paused") return "Pausado"; return "Disponible"; }
function planPrecio(plan) { const n = Number(plan?.price_ars); if (Number.isFinite(n) && n > 0) return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }); if (plan?.trial_days) return `Prueba ${plan.trial_days} dias`; return "Sin precio publicado"; }
function fmtNum(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString("es-AR") : "0"; }
function fmtFecha(value) { const raw = String(value || "").trim(); if (!raw || raw === "-") return "-"; const d = new Date(raw); if (Number.isNaN(d.getTime())) return raw; return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d); }
function esc(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function safeJson(text) { try { return JSON.parse(text); } catch { return {}; } }

document.addEventListener("DOMContentLoaded", () => {
  initEventos();
  initPwToggles();
  initGoogleAuth();
  actualizarNav();
  if (obtenerToken()) cargarDashboard();
  else mostrarSeccion("inicio");
});

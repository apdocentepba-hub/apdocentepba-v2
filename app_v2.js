'use strict';

const API_URL = "https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const APD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
const APD_SUPABASE_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co";
const APD_SUPABASE_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";
const GOOGLE_CLIENT_ID = "650896364013-s3o36ckvoi42947v6ummmgdkdmsgondo.apps.googleusercontent.com";

const TOKEN_KEY = "apd_token_v2";
let tokenMem = null;
let googleInitDone = false;
const alertasState = { items: [], index: 0 };

function mostrarSeccion(id) {
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  const dest = document.getElementById(id);
  if (dest) dest.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.mostrarSeccion = mostrarSeccion;

function esUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || "").trim());
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

async function upsertPreferencias(userId, payload) {
  return supabaseFetch("user_preferences?on_conflict=user_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      user_id: userId,
      distrito_principal: payload.distrito_principal || null,
      otros_distritos: payload.otros_distritos || [],
      cargos: payload.cargos || [],
      materias: payload.materias || [],
      niveles: payload.niveles || [],
      turnos: payload.turnos || [],
      alertas_activas: !!payload.alertas_activas,
      alertas_email: !!payload.alertas_email,
      alertas_whatsapp: !!payload.alertas_whatsapp,
      updated_at: new Date().toISOString()
    })
  });
}

function adaptarPreferencias(prefRaw) {
  if (!prefRaw) {
    return {
      distrito_principal: "",
      segundo_distrito: "",
      tercer_distrito: "",
      cargos_csv: "",
      materias_csv: "",
      nivel_modalidad: "",
      turnos_csv: "",
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
    cargos_csv: cargos.join(", "),
    materias_csv: materias.join(", "),
    nivel_modalidad: niveles.join(", "),
    turnos_csv: turnos.join(", "),
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
    if (retries > 0) setTimeout(() => initGoogleAuth(retries - 1), 300);
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
      shape: "pill"
    });
  }

  if (regBox) {
    google.accounts.id.renderButton(regBox, {
      theme: "outline",
      size: "large",
      text: "signup_with",
      shape: "pill"
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
    showMsg(target, data?.mode === "register" ? "Cuenta creada con Google" : "Ingreso con Google correcto", "ok");
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
  const titulo = [a.cargo, a.area].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" · ") || "Oferta APD";

  box.innerHTML = `
    <div class="alerta-floating">
      <div class="alerta-topbar">
        <button id="alerta-prev" class="alerta-nav" type="button" ${total < 2 ? "disabled" : ""} aria-label="Anterior">&larr;</button>
        <div class="alerta-counter">Oferta ${alertasState.index + 1} de ${total}</div>
        <button id="alerta-next" class="alerta-nav" type="button" ${total < 2 ? "disabled" : ""} aria-label="Siguiente">&rarr;</button>
      </div>

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
        ${alertaRow("Curso/Div.", normalizarCursoDivision(a.cursodivision))}
        ${alertaRow("Jornada", a.jornada)}
        ${alertaRow("Módulos", a.hsmodulos)}
        ${alertaRow("Desde", fmtFecha(a.supl_desde))}
        ${alertaRow("Hasta", fmtFecha(a.supl_hasta))}
        ${alertaRow("Cierre", fmtFecha(a.finoferta))}
        ${a.observaciones ? alertaRow("Observaciones", a.observaciones) : ""}
      </div>
    </div>
  `;

  box.querySelector("#alerta-prev")?.addEventListener("click", () => moverAlerta(-1));
  box.querySelector("#alerta-next")?.addEventListener("click", () => moverAlerta(1));
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
    const docente = await obtenerDocentePorId(token);

    if (!docente) {
      alert("Usuario no encontrado en Supabase");
      logout();
      return;
    }

    const preferencias = adaptarPreferencias(await obtenerPreferenciasPorUserId(token));

    let alertas = [];
    try {
      alertas = await obtenerMisAlertas(token);
    } catch (e) {
      console.error("ERROR ALERTAS:", e);
      alertas = [];
    }

    renderDashboard({
      docente,
      preferencias,
      alertas,
      historial: [],
      estadisticas: {
        total_alertas: alertas.length,
        alertas_leidas: 0,
        alertas_no_leidas: alertas.length,
        ultimo_acceso: docente.ultimo_login || new Date().toISOString()
      }
    });

    cargarPrefsEnFormulario({ preferencias });
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
  const nombre = `${doc.nombre || ""} ${doc.apellido || ""}`.trim();

  const distritos = [pref.distrito_principal, pref.segundo_distrito, pref.tercer_distrito].filter(Boolean).join(" / ") || "(sin filtro)";
  const cargos = pref.cargos_csv || pref.materias_csv || "(sin filtro)";
  const niveles = pref.nivel_modalidad || "(cualquiera)";
  const turnos = turnoTexto(pref.turnos_csv) || "(cualquiera)";

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

function getNivelArray() {
  return Array.from(document.querySelectorAll('input[name="pref-nivel-modalidad"]:checked'))
    .map(el => String(el.value || "").trim().toUpperCase())
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

  const cargos = [
    val("pref-cargo-1").toUpperCase().trim(),
    val("pref-cargo-2").toUpperCase().trim(),
    val("pref-cargo-3").toUpperCase().trim()
  ].filter(Boolean);

  const otrosDistritos = [
    val("pref-segundo-distrito").toUpperCase().trim(),
    val("pref-tercer-distrito").toUpperCase().trim()
  ].filter(Boolean);

  const turno = val("pref-turnos").trim();

  const payload = {
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

  try {
    await upsertPreferencias(token, payload);
    showMsg("preferencias-msg", "Preferencias guardadas", "ok");
    await cargarDashboard();
  } catch (err) {
    console.error("ERROR GUARDANDO PREFERENCIAS:", err);
    showMsg("preferencias-msg", "Error guardando preferencias", "error");
  } finally {
    btnRestore(btn);
  }
}

function limpiarDistritos() {
  ["pref-distrito-principal", "pref-segundo-distrito", "pref-tercer-distrito"].forEach(id => setVal(id, ""));
  ["sug-distrito-1", "sug-distrito-2", "sug-distrito-3"].forEach(limpiarListaAC);
}

function limpiarCargos() {
  ["pref-cargo-1", "pref-cargo-2", "pref-cargo-3"].forEach(id => setVal(id, ""));
  ["sug-cargo-1", "sug-cargo-2", "sug-cargo-3"].forEach(limpiarListaAC);
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

  document.querySelectorAll('input[name="pref-nivel-modalidad"]').forEach(c => c.checked = false);
  document.querySelectorAll(".ac-list").forEach(l => {
    l.innerHTML = "";
    l.style.display = "none";
  });

  setVal("pref-distrito-principal", p.distrito_principal || "");
  setVal("pref-segundo-distrito", p.segundo_distrito || "");
  setVal("pref-tercer-distrito", p.tercer_distrito || "");

  const cargos = splitCSV(p.cargos_csv || p.materias_csv || "");
  setVal("pref-cargo-1", cargos[0] || "");
  setVal("pref-cargo-2", cargos[1] || "");
  setVal("pref-cargo-3", cargos[2] || "");

  const turno = splitCSV(p.turnos_csv || "")[0] || "";
  setVal("pref-turnos", turnoSelectValue(turno));

  if (p.nivel_modalidad) {
    const niveles = p.nivel_modalidad.split(",").map(s => s.trim().toUpperCase());
    document.querySelectorAll('input[name="pref-nivel-modalidad"]').forEach(cb => {
      cb.checked = niveles.includes(cb.value.trim().toUpperCase());
    });
  }

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
  s = s.replace(/Â°/g, "°").replace(/º/g, "°").replace(/�/g, "°");
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

function parseFechaFlexible(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }

  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
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

function debounce(fn, ms = 320) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

async function fetchSugerencias(tipo, q) {
  const url = `${APD_WEB_APP_URL}?accion=sugerencias&tipo=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  return res.json();
}

function renderAC(lista, items, input) {
  if (!items?.length) {
    lista.innerHTML = "";
    lista.style.display = "none";
    return;
  }

  lista.innerHTML = items.map(it => `<div class="ac-item">${esc(it.label || "")}</div>`).join("");
  lista.style.display = "block";

  lista.querySelectorAll(".ac-item").forEach(el => {
    el.addEventListener("mousedown", ev => {
      ev.preventDefault();
      input.value = el.textContent.trim();
      lista.innerHTML = "";
      lista.style.display = "none";
    });
  });
}

function activarAC(inputId, listaId, tipo) {
  const input = document.getElementById(inputId);
  const lista = document.getElementById(listaId);
  if (!input || !lista) return;

  input.addEventListener("input", debounce(async () => {
    const q = input.value.trim();

    if (q.length < 2) {
      lista.innerHTML = "";
      lista.style.display = "none";
      return;
    }

    try {
      const data = await fetchSugerencias(tipo, q);
      renderAC(lista, data.ok ? data.items : [], input);
    } catch {
      lista.innerHTML = "";
      lista.style.display = "none";
    }
  }));

  input.addEventListener("blur", () => setTimeout(() => { lista.style.display = "none"; }, 150));

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) input.dispatchEvent(new Event("input"));
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

  activarAC("pref-distrito-principal", "sug-distrito-1", "distrito");
  activarAC("pref-segundo-distrito", "sug-distrito-2", "distrito");
  activarAC("pref-tercer-distrito", "sug-distrito-3", "distrito");
  activarAC("pref-cargo-1", "sug-cargo-1", "cargo_area");
  activarAC("pref-cargo-2", "sug-cargo-2", "cargo_area");
  activarAC("pref-cargo-3", "sug-cargo-3", "cargo_area");

  initPwToggles();
  initGoogleAuth();
  actualizarNav();

  if (obtenerToken()) {
    cargarDashboard();
  } else {
    mostrarSeccion("inicio");
  }
});

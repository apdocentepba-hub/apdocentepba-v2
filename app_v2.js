'use strict';

/* ══════════════════════════════════════════
   APDocentePBA — app_v2.js
   Versión alineada con:
   - Cloudflare Worker
   - Supabase user_preferences con arrays
   - Google login desactivado temporalmente
══════════════════════════════════════════ */

const API_URL = "https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const APD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
const APD_SUPABASE_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co";
const APD_SUPABASE_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";

/* ──────────────────────────────────────────
   NAVEGACIÓN
────────────────────────────────────────── */

function mostrarSeccion(id) {
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  const dest = document.getElementById(id);
  if (dest) {
    dest.classList.remove("hidden");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ──────────────────────────────────────────
   TOKEN / SESIÓN
────────────────────────────────────────── */

const TOKEN_KEY = "apd_token_v2";
let tokenMem = null;

function esUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function guardarToken(token) {
  const limpio = String(token || "").trim();

  if (!limpio) {
    return false;
  }

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

/* ──────────────────────────────────────────
   NAV
────────────────────────────────────────── */

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

/* ──────────────────────────────────────────
   MENSAJES
────────────────────────────────────────── */

function showMsg(id, texto, tipo = "info") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `msg msg-${tipo}`;
}

/* ──────────────────────────────────────────
   BOTONES
────────────────────────────────────────── */

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

/* ──────────────────────────────────────────
   HTTP GOOGLE (registro y sugerencias)
────────────────────────────────────────── */

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

/* ──────────────────────────────────────────
   SUPABASE
────────────────────────────────────────── */

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
  const safeUserId = encodeURIComponent(userId);
  const rows = await supabaseFetch(
    `users?id=eq.${safeUserId}&select=id,nombre,apellido,email,celular,activo,ultimo_login`
  );
  return rows?.[0] || null;
}

async function obtenerPreferenciasPorUserId(userId) {
  const safeUserId = encodeURIComponent(userId);
  const rows = await supabaseFetch(
    `user_preferences?user_id=eq.${safeUserId}&select=*`
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

/* ──────────────────────────────────────────
   PANEL LOADING
────────────────────────────────────────── */

function setPanelLoading(activo) {
  document.getElementById("panel-loading")?.classList.toggle("hidden", !activo);
  document.getElementById("panel-content")?.classList.toggle("hidden", activo);
}

/* ──────────────────────────────────────────
   REGISTRO
────────────────────────────────────────── */

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

/* ──────────────────────────────────────────
   LOGIN
────────────────────────────────────────── */

async function loginPassword(e) {
  e.preventDefault();

  const btn = e.submitter || document.querySelector("#form-login button[type='submit']");
  btnLoad(btn, "Ingresando...");
  showMsg("login-msg", "Verificando credenciales...", "info");

  try {
    const email = val("login-email").trim();
    const password = val("login-password");

    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
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

    const persistido = guardarToken(token);

    if (!persistido) {
      showMsg("login-msg", "No se pudo guardar la sesión en el navegador", "error");
      return;
    }

    actualizarNav();
    showMsg("login-msg", "Ingresando...", "ok");
    await cargarDashboard();
  } catch (err) {
    console.error("ERROR LOGIN:", err);
    showMsg("login-msg", "Error de conexión. Intentá de nuevo.", "error");
  } finally {
    btnRestore(btn);
  }
}

async function handleGoogleLogin() {
  showMsg("login-msg", "Ingreso con Google desactivado temporalmente.", "error");
}

window.handleGoogleLogin = handleGoogleLogin;
window.mostrarSeccion = mostrarSeccion;

/* ──────────────────────────────────────────
   ALERTAS
────────────────────────────────────────── */

async function obtenerMisAlertas(userId) {
  const res = await fetch(`${API_URL}/api/mis-alertas?user_id=${encodeURIComponent(userId)}`, {
    method: "GET"
  });

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

function alertaRow(label, value) {
  if (!value) {
    return "";
  }

  return `
    <div class="alerta-row">
      <span class="alerta-key">${esc(label)}</span>
      <span class="alerta-val">${esc(String(value))}</span>
    </div>
  `;
}

function renderAlertasAPD(alertas) {
  const box = document.getElementById("panel-alertas");
  const badge = document.getElementById("alertas-badge");

  if (!box) return;

  const lista = Array.isArray(alertas) ? alertas : [];

  if (badge) {
    if (lista.length > 0) {
      badge.textContent = String(lista.length);
      badge.classList.remove("hidden");
    } else {
      badge.textContent = "";
      badge.classList.add("hidden");
    }
  }

  if (!lista.length) {
    box.innerHTML = `
      <div class="empty-state">
        <p>No hay alertas compatibles todavía.</p>
        <p class="empty-hint">Configurá distrito, cargo o materia, nivel y turno. Si dejás algo vacío, ese filtro no se aplica.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = lista.map(a => `
    <div class="alerta-card">
      <div class="alerta-tags">
        ${a.turno ? `<span class="tag tag-turno">${esc(turnoTexto(a.turno))}</span>` : ""}
        ${a.nivel_modalidad ? `<span class="tag tag-nivel">${esc(a.nivel_modalidad)}</span>` : ""}
        <span class="tag tag-estado">Activa</span>
      </div>
      <div class="alerta-titulo">${esc(a.cargo || a.area || "Oferta APD")}</div>
      <div class="alerta-info">
        ${alertaRow("Distrito", a.distrito)}
        ${alertaRow("Área", a.area)}
        ${alertaRow("Escuela", a.escuela)}
        ${alertaRow("Curso/Div.", a.cursodivision)}
        ${alertaRow("Jornada", a.jornada)}
        ${alertaRow("Módulos", a.hsmodulos)}
        ${alertaRow("Desde", fmtFecha(a.supl_desde))}
        ${alertaRow("Hasta", fmtFecha(a.supl_hasta))}
        ${alertaRow("Cierre", fmtFecha(a.finoferta))}
        ${alertaRow("Observaciones", a.observaciones)}
      </div>
    </div>
  `).join("");
}

/* ──────────────────────────────────────────
   DASHBOARD
────────────────────────────────────────── */

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

    const preferenciasRaw = await obtenerPreferenciasPorUserId(token);
    const preferencias = adaptarPreferencias(preferenciasRaw);

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
  const alts = Array.isArray(data.alertas) ? data.alertas : [];
  const stats = data.estadisticas || {};
  const nombre = `${doc.nombre || ""} ${doc.apellido || ""}`.trim();

  setText("panel-bienvenida", nombre ? `Bienvenido/a, ${nombre}` : "Bienvenido/a");
  setText("panel-subtitulo", doc.email ? `Sesión: ${doc.email}` : "Panel docente");

  setHTML("panel-datos-docente", `
    <p><strong>ID:</strong> ${esc(doc.id || "-")}</p>
    <p><strong>Nombre:</strong> ${esc(nombre || "-")}</p>
    <p><strong>Email:</strong> ${esc(doc.email || "-")}</p>
    <p><strong>Celular:</strong> ${esc(doc.celular || "-")}</p>
    <p><strong>Estado:</strong> ${doc.activo ? "Activo" : "Inactivo"}</p>
  `);

  const cargosDisplay = pref.cargos_csv || pref.materias_csv || "-";

  setHTML("panel-preferencias-resumen", `
    <p><strong>Distrito:</strong> ${esc(pref.distrito_principal || "-")}</p>
    ${pref.segundo_distrito ? `<p><strong>2° distrito:</strong> ${esc(pref.segundo_distrito)}</p>` : ""}
    ${pref.tercer_distrito ? `<p><strong>3° distrito:</strong> ${esc(pref.tercer_distrito)}</p>` : ""}
    <p><strong>Cargos/Mat.:</strong> ${esc(cargosDisplay)}</p>
    <p><strong>Nivel:</strong> ${esc(pref.nivel_modalidad || "(cualquiera)")}</p>
    <p><strong>Turno:</strong> ${esc(turnoTexto(pref.turnos_csv) || "(cualquiera)")}</p>
    <p><strong>Alertas:</strong> ${pref.alertas_activas ? "Activas" : "Pausadas"}</p>
    <p><strong>Email:</strong> ${pref.alertas_email ? "Sí" : "No"}</p>
  `);

  setHTML("panel-estadisticas", `
    <div class="stats-row">
      <div class="stat-box"><span class="stat-n">${stats.total_alertas ?? 0}</span><span class="stat-l">Alertas</span></div>
      <div class="stat-box"><span class="stat-n">${stats.alertas_leidas ?? 0}</span><span class="stat-l">Vistas</span></div>
      <div class="stat-box"><span class="stat-n">${stats.alertas_no_leidas ?? 0}</span><span class="stat-l">Sin ver</span></div>
    </div>
    <p class="stat-acceso">Último acceso: ${esc(fmtFecha(stats.ultimo_acceso || "-"))}</p>
  `);

  renderAlertasAPD(alts);
  setHTML("panel-historial", `<p class="ph">Sin historial todavía.</p>`);
}

/* ──────────────────────────────────────────
   PREFERENCIAS — GUARDAR
────────────────────────────────────────── */

function getNivelArray() {
  return Array.from(
    document.querySelectorAll('input[name="pref-nivel-modalidad"]:checked')
  )
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

/* ──────────────────────────────────────────
   PREFERENCIAS — CARGAR EN FORMULARIO
────────────────────────────────────────── */

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

  const cargos = splitCSV(p.cargos_csv || p.materias_csv || "");
  setVal("pref-cargo-1", cargos[0] || "");
  setVal("pref-cargo-2", cargos[1] || "");
  setVal("pref-cargo-3", cargos[2] || "");

  const turnoGuardado = splitCSV(p.turnos_csv || "")[0] || "";
  setVal("pref-turnos", turnoSelectValue(turnoGuardado));

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

/* ──────────────────────────────────────────
   HELPERS DOM
────────────────────────────────────────── */

const val = id => (document.getElementById(id)?.value || "").trim();

const setVal = (id, v) => {
  const el = document.getElementById(id);
  if (el) el.value = v;
};

const checked = id => !!(document.getElementById(id)?.checked);

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
  return String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function turnoTexto(v) {
  const valores = String(v || "")
    .split(",")
    .map(x => x.trim().toUpperCase())
    .filter(Boolean);

  if (!valores.length) {
    return "";
  }

  return valores.map(x => {
    if (x === "M" || x === "MANANA") return "Mañana";
    if (x === "T" || x === "TARDE") return "Tarde";
    if (x === "V" || x === "VESPERTINO") return "Vespertino";
    if (x === "N" || x === "NOCHE") return "Noche";
    if (x === "ALTERNADO" || x === "A") return "Alternado";
    return x;
  }).join(", ");
}

function fmtFecha(v) {
  const t = String(v || "").trim();

  if (!t || t === "-") {
    return "-";
  }

  const d = new Date(t);

  return Number.isNaN(d.getTime()) ? t : d.toLocaleString("es-AR");
}

/* ──────────────────────────────────────────
   AUTOCOMPLETE
────────────────────────────────────────── */

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

  lista.innerHTML = items
    .map(it => `<div class="ac-item">${esc(it.label || "")}</div>`)
    .join("");

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

  if (!input || !lista) {
    return;
  }

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

  input.addEventListener("blur", () => {
    setTimeout(() => {
      lista.style.display = "none";
    }, 150);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) {
      input.dispatchEvent(new Event("input"));
    }
  });
}

/* ──────────────────────────────────────────
   MOSTRAR / OCULTAR CONTRASEÑA
────────────────────────────────────────── */

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

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("form-registro")?.addEventListener("submit", registrarDocente);
  document.getElementById("form-login")?.addEventListener("submit", loginPassword);
  document.getElementById("form-preferencias")?.addEventListener("submit", guardarPreferencias);

  document.getElementById("btn-logout")?.addEventListener("click", logout);
  document.getElementById("btnCerrarSesion")?.addEventListener("click", logout);

  const btnRecargar = document.getElementById("btn-recargar-panel");
  if (btnRecargar) {
    btnRecargar.addEventListener("click", async () => {
      btnLoad(btnRecargar, "Recargando...");
      try {
        await cargarDashboard();
      } catch (e) {
        console.error(e);
      } finally {
        btnRestore(btnRecargar);
      }
    });
  }

  document.getElementById("btnLogin")?.addEventListener("click", () => mostrarSeccion("login"));
  document.getElementById("btnRegistro")?.addEventListener("click", () => mostrarSeccion("registro"));
  document.getElementById("btnMiPanel")?.addEventListener("click", () => cargarDashboard());

  activarAC("pref-distrito-principal", "sug-distrito-1", "distrito");
  activarAC("pref-segundo-distrito", "sug-distrito-2", "distrito");
  activarAC("pref-tercer-distrito", "sug-distrito-3", "distrito");

  activarAC("pref-cargo-1", "sug-cargo-1", "cargo_area");
  activarAC("pref-cargo-2", "sug-cargo-2", "cargo_area");
  activarAC("pref-cargo-3", "sug-cargo-3", "cargo_area");

  initPwToggles();
  actualizarNav();

  if (obtenerToken()) {
    cargarDashboard();
  } else {
    mostrarSeccion("inicio");
  }
});

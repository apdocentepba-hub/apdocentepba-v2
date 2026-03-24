'use strict';

/* ══════════════════════════════════════════
   APDocentePBA — app_v2.js
   Estado estable:
   - Login: Cloudflare Worker
   - Dashboard: Supabase directo por user.id
   - Preferencias: Supabase
   - Autocomplete: Google Script
   - Google login: desactivado temporalmente
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
  if (dest) dest.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ──────────────────────────────────────────
   TOKEN / SESIÓN
────────────────────────────────────────── */

const TOKEN_KEY = "apd_token_v2";
const guardarToken = t => localStorage.setItem(TOKEN_KEY, String(t));
const obtenerToken = () => localStorage.getItem(TOKEN_KEY);
const borrarToken = () => localStorage.removeItem(TOKEN_KEY);

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
   HTTP GOOGLE (solo registro y sugerencias)
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
    console.error("No JSON:", text);
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

  return text ? JSON.parse(text) : null;
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
  return supabaseFetch("user_preferences", {
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
    cargos_csv: cargos.join(","),
    materias_csv: materias.join(","),
    nivel_modalidad: niveles.join(","),
    turnos_csv: turnos.join(","),
    alertas_activas: !!prefRaw.alertas_activas,
    alertas_email: !!prefRaw.alertas_email,
    alertas_whatsapp: !!prefRaw.alertas_whatsapp
  };
}

async function construirDashboardDesdeSupabase(token) {
  const docente = await obtenerDocentePorId(token);

  if (!docente) {
    return { ok: false, message: "Usuario no encontrado en Supabase" };
  }

  const preferenciasRaw = await obtenerPreferenciasPorUserId(token);
  const preferencias = adaptarPreferencias(preferenciasRaw);

  return {
    ok: true,
    docente,
    preferencias,
    alertas: [],
    historial: [],
    estadisticas: {
      total_alertas: 0,
      alertas_leidas: 0,
      alertas_no_leidas: 0,
      ultimo_acceso: docente.ultimo_login || new Date().toISOString()
    }
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
      showMsg("registro-msg", data.message || "✓ Registro exitoso", "ok");
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
    const email = val("login-email");
    const password = val("login-password");

    console.log("LOGIN INPUT:", { email, password });

    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    console.log("LOGIN RESPONSE:", data);

    if (!res.ok || !data.ok || !data.token) {
      showMsg("login-msg", data.message || "Login incorrecto", "error");
      return;
    }

    guardarToken(data.token);
    console.log("TOKEN GUARDADO AHORA:", obtenerToken());

    showMsg("login-msg", "✓ Ingresando...", "ok");
    actualizarNav();

    setTimeout(() => {
      cargarDashboard();
    }, 300);

  } catch (err) {
    console.error("ERROR LOGIN:", err);
    showMsg("login-msg", "Error de conexión. Intentá de nuevo.", "error");
  } finally {
    btnRestore(btn);
  }
}

async function handleGoogleLogin() {
  console.log("Google login desactivado temporalmente");
  showMsg("login-msg", "Ingreso con Google desactivado temporalmente.", "error");
  return;
}

window.handleGoogleLogin = handleGoogleLogin;

/* ──────────────────────────────────────────
   DASHBOARD
────────────────────────────────────────── */

async function cargarDashboard() {
  const token = obtenerToken();

  console.log("TOKEN AL ENTRAR A DASHBOARD:", token);

  if (!token || token === "null") {
    actualizarNav();
    mostrarSeccion("inicio");
    return;
  }

  mostrarSeccion("panel-docente");
  setPanelLoading(true);

  try {
    const data = await construirDashboardDesdeSupabase(token);
    console.log("DATA DASHBOARD:", data);

    if (!data.ok) {
      alert(data.message || "Usuario no encontrado en Supabase");
      return;
    }

    renderDashboard(data);
    cargarPrefsEnFormulario(data);
    actualizarNav();

  } catch (err) {
    console.error("ERROR CARGANDO PANEL:", err);
    alert("Error cargando panel");
  } finally {
    setPanelLoading(false);
  }
}

/* ──────────────────────────────────────────
   RENDER DASHBOARD
────────────────────────────────────────── */

function renderDashboard(data) {
  const doc = data.docente || {};
  const pref = data.preferencias || {};
  const alts = Array.isArray(data.alertas) ? data.alertas : [];
  const hist = Array.isArray(data.historial) ? data.historial : [];
  const stats = data.estadisticas || {};
  const nombre = `${doc.nombre || ""} ${doc.apellido || ""}`.trim();

  setText("panel-bienvenida", nombre ? `Bienvenido/a, ${nombre}` : "Bienvenido/a");
  setText("panel-subtitulo", doc.email ? `Sesión: ${doc.email}` : "Panel docente");

  setHTML("panel-datos-docente", `
    <p><strong>ID:</strong> ${esc(doc.id || "-")}</p>
    <p><strong>Nombre:</strong> ${esc(nombre || "-")}</p>
    <p><strong>Email:</strong> ${esc(doc.email || "-")}</p>
    <p><strong>Celular:</strong> ${esc(doc.celular || "-")}</p>
    <p><strong>Estado:</strong> ${doc.activo
      ? '<span class="badge-ok">● Activo</span>'
      : '<span class="badge-off">● Inactivo</span>'}</p>
  `);

  const cargosDisplay = pref.cargos_csv || pref.materias_csv || "-";

  setHTML("panel-preferencias-resumen", `
    <p><strong>Distrito:</strong> ${esc(pref.distrito_principal || "-")}</p>
    ${pref.segundo_distrito ? `<p><strong>2° distrito:</strong> ${esc(pref.segundo_distrito)}</p>` : ""}
    ${pref.tercer_distrito ? `<p><strong>3° distrito:</strong> ${esc(pref.tercer_distrito)}</p>` : ""}
    <p><strong>Cargos/Mat.:</strong> ${esc(cargosDisplay)}</p>
    <p><strong>Nivel:</strong> ${esc(pref.nivel_modalidad || "(cualquiera)")}</p>
    <p><strong>Turno:</strong> ${esc(turnoTexto(pref.turnos_csv) || "(cualquiera)")}</p>
    <p><strong>Alertas:</strong> ${pref.alertas_activas ? "🔔 Activas" : "⏸ Pausadas"}</p>
    <p><strong>Email:</strong> ${pref.alertas_email ? "✓ Sí" : "✗ No"}</p>
  `);

  setHTML("panel-estadisticas", `
    <div class="stats-row">
      <div class="stat-box"><span class="stat-n">${stats.total_alertas ?? 0}</span><span class="stat-l">Alertas</span></div>
      <div class="stat-box"><span class="stat-n">${stats.alertas_leidas ?? 0}</span><span class="stat-l">Vistas</span></div>
      <div class="stat-box"><span class="stat-n">${stats.alertas_no_leidas ?? 0}</span><span class="stat-l">Sin ver</span></div>
    </div>
    <p class="stat-acceso">Último acceso: ${fmtFecha(stats.ultimo_acceso || "-")}</p>
  `);

  const badge = document.getElementById("alertas-badge");
  if (badge) {
    badge.textContent = String(alts.length);
    badge.classList.toggle("hidden", alts.length === 0);
  }

  const panelAlts = document.getElementById("panel-alertas");
  if (panelAlts) {
    if (alts.length > 0) {
      panelAlts.innerHTML = `
        <p class="alertas-count">${alts.length} oferta${alts.length > 1 ? "s" : ""} compatible${alts.length > 1 ? "s" : ""}</p>
        <div class="alertas-grid">${alts.map(renderAlertaCard).join("")}</div>`;
    } else {
      panelAlts.innerHTML = `
        <div class="empty-state">
          <p>No hay alertas compatibles todavía.</p>
          <p class="empty-hint">Asegurate de configurar tu distrito y cargo/materia. Si dejás el turno en "Cualquier turno" se aceptan todos los turnos.</p>
        </div>`;
    }
  }

  const panelHist = document.getElementById("panel-historial");
  if (panelHist) {
    panelHist.innerHTML = hist.length > 0
      ? `<ul class="hist-list">${hist.map(h => `<li>${esc(String(h))}</li>`).join("")}</ul>`
      : `<p class="empty-hint">Sin historial todavía.</p>`;
  }
}

function renderAlertaCard(a) {
  const turno = a.turno ? turnoTexto(a.turno) : "";
  const cargoMat = a.cargo && a.materia && a.cargo !== a.materia
    ? `${a.cargo} — ${a.materia}`
    : (a.cargo || a.materia || "");

  return `
    <div class="alerta-card">
      <div class="alerta-tags">
        ${turno ? `<span class="tag tag-turno">${esc(turno)}</span>` : ""}
        ${a.nivel_modalidad ? `<span class="tag tag-nivel">${esc(a.nivel_modalidad)}</span>` : ""}
        <span class="tag tag-estado">Publicada</span>
      </div>
      <div class="alerta-titulo">${esc(a.titulo || "APD")}</div>
      <div class="alerta-info">
        ${arow("Cargo/Mat.", cargoMat)}
        ${arow("Distrito", a.distrito)}
        ${arow("Escuela", a.escuela)}
        ${a.domicilio ? arow("Domicilio", a.domicilio) : ""}
        ${a.jornada ? arow("Jornada", a.jornada) : ""}
        ${a.modulos ? arow("Módulos", a.modulos) : ""}
        ${a.curso_division ? arow("Curso/Div.", a.curso_division) : ""}
      </div>
      ${a.fecha_cierre_fmt
        ? `<div class="alerta-cierre">⏱ Cierre: ${esc(fmtFecha(a.fecha_cierre_fmt))}</div>`
        : ""}
    </div>`;
}

function arow(key, val) {
  if (!val) return "";
  return `<div class="alerta-row">
    <span class="alerta-key">${esc(key)}</span>
    <span class="alerta-val">${esc(String(val))}</span>
  </div>`;
}

/* ──────────────────────────────────────────
   PREFERENCIAS — GUARDAR
────────────────────────────────────────── */

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

  const cargo1 = val("pref-cargo-1").toUpperCase().trim();
  const cargo2 = val("pref-cargo-2").toUpperCase().trim();
  const cargo3 = val("pref-cargo-3").toUpperCase().trim();
  const cargos = [cargo1, cargo2, cargo3].filter(Boolean);

  const segundo = val("pref-segundo-distrito").toUpperCase().trim();
  const tercero = val("pref-tercer-distrito").toUpperCase().trim();
  const otrosDistritos = [segundo, tercero].filter(Boolean);

  const niveles = Array.from(document.querySelectorAll('input[name="pref-nivel-modalidad"]:checked'))
    .map(el => el.value.trim().toUpperCase())
    .filter(Boolean);

  const turno = val("pref-turnos").trim().toUpperCase();
  const turnos = turno ? [turno] : [];

  try {
    await upsertPreferencias(token, {
      distrito_principal: val("pref-distrito-principal").toUpperCase().trim(),
      otros_distritos: otrosDistritos,
      cargos,
      materias: cargos,
      niveles,
      turnos,
      alertas_activas: checked("pref-alertas-activas"),
      alertas_email: checked("pref-alertas-email"),
      alertas_whatsapp: checked("pref-alertas-whatsapp")
    });

    showMsg("preferencias-msg", "✓ Preferencias guardadas", "ok");
    await cargarDashboard();

  } catch (err) {
    console.error(err);
    showMsg("preferencias-msg", "Error guardando preferencias", "error");
  } finally {
    btnRestore(btn);
  }
}

/* ──────────────────────────────────────────
   PREFERENCIAS — CARGAR EN FORMULARIO
────────────────────────────────────────── */

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

  setVal("pref-turnos", p.turnos_csv || "");

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
  return String(s || "").split(",").map(x => x.trim()).filter(Boolean);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function turnoTexto(v) {
  const t = String(v || "").trim().toUpperCase();
  if (!t || t === "-") return "";

  return t.split(",").map(x => {
    if (x === "M") return "Mañana";
    if (x === "T") return "Tarde";
    if (x === "V") return "Vespertino";
    if (x === "N") return "Noche";
    if (x === "ALTERNADO") return "Alternado";
    return x;
  }).filter(Boolean).join(", ");
}

function fmtFecha(v) {
  const t = String(v || "").trim();
  if (!t || t === "-") return "-";
  const d = new Date(t);
  return isNaN(d.getTime()) ? t : d.toLocaleString("es-AR");
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
    } catch (_) {
      lista.innerHTML = "";
      lista.style.display = "none";
    }
  }));

  input.addEventListener("blur", () => setTimeout(() => {
    lista.style.display = "none";
  }, 150));

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
      btnLoad(btnRecargar, "↻ Recargando...");
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

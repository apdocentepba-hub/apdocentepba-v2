'use strict';

/* ══════════════════════════════════════════
   APDocentePBA — app.js v4 + Supabase test
══════════════════════════════════════════ */

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";

/* ================================
   🔥 SUPABASE CONFIG
================================ */

const SUPABASE_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co";
const SUPABASE_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";

/* ================================
   🔥 TEST SUPABASE
================================ */

async function cargarUsuarios() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    const data = await res.json();
    console.log("🔥 USUARIOS DESDE SUPABASE:", data);

  } catch (error) {
    console.error("❌ Error Supabase:", error);
  }
}

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

const TOKEN_KEY  = "apd_token_v2";
const guardarToken = t  => localStorage.setItem(TOKEN_KEY, t);
const obtenerToken = () => localStorage.getItem(TOKEN_KEY);
const borrarToken  = () => localStorage.removeItem(TOKEN_KEY);

/* ──────────────────────────────────────────
   NAV
────────────────────────────────────────── */

function actualizarNav() {
  const ok = !!obtenerToken();
  document.getElementById("navPublico")?.classList.toggle("hidden",  ok);
  document.getElementById("navPrivado")?.classList.toggle("hidden", !ok);
}

function logout() {
  borrarToken();
  actualizarNav();
  limpiarMsgs();
  mostrarSeccion("inicio");
}

function limpiarMsgs() {
  ["login-msg","registro-msg","preferencias-msg"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.className = "msg"; }
  });
}

/* ──────────────────────────────────────────
   MENSAJES
────────────────────────────────────────── */

function showMsg(id, texto, tipo = "info") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className   = `msg msg-${tipo}`;
}

/* ──────────────────────────────────────────
   BOTONES
────────────────────────────────────────── */

function btnLoad(btn, txt) {
  if (!btn) return;
  btn.dataset.orig = btn.textContent;
  btn.disabled     = true;
  btn.textContent  = txt;
}

function btnRestore(btn) {
  if (!btn) return;
  btn.disabled    = false;
  btn.textContent = btn.dataset.orig || btn.textContent;
}

/* ──────────────────────────────────────────
   HTTP (Google backend actual)
────────────────────────────────────────── */

async function post(payload) {
  const res  = await fetch(WEB_APP_URL, {
    method:  "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body:    JSON.stringify(payload)
  });
  const text = await res.text();
  try   { return JSON.parse(text); }
  catch { console.error("No JSON:", text); throw new Error("El backend no devolvió JSON válido"); }
}

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {

  actualizarNav();

  if (obtenerToken()) {
    console.log("Sesión activa");
  } else {
    mostrarSeccion("inicio");
  }

  // 🔥 PROBAR SUPABASE
  cargarUsuarios();

});
'use strict';

// ================================
// CONFIG
// ================================

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";

const SUPABASE_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co";
const SUPABASE_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";

// ================================
// TEST SUPABASE
// ================================

async function cargarUsuarios() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    const data = await res.json();
    console.log("🔥 USUARIOS DESDE SUPABASE:", data);

  } catch (error) {
    console.error("❌ Error Supabase:", error);
  }
}

// ================================
// INIT
// ================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("APP INICIADA");

  cargarUsuarios();
});

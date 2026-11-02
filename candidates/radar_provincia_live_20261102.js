/* APDocentePBA — CANDIDATO NO PUBLICADO.
 * Reemplazo del radar histórico fijo: usa solo el estado agregado real del escaneo.
 * No modifica preferencias, ofertas, sesiones, suscripciones ni la base.
 */
(function () {
  "use strict";
  if (window.__apdRadarProvinciaPatchLoaded) return;
  window.__apdRadarProvinciaPatchLoaded = true;

  const state = { requestId: 0, controller: null };
  const MAX_AGE_MS = 36 * 60 * 60 * 1000;
  const MAX_FUTURE_MS = 5 * 60 * 1000;

  function byId(id) { return document.getElementById(id); }
  function finiteInt(value, min, max) {
    return typeof value === "number" && Number.isSafeInteger(value)
      && value >= min && value <= max;
  }
  function formatDate(dateIso) {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires", day: "2-digit",
      month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(dateIso));
  }
  function assess(payload, now) {
    if (!payload || payload.ok !== true) return { kind: "unavailable" };
    const total = payload.total_districts;
    const done = payload.districts_completed;
    const offers = payload.offers_processed;
    if (!finiteInt(total, 1, 300) || !finiteInt(done, 0, total)
      || !finiteInt(offers, 0, 1000000)) return { kind: "unavailable" };
    if (payload.status === "running") {
      return { kind: "running", done, total };
    }
    if (payload.status === "error") {
      return { kind: "error", done, total };
    }
    if (payload.status !== "finished" || done !== total
        || typeof payload.finished_at !== "string") {
      return { kind: "unavailable" };
    }
    const ts = Date.parse(payload.finished_at);
    if (!Number.isFinite(ts) || ts > now + MAX_FUTURE_MS) return { kind: "unavailable" };
    return {
      kind: now - ts > MAX_AGE_MS ? "stale" : "complete",
      done, total, offers, finishedAt: payload.finished_at
    };
  }
  function ensureStyle() {
    if (byId("apd-radar-vivo-style")) return;
    const el = document.createElement("style");
    el.id = "apd-radar-vivo-style";
    el.textContent = ".apd-radar-vivo{display:grid;gap:10px;padding:16px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#17324c}.apd-radar-vivo strong{font-size:18px}.apd-radar-vivo small{font-size:12px;line-height:1.4;color:#475569}.apd-radar-vivo .stats{display:flex;gap:8px;flex-wrap:wrap}.apd-radar-vivo .stat{padding:8px 12px;border-radius:11px;background:white;border:1px solid #dbe3ed;font-size:13px}";
    document.head.appendChild(el);
  }
  function ensureCard() {
    const root = byId("panel-content");
    if (!root) return null;
    let card = byId("panel-radar-combinado-card");
    if (!card) {
      const html = '<div id="panel-radar-combinado-card" class="panel-card span-12">' +
        '<div class="card-lbl-row"><span class="card-lbl">📍 Radar provincial — estado de captura</span>' +
        '<button id="btn-refresh-radar-combinado" class="mini-btn" type="button">Consultar ahora</button></div>' +
        '<div class="apd-radar-vivo" aria-live="polite">' +
        '<strong id="apd-radar-vivo-title">Sin consultar</strong>' +
        '<div id="apd-radar-vivo-stats" class="stats"></div>' +
        '<small id="apd-radar-vivo-detail">Consulta de datos agregados del escáner provincial.</small>' +
        '<small>Las ofertas detectadas no equivalen a vacantes abiertas. Antes de postularte, verificá siempre en ABC.</small>' +
        '</div></div>';
      const historic = byId("panel-historico-apd-card");
      if (historic) historic.insertAdjacentHTML("beforebegin", html);
      else root.insertAdjacentHTML("beforeend", html);
      card = byId("panel-radar-combinado-card");
    }
    return card;
  }
  function stat(label) {
    const el = document.createElement("span");
    el.className = "stat";
    el.textContent = label;
    return el;
  }
  function render(model) {
    ensureStyle();
    if (!ensureCard()) return;
    const title = byId("apd-radar-vivo-title");
    const detail = byId("apd-radar-vivo-detail");
    const stats = byId("apd-radar-vivo-stats");
    if (!title || !detail || !stats) return;
    stats.replaceChildren();
    if (model.kind === "complete" || model.kind === "stale") {
      title.textContent = model.kind === "complete"
        ? "Último barrido provincial completado"
        : "Último barrido registrado — datos antiguos";
      stats.appendChild(stat("Distritos: " + model.done + "/" + model.total));
      stats.appendChild(stat("Ofertas detectadas: " + model.offers.toLocaleString("es-AR")));
      detail.textContent = "Finalizado: " + formatDate(model.finishedAt) +
        " (hora argentina). " +
        (model.kind === "stale" ? "La captura tiene más de 36 horas; no representa la situación actual."
          : "Es un recuento del barrido, no una confirmación de disponibilidad en ABC.");
    } else if (model.kind === "running") {
      title.textContent = "Escaneo provincial en curso";
      stats.appendChild(stat("Distritos procesados: " + model.done + "/" + model.total));
      detail.textContent = "El barrido aún no terminó. No se muestra un total definitivo de ofertas.";
    } else if (model.kind === "error") {
      title.textContent = "Escaneo provincial con incidencias";
      stats.appendChild(stat("Distritos procesados: " + model.done + "/" + model.total));
      detail.textContent = "La última captura no está completa. No se publican totales de ofertas.";
    } else if (model.kind === "loading") {
      title.textContent = "Verificando datos del escáner…";
      detail.textContent = "Consultando estado público agregado, sin acceder a tus datos personales.";
    } else {
      title.textContent = "No se pudo verificar el estado provincial";
      detail.textContent = "No se muestran estadísticas anteriores ni números estimados. Podés reintentar.";
    }
  }
  function apiOrigin() {
    // API_URL is the canonical constant in app_v2.js. Do not guess a second server.
    if (typeof API_URL !== "string" || !/^https:\/\//.test(API_URL)) return null;
    const url = new URL(API_URL);
    if (url.protocol !== "https:") return null;
    return url.origin;
  }
  async function refresh() {
    ensureCard();
    const requestId = ++state.requestId;
    if (state.controller) state.controller.abort();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    state.controller = controller;
    const btn = byId("btn-refresh-radar-combinado");
    if (btn) btn.disabled = true;
    render({ kind: "loading" });
    try {
      const base = apiOrigin();
      if (!base) throw new Error("API origin not configured");
      const response = await fetch(base + "/api/provincia/backfill-status", {
        method: "GET", cache: "no-store", credentials: "omit",
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!response.ok) throw new Error("No verified scan response");
      const payload = await response.json();
      if (requestId === state.requestId) render(assess(payload, Date.now()));
    } catch (_) {
      if (requestId === state.requestId) render({ kind: "unavailable" });
    } finally {
      if (requestId === state.requestId) {
        state.controller = null;
        if (btn) btn.disabled = false;
      }
    }
  }
  function boot() {
    ensureStyle();
    if (!ensureCard()) return;
    const btn = byId("btn-refresh-radar-combinado");
    if (btn && !btn.dataset.apdRadarBound) {
      btn.dataset.apdRadarBound = "1";
      btn.addEventListener("click", function () { void refresh(); });
    }
  }
  window.cargarExtrasProvincia = function cargarExtrasProvincia() {
    boot();
    return refresh();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

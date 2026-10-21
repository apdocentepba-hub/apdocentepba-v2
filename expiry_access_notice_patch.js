/* Alertas APD — aviso de plan vencido. Visual solamente: el Worker es la autoridad. */
(() => {
  "use strict";
  const NOTICE_ID = "apd-expiry-access-notice";
  const CHECK_MS = 60000;
  let lastCheck = 0;
  let checking = false;
  let checkGeneration = 0;

  // Access state belongs to the protected backend, never infer it from incomplete data.
  function readExpiry(planInfo) {
    return planInfo?.access_active === true;
  }

  function ensureNotice(panel) {
    let notice = document.getElementById(NOTICE_ID);
    if (notice) return notice;
    notice = document.createElement("div");
    notice.id = NOTICE_ID;
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.style.cssText = "display:none;margin:12px auto 18px;padding:20px;max-width:1180px;border:1px solid #e6b85b;border-radius:16px;background:#fff9ea;color:#563b12;box-shadow:0 5px 20px rgba(60,44,10,.08);";
    const title = document.createElement("strong");
    title.style.cssText = "display:block;margin-bottom:8px;font-size:19px;";
    title.textContent = "Tu prueba o suscripción finalizó";
    const detail = document.createElement("p");
    detail.style.cssText = "margin:0 0 14px;line-height:1.5;";
    detail.textContent = "Para seguir recibiendo alertas de actos públicos, elegí uno de los planes disponibles. Tus preferencias quedan guardadas.";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "btn btn-primary";
    action.setAttribute("data-plan-open-tab", "");
    action.textContent = "Ver planes y reactivar alertas";
    notice.append(title, detail, action);
    const container = panel.querySelector(".container") || panel;
    container.prepend(notice);
    return notice;
  }

  async function refresh(force = false) {
    const panel = document.getElementById("panel-docente");
    if (!panel || panel.classList.contains("hidden")) return;
    if (typeof obtenerToken !== "function" || typeof window.workerFetchJson !== "function") return;
    const token = obtenerToken();
    if (!token) return;
    if (!force && (checking || Date.now() - lastCheck < CHECK_MS)) return;
    checking = true;
    lastCheck = Date.now();
    const generation = ++checkGeneration;
    try {
      // /api/mi-plan is secured by the Worker; its user_id comes from the session.
      const data = await window.workerFetchJson("/api/mi-plan");
      if (generation !== checkGeneration || token !== obtenerToken()) return;
      const notice = ensureNotice(panel);
      // Backwards-compatible rollout: older Workers do not expose access_active.
      // Hide the banner rather than mislabel an administrator-granted lifetime plan.
      if (typeof data?.access_active !== "boolean") {
        notice.style.display = "none";
        return;
      }
      if (readExpiry(data)) {
        notice.style.display = "none";
      } else {
        const isTrial = String(data?.subscription?.plan_code || "").toUpperCase() === "TRIAL_7D";
        notice.querySelector("strong").textContent = isTrial
          ? "Tu período de prueba gratuita finalizó"
          : "Tu suscripción no está vigente";
        notice.style.display = "block";
      }
    } catch (_) {
      // Do not claim expiry when the network is unavailable; backend still enforces it.
    } finally {
      checking = false;
    }
  }

  function start() {
    const panel = document.getElementById("panel-docente");
    if (!panel) return;
    const observer = new MutationObserver(() => {
      if (!panel.classList.contains("hidden")) refresh(true);
    });
    observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
    if (!panel.classList.contains("hidden")) refresh(true);
    setInterval(() => refresh(false), CHECK_MS);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();

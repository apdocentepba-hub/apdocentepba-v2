(function () {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-listado");
        if (!id) return;
        msg(LISTADOS_MSG_ID, "Eliminando...", "info");
        try {
          await api("/api/listados/delete", { method: "POST", body: JSON.stringify({ id }) });
          msg(LISTADOS_MSG_ID, "Listado eliminado", "ok");
          await refreshPerfilListados();
        } catch (err) {
          msg(LISTADOS_MSG_ID, err?.message || "No se pudo eliminar", "error");
        }
      });
    });

    document.getElementById("btn-recompute-eligibility")?.addEventListener("click", () => recomputeEligibility(false));
  }

  function getCurrentOffersFromPanel() {
    try {
      if (Array.isArray(window.alertasState?.items)) return window.alertasState.items;
    } catch {}
    return [];
  }

  function eligibilityBadgeHtml(item) {
    if (!item || !item.offer_id) return "";
    const cls = item.compatible ? "plan-pill" : "plan-pill plan-pill-neutral";
    return `<div style="margin-top:8px;"><span class="${cls}">${item.compatible ? "Compatible" : "Sin match"}</span>${item.puntaje_usuario != null ? `<span class="plan-pill">Puntaje ${esc(Number(item.puntaje_usuario).toFixed(2))}</span>` : ""}${item.confidence_level ? `<span class="plan-pill plan-pill-neutral">${esc(item.confidence_level)}</span>` : ""}</div>${item.strategic_message ? `<p class="plan-note" style="margin-top:6px;">${esc(item.strategic_message)}</p>` : ""}`;
  }

  function mountEligibilityIntoAlertPanel() {
    const panel = document.getElementById("panel-alertas");
    if (!panel || !currentEligibility.length) return;
    const currentOffer = getCurrentOffersFromPanel()[window.alertasState?.index || 0];
    if (!currentOffer) return;
    const offerId = String(currentOffer.offer_id || currentOffer.source_offer_key || currentOffer.idoferta || currentOffer.iddetalle || "").trim();
    if (!offerId) return;
    const info = currentEligibility.find(item => String(item.offer_id || "").trim() === offerId);
    if (!info || document.getElementById("eligibility-current-offer")) return;
    panel.insertAdjacentHTML("beforeend", `<div id="eligibility-current-offer" style="margin-top:12px;padding:12px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;"><div class="card-lbl">🎯 Tus chances en APD</div>${eligibilityBadgeHtml(info)}</div>`);
  }

  async function recomputeEligibility(silent) {
    const offers = getCurrentOffersFromPanel();
    if (!silent) msg(LISTADOS_MSG_ID, "Calculando compatibilidad...", "info");
    try {
      const data = await api("/api/eligibility/recompute", { method: "POST", body: JSON.stringify({ offers }) });
      currentEligibility = Array.isArray(data?.items) ? data.items : [];
      if (!silent) {
        msg(LISTADOS_MSG_ID, `Compatibilidades calculadas: ${Number(data?.summary?.compatibles || 0)} compatibles`, "ok");
      }
      document.getElementById("eligibility-current-offer")?.remove();
      mountEligibilityIntoAlertPanel();
    } catch (err) {
      if (!silent) msg(LISTADOS_MSG_ID, err?.message || "No se pudo recalcular compatibilidad", "error");
    }
  }

  async function refreshPerfilListados() {
    ensureCards();
    const [profile, listados] = await Promise.all([api("/api/profile/me"), api("/api/listados/mis-listados")]);
    renderProfile(profile);
    renderListados(listados);
  }

  function hookAlertRender() {
    if (window.__perfilDocenteAlertHook) return;
    window.__perfilDocenteAlertHook = true;
    const original = window.renderAlertasAPD;
    if (typeof original === "function") {
      window.renderAlertasAPD = function patchedRenderAlertasAPD(alertas) {
        const result = original(alertas);
        setTimeout(() => {
          document.getElementById("eligibility-current-offer")?.remove();
          mountEligibilityIntoAlertPanel();
        }, 50);
        return result;
      };
    }
  }

  function bootWhenPanelExists() {
    ensureCards();
    hookAlertRender();
    refreshPerfilListados().catch(() => {});
  }

  const observer = new MutationObserver(() => {
    const panel = document.getElementById("panel-content");
    if (panel && !document.getElementById(PROFILE_CARD_ID)) bootWhenPanelExists();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      bootWhenPanelExists();
    }, { once: true });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
    bootWhenPanelExists();
  }
})();

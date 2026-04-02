(function () {
  'use strict';

  const PLAN_PATCH_VERSION = '2026-04-01-plans-ui-2';
  const PLAN_SELECTOR_ID = 'panel-plan-selector';
  const PLAN_MSG_ID = 'plan-checkout-msg';
  let planesCache = null;
  let renderSeq = 0;

  function normalizePlanCodeSafe(code) {
    const raw = String(code || '').trim().toUpperCase();
    return raw === 'PRO' ? 'PREMIUM' : raw;
  }

  function planBox() {
    return document.getElementById('panel-plan');
  }

  function canalesBox() {
    return document.getElementById('panel-canales');
  }

  function ensurePlanMsgNode() {
    const box = planBox();
    if (!box) return null;

    let node = document.getElementById(PLAN_MSG_ID);
    if (!node) {
      box.insertAdjacentHTML('beforeend', `<div id="${PLAN_MSG_ID}" class="msg"></div>`);
      node = document.getElementById(PLAN_MSG_ID);
    }

    return node;
  }

  function setPlanMsg(text, type = 'info') {
    const el = ensurePlanMsgNode();
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type}`;
  }

  function setPlanMsgHtml(html, type = 'info') {
    const el = ensurePlanMsgNode();
    if (!el) return;
    el.innerHTML = String(html || '');
    el.className = `msg msg-${type}`;
  }

  function clearPlanMsg() {
    const el = document.getElementById(PLAN_MSG_ID);
    if (!el) return;
    el.textContent = '';
    el.className = 'msg';
  }

  function cleanupCanalesMercadoPago() {
    const box = canalesBox();
    if (!box) return;

    let removedAny = false;

    [...box.querySelectorAll('.soft-card')].forEach(card => {
      const title = String(card.querySelector('h3')?.textContent || '').trim().toLowerCase();
      if (title === 'mercado pago') {
        card.remove();
        removedAny = true;
      }
    });

    if (removedAny && !box.querySelector('[data-plan-managed-note]')) {
      box.insertAdjacentHTML(
        'beforeend',
        '<div class="soft-meta" data-plan-managed-note="1" style="margin-top:8px">Los cambios de plan ahora se hacen desde el bloque <strong>Mi plan</strong>.</div>'
      );
    }
  }

  function mountCanalesCleanup() {
    const box = canalesBox();
    if (!box) return;

    if (box.dataset.planPatchObserved === '1') {
      cleanupCanalesMercadoPago();
      return;
    }

    const observer = new MutationObserver(() => {
      cleanupCanalesMercadoPago();
    });

    observer.observe(box, { childList: true, subtree: true });
    box.dataset.planPatchObserved = '1';
    cleanupCanalesMercadoPago();
  }

  function mpReturnMessage() {
    const params = new URLSearchParams(window.location.search || '');
    const state = String(params.get('mp') || '').trim().toLowerCase();

    if (state === 'success') return { type: 'ok', text: 'Pago aprobado. Tocá “Actualizar plan” para refrescar tu suscripción.' };
    if (state === 'pending') return { type: 'info', text: 'Tu pago quedó pendiente. Cuando Mercado Pago confirme, tocá “Actualizar plan”.' };
    if (state === 'failure') return { type: 'error', text: 'El pago no se completó. Podés intentar nuevamente desde acá.' };
    return null;
  }

  async function obtenerPlanesDisponiblesUI() {
    if (Array.isArray(planesCache) && planesCache.length) return planesCache;

    const data = await window.workerFetchJson('/api/planes');
    const planes = Array.isArray(data?.planes) ? data.planes : [];
    planesCache = planes.filter(plan => plan?.public_visible !== false);
    return planesCache;
  }

  function planActualCode(planInfo) {
    const code = window.planCodeUI
      ? window.planCodeUI(planInfo?.plan || {}, planInfo?.subscription || {})
      : (planInfo?.subscription?.plan_code || planInfo?.plan?.code || '');
    return normalizePlanCodeSafe(code);
  }

  function isCurrentPlan(plan, planInfo) {
    return normalizePlanCodeSafe(plan?.code || plan?.display_code || '') === planActualCode(planInfo);
  }

  function planCardButtonHtml(plan, planInfo) {
    const current = isCurrentPlan(plan, planInfo);
    const safeName = window.esc ? window.esc(plan?.display_name || plan?.nombre || plan?.code || 'este plan') : String(plan?.display_name || plan?.nombre || plan?.code || 'este plan');
    const buttonLabel = current ? 'Plan actual' : `Cambiar a ${safeName}`;
    const buttonClass = current ? 'btn btn-secondary btn-full' : 'btn btn-primary btn-full';
    const extraAttr = current ? 'disabled' : `data-plan-checkout="${String(plan?.code || '').trim().toUpperCase()}"`;
    return `<button type="button" class="${buttonClass}" ${extraAttr}>${buttonLabel}</button>`;
  }

  function buildPlanFeatureList(plan) {
    const features = Array.isArray(plan?.features) ? plan.features : [];
    if (!features.length) return '';
    return `<ul style="margin:8px 0 0 18px;padding:0;font-size:13px;line-height:1.45;">${features.slice(0, 5).map(item => `<li>${window.esc ? window.esc(item) : String(item)}</li>`).join('')}</ul>`;
  }

  function buildPlanCards(planInfo, planes) {
    if (!Array.isArray(planes) || !planes.length) {
      return '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,52,96,.12);"><p class="ph">No pudimos cargar los planes disponibles.</p></div>';
    }

    return `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,52,96,.12);">
        <div class="plan-pill-row" style="margin-bottom:8px;">
          <span class="plan-pill">Cambiar plan</span>
          <button type="button" class="btn btn-ghost" data-plan-refresh="1">Actualizar plan</button>
        </div>
        <p class="plan-note">Elegí otro plan y te abrimos Mercado Pago. La pestaña actual queda intacta; si el navegador bloquea popups, te dejamos un enlace manual.</p>
        ${planes.map(plan => {
          const limits = window.getPlanLimits ? window.getPlanLimits({ plan }) : {
            maxDistritos: Number(plan?.max_distritos || 1),
            maxCargos: Number(plan?.max_cargos || 2),
            maxDistritosNormales: Number(plan?.max_distritos_normales || plan?.max_distritos || 1),
            maxDistritosEmergencia: Number(plan?.max_distritos_emergencia || 0)
          };
          const current = isCurrentPlan(plan, planInfo);
          const nombre = window.planNombreHumano ? window.planNombreHumano(plan, current ? (planInfo?.subscription || {}) : { plan_code: plan?.code || '', status: 'active' }) : String(plan?.display_name || plan?.nombre || plan?.code || 'Plan');
          const precio = window.planPrecioHumano ? window.planPrecioHumano(plan, current ? (planInfo?.subscription || {}) : { plan_code: plan?.code || '', status: 'active' }) : String(plan?.price_ars || '');
          const descripcion = window.planDescripcionHumana ? window.planDescripcionHumana(plan, current ? (planInfo?.subscription || {}) : { plan_code: plan?.code || '', status: 'active' }) : String(plan?.descripcion || '');
          const distritosText = limits.maxDistritosEmergencia > 0 ? `${limits.maxDistritosNormales} principales + ${limits.maxDistritosEmergencia} de emergencia` : `Hasta ${limits.maxDistritos} distrito(s)`;
          return `
            <div style="margin-top:12px;padding:12px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:${current ? 'rgba(15,52,96,.04)' : '#fff'};">
              <div class="plan-pill-row">
                <span class="plan-pill">${window.esc ? window.esc(nombre) : nombre}</span>
                <span class="plan-pill plan-pill-neutral">${window.esc ? window.esc(precio) : precio}</span>
              </div>
              <div class="plan-pill-row" style="margin-top:8px;">
                <span class="plan-pill">${window.esc ? window.esc(distritosText) : distritosText}</span>
                <span class="plan-pill">Hasta ${limits.maxCargos} cargo(s)/materia(s)</span>
              </div>
              <p class="plan-note" style="margin-top:8px;">${window.esc ? window.esc(descripcion) : descripcion}</p>
              ${buildPlanFeatureList(plan)}
              <div style="margin-top:12px;">${planCardButtonHtml(plan, planInfo)}</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderPlanSelector(planInfo, planes) {
    const box = planBox();
    if (!box) return;

    document.getElementById(PLAN_SELECTOR_ID)?.remove();
    document.getElementById(PLAN_MSG_ID)?.remove();

    box.insertAdjacentHTML('beforeend', `<div id="${PLAN_SELECTOR_ID}">${buildPlanCards(planInfo, planes)}</div>`);
    box.insertAdjacentHTML('beforeend', `<div id="${PLAN_MSG_ID}" class="msg"></div>`);

    const mpMsg = mpReturnMessage();
    if (mpMsg) setPlanMsg(mpMsg.text, mpMsg.type);
  }

  async function refrescarPlanActual() {
    const userId = window.obtenerToken ? window.obtenerToken() : '';
    if (!userId || !window.obtenerMiPlan) {
      setPlanMsg('No se pudo refrescar el plan porque la sesión ya no está activa.', 'error');
      return;
    }

    setPlanMsg('Actualizando plan...', 'info');
    try {
      const planInfo = await window.obtenerMiPlan(userId);
      if (planInfo?.plan || planInfo?.subscription) window.planActual = planInfo;
      await window.renderPlanUI(window.planActual || planInfo);
      setPlanMsg('Plan actualizado.', 'ok');
    } catch (err) {
      console.error('ERROR REFRESH PLAN:', err);
      setPlanMsg(err?.message || 'No se pudo actualizar el plan.', 'error');
    }
  }

  async function iniciarCheckoutPlan(planCode, button) {
    const userId = window.obtenerToken ? window.obtenerToken() : '';
    if (!userId) {
      setPlanMsg('Tu sesión venció. Volvé a ingresar para cambiar de plan.', 'error');
      return;
    }

    clearPlanMsg();
    if (button && typeof window.btnLoad === 'function') window.btnLoad(button, 'Abriendo...');
    else if (button) button.disabled = true;

    try {
      const data = await window.workerFetchJson('/api/mercadopago/create-checkout-link', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, plan_code: String(planCode || '').trim().toUpperCase() })
      });

      if (!data?.checkout_url) {
        setPlanMsg(data?.message || 'No se pudo generar el checkout de Mercado Pago.', data?.configured === false ? 'info' : 'error');
        return;
      }

      const opened = window.open(data.checkout_url, '_blank', 'noopener');
      if (opened) {
        setPlanMsg('Mercado Pago se abrió en una pestaña nueva.', 'ok');
        return;
      }

      const safeUrl = window.esc ? window.esc(data.checkout_url) : String(data.checkout_url);
      setPlanMsgHtml(`Tu navegador bloqueó la pestaña nueva. <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Abrir Mercado Pago</a>`, 'info');
    } catch (err) {
      console.error('ERROR CHECKOUT PLAN:', err);
      setPlanMsg(err?.message || 'No se pudo iniciar el cambio de plan.', 'error');
    } finally {
      if (button && typeof window.btnRestore === 'function') window.btnRestore(button);
      else if (button) button.disabled = false;
    }
  }

  document.addEventListener('click', async ev => {
    const refreshBtn = ev.target.closest('[data-plan-refresh]');
    if (refreshBtn) {
      ev.preventDefault();
      await refrescarPlanActual();
      return;
    }

    const checkoutBtn = ev.target.closest('[data-plan-checkout]');
    if (!checkoutBtn) return;
    ev.preventDefault();
    await iniciarCheckoutPlan(checkoutBtn.dataset.planCheckout, checkoutBtn);
  });

  const originalRenderPlanUI = window.renderPlanUI;
  if (typeof originalRenderPlanUI === 'function') {
    window.renderPlanUI = function patchedRenderPlanUI(planInfo) {
      const result = originalRenderPlanUI(planInfo);
      const currentRender = ++renderSeq;

      Promise.resolve().then(async () => {
        const box = planBox();
        if (!box) return;

        const oldSelector = document.getElementById(PLAN_SELECTOR_ID);
        if (oldSelector) oldSelector.innerHTML = '<p class="ph">Cargando opciones de plan...</p>';
        else box.insertAdjacentHTML('beforeend', `<div id="${PLAN_SELECTOR_ID}"><p class="ph">Cargando opciones de plan...</p></div>`);

        try {
          const planes = await obtenerPlanesDisponiblesUI();
          if (currentRender !== renderSeq) return;
          renderPlanSelector(planInfo || window.planActual || {}, planes);
          mountCanalesCleanup();
        } catch (err) {
          console.error('ERROR PLAN PATCH:', err);
          if (currentRender !== renderSeq) return;
          renderPlanSelector(planInfo || window.planActual || {}, []);
          mountCanalesCleanup();
          setPlanMsg('No se pudieron cargar los planes disponibles.', 'error');
        }
      });

      return result;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountCanalesCleanup, { once: true });
  } else {
    mountCanalesCleanup();
  }

  window.APD_PLAN_PATCH_VERSION = PLAN_PATCH_VERSION;
})();

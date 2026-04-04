(function () {
  'use strict';

  const PLAN_PATCH_VERSION = '2026-04-04-plans-ui-5';
  const PLAN_SELECTOR_CARD_ID = 'panel-plan-selector-card';
  const PLAN_SELECTOR_BODY_ID = 'panel-plan-selector-body';
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

  function selectorCard() {
    return document.getElementById(PLAN_SELECTOR_CARD_ID);
  }

  function selectorBody() {
    return document.getElementById(PLAN_SELECTOR_BODY_ID);
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
    const observer = new MutationObserver(() => cleanupCanalesMercadoPago());
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

  function transitionPolicy(plan, planInfo) {
    const currentCode = planActualCode(planInfo);
    const targetCode = normalizePlanCodeSafe(plan?.code || plan?.display_code || '');

    if (targetCode === currentCode) {
      return {
        allowed: false,
        label: 'Plan actual',
        reason: ''
      };
    }

    if (!currentCode || currentCode === 'TRIAL_7D') {
      return {
        allowed: true,
        label: `Cambiar a ${String(plan?.display_name || plan?.nombre || plan?.code || 'este plan')}`,
        reason: ''
      };
    }

    if (targetCode === 'TRIAL_7D') {
      return {
        allowed: false,
        label: 'No volver a prueba',
        reason: 'La vuelta a prueba gratis queda bloqueada hasta cerrar la cancelación segura de cobros recurrentes.'
      };
    }

    return {
      allowed: false,
      label: 'Cambio manual por ahora',
      reason: 'Los cambios entre planes pagos quedan desactivados hasta definir bien prorrateos, bajas y renovaciones de Mercado Pago.'
    };
  }

  function planCardButtonHtml(plan, planInfo) {
    const policy = transitionPolicy(plan, planInfo);
    const current = isCurrentPlan(plan, planInfo);
    const buttonClass = current || !policy.allowed ? 'btn btn-secondary btn-full' : 'btn btn-primary btn-full';
    const extraAttr = policy.allowed ? `data-plan-checkout="${String(plan?.code || '').trim().toUpperCase()}"` : 'disabled';
    const reasonHtml = policy.reason
      ? `<div class="plan-note" style="margin-top:8px;opacity:.88;">${window.esc ? window.esc(policy.reason) : String(policy.reason)}</div>`
      : '';

    return `
      <button type="button" class="${buttonClass}" ${extraAttr}>${window.esc ? window.esc(policy.label) : policy.label}</button>
      ${reasonHtml}
    `;
  }

  function buildPlanFeatureList(plan) {
    const features = Array.isArray(plan?.features) ? plan.features : [];
    if (!features.length) return '';
    return `<ul style="margin:8px 0 0 18px;padding:0;font-size:13px;line-height:1.45;">${features.slice(0, 5).map(item => `<li>${window.esc ? window.esc(item) : String(item)}</li>`).join('')}</ul>`;
  }

  function ensureSelectorCard() {
    let card = selectorCard();
    if (card) return card;

    const panel = document.getElementById('panel-content');
    if (!panel) return null;

    panel.insertAdjacentHTML('beforeend', `
      <div id="${PLAN_SELECTOR_CARD_ID}" class="panel-card span-8">
        <div class="card-lbl-row">
          <span class="card-lbl">💳 Opciones de plan</span>
          <div class="mini-group">
            <button type="button" class="mini-btn" data-plan-refresh="1">Actualizar plan</button>
          </div>
        </div>
        <p class="prefs-hint">Acá comparás planes y, si corresponde, te abrimos Mercado Pago en una pestaña nueva.</p>
        <div class="soft-meta" style="margin:8px 0 12px 0;">Para evitar problemas de cobro, por ahora solo queda habilitada la activación inicial o el paso desde prueba gratis a un plan pago. Bajas, vuelta a prueba y cambios entre planes pagos quedan bloqueados hasta cerrar bien la lógica de suscripción.</div>
        <div id="${PLAN_SELECTOR_BODY_ID}"><p class="ph">Cargando opciones de plan...</p></div>
      </div>
    `);

    card = selectorCard();
    if (typeof window.APD_refreshPanelTabs === 'function') {
      setTimeout(() => window.APD_refreshPanelTabs(), 0);
    }
    return card;
  }

  function buildPlanCards(planInfo, planes) {
    if (!Array.isArray(planes) || !planes.length) {
      return '<p class="ph">No pudimos cargar los planes disponibles.</p>';
    }

    return `${planes.map(plan => {
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
    }).join('')}`;
  }

  function renderSelectorCard(planInfo, planes) {
    ensureSelectorCard();
    const body = selectorBody();
    if (!body) return;
    body.innerHTML = buildPlanCards(planInfo, planes);
    if (typeof window.APD_refreshPanelTabs === 'function') {
      setTimeout(() => window.APD_refreshPanelTabs(), 0);
    }
  }

  function renderCompactActions() {
    const box = planBox();
    if (!box) return;

    document.getElementById('plan-summary-actions')?.remove();
    box.insertAdjacentHTML('beforeend', `
      <div id="plan-summary-actions" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,52,96,.12);">
        <div class="plan-pill-row">
          <span class="plan-pill">Gestión de plan</span>
          <span class="plan-pill plan-pill-neutral">Separada del resumen</span>
        </div>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" data-plan-open-tab="1">Ver opciones de plan</button>
          <button type="button" class="btn btn-secondary" data-plan-refresh="1">Actualizar plan</button>
        </div>
      </div>
    `);

    document.getElementById(PLAN_MSG_ID)?.remove();
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

  function openPlanTab() {
    if (typeof window.APD_activatePanelTab === 'function') {
      window.APD_activatePanelTab('plan');
    }
    setTimeout(() => {
      const target = selectorCard() || planBox();
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  document.addEventListener('click', async ev => {
    const openTabBtn = ev.target.closest('[data-plan-open-tab]');
    if (openTabBtn) {
      ev.preventDefault();
      openPlanTab();
      return;
    }

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

        renderCompactActions();
        const body = selectorBody();
        if (body) body.innerHTML = '<p class="ph">Cargando opciones de plan...</p>';
        else ensureSelectorCard();

        try {
          const planes = await obtenerPlanesDisponiblesUI();
          if (currentRender !== renderSeq) return;
          renderSelectorCard(planInfo || window.planActual || {}, planes);
          mountCanalesCleanup();
        } catch (err) {
          console.error('ERROR PLAN PATCH:', err);
          if (currentRender !== renderSeq) return;
          renderSelectorCard(planInfo || window.planActual || {}, []);
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

(function () {
  'use strict';

  if (window.__apdPlanAutoRenewPatchLoaded) return;
  window.__apdPlanAutoRenewPatchLoaded = true;

  const BOX_ID = 'plan-autorenew-box';

  function byId(id) { return document.getElementById(id); }
  function planBox() { return byId('panel-plan'); }
  function esc(v) { return typeof window.esc === 'function' ? window.esc(v) : String(v || ''); }

  function ensureBox() {
    const box = planBox();
    if (!box) return null;
    let node = byId(BOX_ID);
    if (!node) {
      box.insertAdjacentHTML('beforeend', `<div id="${BOX_ID}" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,52,96,.12);"></div>`);
      node = byId(BOX_ID);
    }
    return node;
  }

  function renderAutoRenew(planInfo) {
    const node = ensureBox();
    if (!node) return;

    const sub = planInfo?.subscription || {};
    const actions = planInfo?.actions || {};
    const currentPlanCode = String(sub.plan_code || planInfo?.plan?.code || '').trim().toUpperCase();
    const paidCurrent = currentPlanCode && currentPlanCode !== 'TRIAL_7D';
    const recurringEnabled = !!sub.recurring_enabled;
    const billingNote = String(planInfo?.billing_note || '').trim();
    const nextPayment = String(sub.next_payment_date || '').trim();

    let controls = '';
    if (!paidCurrent) {
      controls = '<div class="soft-meta">La renovación automática se configura cuando tengas un plan pago activo.</div>';
    } else if (actions.can_enable_auto_renew) {
      controls = `
        <div class="plan-pill-row">
          <span class="plan-pill">Renovación automática</span>
          <span class="plan-pill plan-pill-neutral">Apagada por defecto</span>
        </div>
        <p class="plan-note" style="margin-top:8px;">Si activás esta opción, Mercado Pago intentará cobrar el próximo ciclo automáticamente. Si no la activás, al vencer este ciclo el acceso se corta y no se cobra nada solo.</p>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" data-enable-auto-renew="1">Activar débito automático mensual</button>
        </div>
      `;
    } else if (actions.can_disable_auto_renew || recurringEnabled) {
      controls = `
        <div class="plan-pill-row">
          <span class="plan-pill">Renovación automática</span>
          <span class="plan-pill">${esc(sub.auto_renew_status || 'activa')}</span>
        </div>
        <p class="plan-note" style="margin-top:8px;">${nextPayment ? `Próximo intento de cobro: ${esc(nextPayment)}.` : 'Mercado Pago intentará cobrar el próximo ciclo automáticamente si la suscripción sigue activa.'}</p>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" data-disable-auto-renew="1">Desactivar renovación automática</button>
        </div>
      `;
    }

    node.innerHTML = `
      <div class="plan-pill-row">
        <span class="plan-pill">Ciclo actual</span>
        <span class="plan-pill plan-pill-neutral">${recurringEnabled ? 'Con opt-in de renovación' : 'Manual por defecto'}</span>
      </div>
      ${billingNote ? `<p class="plan-note" style="margin-top:8px;">${esc(billingNote)}</p>` : ''}
      ${controls}
      <div id="plan-autorenew-msg" class="msg" style="margin-top:10px"></div>
    `;
  }

  function setMsg(text, type) {
    const node = byId('plan-autorenew-msg');
    if (!node) return;
    node.textContent = String(text || '');
    node.className = `msg msg-${type || 'info'}`;
  }

  async function callAutoRenew(path, button) {
    const userId = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
    if (!userId) {
      setMsg('Tu sesión venció. Volvé a ingresar.', 'error');
      return;
    }

    if (button && typeof window.btnLoad === 'function') window.btnLoad(button, 'Procesando...');
    else if (button) button.disabled = true;

    try {
      const data = await window.workerFetchJson(path, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });

      if (data?.checkout_url) {
        const opened = window.open(data.checkout_url, '_blank', 'noopener');
        setMsg(data.message || (opened ? 'Mercado Pago se abrió en una pestaña nueva.' : 'Abrí Mercado Pago para completar la configuración.'), 'ok');
      } else {
        setMsg(data?.message || 'Operación realizada.', data?.ok ? 'ok' : 'info');
      }

      if (typeof window.obtenerMiPlan === 'function' && typeof window.renderPlanUI === 'function') {
        const planInfo = await window.obtenerMiPlan(userId);
        if (planInfo?.plan || planInfo?.subscription) window.planActual = planInfo;
        await window.renderPlanUI(window.planActual || planInfo);
      }
    } catch (err) {
      setMsg(err?.message || 'No se pudo completar la operación.', 'error');
    } finally {
      if (button && typeof window.btnRestore === 'function') window.btnRestore(button);
      else if (button) button.disabled = false;
    }
  }

  document.addEventListener('click', async ev => {
    const enableBtn = ev.target.closest('[data-enable-auto-renew]');
    if (enableBtn) {
      ev.preventDefault();
      await callAutoRenew('/api/subscription/enable-auto-renew', enableBtn);
      return;
    }

    const disableBtn = ev.target.closest('[data-disable-auto-renew]');
    if (disableBtn) {
      ev.preventDefault();
      await callAutoRenew('/api/subscription/cancel', disableBtn);
    }
  });

  const originalRenderPlanUI = window.renderPlanUI;
  if (typeof originalRenderPlanUI === 'function') {
    window.renderPlanUI = function patchedRenderPlanUIAutoRenew(planInfo) {
      const result = originalRenderPlanUI.apply(this, arguments);
      Promise.resolve().then(() => renderAutoRenew(planInfo || window.planActual || {}));
      return result;
    };
  }

  if (document.readyState !== 'loading') {
    setTimeout(() => renderAutoRenew(window.planActual || {}), 300);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => renderAutoRenew(window.planActual || {}), 300), { once: true });
  }
})();

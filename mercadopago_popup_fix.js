(function () {
  'use strict';

  const PATCH_VERSION = '2026-05-05-mp-popup-fix-1';
  const API_URL = window.API_URL || 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  const TOKEN_KEY = 'apd_token_v2';

  function setMsg(id, text, type = 'info') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type}`;
  }

  function showPlanMessage(text, type = 'info') {
    setMsg('plan-checkout-msg', text, type);
    setMsg('plan-selector-msg', text, type);
  }

  function getUserId() {
    if (typeof window.obtenerToken === 'function') {
      const token = String(window.obtenerToken() || '').trim();
      if (token) return token;
    }
    return String(localStorage.getItem(TOKEN_KEY) || '').trim();
  }

  async function createCheckout(userId, planCode) {
    if (typeof window.workerFetchJson === 'function') {
      return await window.workerFetchJson('/api/mercadopago/create-checkout-link', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, plan_code: planCode })
      });
    }

    const res = await fetch(`${API_URL}/api/mercadopago/create-checkout-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, plan_code: planCode })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || data?.error || `Worker ${res.status}`);
    }
    return data;
  }

  async function handleCheckoutClick(ev, button) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    const planCode = String(button?.dataset?.planCheckout || '').trim().toUpperCase();
    const userId = getUserId();

    if (!userId) {
      showPlanMessage('Tu sesión venció. Volvé a ingresar para cambiar de plan.', 'error');
      return;
    }

    if (!planCode) {
      showPlanMessage('No se pudo detectar el plan elegido.', 'error');
      return;
    }

    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.document.write('<!doctype html><title>Mercado Pago</title><p style="font-family:Arial;padding:24px">Preparando Mercado Pago...</p>');
      popup.document.close();
    }

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Abriendo Mercado Pago...';
    showPlanMessage('Preparando checkout de Mercado Pago...', 'info');

    try {
      const data = await createCheckout(userId, planCode);

      if (data?.scheduled) {
        if (popup) popup.close();
        showPlanMessage(data?.message || 'El cambio quedó programado para el próximo ciclo.', 'ok');
        return;
      }

      const checkoutUrl = String(data?.checkout_url || '').trim();
      if (!checkoutUrl) {
        if (popup) popup.close();
        showPlanMessage(data?.message || 'Mercado Pago no devolvió un link de pago.', data?.configured === false ? 'info' : 'error');
        return;
      }

      if (popup) {
        popup.location.href = checkoutUrl;
        showPlanMessage(data?.message || 'Mercado Pago se abrió en una pestaña nueva.', 'ok');
        return;
      }

      showPlanMessage('El navegador bloqueó la pestaña nueva. Abrí Mercado Pago desde este enlace.', 'info');
      const msg1 = document.getElementById('plan-checkout-msg');
      const msg2 = document.getElementById('plan-selector-msg');
      const linkHtml = `El navegador bloqueó la pestaña nueva. <a href="${checkoutUrl}" target="_blank" rel="noopener noreferrer">Abrir Mercado Pago</a>`;
      [msg1, msg2].forEach((el) => {
        if (!el) return;
        el.innerHTML = linkHtml;
        el.className = 'msg msg-info';
      });
    } catch (err) {
      if (popup) popup.close();
      showPlanMessage(err?.message || 'No se pudo abrir Mercado Pago.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  document.addEventListener('click', function (ev) {
    const button = ev.target.closest('[data-plan-checkout]');
    if (!button) return;
    handleCheckoutClick(ev, button);
  }, true);

  window.APD_MP_POPUP_FIX_VERSION = PATCH_VERSION;
})();

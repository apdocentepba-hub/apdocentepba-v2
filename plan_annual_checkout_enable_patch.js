(function () {
  'use strict';

  if (window.__apdAnnualCheckoutEnablePatchLoaded) return;
  window.__apdAnnualCheckoutEnablePatchLoaded = true;

  const PLAN_MSG_ID = 'plan-checkout-msg';
  const PLAN_SELECTOR_MSG_ID = 'plan-selector-msg';

  function isAnnualPlan(code) {
    return String(code || '').trim().toUpperCase().endsWith('_ANUAL');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureMsgNode(id, fallbackParentId) {
    let node = byId(id);
    if (node) return node;
    const parent = byId(fallbackParentId);
    if (!parent) return null;
    parent.insertAdjacentHTML('beforeend', `<div id="${id}" class="msg"></div>`);
    return byId(id);
  }

  function setMsg(text, type) {
    const nodes = [
      ensureMsgNode(PLAN_MSG_ID, 'panel-plan'),
      byId(PLAN_SELECTOR_MSG_ID)
    ].filter(Boolean);

    nodes.forEach(node => {
      node.textContent = String(text || '');
      node.className = `msg msg-${type || 'info'}`;
    });
  }

  function setMsgHtml(html, type) {
    const nodes = [
      ensureMsgNode(PLAN_MSG_ID, 'panel-plan'),
      byId(PLAN_SELECTOR_MSG_ID)
    ].filter(Boolean);

    nodes.forEach(node => {
      node.innerHTML = String(html || '');
      node.className = `msg msg-${type || 'info'}`;
    });
  }

  function buttonLoad(button, text) {
    if (!button) return;
    if (typeof window.btnLoad === 'function') {
      window.btnLoad(button, text || 'Abriendo...');
      return;
    }
    button.dataset.apdOriginalText = button.textContent || '';
    button.textContent = text || 'Abriendo...';
    button.disabled = true;
  }

  function buttonRestore(button) {
    if (!button) return;
    if (typeof window.btnRestore === 'function') {
      window.btnRestore(button);
      return;
    }
    if (button.dataset.apdOriginalText) button.textContent = button.dataset.apdOriginalText;
    delete button.dataset.apdOriginalText;
    button.disabled = false;
  }

  async function iniciarCheckoutAnual(planCode, button) {
    const userId = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
    if (!userId) {
      setMsg('Tu sesión venció. Volvé a ingresar para contratar el plan anual.', 'error');
      return;
    }

    const ok = window.confirm(
      'Antes de abrir Mercado Pago:\n\n' +
      'El plan anual es pago único por 365 días. No activa débito mensual automático.\n\n' +
      'Si tenés un mensual activo, se descuenta el proporcional no usado del ciclo vigente.\n\n' +
      'No se realizan reembolsos en dinero una vez acreditado el pago.\n\n' +
      '¿Querés continuar?'
    );

    if (!ok) return;

    setMsg('Preparando checkout anual...', 'info');
    buttonLoad(button, 'Abriendo...');

    try {
      if (typeof window.workerFetchJson !== 'function') {
        throw new Error('No está disponible workerFetchJson en el panel.');
      }

      const data = await window.workerFetchJson('/api/mercadopago/create-checkout-link', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          plan_code: String(planCode || '').trim().toUpperCase(),
          confirm_annual_checkout: true
        })
      });

      if (!data?.checkout_url) {
        const msg = data?.message || 'No se pudo generar el checkout anual de Mercado Pago.';
        setMsg(msg, data?.configured === false ? 'info' : 'error');
        return;
      }

      const opened = window.open(data.checkout_url, '_blank', 'noopener');
      const msg = data?.message || 'Mercado Pago se abrió en una pestaña nueva.';

      if (opened) {
        setMsg(msg, 'ok');
        return;
      }

      setMsgHtml(`${esc(msg)}<br><a href="${esc(data.checkout_url)}" target="_blank" rel="noopener noreferrer">Abrir Mercado Pago</a>`, 'info');
    } catch (err) {
      console.error('ERROR CHECKOUT ANUAL:', err);
      setMsg(err?.message || 'No se pudo iniciar el checkout anual.', 'error');
    } finally {
      buttonRestore(button);
    }
  }

  document.addEventListener('click', ev => {
    const button = ev.target.closest('[data-plan-checkout]');
    if (!button) return;

    const planCode = String(button.dataset.planCheckout || '').trim().toUpperCase();
    if (!isAnnualPlan(planCode)) return;

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    iniciarCheckoutAnual(planCode, button);
  }, true);
})();

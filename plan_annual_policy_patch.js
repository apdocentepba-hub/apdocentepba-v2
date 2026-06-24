(function () {
  'use strict';

  if (window.__apdAnnualPolicyPatchLoaded) return;
  window.__apdAnnualPolicyPatchLoaded = true;

  const POLICY_TEXT = 'Pago único anual. Si ya tenés un plan mensual activo, se descuenta el proporcional no usado del ciclo mensual vigente. No se realizan reembolsos en dinero una vez acreditado el pago.';

  function esc(value) {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isAnnualCode(code) {
    return String(code || '').trim().toUpperCase().endsWith('_ANUAL');
  }

  function decorateAnnualCards(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-plan-checkout]').forEach(button => {
      if (!isAnnualCode(button.dataset.planCheckout)) return;
      const card = button.closest('div[style*="border"], .soft-card, .panel-card') || button.parentElement;
      if (!card || card.querySelector('[data-annual-policy-note="1"]')) return;
      button.insertAdjacentHTML(
        'afterend',
        `<div class="plan-note" data-annual-policy-note="1" style="margin-top:8px;opacity:.9;line-height:1.45;">${esc(POLICY_TEXT)}</div>`
      );
    });
  }

  document.addEventListener('click', ev => {
    const button = ev.target.closest('[data-plan-checkout]');
    if (!button || !isAnnualCode(button.dataset.planCheckout)) return;
    if (button.dataset.apdAnnualPolicyOk === '1') return;

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    const ok = window.confirm(
      'Antes de abrir Mercado Pago:\n\n' +
      POLICY_TEXT + '\n\n' +
      'El plan anual dura 365 días desde la acreditación del pago y no activa débito mensual automático.\n\n' +
      '¿Querés continuar?'
    );

    if (!ok) return;
    button.dataset.apdAnnualPolicyOk = '1';
    button.click();
    setTimeout(() => { delete button.dataset.apdAnnualPolicyOk; }, 0);
  }, true);

  function boot() {
    decorateAnnualCards(document);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node && node.nodeType === 1) decorateAnnualCards(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

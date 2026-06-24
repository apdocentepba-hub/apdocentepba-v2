(function () {
  'use strict';

  if (window.__apdAnnualVisualPatchLoaded) return;
  window.__apdAnnualVisualPatchLoaded = true;

  function isAnnualPlan(code) {
    return String(code || '').trim().toUpperCase().endsWith('_ANUAL');
  }

  function annualPlanLabel(code) {
    const c = String(code || '').trim().toUpperCase();
    if (c === 'PLUS_ANUAL') return 'Plan Plus Anual';
    if (c === 'PREMIUM_ANUAL' || c === 'PRO_ANUAL') return 'Plan Pro Anual';
    if (c === 'INSIGNE_ANUAL') return 'Plan Insigne Anual';
    return 'Plan Anual';
  }

  function normalizeAnnualButtons() {
    document.querySelectorAll('[data-plan-checkout]').forEach(btn => {
      const code = String(btn.dataset.planCheckout || '').trim().toUpperCase();
      if (!isAnnualPlan(code)) return;

      const label = annualPlanLabel(code);
      const txt = String(btn.textContent || '').trim();

      if (/Pagar diferencia y pasar/i.test(txt) || /Activar/i.test(txt) || /Subir a/i.test(txt)) {
        btn.textContent = `Pasar a ${label} con descuento proporcional`;
      }

      if (btn.dataset.apdAnnualVisualReady !== '1') {
        btn.dataset.apdAnnualVisualReady = '1';
      }

      const parent = btn.parentElement;
      if (parent && !parent.querySelector('[data-apd-anual-aviso="1"]')) {
        btn.insertAdjacentHTML(
          'afterend',
          '<div data-apd-anual-aviso="1" class="plan-note" style="margin-top:8px;opacity:.9;line-height:1.45;">Pago único anual. Si tenés mensual activo, se descuenta el proporcional no usado. No se realizan reembolsos en dinero.</div>'
        );
      }
    });
  }

  function boot() {
    normalizeAnnualButtons();

    const observer = new MutationObserver(() => normalizeAnnualButtons());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    setTimeout(normalizeAnnualButtons, 300);
    setTimeout(normalizeAnnualButtons, 1000);
    setTimeout(normalizeAnnualButtons, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

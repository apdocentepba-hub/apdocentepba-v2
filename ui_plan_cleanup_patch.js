(function () {
  'use strict';

  if (window.__apdUiPlanCleanupLoaded) return;
  window.__apdUiPlanCleanupLoaded = true;

  const WORDS = [
    'débito automático',
    'debito automatico',
    'renovación automática',
    'renovacion automatica',
    'próxima renovación',
    'proxima renovacion',
    'cobro automático',
    'cobro automatico',
    'precio vigente del plan',
    'manual por defecto',
    'apagada por defecto',
    'configuración pendiente',
    'configuracion pendiente'
  ];

  function hasBlockedText(text) {
    const value = String(text || '').trim().toLowerCase();
    return !!value && WORDS.some((word) => value.includes(word));
  }

  function clearNode(node) {
    if (!node) return;
    const text = String(node.textContent || '').trim();
    if (!hasBlockedText(text)) return;

    if (node.id === 'plan-checkout-msg' || node.id === 'plan-selector-msg') {
      node.textContent = '';
      node.innerHTML = '';
      node.className = 'msg';
      return;
    }

    node.remove();
  }

  function clearRoot(root) {
    if (!root) return;
    [...root.querySelectorAll('button, .msg, .plan-note, .soft-meta, span, div, p')].forEach((node) => {
      if (node.hasAttribute('data-plan-refresh')) return;
      if (node.hasAttribute('data-plan-open-tab')) return;
      clearNode(node);
    });
  }

  function runCleanup() {
    clearRoot(document.getElementById('panel-plan'));
    clearRoot(document.getElementById('panel-plan-selector-card'));
    clearNode(document.getElementById('plan-checkout-msg'));
    clearNode(document.getElementById('plan-selector-msg'));
  }

  function watch(node) {
    if (!node || node.dataset.apdUiPlanCleanupObserved === '1') return;
    const observer = new MutationObserver(runCleanup);
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    node.dataset.apdUiPlanCleanupObserved = '1';
  }

  function boot() {
    runCleanup();
    watch(document.body);
    watch(document.getElementById('panel-content'));
    watch(document.getElementById('panel-plan'));
    watch(document.getElementById('panel-plan-selector-card'));
    setInterval(runCleanup, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

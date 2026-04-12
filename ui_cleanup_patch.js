(function () {
  'use strict';

  if (window.__apdUiCleanupPatchLoaded) return;
  window.__apdUiCleanupPatchLoaded = true;

  function keepNotificationPreferencesVisible() {
    const ids = ['pref-alertas-email', 'pref-alertas-telegram', 'pref-alertas-whatsapp'];
    ids.forEach((id) => {
      const input = document.getElementById(id);
      const card = input?.closest('label');
      if (card) card.style.display = '';
    });
  }

  function polishHeroText() {
    document.querySelectorAll('.hero-features .hfeat').forEach(item => {
      const textNode = item.querySelector('span:last-child');
      if (!textNode) return;
      const text = String(textNode.textContent || '').trim();
      if (/radar provincial/i.test(text)) {
        textNode.textContent = 'Mercado APD';
      }
    });
  }

  function preferAlertasTab() {
    if (!localStorage.getItem('apd_panel_tab_v1')) {
      localStorage.setItem('apd_panel_tab_v1', 'alertas');
    }
  }

  function applyCleanup() {
    keepNotificationPreferencesVisible();
    polishHeroText();
    preferAlertasTab();
  }

  const observer = new MutationObserver(() => applyCleanup());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyCleanup();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    applyCleanup();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

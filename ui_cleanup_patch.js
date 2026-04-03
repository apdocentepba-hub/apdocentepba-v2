(function () {
  'use strict';

  if (window.__apdUiCleanupPatchLoaded) return;
  window.__apdUiCleanupPatchLoaded = true;

  function hideWhatsappPreference() {
    const input = document.getElementById('pref-alertas-whatsapp');
    const card = input?.closest('label.chk-card.chk-notif');
    if (card) card.style.display = 'none';
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
    hideWhatsappPreference();
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

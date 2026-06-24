(function () {
  'use strict';

  if (window.__apdChannelPersistenceHotfixLoaded) return;
  window.__apdChannelPersistenceHotfixLoaded = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function ensureScript(src, markerId) {
    if (markerId && byId(markerId)) return;
    if ([...document.scripts].some(s => s.src && s.src.includes(src))) return;
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    if (markerId) s.id = markerId;
    document.body.appendChild(s);
  }

  function loadAnnualVisualPatch() {
  ensureScript('plan_annual_visual_patch.js?v=1', 'apd-plan-annual-visual-loader');
  ensureScript('plan_annual_checkout_enable_patch.js?v=1', 'apd-plan-annual-checkout-enable-loader');
  ensureScript('plan_autorenew_patch.js?v=1', 'apd-plan-autorenew-loader');
}

  function patchAdaptarPreferencias() {
    if (typeof window.adaptarPreferencias !== 'function' || window.adaptarPreferencias.__apdChannelPersistenceHotfix) return;

    const orig = window.adaptarPreferencias;
    window.adaptarPreferencias = function (prefRaw) {
      const out = orig.apply(this, arguments) || {};
      if (prefRaw && typeof prefRaw === 'object') {
        out.alertas_telegram = !!prefRaw.alertas_telegram;
        out.alertas_whatsapp = !!prefRaw.alertas_whatsapp;
      } else {
        if (typeof out.alertas_telegram !== 'boolean') out.alertas_telegram = false;
        if (typeof out.alertas_whatsapp !== 'boolean') out.alertas_whatsapp = false;
      }
      return out;
    };

    window.adaptarPreferencias.__apdChannelPersistenceHotfix = true;
  }

  function patchBuildPreferenciasPayload() {
    if (typeof window.buildPreferenciasPayload !== 'function' || window.buildPreferenciasPayload.__apdChannelPersistenceHotfix) return;

    const orig = window.buildPreferenciasPayload;
    window.buildPreferenciasPayload = function () {
      const out = orig.apply(this, arguments) || {};
      out.alertas_telegram = !!byId('pref-alertas-telegram')?.checked;
      out.alertas_whatsapp = !!byId('pref-alertas-whatsapp')?.checked;
      return out;
    };

    window.buildPreferenciasPayload.__apdChannelPersistenceHotfix = true;
  }

  function patchCargarPrefsEnFormulario() {
    if (typeof window.cargarPrefsEnFormulario !== 'function' || window.cargarPrefsEnFormulario.__apdChannelPersistenceHotfix) return;

    const orig = window.cargarPrefsEnFormulario;
    window.cargarPrefsEnFormulario = function (data) {
      const out = orig.apply(this, arguments);
      const pref = data?.preferencias || {};

      const tg = byId('pref-alertas-telegram');
      const wa = byId('pref-alertas-whatsapp');

      if (tg) tg.checked = !!pref.alertas_telegram;
      if (wa) wa.checked = !!pref.alertas_whatsapp;

      return out;
    };

    window.cargarPrefsEnFormulario.__apdChannelPersistenceHotfix = true;
  }

  function boot() {
    loadAnnualVisualPatch();

    let tries = 0;
    const tick = () => {
      tries += 1;
      patchAdaptarPreferencias();
      patchBuildPreferenciasPayload();
      patchCargarPrefsEnFormulario();
      if (tries < 20 && (typeof window.adaptarPreferencias !== 'function' || typeof window.cargarPrefsEnFormulario !== 'function')) {
        setTimeout(tick, 500);
      }
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
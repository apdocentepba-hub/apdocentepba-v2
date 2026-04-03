(function () {
  'use strict';

  if (window.__apdMarketFreezeHotfixLoaded) return;
  window.__apdMarketFreezeHotfixLoaded = true;

  const proto = Element.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
  if (!desc || typeof desc.get !== 'function' || typeof desc.set !== 'function') return;

  Object.defineProperty(proto, 'innerHTML', {
    configurable: true,
    enumerable: desc.enumerable,
    get: function () {
      return desc.get.call(this);
    },
    set: function (value) {
      try {
        if (this && this.id === 'mercado-banner-rotator') {
          const next = String(value || '');
          const current = desc.get.call(this);
          if (current === next) return;
          if (this.dataset.apdFreezeLocked === '1') return;
          this.dataset.apdFreezeLocked = '1';
          return desc.set.call(this, next);
        }
      } catch {}
      return desc.set.call(this, value);
    }
  });
})();

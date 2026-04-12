(function () {
  'use strict';
  if (window.__apdPidLookupPatchLoadedV3) return;
  window.__apdPidLookupPatchLoadedV3 = true;

  function removeLegacyPidCards() {
    document.querySelectorAll('#panel-pid-lookup-card,[data-apd-legacy-pid-lookup="1"]').forEach(function (el) {
      el.remove();
    });
  }

  function removeLegacyPidStyles() {
    const ids = ['pid-lookup-inline-style', 'pid-lookup-inline-style-v3'];
    ids.forEach(function (id) {
      const node = document.getElementById(id);
      if (node) node.remove();
    });
  }

  function boot() {
    removeLegacyPidCards();
    removeLegacyPidStyles();
  }

  const observer = new MutationObserver(function () {
    boot();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    boot();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

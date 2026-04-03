(function () {
  'use strict';

  if (window.__apdProfileAbcUiHotfixLoaded) return;
  window.__apdProfileAbcUiHotfixLoaded = true;

  const ABC_POPUP_NAME = 'apd_abc_import';
  const ABC_POPUP_FEATURES = 'popup=yes,width=1180,height=820,left=80,top=60,resizable=yes,scrollbars=yes';
  const ABC_IMPORT_TYPE = 'APD_ABC_LISTADOS';

  function esc(v) {
    return String(v || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function profileBody() {
    return document.getElementById('perfil-docente-body');
  }

  function profileMsg() {
    return document.getElementById('perfil-docente-msg');
  }

  function setProfileMsg(text, type) {
    const el = profileMsg();
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type || 'info'}`;
  }

  function currentSavedDni() {
    const input = document.getElementById('perfil-dni');
    return String(input?.value || '').replace(/\D/g, '');
  }

  function currentConsent() {
    return !!document.getElementById('perfil-consentimiento')?.checked;
  }

  function buildAbcPopupUrl() {
    const dni = currentSavedDni();
    const u = new URL('https://abc.gob.ar/listado-oficial');
    if (dni) u.searchParams.set('apd_dni', dni);
    return u.toString();
  }

  function openAbcPopupDirect() {
    const ref = window.open(buildAbcPopupUrl(), ABC_POPUP_NAME, ABC_POPUP_FEATURES);
    if (ref) ref.focus();
    return ref;
  }

  function enhanceProfileUi() {
    const box = profileBody();
    if (!box) return;
    if (box.dataset.abcHotfixDone === '1') return;

    const dniField = document.getElementById('perfil-dni')?.closest('.field');
    if (dniField) {
      dniField.style.display = 'none';
    }

    const saveBtn = document.getElementById('btn-save-dni');
    if (saveBtn) {
      saveBtn.style.display = 'none';
    }

    const openBtn = document.getElementById('btn-open-abc');
    if (openBtn) {
      openBtn.textContent = 'Abrir ABC y traer listados';
      openBtn.dataset.abcUiPatched = '1';
    }

    const bookmarkletBtn = document.getElementById('btn-bookmarklet-abc');
    if (bookmarkletBtn) {
      bookmarkletBtn.textContent = 'Guardar favorito “Traer a APDocentePBA”';
      bookmarkletBtn.title = 'Guardalo una sola vez en favoritos. Después entrás a ABC, tocás el favorito y vuelve solo a APDocentePBA.';
    }

    if (!document.getElementById('apd-abc-sync-note')) {
      const target = bookmarkletBtn?.parentElement || openBtn?.parentElement || box;
      target?.insertAdjacentHTML('afterend', `
        <div id="apd-abc-sync-note" style="margin-top:12px;padding:10px 12px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
          <div class="card-lbl" style="margin-bottom:6px;">🔁 Flujo recomendado para ABC</div>
          <div class="soft-meta">
            1. Guardá el favorito una sola vez.<br>
            2. Abrí ABC desde este botón.<br>
            3. Dentro de ABC tocá el favorito “Traer a APDocentePBA”.<br>
            4. La ventana se cierra sola, se refrescan tus listados y se recalcula compatibilidad.
          </div>
        </div>
      `);
    }

    box.dataset.abcHotfixDone = '1';
  }

  document.addEventListener('click', function captureAbcOpen(ev) {
    const btn = ev.target.closest('#btn-open-abc');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

    openAbcPopupDirect();
    setProfileMsg(
      currentSavedDni()
        ? 'ABC abierto. Ahora tocá tu favorito “Traer a APDocentePBA”.'
        : 'ABC abierto. Si el favorito te pide DNI, lo completás ahí mismo y después vuelve solo a APDocentePBA.',
      'ok'
    );
  }, true);

  window.addEventListener('message', function onAbcImportHotfix(event) {
    if (!event?.data || event.data.type !== ABC_IMPORT_TYPE) return;
    if (!String(event.origin || '').includes('abc.gob.ar')) return;

    if (event.data.status === 'progress') {
      setProfileMsg(event.data.message || 'Leyendo resultados en ABC...', 'info');
      return;
    }

    if (event.data.status === 'error') {
      setProfileMsg(event.data.message || 'No se pudo importar desde ABC.', 'error');
      return;
    }

    if (event.data.status === 'ok') {
      setProfileMsg('ABC devolvió datos. Actualizando tus listados y compatibilidad...', 'ok');
      if (typeof window.APD_activatePanelTab === 'function') {
        window.APD_activatePanelTab('perfil');
      }
      setTimeout(() => {
        document.getElementById('btn-recargar-panel')?.click();
      }, 900);
    }
  });

  function boot() {
    enhanceProfileUi();

    const observerTarget = profileBody();
    if (observerTarget && !observerTarget.dataset.abcUiObserved) {
      const obs = new MutationObserver(() => {
        enhanceProfileUi();
      });
      obs.observe(observerTarget, { childList: true, subtree: true });
      observerTarget.dataset.abcUiObserved = '1';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

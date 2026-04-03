(function () {
  'use strict';

  if (window.__apdProfileAbcUiHotfixLoaded) return;
  window.__apdProfileAbcUiHotfixLoaded = true;

  const WORKER_BASE = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  const ABC_IMPORT_TYPE = 'APD_ABC_LISTADOS';
  const ABC_POPUP_NAME = 'apd_abc_import';
  const ABC_POPUP_FEATURES = 'popup=yes,width=1180,height=820,left=80,top=60,resizable=yes,scrollbars=yes';
  const PROFILE_MSG_ID = 'perfil-docente-msg';

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

  function profileMsgEl() {
    return document.getElementById(PROFILE_MSG_ID);
  }

  function setProfileMsg(text, type = 'info') {
    const el = profileMsgEl();
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type}`;
  }

  function currentSavedDni() {
    return String(document.getElementById('perfil-dni')?.value || '').replace(/\D/g, '');
  }

  function currentConsent() {
    return !!document.getElementById('perfil-consentimiento')?.checked;
  }

  function token() {
    return localStorage.getItem('apd_token_v2') || '';
  }

  function buildAbcPopupUrl() {
    const dni = currentSavedDni();
    const u = new URL('https://abc.gob.ar/listado-oficial');
    if (dni) u.searchParams.set('apd_dni', dni);
    return u.toString();
  }

  function openAbcPopupNow() {
    const ref = window.open(buildAbcPopupUrl(), ABC_POPUP_NAME, ABC_POPUP_FEATURES);
    if (ref) ref.focus();
    return ref;
  }

  async function saveDniInBackground() {
    const dni = currentSavedDni();
    const consentimiento = currentConsent();
    if (!dni || !consentimiento) return false;

    const authToken = token();
    const headers = {
      'Content-Type': 'application/json'
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    const res = await fetch(`${WORKER_BASE}/api/profile/save-dni`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dni, consentimiento_datos: consentimiento })
    });

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text || `HTTP ${res.status}` };
    }

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    }

    return true;
  }

  function enhanceProfileUi() {
    const box = profileBody();
    if (!box) return;

    const saveBtn = document.getElementById('btn-save-dni');
    const openBtn = document.getElementById('btn-open-abc');
    const bookmarkletBtn = document.getElementById('btn-bookmarklet-abc');

    if (saveBtn) {
      saveBtn.textContent = 'Guardar DNI y abrir ABC';
      saveBtn.dataset.abcPrimary = '1';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-secondary');
    }

    if (openBtn) {
      openBtn.textContent = 'Abrir ABC otra vez';
      openBtn.title = 'Reabrí ABC si cerraste la pestaña o querés relanzar la lectura.';
    }

    if (bookmarkletBtn) {
      bookmarkletBtn.textContent = 'Guardar favorito “Traer a APDocentePBA”';
      bookmarkletBtn.title = 'Guardalo una sola vez. Después entrás a ABC, tocás el favorito y vuelve a APDocentePBA.';
    }

    if (!document.getElementById('apd-abc-sync-note')) {
      const target = bookmarkletBtn?.parentElement || openBtn?.parentElement || box;
      target?.insertAdjacentHTML('afterend', `
        <div id="apd-abc-sync-note" style="margin-top:12px;padding:10px 12px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
          <div class="card-lbl" style="margin-bottom:6px;">🔁 Flujo más corto desde ABC</div>
          <div class="soft-meta">
            1. Cargás tu DNI y tocás <strong>Guardar DNI y abrir ABC</strong>.<br>
            2. En ABC tocás el favorito <strong>Traer a APDocentePBA</strong>.<br>
            3. La ventana se cierra sola y APDocentePBA refresca tus listados.
          </div>
        </div>
      `);
    }
  }

  function validateBeforeOpen() {
    const dni = currentSavedDni();
    if (!dni) {
      setProfileMsg('Primero cargá tu DNI.', 'error');
      return false;
    }
    if (!currentConsent()) {
      setProfileMsg('Para importar desde ABC tenés que aceptar el consentimiento.', 'error');
      return false;
    }
    return true;
  }

  function launchAbcFlow(reason) {
    if (!validateBeforeOpen()) return;

    const popup = openAbcPopupNow();
    if (!popup) {
      setProfileMsg('El navegador bloqueó la ventana de ABC. Habilitá popups para este sitio.', 'error');
      return;
    }

    setProfileMsg('ABC abierto. Guardando DNI en segundo plano...', 'info');

    saveDniInBackground()
      .then(() => {
        setProfileMsg(
          reason === 'save'
            ? 'ABC abierto. Ahora tocá tu favorito “Traer a APDocentePBA”.'
            : 'ABC reabierto. Tocá tu favorito “Traer a APDocentePBA”.',
          'ok'
        );
      })
      .catch(err => {
        setProfileMsg(
          `ABC se abrió, pero no pude guardar el DNI automáticamente: ${err?.message || 'error'}`,
          'error'
        );
      });
  }

  document.addEventListener('click', function captureAbcButtons(ev) {
    const saveBtn = ev.target.closest('#btn-save-dni');
    if (saveBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      launchAbcFlow('save');
      return;
    }

    const openBtn = ev.target.closest('#btn-open-abc');
    if (openBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      launchAbcFlow('open');
    }
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
    const box = profileBody();
    if (box && !box.dataset.abcUiObserved) {
      const obs = new MutationObserver(() => {
        enhanceProfileUi();
      });
      obs.observe(box, { childList: true, subtree: true });
      box.dataset.abcUiObserved = '1';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

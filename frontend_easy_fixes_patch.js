(function () {
  'use strict';

  if (window.__apdFrontendEasyFixesLoaded) return;
  window.__apdFrontendEasyFixesLoaded = true;

  function injectStyles() {
    if (document.getElementById('apd-frontend-easy-fixes-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-frontend-easy-fixes-style';
    style.textContent = `
      #btn-recargar-panel { display: none !important; }
      .pw-wrap { position: relative; }
      .pw-toggle {
        z-index: 3;
        pointer-events: auto;
        touch-action: manipulation;
        user-select: none;
      }
      #form-mi-password .grid-2 {
        align-items: start;
      }
      #form-mi-password .field {
        margin-bottom: 0;
      }
      #form-mi-password .field label {
        min-height: 18px;
      }
    `;
    document.head.appendChild(style);
  }

  function isRegistroVisible() {
    const sec = document.getElementById('registro');
    return !!sec && !sec.classList.contains('hidden');
  }

  function getRegistroLegalCheckbox() {
    return document.getElementById('reg-acepta-legal');
  }

  function requireLegalAcceptanceForGoogle() {
    if (!isRegistroVisible()) return true;
    const chk = getRegistroLegalCheckbox();
    if (!chk || chk.checked) return true;

    const msg = document.getElementById('registro-msg');
    if (msg) {
      msg.textContent = 'Para continuar con Google tenés que aceptar los Términos, la Política de Privacidad y la Política de Suscripciones.';
      msg.className = 'msg msg-error';
    }

    chk.focus();
    return false;
  }

  function patchGoogleHandler() {
    if (typeof window.handleGoogleCredential !== 'function') return false;
    if (window.handleGoogleCredential.__apdLegalPatched) return true;

    const original = window.handleGoogleCredential;
    const wrapped = async function patchedHandleGoogleCredential(response) {
      if (!requireLegalAcceptanceForGoogle()) return;
      return original.call(this, response);
    };

    wrapped.__apdLegalPatched = true;
    window.handleGoogleCredential = wrapped;
    return true;
  }

  function patchAutocompleteNoneOption() {
    if (typeof window.renderACItems === 'function' && !window.renderACItems.__apdNonePatched) {
      const originalRender = window.renderACItems;
      window.renderACItems = function patchedRenderACItems(state, items) {
        const normalized = Array.isArray(items) ? items.slice() : [];
        const hasNone = normalized.some(item => String(item?.label || '').trim().toUpperCase() === 'NINGUNA');
        if (normalized.length && !hasNone) {
          normalized.unshift({ label: 'NINGUNA', __clear: true });
        }
        return originalRender.call(this, state, normalized);
      };
      window.renderACItems.__apdNonePatched = true;
    }

    if (typeof window.seleccionarAC === 'function' && !window.seleccionarAC.__apdNonePatched) {
      const originalSelect = window.seleccionarAC;
      window.seleccionarAC = function patchedSeleccionarAC(state, index) {
        const item = state?.items?.[index];
        if (item && item.__clear) {
          if (state?.input) state.input.value = '';
          if (typeof window.hideAC === 'function') {
            window.hideAC(state);
          } else if (state?.lista) {
            state.lista.innerHTML = '';
            state.lista.style.display = 'none';
          }
          return;
        }
        return originalSelect.call(this, state, index);
      };
      window.seleccionarAC.__apdNonePatched = true;
    }
  }

  function bindPasswordToggleDelegation() {
    if (document.body?.dataset.apdPwDelegationBound === '1') return;
    document.body.dataset.apdPwDelegationBound = '1';

    document.addEventListener('mousedown', function (ev) {
      const btn = ev.target.closest('.pw-toggle');
      if (!btn) return;
      ev.preventDefault();
    }, true);

    document.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.pw-toggle');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();

      const targetId = btn.dataset.target;
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;

      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? '🙈' : '👁';
      btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    }, true);
  }

  function neutralizeReloadButton() {
    const btn = document.getElementById('btn-recargar-panel');
    if (!btn) return;
    btn.setAttribute('aria-hidden', 'true');
    btn.tabIndex = -1;
  }

  function boot() {
    injectStyles();
    bindPasswordToggleDelegation();
    patchAutocompleteNoneOption();
    patchGoogleHandler();
    neutralizeReloadButton();
  }

  let attempts = 0;
  function loop() {
    attempts += 1;
    boot();
    if (attempts < 30 && typeof window.handleGoogleCredential !== 'function') {
      setTimeout(loop, 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loop, { once: true });
  } else {
    loop();
  }
})();

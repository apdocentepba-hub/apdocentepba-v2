(function () {
  'use strict';

  if (window.__apdFrontendEasyFixesLoaded) return;
  window.__apdFrontendEasyFixesLoaded = true;

  const GOOGLE_CLIENT_ID_FALLBACK = '650896364013-s3o36ckvoi42947v6ummmgdkdmsgondo.apps.googleusercontent.com';
  const DISTRICT_INPUT_IDS = [
    'pref-distrito-principal',
    'pref-segundo-distrito',
    'pref-tercer-distrito',
    'pref-cuarto-distrito',
    'pref-quinto-distrito'
  ];
  const DISTRICT_LIST_IDS = ['sug-distrito-1', 'sug-distrito-2', 'sug-distrito-3', 'sug-distrito-4', 'sug-distrito-5'];
  const CARGO_INPUT_IDS = [
    'pref-cargo-1','pref-cargo-2','pref-cargo-3','pref-cargo-4','pref-cargo-5',
    'pref-cargo-6','pref-cargo-7','pref-cargo-8','pref-cargo-9','pref-cargo-10'
  ];
  const CARGO_LIST_IDS = ['sug-cargo-1','sug-cargo-2','sug-cargo-3','sug-cargo-4','sug-cargo-5','sug-cargo-6','sug-cargo-7','sug-cargo-8','sug-cargo-9','sug-cargo-10'];
  const MAX_DROPDOWN_ITEMS = 80;

  const cache = {
    districts: null,
    cargos: null
  };

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function norm(value) {
    return String(value || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

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
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: start;
        gap: 14px;
      }
      #form-mi-password .grid-2 > .field {
        min-width: 0;
        margin-bottom: 0 !important;
      }
      #form-mi-password .field label {
        display: block;
        min-height: auto !important;
        height: auto !important;
        line-height: 1.25;
        margin-bottom: 6px;
      }
      #form-mi-password .pw-wrap input {
        width: 100%;
      }
      @media (max-width: 768px) {
        #form-mi-password .grid-2 {
          grid-template-columns: 1fr;
        }
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

  function blockGoogleByLegal() {
    if (!isRegistroVisible()) return false;
    const chk = getRegistroLegalCheckbox();
    if (!chk || chk.checked) return false;

    const msg = document.getElementById('registro-msg');
    if (msg) {
      msg.textContent = 'Para continuar con Google tenés que aceptar los Términos, la Política de Privacidad y la Política de Suscripciones.';
      msg.className = 'msg msg-error';
    }
    chk.focus();
    return true;
  }

  function patchGoogleCallback() {
    if (!window.google?.accounts?.id) return false;
    if (window.__apdGoogleLegalGuardPatched) return true;

    const callback = async function (response) {
      if (blockGoogleByLegal()) return;
      const handler = typeof window.handleGoogleCredential === 'function' ? window.handleGoogleCredential : null;
      if (handler) {
        return handler(response);
      }
    };

    try {
      window.google.accounts.id.initialize({
        client_id: window.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID_FALLBACK,
        callback
      });

      const loginBox = document.getElementById('google-btn-login');
      const regBox = document.getElementById('google-btn-registro');

      if (loginBox) {
        loginBox.innerHTML = '';
        window.google.accounts.id.renderButton(loginBox, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 320
        });
      }

      if (regBox) {
        regBox.innerHTML = '';
        window.google.accounts.id.renderButton(regBox, {
          theme: 'outline',
          size: 'large',
          text: 'signup_with',
          shape: 'pill',
          width: 320
        });
      }

      window.__apdGoogleLegalGuardPatched = true;
      return true;
    } catch (err) {
      console.error('GOOGLE LEGAL PATCH ERROR:', err);
      return false;
    }
  }

  function patchAutocompleteNoneOption() {
    if (typeof window.renderACItems === 'function' && !window.renderACItems.__apdNonePatched) {
      const originalRender = window.renderACItems;
      window.renderACItems = function patchedRenderACItems(state, items) {
        const normalized = Array.isArray(items) ? items.slice() : [];
        const hasNone = normalized.some(item => String(item?.label || '').trim().toUpperCase() === 'NINGUNA');
        if (!hasNone) {
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

  async function fetchSupabase(path) {
    const res = await fetch(`${window.APD_SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: window.APD_SUPABASE_KEY,
        Authorization: `Bearer ${window.APD_SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `Supabase ${res.status}`);
    return text ? JSON.parse(text) : [];
  }

  async function loadDistricts() {
    if (Array.isArray(cache.districts)) return cache.districts;
    const rows = await fetchSupabase('catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc');
    const seen = new Set();
    cache.districts = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      [row?.nombre, row?.apd_nombre].forEach((raw) => {
        const label = String(raw || '').trim().toUpperCase();
        const key = norm(label);
        if (!label || !key || seen.has(key)) return;
        seen.add(key);
        cache.districts.push(label);
      });
    });
    cache.districts.sort((a, b) => a.localeCompare(b, 'es'));
    return cache.districts;
  }

  async function loadCargos() {
    if (Array.isArray(cache.cargos)) return cache.cargos;
    const rows = await fetchSupabase('catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=1200');
    const seen = new Set();
    cache.cargos = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const codigo = String(row?.codigo || '').trim().toUpperCase();
      const nombre = String(row?.nombre || row?.apd_nombre || '').trim().toUpperCase();
      if (!nombre) return;
      const label = codigo ? `(${codigo}) ${nombre}` : nombre;
      const key = norm(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      cache.cargos.push(label);
    });
    cache.cargos.sort((a, b) => a.localeCompare(b, 'es'));
    return cache.cargos;
  }

  function filterItems(items, query) {
    const q = norm(query);
    const base = Array.isArray(items) ? items : [];
    if (!q) return base.slice(0, MAX_DROPDOWN_ITEMS);

    const starts = [];
    const contains = [];
    for (const label of base) {
      const hay = norm(label);
      if (!hay) continue;
      if (hay.startsWith(q)) {
        starts.push(label);
      } else if (hay.includes(q)) {
        contains.push(label);
      }
      if (starts.length + contains.length >= MAX_DROPDOWN_ITEMS) break;
    }
    return starts.concat(contains).slice(0, MAX_DROPDOWN_ITEMS);
  }

  function renderFastDropdown(input, list, labels) {
    if (!input || !list) return;
    const rows = ['<div class="ac-item" data-clear="1">NINGUNA</div>']
      .concat(labels.map((label) => `<div class="ac-item" data-label="${esc(label)}">${esc(label)}</div>`));
    list.innerHTML = rows.join('');
    list.style.display = 'block';

    list.querySelectorAll('.ac-item').forEach((item) => {
      item.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        if (item.dataset.clear === '1') {
          input.value = '';
        } else {
          input.value = item.dataset.label || item.textContent || '';
        }
        list.innerHTML = '';
        list.style.display = 'none';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  async function openFastDropdown(inputId, listId, type) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    try {
      const source = type === 'district' ? await loadDistricts() : await loadCargos();
      const labels = filterItems(source, input.value);
      renderFastDropdown(input, list, labels);
    } catch (err) {
      console.error('FAST DROPDOWN ERROR:', err);
    }
  }

  function bindFastDropdowns() {
    const pairs = [];
    DISTRICT_INPUT_IDS.forEach((id, i) => pairs.push([id, DISTRICT_LIST_IDS[i], 'district']));
    CARGO_INPUT_IDS.forEach((id, i) => pairs.push([id, CARGO_LIST_IDS[i], 'cargo']));

    pairs.forEach(([inputId, listId, type]) => {
      const input = document.getElementById(inputId);
      if (!input || input.dataset.apdFastDropdownBound === '1') return;
      input.dataset.apdFastDropdownBound = '1';

      input.addEventListener('focus', function () {
        setTimeout(() => openFastDropdown(inputId, listId, type), 0);
      });

      input.addEventListener('input', function () {
        setTimeout(() => openFastDropdown(inputId, listId, type), 0);
      });
    });
  }

  function boot() {
    injectStyles();
    bindPasswordToggleDelegation();
    patchAutocompleteNoneOption();
    patchGoogleCallback();
    neutralizeReloadButton();
    bindFastDropdowns();
  }

  let attempts = 0;
  function loop() {
    attempts += 1;
    boot();
    if (attempts < 40 && (!window.google?.accounts?.id || !document.getElementById('pref-cargo-1'))) {
      setTimeout(loop, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loop, { once: true });
  } else {
    loop();
  }
})();
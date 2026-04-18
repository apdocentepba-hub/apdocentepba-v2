(function () {
  'use strict';

  if (window.__apdCargoDelegateFixLoaded) return;
  window.__apdCargoDelegateFixLoaded = true;

  const originalBuscarSugerenciasState = window.buscarSugerenciasState;
  const originalSeleccionarAC = window.seleccionarAC;
  const originalCargarPrefsEnFormulario = window.cargarPrefsEnFormulario;

  function formatCargoValue(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';

    const pref = text.match(/^\(([^()]{1,20})\)\s+(.+)$/);
    if (pref) {
      const code = String(pref[1] || '').trim().toUpperCase();
      const name = String(pref[2] || '').trim().toUpperCase();
      return code && name ? `(${code}) ${name}` : text.toUpperCase();
    }

    const suff = text.match(/^(.*?)\s*\(([A-Z0-9./-]{1,20})\)\s*$/i);
    if (suff) {
      const name = String(suff[1] || '').trim().toUpperCase();
      const code = String(suff[2] || '').trim().toUpperCase();
      return code && name ? `(${code}) ${name}` : text.toUpperCase();
    }

    return text.toUpperCase();
  }

  if (typeof originalBuscarSugerenciasState === 'function') {
    window.buscarSugerenciasState = async function patchedBuscarSugerenciasState(state) {
      if (!state || state.tipo !== 'cargo_area') {
        return originalBuscarSugerenciasState(state);
      }

      const q = state.input.value.trim();
      if (!q) {
        hideAC(state);
        return;
      }

      const cacheKey = typeof normalizeCacheKey === 'function'
        ? normalizeCacheKey(state.tipo, q)
        : `${state.tipo}|${q}`;

      if (window.suggestionCache?.has(cacheKey)) {
        renderACItems(state, suggestionCache.get(cacheKey));
        return;
      }

      renderACStatus(state, 'Buscando...');
      const requestId = ++state.requestSeq;

      try {
        let items = [];

        if (typeof window.buscarSugerenciasCargosSupabase === 'function') {
          items = await window.buscarSugerenciasCargosSupabase(q);
        }

        if (!items.length) {
          const data = await fetchSugerenciasRemotas(state.tipo, q);
          items = data.ok && Array.isArray(data.items)
            ? data.items.map(item => ({ label: formatCargoValue(item?.label || item?.nombre || '') })).filter(it => it.label)
            : [];
        }

        if (requestId !== state.requestSeq) return;
        if (state.input.value.trim() !== q) return;

        suggestionCache.set(cacheKey, items);
        renderACItems(state, items);
      } catch (err) {
        console.error('ERROR CARGO DELEGATE FIX:', err);
        if (requestId !== state.requestSeq) return;
        renderACStatus(state, 'No se pudo cargar');
        setTimeout(() => {
          if (state.lista.textContent.includes('No se pudo')) hideAC(state);
        }, 900);
      }
    };
  }

  if (typeof originalSeleccionarAC === 'function') {
    window.seleccionarAC = function patchedSeleccionarAC(state, index) {
      if (state?.tipo === 'cargo_area') {
        const item = state.items[index];
        if (!item) return;
        state.input.value = formatCargoValue(item.label || '');
        hideAC(state);
        return;
      }
      return originalSeleccionarAC(state, index);
    };
  }

  if (typeof originalCargarPrefsEnFormulario === 'function') {
    window.cargarPrefsEnFormulario = function patchedCargarPrefsEnFormulario(data) {
      const result = originalCargarPrefsEnFormulario(data);
      if (Array.isArray(window.CARGO_INPUT_IDS)) {
        window.CARGO_INPUT_IDS.forEach(id => {
          const input = document.getElementById(id);
          if (!input) return;
          const next = formatCargoValue(input.value);
          if (next) input.value = next;
        });
      }
      return result;
    };
  }
})();

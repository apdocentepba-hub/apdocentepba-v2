(function () {
  'use strict';

  if (window.__apdCargoDelegateFixLoaded) return;
  window.__apdCargoDelegateFixLoaded = true;

  const originalBuscarSugerenciasState = window.buscarSugerenciasState;
  const originalSeleccionarAC = window.seleccionarAC;
  const originalCargarPrefsEnFormulario = window.cargarPrefsEnFormulario;

  let canonicalizeSeq = 0;

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

  function normalizeCargoItems(items) {
    return (Array.isArray(items) ? items : [])
      .map(item => ({
        ...item,
        label: formatCargoValue(item?.label || item?.nombre || item?.apd_nombre || '')
      }))
      .filter(item => item.label);
  }

  async function resolveCatalogLabel(rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return '';

    const formatted = formatCargoValue(text);
    if (/^\([^)]+\)\s+/.test(formatted)) {
      return formatted;
    }

    try {
      if (typeof window.buscarSugerenciasCargosSupabase !== 'function') {
        return formatted;
      }

      const suggestions = await window.buscarSugerenciasCargosSupabase(text);
      const first = Array.isArray(suggestions)
        ? suggestions.find(item => String(item?.label || '').trim())
        : null;

      return first ? formatCargoValue(first.label) : formatted;
    } catch (err) {
      console.error('ERROR RESOLVIENDO CARGO CATALOGADO:', err);
      return formatted;
    }
  }

  async function canonicalizeCargoInputs() {
    if (!Array.isArray(CARGO_INPUT_IDS)) return;

    const seq = ++canonicalizeSeq;

    for (const id of CARGO_INPUT_IDS) {
      const input = document.getElementById(id);
      if (!input) continue;

      const current = String(input.value || '').trim();
      if (!current) continue;

      const next = await resolveCatalogLabel(current);
      if (seq !== canonicalizeSeq) return;

      if (next) {
        input.value = next;
      }
    }
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

      const cacheKey = normalizeCacheKey(state.tipo, q);

      if (suggestionCache.has(cacheKey)) {
        renderACItems(state, normalizeCargoItems(suggestionCache.get(cacheKey)));
        return;
      }

      renderACStatus(state, 'Buscando...');
      const requestId = ++state.requestSeq;

      try {
        let items = [];

        if (typeof window.buscarSugerenciasCargosSupabase === 'function') {
          items = await window.buscarSugerenciasCargosSupabase(q);
        }

        items = normalizeCargoItems(items);

        if (!items.length) {
          const data = await fetchSugerenciasRemotas(state.tipo, q);
          items = data.ok && Array.isArray(data.items)
            ? normalizeCargoItems(data.items)
            : [];
        }

        if (requestId !== state.requestSeq) return;
        if (state.input.value.trim() !== q) return;

        suggestionCache.set(cacheKey, items);
        renderACItems(state, items);
      } catch (err) {
        console.error('ERROR CARGO DELEGATE FIX:', err);
        if (requestId !== state.requestSeq) return;
        renderACItems(state, []);
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

      setTimeout(() => {
        canonicalizeCargoInputs().catch(err => {
          console.error('ERROR CANONICALIZANDO CARGOS GUARDADOS:', err);
        });
      }, 0);

      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      canonicalizeCargoInputs().catch(err => {
        console.error('ERROR CANONICALIZANDO CARGOS INICIALES:', err);
      });
    }, 0);
  });

  window.formatCargoValue = formatCargoValue;
})();

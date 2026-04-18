(function () {
  'use strict';

  if (window.__apdAutocompleteFastPatchLoaded) return;
  window.__apdAutocompleteFastPatchLoaded = true;

  const CARGO_ALIAS_MAP = {
    CCD: 'CONSTRUCCION DE LA CIUDADANIA',
    NTICX: 'NUEVAS TECNOLOGIAS DE LA INFORMACION Y LA CONECTIVIDAD',
    ACO: 'ENCARGADO MEDIOS APOYO TEC-PED.CONSTRUCCIONES',
    EMATP: 'ENCARGADO MEDIOS APOYO TEC-PED.INF/COMP/E INF.APL.'
  };

  function normalizeCode(raw) {
    return String(raw || '')
      .toUpperCase()
      .replace(/[()]/g, '')
      .replace(/[\/\s]+/g, '')
      .trim();
  }

  function splitCargoCode(raw) {
    const text = String(raw || '').trim();
    if (!text) return { raw: '', name: '', code: '' };

    const suffixMatch = text.match(/^(.*?)(?:\s*\(([^()]{1,16})\))\s*$/);
    if (suffixMatch) {
      const name = String(suffixMatch[1] || '').trim();
      const code = normalizeCode(suffixMatch[2] || '');
      if (name && code) return { raw: text, name, code };
    }

    const prefixMatch = text.match(/^\(([^()]{1,16})\)\s*(.*?)\s*$/);
    if (prefixMatch) {
      const code = normalizeCode(prefixMatch[1] || '');
      const name = String(prefixMatch[2] || '').trim();
      if (name && code) return { raw: text, name, code };
    }

    const maybeCode = normalizeCode(text);
    if (maybeCode && CARGO_ALIAS_MAP[maybeCode]) {
      return { raw: text, name: CARGO_ALIAS_MAP[maybeCode], code: maybeCode };
    }

    return { raw: text, name: text, code: '' };
  }

  function formatCargoDisplay(raw, explicitCode) {
    const info = splitCargoCode(raw);
    const code = normalizeCode(explicitCode || info.code);
    const name = String(info.name || raw || '').trim().toUpperCase();
    if (!name) return '';

    const finalName = !code && CARGO_ALIAS_MAP[normalizeCode(name)]
      ? CARGO_ALIAS_MAP[normalizeCode(name)]
      : name;

    return code ? `${finalName} (${code})`.toUpperCase() : finalName.toUpperCase();
  }

  function buildCargoSearch(raw, display, code) {
    const info = splitCargoCode(raw);
    const cleanCode = normalizeCode(code || info.code);
    return normalizarBusqueda([
      display,
      info.raw,
      info.name,
      cleanCode,
      cleanCode ? `${cleanCode} ${info.name}` : '',
      cleanCode && CARGO_ALIAS_MAP[cleanCode] ? CARGO_ALIAS_MAP[cleanCode] : ''
    ].filter(Boolean).join(' '));
  }

  function buildCargoCatalogItems(rows) {
    const out = [];
    const seen = new Set();

    (Array.isArray(rows) ? rows : []).forEach(row => {
      const code = normalizeCode(row?.codigo || '');

      [row?.nombre, row?.apd_nombre].forEach(raw => {
        const text = String(raw || '').trim();
        if (!text) return;

        const label = formatCargoDisplay(text, code);
        const key = normalizarBusqueda(label);
        if (!label || !key || seen.has(key)) return;

        seen.add(key);
        out.push({
          label,
          raw: text,
          code,
          search: buildCargoSearch(text, label, code)
        });
      });
    });

    out.sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return out;
  }

  async function cargarCatalogoCargosAutocompleteFast() {
    if (!catalogoAutocomplete.cargos) {
      catalogoAutocomplete.cargos = { ready: false, loading: null, items: [] };
    }

    if (catalogoAutocomplete.cargos.ready) return catalogoAutocomplete.cargos;
    if (catalogoAutocomplete.cargos.loading) return catalogoAutocomplete.cargos.loading;

    catalogoAutocomplete.cargos.loading = (async () => {
      const rows = await supabaseFetch(
        'catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=5000'
      );
      catalogoAutocomplete.cargos.items = buildCargoCatalogItems(rows);
      catalogoAutocomplete.cargos.ready = true;
      return catalogoAutocomplete.cargos;
    })();

    try {
      return await catalogoAutocomplete.cargos.loading;
    } finally {
      catalogoAutocomplete.cargos.loading = null;
    }
  }

  function buscarSugerenciasLocalesCatalogo(items, q) {
    const needle = normalizarBusqueda(q);
    if (!needle) return [];

    const scored = [];

    for (const item of Array.isArray(items) ? items : []) {
      const hay = item?.search || normalizarBusqueda(item?.label || '');
      const labelNorm = normalizarBusqueda(item?.label || '');
      if (!hay) continue;

      let score = 0;
      if (labelNorm === needle) score = 1000;
      else if (hay.startsWith(needle)) score = 900;
      else if (hay.includes(` ${needle}`)) score = 760;
      else if (hay.includes(needle)) score = 620;
      else continue;

      scored.push({ item, score });
      if (scored.length > AUTOCOMPLETE_LIMIT * 6) break;
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item.label || '').localeCompare(String(b.item.label || ''), 'es');
    });

    return scored.slice(0, AUTOCOMPLETE_LIMIT).map(entry => ({ label: entry.item.label, raw: entry.item.raw, code: entry.item.code }));
  }

  function formatCargoInputValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return formatCargoDisplay(raw);
  }

  function formatCargoInputsInDOM() {
    if (!Array.isArray(CARGO_INPUT_IDS)) return;
    CARGO_INPUT_IDS.forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      const next = formatCargoInputValue(input.value);
      if (next) input.value = next;
    });
  }

  const originalBuscarSugerenciasState = buscarSugerenciasState;
  buscarSugerenciasState = async function patchedBuscarSugerenciasState(state) {
    if (!state || state.tipo !== 'cargo_area') {
      return originalBuscarSugerenciasState(state);
    }

    const q = state.input.value.trim();
    if (!q) {
      hideAC(state);
      return;
    }

    const cacheKey = `cargo_fast|${normalizeCacheKey(state.tipo, q)}`;
    if (suggestionCache.has(cacheKey)) {
      renderACItems(state, suggestionCache.get(cacheKey));
      return;
    }

    renderACStatus(state, 'Buscando...');
    const requestId = ++state.requestSeq;

    try {
      let items = [];

      try {
        await cargarCatalogoCargosAutocompleteFast();
        items = buscarSugerenciasLocalesCatalogo(catalogoAutocomplete.cargos.items, q);
      } catch (err) {
        console.error('ERROR CATALOGO CARGOS FAST:', err);
      }

      if (!items.length) {
        const data = await fetchSugerenciasRemotas(state.tipo, q);
        items = data.ok && Array.isArray(data.items)
          ? data.items
              .map(item => {
                const raw = String(item?.label || item?.nombre || '').trim();
                const label = formatCargoDisplay(raw);
                return label ? { label, raw } : null;
              })
              .filter(Boolean)
          : [];
      }

      if (requestId !== state.requestSeq) return;
      if (state.input.value.trim() !== q) return;

      suggestionCache.set(cacheKey, items);
      renderACItems(state, items);
    } catch (err) {
      if (requestId !== state.requestSeq) return;
      console.error('ERROR AUTOCOMPLETE FAST:', err);
      renderACStatus(state, 'No se pudo cargar');
      setTimeout(() => {
        if (state.lista.textContent.includes('No se pudo')) hideAC(state);
      }, 900);
    }
  };

  const originalSeleccionarAC = seleccionarAC;
  seleccionarAC = function patchedSeleccionarAC(state, index) {
    if (state?.tipo === 'cargo_area') {
      const item = state.items[index];
      if (!item) return;
      state.input.value = formatCargoDisplay(item.label || item.raw || '', item.code || '');
      hideAC(state);
      return;
    }

    return originalSeleccionarAC(state, index);
  };

  const originalCargarPrefsEnFormulario = cargarPrefsEnFormulario;
  cargarPrefsEnFormulario = function patchedCargarPrefsEnFormulario(data) {
    originalCargarPrefsEnFormulario(data);
    formatCargoInputsInDOM();
  };

  function retuneCargoAutocompleteStates() {
    if (!autocompleteStates || typeof autocompleteStates.forEach !== 'function') return;
    autocompleteStates.forEach(state => {
      if (!state || state.tipo !== 'cargo_area') return;
      state.search = debounce(() => buscarSugerenciasState(state), 45);
    });
  }

  function bootFastAutocompletePatch() {
    retuneCargoAutocompleteStates();
    formatCargoInputsInDOM();
    cargarCatalogoCargosAutocompleteFast().catch(err => {
      console.error('ERROR PRELOAD CARGOS FAST:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFastAutocompletePatch, { once: true });
  } else {
    bootFastAutocompletePatch();
  }
})();

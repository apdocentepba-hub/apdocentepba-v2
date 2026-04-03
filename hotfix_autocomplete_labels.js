(function () {
  'use strict';

  if (window.__apdAutocompleteLabelsHotfixLoaded) return;
  window.__apdAutocompleteLabelsHotfixLoaded = true;

  function normalizeCode(raw) {
    return String(raw || '')
      .toUpperCase()
      .replace(/[()]/g, '')
      .replace(/[\/\s]+/g, '')
      .trim();
  }

  function normalizeLabel(raw) {
    return String(raw || '').trim().toUpperCase();
  }

  function formatWithCode(code, name) {
    const cleanCode = normalizeCode(code);
    const cleanName = normalizeLabel(name);
    if (!cleanName) return '';
    return cleanCode ? `(${cleanCode}) ${cleanName}` : cleanName;
  }

  function parseEmbeddedCode(text) {
    const raw = String(text || '').trim();
    if (!raw) return { code: '', name: '' };
    const match = raw.match(/^\(?\s*([A-Z]{1,6})\s*\)?\s*[-–:]?\s+(.+)$/i);
    if (!match) return { code: '', name: raw };
    return { code: normalizeCode(match[1]), name: String(match[2] || '').trim() };
  }

  function buildCargoItems(rows) {
    const out = [];
    const seen = new Set();

    (Array.isArray(rows) ? rows : []).forEach(row => {
      const codigo = normalizeCode(row?.codigo || '');
      [row?.nombre, row?.apd_nombre].forEach(raw => {
        const text = String(raw || '').trim();
        if (!text) return;
        const embedded = parseEmbeddedCode(text);
        const label = formatWithCode(codigo || embedded.code, embedded.name || text);
        const key = typeof normalizarBusqueda === 'function' ? normalizarBusqueda(label) : label;
        if (!label || !key || seen.has(key)) return;
        seen.add(key);
        out.push({
          label,
          raw: text,
          search: (typeof normalizarBusqueda === 'function' ? normalizarBusqueda([label, text, embedded.name, codigo, embedded.code].filter(Boolean).join(' ')) : label)
        });
      });
    });

    out.sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'es'));
    return out;
  }

  async function ensureCargoCatalog() {
    if (!window.catalogoAutocomplete) return { items: [] };
    if (!catalogoAutocomplete.cargos) {
      catalogoAutocomplete.cargos = { ready: false, loading: null, items: [] };
    }
    if (catalogoAutocomplete.cargos.ready) return catalogoAutocomplete.cargos;
    if (catalogoAutocomplete.cargos.loading) return catalogoAutocomplete.cargos.loading;

    catalogoAutocomplete.cargos.loading = (async () => {
      const rows = await supabaseFetch('catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=5000');
      catalogoAutocomplete.cargos.items = buildCargoItems(rows);
      catalogoAutocomplete.cargos.ready = true;
      return catalogoAutocomplete.cargos;
    })();

    try {
      return await catalogoAutocomplete.cargos.loading;
    } finally {
      catalogoAutocomplete.cargos.loading = null;
    }
  }

  function searchCargoItems(items, q) {
    const needle = typeof normalizarBusqueda === 'function' ? normalizarBusqueda(q) : String(q || '').trim().toUpperCase();
    if (!needle) return [];

    const scored = [];
    for (const item of Array.isArray(items) ? items : []) {
      const hay = item?.search || '';
      const labelNorm = typeof normalizarBusqueda === 'function' ? normalizarBusqueda(item?.label || '') : String(item?.label || '').toUpperCase();
      if (!hay) continue;
      let score = 0;
      if (labelNorm === needle) score = 1000;
      else if (labelNorm.startsWith(`(${needle})`)) score = 980;
      else if (hay.startsWith(needle)) score = 920;
      else if (hay.includes(` ${needle}`)) score = 780;
      else if (hay.includes(needle)) score = 620;
      else continue;
      scored.push({ item, score });
      if (scored.length > (window.AUTOCOMPLETE_LIMIT || 12) * 6) break;
    }

    scored.sort((a, b) => (b.score - a.score) || String(a.item.label || '').localeCompare(String(b.item.label || ''), 'es'));
    return scored.slice(0, window.AUTOCOMPLETE_LIMIT || 12).map(entry => ({ label: entry.item.label, raw: entry.item.raw }));
  }

  function formatCurrentCargoInputs() {
    if (!Array.isArray(window.CARGO_INPUT_IDS)) return;
    CARGO_INPUT_IDS.forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      const value = String(input.value || '').trim();
      if (!value) return;
      const embedded = parseEmbeddedCode(value);
      const next = formatWithCode(embedded.code, embedded.name || value);
      if (next) input.value = next;
    });
  }

  const originalBuscar = window.buscarSugerenciasState;
  if (typeof originalBuscar === 'function') {
    window.buscarSugerenciasState = async function hotfixBuscarSugerenciasState(state) {
      if (!state || state.tipo !== 'cargo_area') return originalBuscar(state);

      const q = state.input.value.trim();
      if (!q) {
        hideAC(state);
        return;
      }

      const cacheKey = `cargo_code_hotfix|${typeof normalizeCacheKey === 'function' ? normalizeCacheKey(state.tipo, q) : q}`;
      if (window.suggestionCache?.has(cacheKey)) {
        renderACItems(state, suggestionCache.get(cacheKey));
        return;
      }

      renderACStatus(state, 'Buscando...');
      const requestId = ++state.requestSeq;

      try {
        await ensureCargoCatalog();
        let items = searchCargoItems(catalogoAutocomplete.cargos.items, q);

        if (!items.length) {
          const data = await fetchSugerenciasRemotas(state.tipo, q);
          items = data.ok && Array.isArray(data.items)
            ? data.items.map(item => {
                const raw = String(item?.label || item?.nombre || '').trim();
                const embedded = parseEmbeddedCode(raw);
                const label = formatWithCode('', embedded.name || raw);
                return label ? { label, raw } : null;
              }).filter(Boolean)
            : [];
        }

        if (requestId !== state.requestSeq) return;
        if (state.input.value.trim() !== q) return;

        suggestionCache.set(cacheKey, items);
        renderACItems(state, items);
      } catch (err) {
        if (requestId !== state.requestSeq) return;
        console.error('ERROR AUTOCOMPLETE HOTFIX:', err);
        renderACStatus(state, 'No se pudo cargar');
      }
    };
  }

  const originalSeleccionar = window.seleccionarAC;
  if (typeof originalSeleccionar === 'function') {
    window.seleccionarAC = function hotfixSeleccionarAC(state, index) {
      if (state?.tipo === 'cargo_area') {
        const item = state.items[index];
        if (!item) return;
        state.input.value = String(item.label || '').trim();
        hideAC(state);
        return;
      }
      return originalSeleccionar(state, index);
    };
  }

  const originalCargarPrefs = window.cargarPrefsEnFormulario;
  if (typeof originalCargarPrefs === 'function') {
    window.cargarPrefsEnFormulario = function hotfixCargarPrefsEnFormulario(data) {
      const result = originalCargarPrefs(data);
      setTimeout(formatCurrentCargoInputs, 0);
      return result;
    };
  }

  function boot() {
    formatCurrentCargoInputs();
    ensureCargoCatalog().catch(err => console.error('ERROR PRELOAD CARGOS HOTFIX:', err));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

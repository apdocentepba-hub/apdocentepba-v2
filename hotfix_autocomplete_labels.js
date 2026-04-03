(function () {
  'use strict';

  if (window.__apdAutocompleteLabelsHotfixLoaded) return;
  window.__apdAutocompleteLabelsHotfixLoaded = true;

  const LS_KEY = 'apd_cargos_catalogo_cache_v1';
  const LS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
  const LIMIT = typeof window.AUTOCOMPLETE_LIMIT === 'number' ? window.AUTOCOMPLETE_LIMIT : 12;

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

  function norm(raw) {
    if (typeof window.normalizarBusqueda === 'function') return window.normalizarBusqueda(raw);
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
    const paren = raw.match(/^\(([^()]{1,8})\)\s+(.+)$/);
    if (paren) return { code: normalizeCode(paren[1]), name: String(paren[2] || '').trim() };
    const dash = raw.match(/^([A-Z]{1,6})\s*[-–:]\s*(.+)$/i);
    if (dash) return { code: normalizeCode(dash[1]), name: String(dash[2] || '').trim() };
    return { code: '', name: raw };
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
        const key = norm(label);
        if (!label || !key || seen.has(key)) return;
        seen.add(key);
        out.push({
          label,
          raw: text,
          search: norm([label, text, embedded.name, codigo, embedded.code].filter(Boolean).join(' '))
        });
      });
    });

    out.sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'es'));
    return out;
  }

  function saveCache(items) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: Date.now(), items: Array.isArray(items) ? items : [] }));
    } catch {}
  }

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.items)) return [];
      if (!parsed.savedAt || (Date.now() - parsed.savedAt) > LS_MAX_AGE_MS) return [];
      return parsed.items;
    } catch {
      return [];
    }
  }

  function ensureCatalogState() {
    if (!window.catalogoAutocomplete) return null;
    if (!catalogoAutocomplete.cargos) {
      catalogoAutocomplete.cargos = { ready: false, loading: null, items: [] };
    }
    return catalogoAutocomplete.cargos;
  }

  async function ensureCargoCatalog() {
    const state = ensureCatalogState();
    if (!state) return { ready: false, items: [] };

    if (!Array.isArray(state.items) || !state.items.length) {
      const cached = readCache();
      if (cached.length) {
        state.items = cached;
        state.ready = true;
      }
    }

    if (state.ready && Array.isArray(state.items) && state.items.length) return state;
    if (state.loading) return state.loading;

    state.loading = (async () => {
      const rows = await supabaseFetch('catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=5000');
      state.items = buildCargoItems(rows);
      state.ready = true;
      saveCache(state.items);
      return state;
    })();

    try {
      return await state.loading;
    } finally {
      state.loading = null;
    }
  }

  function searchCargoItems(items, q) {
    const needle = norm(q);
    if (!needle) return [];

    const scored = [];
    for (const item of Array.isArray(items) ? items : []) {
      const hay = item?.search || '';
      const labelNorm = norm(item?.label || '');
      if (!hay) continue;
      let score = 0;
      if (labelNorm === needle) score = 1000;
      else if (labelNorm.startsWith(`(${needle})`)) score = 980;
      else if (hay.startsWith(needle)) score = 920;
      else if (hay.includes(` ${needle}`)) score = 790;
      else if (hay.includes(needle)) score = 640;
      else continue;
      scored.push({ item, score });
      if (scored.length > LIMIT * 8) break;
    }

    scored.sort((a, b) => (b.score - a.score) || String(a.item.label || '').localeCompare(String(b.item.label || ''), 'es'));
    return scored.slice(0, LIMIT).map(entry => ({ label: entry.item.label, raw: entry.item.raw }));
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

      const stateCatalog = ensureCatalogState();
      const cacheKey = `cargo_code_hotfix|${typeof normalizeCacheKey === 'function' ? normalizeCacheKey(state.tipo, q) : q}`;
      if (window.suggestionCache?.has(cacheKey)) {
        renderACItems(state, suggestionCache.get(cacheKey));
        return;
      }

      let localItems = [];
      if (stateCatalog?.items?.length) {
        localItems = searchCargoItems(stateCatalog.items, q);
        if (localItems.length) {
          suggestionCache.set(cacheKey, localItems);
          renderACItems(state, localItems);
          if (!stateCatalog.ready && !stateCatalog.loading) ensureCargoCatalog().catch(() => null);
          return;
        }
      }

      const requestId = ++state.requestSeq;
      const loadingTimer = setTimeout(() => {
        if (requestId === state.requestSeq) renderACStatus(state, 'Buscando...');
      }, 180);

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

        clearTimeout(loadingTimer);
        if (requestId !== state.requestSeq) return;
        if (state.input.value.trim() !== q) return;

        suggestionCache.set(cacheKey, items);
        renderACItems(state, items);
      } catch (err) {
        clearTimeout(loadingTimer);
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

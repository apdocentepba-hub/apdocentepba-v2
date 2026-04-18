(function () {
  function cargoLikePattern(term, mode) {
    const cleaned = String(term || "").trim().replace(/\s+/g, "*");
    if (!cleaned) return "";
    return mode === "prefix" ? `${cleaned}*` : `*${cleaned}*`;
  }

  function buildCargoSuggestionLabel(row) {
    const codigo = String(row?.codigo || "").trim().toUpperCase();
    const nombre = String(row?.nombre || row?.apd_nombre || "").trim().toUpperCase();
    if (!nombre) return "";
    return codigo ? `${nombre} (${codigo})` : nombre;
  }

  async function buscarSugerenciasCargosSupabasePattern(term, mode) {
    const pattern = cargoLikePattern(term, mode);
    if (!pattern) return [];

    const orFilter = encodeURIComponent(
      `(codigo.ilike.${pattern},nombre_norm.ilike.${pattern},apd_nombre_norm.ilike.${pattern})`
    );

    const rows = await supabaseFetch(
      `catalogo_cargos_areas?select=codigo,nombre,apd_nombre,nombre_norm,apd_nombre_norm&or=${orFilter}&order=nombre.asc&limit=${AUTOCOMPLETE_LIMIT}`
    );

    return mergeSuggestionItems(
      (Array.isArray(rows) ? rows : []).map((row) => ({
        label: buildCargoSuggestionLabel(row)
      }))
    ).slice(0, AUTOCOMPLETE_LIMIT);
  }

  async function buscarSugerenciasCargosSupabase(query) {
    const needle = normalizarBusqueda(query);
    if (!needle || needle.length < 2) return [];

    const prefix = await buscarSugerenciasCargosSupabasePattern(needle, "prefix");
    if (prefix.length >= AUTOCOMPLETE_LIMIT) return prefix;

    const contains = await buscarSugerenciasCargosSupabasePattern(needle, "contains");
    return mergeSuggestionItems(prefix, contains).slice(0, AUTOCOMPLETE_LIMIT);
  }

  window.buildCargoSuggestionLabel = buildCargoSuggestionLabel;
  window.buscarSugerenciasCargosSupabasePattern = buscarSugerenciasCargosSupabasePattern;
  window.buscarSugerenciasCargosSupabase = buscarSugerenciasCargosSupabase;
})();

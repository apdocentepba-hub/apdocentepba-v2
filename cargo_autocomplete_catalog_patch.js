(function () {
  const CARGO_ALIAS_MAP = {
    CCD: [
      "CONSTRUCCION DE LA CIUDADANIA",
      "CONSTRUCCIÓN DE LA CIUDADANÍA"
    ],
    NTICX: [
      "NUEVAS TECNOLOGIAS DE LA INFORMACION Y LA CONECTIVIDAD",
      "NUEVAS TECNOLOGÍAS DE LA INFORMACIÓN Y LA CONECTIVIDAD"
    ],
    ACO: [
      "ENCARGADO MEDIOS APOYO TEC-PED.CONSTRUCCIONES"
    ],
    EMATP: [
      "ENCARGADO MEDIOS APOYO TEC-PED.INF/COMP/E INF.APL.",
      "ENCARGADO DE MEDIOS DE APOYO TECNICO PEDAGOGICO"
    ]
  };

  function cargoNeedleVariants(query) {
    const normalized = normalizarBusqueda(query);
    if (!normalized) return [];

    const variants = [normalized];
    const aliases = CARGO_ALIAS_MAP[normalized] || [];

    aliases.forEach((item) => {
      const aliasNorm = normalizarBusqueda(item);
      if (aliasNorm && !variants.includes(aliasNorm)) {
        variants.push(aliasNorm);
      }
    });

    return variants;
  }

  function cargoLikePattern(term, mode) {
    const cleaned = String(term || "").trim().replace(/\s+/g, "*");
    if (!cleaned) return "";
    if (mode === "prefix") return `${cleaned}*`;
    return `*${cleaned}*`;
  }

  function buildCargoSuggestionLabel(row) {
    const codigo = String(row?.codigo || "").trim().toUpperCase();
    const nombre = String(
      row?.nombre || row?.apd_nombre || row?.descripcion || ""
    ).trim().toUpperCase();

    if (!nombre) return "";
    if (!codigo) return nombre;
    if (nombre.includes(`(${codigo})`)) return nombre;
    return `${nombre} (${codigo})`;
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
    const variants = cargoNeedleVariants(query);
    if (!variants.length) return [];

    const mergedPrefix = [];
    for (const term of variants) {
      const found = await buscarSugerenciasCargosSupabasePattern(term, "prefix");
      mergedPrefix.push(...found);
    }

    const prefixItems = mergeSuggestionItems(mergedPrefix).slice(0, AUTOCOMPLETE_LIMIT);
    if (prefixItems.length >= AUTOCOMPLETE_LIMIT) {
      return prefixItems;
    }

    const mergedContains = [];
    for (const term of variants) {
      const found = await buscarSugerenciasCargosSupabasePattern(term, "contains");
      mergedContains.push(...found);
    }

    return mergeSuggestionItems(prefixItems, mergedContains).slice(0, AUTOCOMPLETE_LIMIT);
  }

  window.buscarSugerenciasCargosSupabasePattern = buscarSugerenciasCargosSupabasePattern;
  window.buscarSugerenciasCargosSupabase = buscarSugerenciasCargosSupabase;
})();

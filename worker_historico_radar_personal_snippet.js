async function handleHistoricoRadarPersonal(url, env) {
  const userId = String(url.searchParams.get("user_id") || "").trim();
  const days = clampInt(url.searchParams.get("days"), 7, 120, HISTORICO_DAYS_DEFAULT);
  if (!userId) return json({ ok: false, message: "Falta user_id" }, 400);

  const prefs = await obtenerPreferenciasUsuario(env, userId);
  if (!prefs || !prefs.alertas_activas) {
    return json({ ok: true, empty: true, personal: true, message: "Activa alertas y guarda tus preferencias." });
  }

  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const distritos = distritosPrefsAPD(prefsCanon);
  if (!distritos.length) {
    return json({ ok: true, empty: true, personal: true, message: "Configura al menos un distrito." });
  }

  const globalRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_global_snapshots", distritos, days, 8000);
  const localRows = await fetchHistoricoRowsByDistritos(env, "apd_ofertas_historial", distritos, days, 8000);
  const rawRows = globalRows.length ? globalRows : localRows;
  const matchedRows = rawRows.filter(row => coincideOfertaConPreferencias(historicoRowToOferta(row), prefsCanon).match);
  const provinciaRows = await fetchProvinciaCurrentRows(env, days).catch(() => []);
  return json(buildHistoricoRadarPersonalPayload(matchedRows, provinciaRows, prefsCanon, days));
}

function buildHistoricoRadarPersonalPayload(rows, provinciaRows, prefsCanon, days) {
  const latestRows = [];
  const byKey = new Map();
  for (const row of rows) {
    const key = historicoRowKey(row);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || sortHistoricoDesc(row, prev) < 0) byKey.set(key, row);
  }
  latestRows.push(...byKey.values());
  latestRows.sort(sortHistoricoDesc);
  const activeRows = latestRows.filter(ofertaHistoricaActiva);
  const provinciaActivas = Array.isArray(provinciaRows) ? provinciaRows.filter(ofertaHistoricaActiva) : [];

  return {
    ok: true,
    empty: latestRows.length === 0,
    personal: true,
    ventana_dias: days,
    filtros_aplicados: {
      distritos: unique([prefsCanon?.distrito_principal, ...(prefsCanon?.otros_distritos || [])].filter(Boolean)),
      cargos: unique([...(prefsCanon?.cargos || []), ...(prefsCanon?.materias || [])].filter(Boolean)),
      turnos: unique((prefsCanon?.turnos || []).filter(Boolean)),
      niveles: unique((prefsCanon?.niveles || []).filter(Boolean))
    },
    ofertas_unicas: latestRows.length,
    activas_estimadas: activeRows.length,
    nuevas_7d: latestRows.length,
    cambios_estado_recientes: 0,
    top_distritos: topCountItems(latestRows.map(row => row.distrito), 4),
    top_cargos: topCountItems(latestRows.map(tituloHistoricoRow), 5),
    top_turnos: topCountItems(activeRows.map(row => mapTurnoAPD(row.turno || "")), 4),
    top_niveles: topCountItems(latestRows.map(row => row.nivel_modalidad), 4),
    comparativa: {
      activas_provincia: provinciaActivas.length,
      share_vs_provincia_pct: provinciaActivas.length ? Math.round((activeRows.length / provinciaActivas.length) * 1000) / 10 : null
    }
  };
}

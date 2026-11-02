/* Diagnóstico agregado — NO confirma igualdad de cobertura ni vacantes disponibles.
 * ABC: estado="Publicada", rows=0. APDocente: barrido provincial de ofertas
 * marcadas como publicadas Y vigentes, deduplicadas, recogidas por distritos.
 * Este módulo no usa red, claves ni datos individuales.
 */
const MAX_NEAR_SNAPSHOT_AGE_MS = 15 * 60 * 1000;
export function assessCoverage({abcBefore, abcAfter, scan, observedAt}) {
  const observationMs = Date.parse(observedAt);
  if (!Number.isFinite(observationMs)) throw Error("Invalid observation timestamp");
  const cleanCount = value =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!cleanCount(abcBefore?.count) || !cleanCount(abcAfter?.count) ||
      !Number.isFinite(Date.parse(abcBefore?.at)) ||
      !Number.isFinite(Date.parse(abcAfter?.at))) {
    throw Error("Invalid ABC count observations");
  }
  const firstMs = Date.parse(abcBefore.at), lastMs = Date.parse(abcAfter.at);
  if (lastMs < firstMs || observationMs < lastMs ||
      firstMs > observationMs + 60000) {
    throw Error("Inconsistent public observation clock");
  }
  const abcStable = abcBefore.count === abcAfter.count;
  const complete = scan?.status === "finished" &&
    scan?.scope === "PROVINCIA_FULL" &&
    (scan?.mode == null || scan.mode === "current_published") &&
    cleanCount(scan.offers_processed) &&
    cleanCount(scan.total_districts) && scan.total_districts > 0 &&
    cleanCount(scan.districts_completed) &&
    scan.districts_completed === scan.total_districts;
  const scanEndMs = Date.parse(scan?.finished_at || "");
  const scanStartMs = Date.parse(scan?.started_at || "");
  const validPeriod = Number.isFinite(scanStartMs) &&
    Number.isFinite(scanEndMs) && scanStartMs <= scanEndMs &&
    scanEndMs <= observationMs + 60000;
  const scanAgeMinutes = validPeriod ?
    Math.round((firstMs - scanEndMs) / 60000 * 10) / 10 : null;
  const comparisonPossible = abcStable && complete && validPeriod;
  const discrepancy = comparisonPossible ?
    abcAfter.count - scan.offers_processed : null;
  let classification;
  if (!abcStable) classification = "ABC_CAMBIO_DURANTE_LECTURA";
  else if (!complete || !validPeriod) classification = "BARRIDO_NO_VALIDADO";
  else if (firstMs - scanEndMs > MAX_NEAR_SNAPSHOT_AGE_MS)
    classification = "CAPTURA_ANTERIOR_NO_COMPARABLE";
  else if (firstMs - scanEndMs < -60000)
    classification = "BARRIDO_POSTERIOR_A_ABC";
  else classification = "CERCANOS_EN_TIEMPO_CRITERIOS_DISTINTOS";
  const report = {
    schema_version: 1,
    observed_at_utc: observedAt,
    abc: {
      query:'estado:"Publicada"',
      rows_requested:0,
      before_count:abcBefore.count,
      before_at_utc:abcBefore.at,
      after_count:abcAfter.count,
      after_at_utc:abcAfter.at,
      count_stable_during_check:abcStable,
      observation_gap_seconds:Math.round((lastMs-firstMs)/1000)
    },
    apdocentepba: {
      status:typeof scan?.status==="string"?scan.status:"unknown",
      mode:typeof scan?.mode==="string"?scan.mode:null,
      scope:typeof scan?.scope==="string"?scan.scope:null,
      scan_started_at_utc:validPeriod?scan.started_at:null,
      scan_finished_at_utc:validPeriod?scan.finished_at:null,
      completed_districts:cleanCount(scan?.districts_completed)?scan.districts_completed:null,
      total_districts:cleanCount(scan?.total_districts)?scan.total_districts:null,
      offers_captured:cleanCount(scan?.offers_processed)?scan.offers_processed:null,
      finished_scan_valid:!!complete && validPeriod,
      age_at_first_abc_read_minutes:scanAgeMinutes
    },
    difference_abc_minus_scan:discrepancy,
    diagnostic_classification:classification,
    same_time_and_same_criteria_confirmed:false,
    interpretation:"Comparación diagnóstica, NO auditoría de coincidencia oferta por oferta. ABC = estado Publicada; APD = publicación filtrada por vigencia y distrito y deduplicada, capturada a lo largo de un barrido. Diferencias pueden deberse a momento, cierre, paginación, criterios o cobertura.",
    private_records_accessed:false
  };
  return report;
}

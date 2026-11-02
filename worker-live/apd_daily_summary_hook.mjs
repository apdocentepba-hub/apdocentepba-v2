/* APDocentePBA — Adaptador OPCIONAL para una captura provincial compacta.
 * No importado ni desplegado en el Worker: se integra únicamente después
 * de aplicar la migración autorizada y probar la ruta completa.
 * Mantener snapshot_writes=false en el scanner actual.
 */
export async function maybeCaptureDailyProvinceSummary(env, scanDate, finished, supabaseFetchWithRetry) {
  if (!finished || env?.APD_DAILY_SUMMARY_ENABLED !== "true") {
    return { ok: true, skipped: true, reason: "feature_disabled_or_scan_incomplete" };
  }
  const day = String(scanDate || "").trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)) {
    return { ok: false, skipped: true, reason: "invalid_scan_date" };
  }
  if (typeof supabaseFetchWithRetry !== "function") {
    return { ok: false, skipped: true, reason: "missing_authorized_fetcher" };
  }
  try {
    const response = await supabaseFetchWithRetry(
      env,
      `${env.SUPABASE_URL}/rest/v1/rpc/capture_apd_daily_province_summary`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_scan_date: day })
      }
    );
    if (!response.ok) throw new Error(`Summary RPC HTTP ${response.status}`);
    return { ok: true, captured: true, scan_date: day };
  } catch (err) {
    // Un fallo de historico jamás debe detener el scanner de ofertas.
    console.warn("APD_DAILY_SUMMARY_FAILED", String(err?.message || err));
    return { ok: false, captured: false, scan_date: day };
  }
}

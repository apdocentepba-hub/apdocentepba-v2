/* APDocentePBA — preview ONLY: admin read-only daily history.
 * Requires new SQL table, existing session middleware and explicit enable flag.
 * Not imported or deployed in the production Worker.
 */
export async function handleApdAdminDailyHistory(request, url, env, requireAdmin, supabaseSelect, json) {
  const respond = (payload, status = 200) => {
    const response = json(payload, status);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  // No DB access, even for session validation, while the endpoint is disabled.
  if (env?.APD_DAILY_HISTORY_READ_ENABLED !== "true") {
    return respond({ ok: false, error: "Ruta no encontrada" }, 404);
  }

  let auth;
  try {
    auth = await requireAdmin(env, request);
  } catch (_) {
    return respond({ ok: false, error: "Autenticacion no disponible" }, 503);
  }
  if (!auth?.ok) {
    // Preserve existing 401/403 semantics from the verified session middleware.
    return auth?.response || respond({ ok: false, error: "No autenticado" }, 401);
  }

  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 30 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 60 ||
      (rawLimit !== null && !/^[1-9][0-9]?$/.test(rawLimit))) {
    return respond({ ok: false, error: "limit debe ser un entero entre 1 y 60" }, 400);
  }

  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    return respond({ ok: false, error: "Historico no disponible" }, 503);
  }
  try {
    // Fixed columns only: never select raw offer payloads or user identifiers.
    // Query construction uses a validated integer, not arbitrary client strings.
    const query = "apd_daily_province_summary?select=" +
      "scan_date,scan_finished_at,total_districts,districts_with_offers," +
      "offers_total,district_offer_counts&order=scan_date.desc&limit=" + limit;
    const rows = await supabaseSelect(env, query);
    if (!Array.isArray(rows) || rows.length > limit) {
      throw new Error("invalid summary collection");
    }
    const verified = rows.map((r) => {
      if (!r || typeof r !== "object" ||
          typeof r.scan_date !== "string" ||
          !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.scan_date) ||
          !Number.isFinite(Date.parse(r.scan_date + "T00:00:00Z")) ||
          typeof r.scan_finished_at !== "string" ||
          !Number.isFinite(Date.parse(r.scan_finished_at)) ||
          !Number.isSafeInteger(Number(r.total_districts)) ||
          Number(r.total_districts) < 1 || Number(r.total_districts) > 500 ||
          !Number.isSafeInteger(Number(r.districts_with_offers)) ||
          Number(r.districts_with_offers) < 0 ||
          Number(r.districts_with_offers) > Number(r.total_districts) ||
          !Number.isSafeInteger(Number(r.offers_total)) ||
          Number(r.offers_total) < 0 ||
          !r.district_offer_counts ||
          typeof r.district_offer_counts !== "object" ||
          Array.isArray(r.district_offer_counts)) {
        throw new Error("invalid summary row");
      }
      const districtEntries = Object.entries(r.district_offer_counts);
      if (districtEntries.length !== Number(r.districts_with_offers)) {
        throw new Error("district count mismatch");
      }
      let sum = 0;
      for (const [district, count] of districtEntries) {
        if (!district || district.length > 100 ||
            district === "__proto__" || district === "constructor" ||
            !Number.isSafeInteger(Number(count)) || Number(count) < 1) {
          throw new Error("invalid district count");
        }
        sum += Number(count);
      }
      if (!Number.isSafeInteger(sum) || sum !== Number(r.offers_total)) {
        throw new Error("offer count mismatch");
      }
      return {
        scan_date: r.scan_date,
        scan_finished_at: r.scan_finished_at,
        total_districts: Number(r.total_districts),
        districts_with_offers: Number(r.districts_with_offers),
        offers_total: Number(r.offers_total),
        district_offer_counts: Object.fromEntries(districtEntries)
      };
    });
    return respond({
      ok: true,
      source: "apd_daily_province_summary",
      total_dates: verified.length,
      comparable: verified.length >= 2,
      dates: verified
    });
  } catch (_) {
    // Missing migration, upstream API outage, invalid data: always fail closed.
    // Never leak SQL/credentials/provider error text to the browser.
    return respond({ ok: false, error: "Historico no disponible" }, 503);
  }
}

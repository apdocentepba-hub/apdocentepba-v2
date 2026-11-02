/* Preview-only paginated province summary: NEVER deployed without separate approval.
 * The public API currently returns only 1000 rows despite 2609 offers in latest scan.
 * No changes to data or roles. Feature flag disabled unless explicitly true.
 */
export async function handleProvinciaResumenPaginadoPreview(url, env, deps) {
  const reply = (body, status=200) => {
    const r = deps.json(body,status);
    r.headers.set("Cache-Control","no-store");
    return r;
  };
  if (env?.APD_PROVINCIA_PAGINATION_ENABLED !== "true") {
    return reply({ok:false,error:"Ruta no habilitada"},404);
  }
  const rawDays = url.searchParams.get("days");
  const days = rawDays !== null && /^[0-9]{1,3}$/.test(rawDays)
    ? Math.min(120,Math.max(7,Number(rawDays))) : 30;
  const now = Date.now();
  const requestedWindowStartMs = now - days * 86400000;
  // Query exactly the completed scan, not a rolling 30-day collection of older scans.
  const PAGE_SIZE = 500, MAX_ROWS = 20000;
  const projection = "source_offer_key,idoferta,iddetalle,estado,distrito,escuela," +
    "cargo,area,nivel_modalidad,turno,jornada,hsmodulos,cursodivision," +
    "supl_desde,supl_hasta,finoferta,ult_movimiento,first_seen_at,last_seen_at," +
    "last_state_change_at,times_seen,state_changes";

  try {
    const before = await deps.getScanState(env);
    const validScan = (s) =>
      s?.scope === "PROVINCIA_FULL" &&
      s?.status === "finished" && s?.mode === "current_published" &&
      Number.isSafeInteger(Number(s.total_districts)) && Number(s.total_districts) > 0 &&
      Number(s.districts_completed) === Number(s.total_districts) &&
      Number.isSafeInteger(Number(s.offers_processed)) &&
      Number(s.offers_processed) >= 0 &&
      typeof s.started_at === "string" &&
      typeof s.finished_at === "string" &&
      Number.isFinite(Date.parse(s.started_at)) &&
      Number.isFinite(Date.parse(s.finished_at)) &&
      Date.parse(s.finished_at) >= Date.parse(s.started_at) &&
      Date.parse(s.finished_at) <= now + 5*60000;
    if (!validScan(before) || Date.parse(before.finished_at) < requestedWindowStartMs) {
      return reply({ok:false,error:"Barrido provincial no verificado"},503);
    }

    const rows = [], seen = new Set();
    for(let offset=0; offset<=MAX_ROWS; offset+=PAGE_SIZE) {
      const query = "apd_ofertas_global_current?last_seen_at=gte." +
        encodeURIComponent(before.started_at) +
        "&last_seen_at=lte." + encodeURIComponent(before.finished_at) +
        "&select=" + projection +
        "&order=last_seen_at.desc,source_offer_key.asc&limit=" + PAGE_SIZE +
        "&offset=" + offset;
      const page = await deps.supabaseSelect(env,query);
      if (!Array.isArray(page) || page.length>PAGE_SIZE) throw Error("invalid page");
      if(offset===MAX_ROWS && page.length) throw Error("page limit reached");
      for(const item of page) {
        if (!item || typeof item.source_offer_key !== "string" ||
            !item.source_offer_key || seen.has(item.source_offer_key)) {
          throw Error("duplicate or empty source offer key");
        }
        seen.add(item.source_offer_key);
        rows.push(item);
      }
      if(page.length<PAGE_SIZE) break;
    }
    const after = await deps.getScanState(env);
    if(!validScan(after) ||
       after.started_at !== before.started_at ||
       after.finished_at !== before.finished_at ||
       Number(after.offers_processed) !== Number(before.offers_processed) ||
       Number(after.total_districts) !== Number(before.total_districts) ||
       Number(after.districts_completed) !== Number(before.districts_completed) ||
       after.mode !== before.mode || after.scope !== before.scope) {
      throw Error("scan changed during pagination");
    }
    // Each row in a finished full current scan must belong to that scan.
    // Otherwise, refuse to pass an old/stale record off as a current count.
    const start = Date.parse(before.started_at);
    if(rows.some(x => !Number.isFinite(Date.parse(x.last_seen_at)) ||
      Date.parse(x.last_seen_at)<start ||
      Date.parse(x.last_seen_at)>Date.parse(before.finished_at))) {
      throw Error("mixed scan windows");
    }
    if(rows.length!==Number(before.offers_processed)) {
      throw Error("summary count not equal to finished scan");
    }
    const result = deps.buildSummary(rows,days,before);
    if(!result || result.ok!==true || result.total_ofertas!==rows.length) {
      throw Error("invalid aggregate result");
    }
    return reply({...result,source:"full_paginated_current_scan",
      verified_complete_scan:true});
  } catch (_) {
    // Do not expose provider errors, SQL text, or a fabricated zero-result panel.
    return reply({ok:false,error:"Resumen provincial no verificable"},503);
  }
}

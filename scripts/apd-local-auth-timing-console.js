/* APDocentePBA: local, READ-ONLY DevTools timing summary, opt-in.
 * This script is NEVER injected into the deployed site by the PR.
 * Paste/run in the browser console on the owner's authenticated tab.
 * Reads browser Resource Timing ONLY; no fetch, token, cookie, DOM, storage,
 * response body, personal identifier or remote reporting.
 */
(()=>{
 "use strict";
 const PAGE_ORIGIN="https://alertasapd.com.ar";
 const WORKER_ORIGIN="https://ancient-wildflower-cd37.apdocentepba.workers.dev";
 const ROUTES=Object.freeze({
  "/api/mis-alertas":"alerts",
  "/api/account/profile":"profile",
  "/api/account/preferences":"preferences",
  "/api/mi-plan":"plan"
 });
 const actualOrigin=typeof location==="object"&&location?location.origin:null;
 if(actualOrigin!==PAGE_ORIGIN)
  throw Error("APD local performance probe: use the canonical HTTPS site only");
 const entries=performance.getEntriesByType("resource");
 if(!Array.isArray(entries))throw Error("Resource Timing is unavailable");
 const routeGroups=Object.fromEntries(Object.values(ROUTES).map(k=>[k,[]]));
 let inspected=0,qualified=0;
 // Do not include the resource name/query/header in ANY report or state.
 // A user_id can appear in /api/mis-alertas?user_id=... .
 for(const entry of entries.slice(-500)){
  inspected++;
  if(entry?.entryType!=="resource"||typeof entry.name!=="string")continue;
  let route;
  try{
   const parsed=new URL(entry.name);
   if(parsed.origin!==WORKER_ORIGIN||parsed.protocol!=="https:")continue;
   route=ROUTES[parsed.pathname];
  }catch{continue;}
  if(!route)continue;
  qualified++;
  const number=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:null;
  const start=number(entry.startTime);
  const duration=number(entry.duration);
  const responseStart=number(entry.responseStart);
  const responseEnd=number(entry.responseEnd);
  const allowed=duration!==null&&duration>0&&start!==null;
  const ttfb=allowed&&responseStart!==null&&responseStart>start?
   Math.round((responseStart-start)*10)/10:null;
  routeGroups[route].push({
   duration_ms:allowed?Math.round(duration*10)/10:null,
   ttfb_ms:ttfb,
   // Start relative to page navigation; NOT authenticated login elapsed.
   start_after_navigation_ms:start===null?null:Math.round(start*10)/10,
   response_end_ms:responseEnd===null?null:Math.round(responseEnd*10)/10
  });
 }
 const stats=(values,minForPercentile)=>{
  const usable=values.filter(v=>v!==null).sort((a,b)=>a-b);
  const percentile=p=>usable[Math.max(0,Math.ceil(usable.length*p)-1)]??null;
  return {
   timing_available_samples:usable.length,
   min_ms:usable.length?usable[0]:null,
   max_ms:usable.length?usable[usable.length-1]:null,
   p50_ms:usable.length>=minForPercentile?percentile(.5):null,
   p95_ms:usable.length>=20?percentile(.95):null
  };
 };
 const routes={};
 for(const [key,items] of Object.entries(routeGroups)){
  routes[key]={
   observed_requests:items.length,
   timing_unavailable_requests:items.filter(x=>x.duration_ms===null).length,
   network_duration:stats(items.map(x=>x.duration_ms),10),
   ttfb:stats(items.map(x=>x.ttfb_ms),10)
  };
 }
 const report=Object.freeze({
  proof:"browser_resource_timing_only",
  origin_verified:true,source:"browser_performance_resource_entries",
  inspected_recent_entries:inspected,matched_route_entries:qualified,
  routes,
  contains_user_ids:false,contains_urls:false,
  contains_tokens_or_headers:false,
  additional_network_requests:0,
  first_alert_paint_measured:false,
  authenticated_worker_execution_proven:false,
  read_only:true,
  caution:"Cross-origin timing may be unavailable; no timings means unknown, not zero. p50 requires 10 and p95 requires 20 measurable samples."
 });
 // Numeric object only, no raw entries or route query strings.
 console.log("APD_LOCAL_AUTH_TIMING_SUMMARY",report);
 return report;
})();
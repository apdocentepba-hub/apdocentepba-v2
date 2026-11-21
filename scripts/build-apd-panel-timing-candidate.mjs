/* Non-production browser telemetry candidate. Strictly builds tmp copy.
 * No backend writes, no URLs or PII. Marks API, gated profile and DOM paint.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
const input=readFileSync("app_v2.js","utf8");
const core=readFileSync("scripts/apd-panel-timing-meter.mjs","utf8")
 .replace("export function createApdPanelTimingMeter(", "function createApdPanelTimingMeter(");
function exactlyOnce(source,from,to,label){
 const count=source.split(from).length-1;
 if(count!==1)throw Error(label+": expected 1 unambiguous match, got "+count);
 return source.replace(from,to);
}
const init=`
// Local performance laboratory only. No tracking, cookies, usernames or remote logs.
(function(){
${core}
  window.__APD_LAB_PERF = createApdPanelTimingMeter();
})();
`;
let candidate=exactlyOnce(input,"'use strict';","'use strict';\n"+init,
 "local-only timing helper");
candidate=exactlyOnce(candidate,
 `  const alertasPromise = obtenerMisAlertas(token)
    .then(items => ({ ok: true, items }))
    .catch(error => ({ ok: false, error }));`,
 `  const apdLabRun = window.__APD_LAB_PERF.begin();
  const alertasPromise = obtenerMisAlertas(token)
    .then(items => {
      window.__APD_LAB_PERF.markApi(apdLabRun, "success");
      return { ok: true, items };
    })
    .catch(error => {
      window.__APD_LAB_PERF.markApi(apdLabRun, "error");
      return { ok: false, error };
    });`,
 "start and settle protected alert request");
candidate=exactlyOnce(candidate,
 `    if (!current()) return;
    if (!docente) {`,
 `    if (!current()) { window.__APD_LAB_PERF.discard(apdLabRun); return; }
    if (!docente) {
      window.__APD_LAB_PERF.discard(apdLabRun);`,
 "drop obsolete user data on profile load");
candidate=exactlyOnce(candidate,
 `    cargarPrefsEnFormulario({ preferencias });`,
 `    window.__APD_LAB_PERF.markProfile(apdLabRun);
    cargarPrefsEnFormulario({ preferencias });`,
 "time authenticated profile rendered");
candidate=exactlyOnce(candidate,
 `    void alertasPromise.then(result => {
      if (!current()) return;`,
 `    void alertasPromise.then(result => {
      if (!current()) { window.__APD_LAB_PERF.discard(apdLabRun); return; }`,
 "discard obsolete alert response");
candidate=exactlyOnce(candidate,
 `        renderAlertasAPD([]);
        renderEstadisticasPanel(null, ultimoAcceso);`,
 `        renderAlertasAPD([]);
        window.__APD_LAB_PERF.finish(apdLabRun, "plan_inactive");
        renderEstadisticasPanel(null, ultimoAcceso);`,
 "plan access meter");
candidate=exactlyOnce(candidate,
 `        renderEstadisticasPanel(null, ultimoAcceso, true);
        return;`,
 `        renderEstadisticasPanel(null, ultimoAcceso, true);
        window.__APD_LAB_PERF.finish(apdLabRun, "api_error");
        return;`,
 "api error meter");
candidate=exactlyOnce(candidate,
 `      renderAlertasAPD(items);
      renderEstadisticasPanel(planActual?.access_active === false ? null : items.length, ultimoAcceso);`,
 `      renderAlertasAPD(items);
      window.__APD_LAB_PERF.finish(apdLabRun, items.length ? "rendered" : "no_matches");
      renderEstadisticasPanel(planActual?.access_active === false ? null : items.length, ultimoAcceso);`,
 "first alert paint meter");
candidate=exactlyOnce(candidate,
 `  } catch (err) {
    if (!current()) return;
    console.error("ERROR CARGANDO PANEL:", err);`,
 `  } catch (err) {
    if (!current()) { window.__APD_LAB_PERF.discard(apdLabRun); return; }
    window.__APD_LAB_PERF.finish(apdLabRun, "profile_error");
    console.error("ERROR CARGANDO PANEL:", err);`,
 "profile error meter");
const path="tmp/apd-alerts-performance/app_v2_telemetry_candidate.js";
mkdirSync(dirname(path),{recursive:true});
writeFileSync(path,candidate);
console.log(JSON.stringify({candidate:path,production_html_untouched:true,
  sampled_only_on_local_browser:true,
  remote_telemetry:false,number_of_endpoint_changes:0,
  sample_contains_no_auth_or_pii:true}));

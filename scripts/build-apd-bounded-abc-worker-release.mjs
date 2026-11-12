/* Candidate ONLY: a conservative performance patch for the existing Worker.
 * Never modifies worker-live/ or deploys. Emits a disposable candidate to tmp/.
 * - Fetches at most 2 ABC districts concurrently, keeping original district order.
 * - Starts independent PID lookup while catalog/ABC requests are pending.
 * - Keeps all matching, filtering, plan checks and response fields unchanged.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
const source=readFileSync("worker-live/worker_hotfix.js","utf8");
function replaceExactlyOnce(text,before,after,label){
 const n=text.split(before).length-1;
 if(n!==1)throw Error(label+": expected exactly 1 source match, found "+n);
 return text.replace(before,after);
}
const districtBefore=`  const debugDistritos = [];
  for (const distritoAPD of distritos) {
    const info = await traerOfertasAPDDeUnDistrito(distritoAPD);`;
const districtAfter=`  const debugDistritos = [];
  // Bounded GET concurrency; result aggregation remains in original district order.
  const districtResults = new Array(distritos.length);
  let districtCursor = 0;
  let districtFailed = false;
  let districtFailure;
  async function fetchNextDistrict() {
    while (!districtFailed && districtCursor < distritos.length) {
      const index = districtCursor++;
      try {
        districtResults[index] = await traerOfertasAPDDeUnDistrito(distritos[index]);
      } catch (error) {
        // Stop scheduling more ABC requests after the first observed error.
        // Allow already-running district GETs to settle; never hide the error.
        if (!districtFailed) {
          districtFailure = error;
          districtFailed = true;
        }
        return;
      }
    }
  }
  await Promise.all(Array.from({
    length: Math.min(2, distritos.length)
  }, () => fetchNextDistrict()));
  if (districtFailed) throw districtFailure;
  for (let index = 0; index < distritos.length; index++) {
    const distritoAPD = distritos[index];
    const info = districtResults[index];`;
const oldPid=`  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const { ofertas, debugDistritos } = await traerOfertasAPDPorDistritos(prefsCanon);
  const pidData = await obtenerUltimaPidGuardada(userId).catch(() => null);`;
const newPid=`  // PID is read-only and independent of district fetch. Start early, await later.
  const pidPromise = obtenerUltimaPidGuardada(userId).catch(() => null);
  const catalogos = await cargarCatalogos(env);
  const prefsCanon = canonizarPreferenciasConCatalogo(prefs, catalogos);
  const { ofertas, debugDistritos } = await traerOfertasAPDPorDistritos(prefsCanon);
  const pidData = await pidPromise;`;
let candidate=replaceExactlyOnce(source,districtBefore,districtAfter,"district bounded fetch");
candidate=replaceExactlyOnce(candidate,oldPid,newPid,"PID asynchronous overlap");
const output="tmp/apd-bounded-abc-worker-release/worker_hotfix.js";
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,candidate);
console.log(JSON.stringify({
 candidate_only:true,production_source_unchanged:true,
 output,max_inflight_abc_districts:2,
 no_cache_of_user_alerts:true,
 expected_behavior:"same results, original district order, faster on multi-district latency",
 benchmark_actual_user_latency_available:false
}));

/* Build a SECOND, non-deployable privacy candidate from the performance
 * candidate already emitted into tmp/. The published Worker is never changed.
 * This proposal deliberately substitutes free-text observations with a notice.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {SAFE_RAW_FIELD_KEYS,OBSERVATION_NOTICE} from "./apd-alert-payload-minimization.mjs";
const originalPath="tmp/apd-alerts-performance/worker_hotfix.js";
const input=readFileSync(originalPath,"utf8");
function replaceExactlyOnce(source,needle,replacement,name){
 const count=source.split(needle).length-1;
 if(count!==1)throw Error(name+": expected one target in candidate, found "+count);
 return source.replace(needle,replacement);
}
const safeCode=`
const APD_SAFE_ALERT_FIELDS = Object.freeze(${JSON.stringify(SAFE_RAW_FIELD_KEYS)});
const APD_OBSERVATION_NOTICE = ${JSON.stringify(OBSERVATION_NOTICE)};
function apdSafeObservationNotice(value) {
  return typeof value==="string" && value.trim() ? APD_OBSERVATION_NOTICE : "";
}
function apdMinimizedRawAlertOffer(original) {
  if (!original || typeof original!=="object" || Array.isArray(original)) return {};
  const safe = {};
  for (const key of APD_SAFE_ALERT_FIELDS) {
    const value = original[key];
    if (typeof value==="string" || typeof value==="number" || typeof value==="boolean")
      safe[key] = value;
  }
  safe.observaciones=apdSafeObservationNotice(original.observaciones);
  return safe;
}
`;
let result=replaceExactlyOnce(input,
 "function buildAlertItem(oferta, evaluacion, pidInfo = null) {",
 safeCode+"\nfunction buildAlertItem(oferta, evaluacion, pidInfo = null) {",
 "Safe payload helper placement");
result=replaceExactlyOnce(result,
 'observaciones: oferta.observaciones || "",',
 "observaciones: apdSafeObservationNotice(oferta.observaciones),",
 "Safe top-level observation");
result=replaceExactlyOnce(result,
 "    raw: oferta\n  };",
 "    raw: apdMinimizedRawAlertOffer(oferta)\n  };",
 "Minimized nested source offer");
const out="tmp/apd-alerts-performance/worker_privacy_candidate.js";
writeFileSync(out,result);
console.log(JSON.stringify({
 output:out,experimental_only:true,production_worker_unchanged:true,
 raw_field_count:SAFE_RAW_FIELD_KEYS.length,
 free_text_observations_in_auto_alerts:false,
 official_source_text_modified:false,
 real_user_payload_included:false
}));

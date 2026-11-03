/* Generate a 3rd standalone Worker candidate, never modify canonical source.
 * Includes bounded parallel districts, privacy-minimized alert payload, and
 * Published-only fully projected cursor. NOT deployable by this builder.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";
const input=readFileSync("tmp/apd-alerts-performance/worker_privacy_candidate.js","utf8");
const helperSource=readFileSync("scripts/apd-fetch-published-district-lab.mjs","utf8");
const from="async function traerOfertasAPDDeUnDistrito(distrito) {";
const start=input.indexOf(from);
const end=input.indexOf("\n__name(traerOfertasAPDDeUnDistrito,",start);
if(start<0||end<=start||input.indexOf(from,start+1)!==-1)
 throw Error("Cannot safely locate exactly one legacy district loader");
if(input.includes("const PUBLIC_ALERT_FIELDS ="))
 throw Error("Potential conflicting published-only field constant");
const expected=helperSource
 .replace('import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";\n',"")
 .replace("export async function apdFetchPublishedOnlyDistrict(","async function apdFetchPublishedOnlyDistrict(");
if(expected.includes("export async function ")||expected.includes("import {"))
 throw Error("Standalone helper could not be inlined safely");
const candidateHelper=`
// PILOT ONLY: fail-closed full coverage of Published offers, no CUIL projection.
const PUBLIC_ALERT_FIELDS=Object.freeze(${JSON.stringify(PUBLIC_ALERT_FIELDS)});
${expected}
`;
const fn=`async function traerOfertasAPDDeUnDistrito(distrito) {
  return apdFetchPublishedOnlyDistrict({
    district:distrito,fetchImpl:fetch,
    normalizeDistrict:normDistritoABC,
    districtVariants:districtQueryVariants,
    escapeSolr:escaparSolr,
    keyFromOffer:buildSourceOfferKeyFromOferta,
    rows:100,maxPages:12
  });
}`;
const output=input.slice(0,start)+candidateHelper+"\n"+fn+input.slice(end);
const dest="tmp/apd-alerts-performance/worker_published_minimized_candidate.js";
writeFileSync(dest,output);
console.log(JSON.stringify({
  output:dest,production_source_changed:false,automatic_deployment:false,
  district_get_concurrency_limit:2,
  published_source_cursor_max_pages:12,source_page_size:100,
  projected_fields:PUBLIC_ALERT_FIELDS.length,personal_fields_returned_to_client:false,
  server_side_observations_in_memory_only:true,
  fails_closed_on_partial_source:true
}));

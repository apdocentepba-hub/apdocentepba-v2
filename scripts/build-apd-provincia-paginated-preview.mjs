import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {pathToFileURL} from "node:url";

const FUNCTION_ANCHOR="var worker_hotfix_default = {";
const ROUTE_ANCHOR='    if (path === ${API_URL_PREFIX3}/provincia/resumen';
const EXACT_ROUTE='    if (path === `${API_URL_PREFIX3}/provincia/resumen` && request.method === "GET") {';
const EXPORT_ANCHOR="export async function handleProvinciaResumenPaginadoPreview(";
function once(source,text,label){
  const count=source.split(text).length-1;
  if(count!==1)throw Error(label+": expected single anchor, found "+count);
}
export function buildPaginatedProvinciaPreview(live,hook){
  if(live.includes("APD_PROVINCIA_PAGINATION_ENABLED") ||
     live.includes("handleProvinciaResumenPaginadoPreview"))throw Error("Already integrated");
  once(live,FUNCTION_ANCHOR,"worker outer export");
  once(live,EXACT_ROUTE,"province router");
  once(hook,EXPORT_ANCHOR,"hook export");
  if(/^\s*import\s/m.test(hook))throw Error("Hook must have no imports");
  for(const required of ["async function obtenerScanState(env)",
    "async function supabaseSelect(env, query)",
    "function buildProvinciaResumenPayload(rows, days, state)",
    "function json2(data, status = 200)"]) {
    if(!live.includes(required))throw Error("Missing dependency: "+required);
  }
  const functionBody=hook.replace(EXPORT_ANCHOR,"async function handleProvinciaResumenPaginadoPreview(");
  const withHelper=live.replace(FUNCTION_ANCHOR,functionBody+"\n"+FUNCTION_ANCHOR);
  const newRoute=[
    '    if (path === `${API_URL_PREFIX3}/provincia/resumen` && request.method === "GET" &&',
    '        env?.APD_PROVINCIA_PAGINATION_ENABLED === "true") {',
    '      return await handleProvinciaResumenPaginadoPreview(url,env,{',
    '        getScanState: obtenerScanState, supabaseSelect,',
    '        buildSummary: buildProvinciaResumenPayload, json: json2',
    '      });',
    '    }',
    EXACT_ROUTE
  ].join("\n");
  return withHelper.replace(EXACT_ROUTE,newRoute);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const target=resolve(process.argv[2]||"tmp/apd-provincia-page/preview.mjs");
  mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,buildPaginatedProvinciaPreview(
    readFileSync("worker-live/worker_hotfix.js","utf8"),
    readFileSync("worker-live/apd_provincia_summary_pagination_hook.mjs","utf8")));
  console.log("Generated un-deployed preview: "+target);
}

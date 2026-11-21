/* Generates a temporary Wrangler config for ZERO-traffic Worker-version upload.
 * The checked-in wrangler.toml omits an active cron; do not use it for upload.
 * Read-only manifest, no secrets or account values are written.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
export const OUTPUT="tmp/apd-bounded-abc-worker-release/wrangler.zero-traffic.toml";
export function generate({manifest=JSON.parse(readFileSync("worker-live/manifest.json","utf8")),output=OUTPUT}={}){
 assert.equal(manifest.worker_name,"ancient-wildflower-cd37");
 assert.equal(manifest.main_module,"worker_hotfix.js");
 assert.equal(manifest.compatibility_date,"2026-04-01");
 const schedules=manifest.schedules??[];
 const expected=["0 01 * * *","0 17 * * *","0 21 * * *","1-59/2 * * * *"];
 assert.deepEqual([...schedules].sort(),[...expected].sort(),
   "STOP: expected four production crons; refuse upload when manifest drifts");
 const kv=(manifest.bindings??[]).filter(b=>b.type==="kv_namespace");
 assert.equal(kv.length,1,"Unexpected KV binding count");
 assert.equal(kv[0].name,"EMAIL_SWEEP_STATE");
 assert.match(String(kv[0].namespace_id||""),/^[a-f0-9]{32}$/i);
 assert.equal((manifest.bindings??[]).length,29,"STOP: expected 29 active bindings");
 const text=[
  "# GENERATED FOR ZERO-TRAFFIC UPLOAD ONLY; DO NOT DEPLOY",
  'name = "ancient-wildflower-cd37"',
  'main = "worker_hotfix.js"',
  'compatibility_date = "2026-04-01"',
  "workers_dev = true",
  "keep_vars = true",
  "[observability]",
  "enabled = true",
  "[triggers]",
  "crons = "+JSON.stringify(schedules),
  "[[kv_namespaces]]",
  'binding = "EMAIL_SWEEP_STATE"',
  "id = "+JSON.stringify(kv[0].namespace_id),
  ""
 ].join("\n");
 assert.doesNotMatch(text,/SUPABASE_SERVICE_ROLE_KEY|BREVO_API_KEY|MERCADOPAGO_ACCESS_TOKEN|WHATSAPP_ACCESS_TOKEN/);
 mkdirSync(dirname(output),{recursive:true});
 writeFileSync(output,text);
 return {output,trigger_count:schedules.length,required_bindings:manifest.bindings.length,
         secret_values_written:false,uses_keep_vars:true,production_config_file_modified:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 console.log("APD_ZERO_TRAFFIC_CONFIG_OK "+JSON.stringify(generate()));
}

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generate} from "./build-apd-worker-zero-traffic-config.mjs";
const manifest=JSON.parse(readFileSync("worker-live/manifest.json","utf8"));
test("temp Wrangler config retains four active cron triggers and no secret values",()=>{
 const r=generate();
 const text=readFileSync(r.output,"utf8");
 assert.equal(r.trigger_count,4);
 assert.equal(r.required_bindings,29);
 assert.match(text,/keep_vars = true/);
 assert.match(text,/1-59\/2 \* \* \* \*/);
 assert.match(text,/0 21 \* \* \*/);
 assert.match(text,/\[\[kv_namespaces\]\]/);
 assert.match(text,/binding = "EMAIL_SWEEP_STATE"/);
 for(const k of ["SUPABASE_SERVICE_ROLE_KEY","BREVO_API_KEY","WHATSAPP_ACCESS_TOKEN","MERCADOPAGO_ACCESS_TOKEN"]){
  assert.ok(!text.includes(k),"Never bake secret names or values into a staging config");
 }
});
test("refuse stale manifest with only three cron triggers",()=>{
 const malformed={...manifest,schedules:manifest.schedules.slice(0,3)};
 assert.throws(()=>generate({manifest:malformed}),/expected four production crons/);
});
test("refuse altered binding count or KV resource",()=>{
 assert.throws(()=>generate({manifest:{...manifest,bindings:manifest.bindings.slice(0,28)}}),/29 active bindings/);
 const changes=manifest.bindings.map(b=>b.name==="EMAIL_SWEEP_STATE"?{...b,namespace_id:"bad"}:b);
 assert.throws(()=>generate({manifest:{...manifest,bindings:changes}}),/regular expression/);
});
test("upload script requires dedicated authorized branch and never invokes deploy",()=>{
 const s=readFileSync("scripts/upload-apd-worker-zero-traffic-once.mjs","utf8");
 assert.match(s,/refs\/heads\/staging\/apd-worker-zero-traffic-20261104/);
 assert.match(s,/APD_ZERO_TRAFFIC_UPLOAD_APPROVED/);
 assert.match(s,/--keep-vars/);
 assert.match(s,/--strict/);
 assert.match(s,/assert\.equal\(serving\[0\]\.version_id,before\.active_version_id/);
 assert.match(s,/if\(uploadArgs\.includes\("deploy"\)\)/);
 assert.doesNotMatch(s,/execFileSync\("wrangler",\["deploy"/);
});

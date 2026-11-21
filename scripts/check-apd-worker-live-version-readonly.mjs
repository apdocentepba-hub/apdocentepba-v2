/* READ-ONLY verification against Cloudflare's *currently active* Worker version.
 * NOT a deployment, no traffic changes. No secrets, bindings' values, accounts,
 * or bundled module bytes are logged or persisted.
 *
 * CI usage (requires repo secrets):
 * CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *   node scripts/check-apd-worker-live-version-readonly.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const baseUrl="https://api.cloudflare.com/client/v4";
const ID=/^[a-f0-9]{32}$/i;
const VERSION=/^[a-f0-9-]{36}$/i;
function requireApi(json,description){
 if(!json||json.success!==true||!json.result)throw new Error(description+" failed (no raw response retained)");
 return json.result;
}
export async function checkLive({env=process.env,request=fetch,manifestOverride=null}={}){
 const token=String(env.CLOUDFLARE_API_TOKEN||"").trim();
 assert.ok(token,"Missing CLOUDFLARE_API_TOKEN: cannot attest live Worker; fail closed");
 const manifest=manifestOverride??JSON.parse(readFileSync("worker-live/manifest.json","utf8"));
 assert.equal(manifest.worker_name,"ancient-wildflower-cd37");
 assert.equal(manifest.main_module,"worker_hotfix.js");
 assert.match(String(manifest.version_id||""),VERSION);
 const get=async path=>{
  const url=new URL(baseUrl+path);
  assert.equal(url.protocol,"https:");
  assert.equal(url.hostname,"api.cloudflare.com");
  const response=await request(url.toString(),{
   method:"GET",
   redirect:"error",cache:"no-store",
   headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
   signal:AbortSignal.timeout(20000)
  });
  assert.equal(response.status,200,"Cloudflare GET failed at "+url.pathname);
  return requireApi(await response.json(),url.pathname);
 };
 const accounts=await get("/accounts?per_page=50");
 assert.ok(Array.isArray(accounts),"Cloudflare accessible accounts missing");
 let account=String(env.CLOUDFLARE_ACCOUNT_ID||"").trim();
 if(account){
  assert.match(account,ID,"Invalid explicitly configured account identifier");
  assert.ok(accounts.some(a=>a.id===account),"Configured account is not accessible");
 }else{
  assert.equal(accounts.length,1,"Ambiguous Cloudflare accounts; configure CLOUDFLARE_ACCOUNT_ID");
  account=accounts[0].id;
  assert.match(account,ID);
 }
 const name=manifest.worker_name;
 const deployment=await get("/accounts/"+account+"/workers/scripts/"+name+"/deployments");
 const rows=deployment.deployments??[];
 assert.ok(Array.isArray(rows)&&rows.length>0,"No active Cloudflare Worker deployments");
 const traffic=(rows[0].versions??[]).filter(v=>Number(v.percentage)>0);
 assert.equal(traffic.length,1,"Multiple traffic-serving versions; fail closed");
 assert.equal(Number(traffic[0].percentage),100,"Active Worker does not receive 100% of traffic");
 const liveVersion=String(traffic[0].version_id||"");
 assert.match(liveVersion,VERSION,"Invalid active Worker version identifier");
 assert.equal(liveVersion,manifest.version_id,
  "STOP: live Worker version differs from pinned canonical capture; refresh from the active version before proceeding");
 const active=await get("/accounts/"+account+"/workers/workers/"+name+"/versions/"+liveVersion+"?include=modules");
 assert.equal(active.id,liveVersion,"Active version detail mismatch");
 assert.equal(active.main_module,manifest.main_module,"Active main module drifted");
 assert.ok(Array.isArray(active.modules)&&active.modules.length>0,"No active Worker modules");
 const canonical=manifest.modules??[];
 assert.deepEqual(active.modules.map(x=>x.name).sort(),canonical.map(x=>x.name).sort(),"Live module set mismatch");
 for(const stored of canonical){
  const live=active.modules.find(x=>x.name===stored.name);
  assert.ok(live&&typeof live.content_base64==="string","Live source bytes unavailable; do not infer equivalence");
  const actualHash=hash(Buffer.from(live.content_base64,"base64"));
  const expectedHash=stored.module_sha256||stored.sha256;
  assert.match(String(expectedHash||""),/^[a-f0-9]{64}$/i);
  assert.equal(actualHash,expectedHash,"STOP: active Worker source SHA-256 mismatch for "+stored.name);
 }
 const schedules=await get("/accounts/"+account+"/workers/scripts/"+name+"/schedules");
 assert.ok(Array.isArray(schedules.schedules),"Active Cron Triggers could not be read");
 const expectedCron=[...(manifest.schedules??[])].sort();
 const activeCron=schedules.schedules.map(x=>String(x.cron||"")).sort();
 assert.ok(expectedCron.length>0,"Canonical manifest lacks cron triggers");
 assert.deepEqual(activeCron,expectedCron,"STOP: live Cron Triggers differ from canonical manifest");
 const bindingList=active.bindings??[];
 assert.ok(Array.isArray(bindingList),"Active resource binding metadata missing");
 const bindings=new Map(bindingList.map(b=>[String(b.name)+":"+String(b.type),b]));
 for(const expected of manifest.bindings??[]){
  const key=String(expected.name)+":"+String(expected.type);
  assert.ok(bindings.has(key),"STOP: required Worker binding missing: "+expected.name);
  const live=bindings.get(key);
  if(expected.namespace_id){
   assert.equal(live.namespace_id||live.id,expected.namespace_id,
    "STOP: Worker resource namespace changed: "+expected.name);
  }
 }
 return {
  live_verified:true,
  active_version_id:liveVersion,
  compared_to_capture_at:manifest.captured_at??null,
  active_module_count:active.modules.length,
  verified_required_binding_count:(manifest.bindings??[]).length,
  verified_live_schedule_count:activeCron.length,
  active_worker_source_sha256:hash(Buffer.from(active.modules.find(x=>x.name===manifest.main_module).content_base64,"base64")),
  read_only:true,production_mutation:false,account_credentials_logged:false
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  console.log("APD_CLOUDFLARE_LIVE_VERSION_READONLY_OK "+JSON.stringify(await checkLive()));
 }catch(error){
  console.error("APD_CLOUDFLARE_LIVE_VERSION_READONLY_FAIL "+String(error?.message||"unknown error"));
  process.exitCode=1;
 }
}

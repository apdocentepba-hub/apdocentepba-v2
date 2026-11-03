/* Isolated end-to-end preflight -> PostgreSQL 17/PostgREST transactions.
 * Every identity and credential in this test is fictional and CI-local.
 * Runs ONLY against loopback:3300, never ABC, Supabase or Cloudflare.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {prepareGlobalSourcePairsForLab} from "./apd-global-source-pair-stage-gate.mjs";
import {prepareProjectedGlobalPairsForIsolatedPg17} from "./apd-global-projected-content-preflight-lab.mjs";
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"CI-only JWT secret required");
const encode=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
const epoch=Math.floor(Date.now()/1000);
const unsigned=encode({alg:"HS256",typ:"JWT"})+"."+
 encode({role:"apd_api_scanner",iat:epoch,exp:epoch+600});
const bearer=unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
const base=new URL("http://127.0.0.1:3300/");
assert.equal(base.hostname,"127.0.0.1");
const fakeOffers=[
 {district:"MORENO",sourceTotal:1,pairs:[
  {id:"SOLR_FAKE_PRESTAGE_9401",source_offer_key:"D_9401"}]},
 {district:"TIGRE",sourceTotal:1,pairs:[
  {id:"SOLR_FAKE_PRESTAGE_9402",source_offer_key:"D_9402"}]}
];
const cloned=()=>JSON.parse(JSON.stringify(fakeOffers));
let requestCount=0;
async function rpc(name,body){
 assert.ok(["create_capture","stage_capture_page","seal_capture",
  "register_source_pairs","revalidate_source_pairs",
  "commit_capture","capture_status"].includes(name));
 requestCount++;
 const response=await fetch(new URL("rpc/"+name,base),{
  method:"POST",credentials:"omit",redirect:"error",
  headers:{Authorization:"Bearer "+bearer,
   "Content-Type":"application/json","Accept":"application/json",
   "Content-Profile":"apd_scanner_api","Accept-Profile":"apd_scanner_api",
   Prefer:"return=representation"},
  body:JSON.stringify(body)
 });
 assert.equal(response.ok,true,"Fake local PostgreSQL "+name+" HTTP "+response.status);
 return response.json();
}
// Both source passes are synthetic and independent; content must be stable
// before any request reaches disposable PG17/PostgREST.
const fakeProjected=Object.fromEntries(fakeOffers.map(({district,pairs})=>[
 district,pairs.map(({id,source_offer_key})=>({
  id,iddetalle:source_offer_key.slice(2),idoferta:"FAKE_"+source_offer_key,
  descdistrito:district,estado:"Publicada",
  descripcioncargo:"INFORMATICA",descripcionarea:"LABORATORIO",
  descnivelmodalidad:"TECNICA",escuela:"ESCUELA FICTICIA",
  turno:"TM",jornada:"SIMPLE",hsmodulos:"2",cursodivision:"1 A",
  supl_desde:"",supl_hasta:"",finoferta:"2099-12-31",
  ult_movimiento:"2026-11-02T16:00:00Z",
  observaciones:"CI-ONLY FICTITIOUS TEXT"
 }))
]));
const readProjected=async district=>{
 const docs=structuredClone(fakeProjected[district]);
 return {docs,totalBruto:docs.length,totalFiltrado:docs.length};
};
const good=await prepareProjectedGlobalPairsForIsolatedPg17({
 districts:fakeOffers.map(x=>x.district),
 readDistrict:readProjected,
 keyFromOffer:doc=>"D_"+doc.iddetalle
});
assert.equal(good.summary.source_content_hashes_checked,true);
let projectedPass=0;
await assert.rejects(()=>prepareProjectedGlobalPairsForIsolatedPg17({
 districts:fakeOffers.map(x=>x.district),
 readDistrict:async district=>{
  if(district==="MORENO")projectedPass++;
  const result=await readProjected(district);
  if(projectedPass===2 && district==="MORENO")
   result.docs[0].observaciones="CHANGED AT SAME SOURCE COUNT";
  return result;
 },
 keyFromOffer:doc=>"D_"+doc.iddetalle
}),/source content drifted/);

assert.equal(good.summary.total_worker_keys,2);
assert.equal(good.summary.deploy_authorized,false);
// Prove adversarial input never triggers a single remote write.
for(const modify of [
  x=>x[1].pairs[0].source_offer_key="D_9401",
  x=>x[1].pairs[0].id="SOLR_FAKE_PRESTAGE_9401"
]){
 const malicious=cloned();modify(malicious);
 assert.throws(()=>prepareGlobalSourcePairsForLab({
  first:malicious,second:JSON.parse(JSON.stringify(malicious))
 }),/collision/);
}
const drifting=cloned();drifting[1].pairs[0].source_offer_key="D_9499";
assert.throws(()=>prepareGlobalSourcePairsForLab({
 first:cloned(),second:drifting
}),/mapping drifted/);
const tampered=structuredClone(good.stagedRowsForIsolatedPg17("MORENO",["D_9401"]));
tampered[0].cargo="CHANGED_AFTER_SOURCE_AUDIT";
assert.throws(()=>good.validateStagedRowsForIsolatedPg17(
 "MORENO",["D_9401"],tampered),/outgoing staging content drifted/);
assert.equal(requestCount,0,"Unsafe source snapshots initiated an API request");
const rows=[
 {district:"MORENO",key:"D_9401",run:"00000000-0000-0000-0000-000000009401"},
 {district:"TIGRE",key:"D_9402",run:"00000000-0000-0000-0000-000000009402"}
];

for(const {district,key,run} of rows){
 const pairs=good.pairsForIsolatedStaging(district,[key]);
 assert.equal(pairs.length,1);
 assert.equal(await rpc("create_capture",{
  p_run_id:run,p_district:district,p_expected_pages:1,
  p_started_at:"2026-11-02T20:00:00Z",p_captured_at:"2026-11-02T20:01:00Z"
 }),run);
 assert.equal(await rpc("stage_capture_page",{
  p_run_id:run,p_page_index:0,p_source_total:pairs.length,
  p_rows:good.validateStagedRowsForIsolatedPg17(
   district,[key],good.stagedRowsForIsolatedPg17(district,[key]))
 }),1);
 assert.equal(await rpc("seal_capture",{p_run_id:run}),1);
 assert.equal(await rpc("register_source_pairs",{
  p_run_id:run,p_pairs:pairs
 }),1);
 assert.equal(await rpc("revalidate_source_pairs",{
  p_run_id:run,p_pairs:pairs
 }),1);
 assert.deepEqual(await rpc("commit_capture",{p_run_id:run}),[
  {upserted:1,pruned:0}
 ]);
}
console.log(JSON.stringify({
 proof:"global_two_pass_preflight_to_disposable_pg17_staging",
 fake_districts:2,
 verified_fake_source_pairs:good.summary.total_worker_keys,
 pre_api_collision_and_mapping_rejections:3,
 commits_verified:2,
 upserts_verified:2,
 pruned:0,
 localhost_only:true,
 no_actual_ABC_records:true,
 no_actual_supabase_connection:true,
 source_ids_or_worker_keys_logged:false,
 projected_content_hashes_checked:true,
 staged_rows_derived_from_verified_source:true,
 outgoing_staging_payload_validated:true,
 raw_source_content_excluded_from_staging:true,
 production_modified:false
}));

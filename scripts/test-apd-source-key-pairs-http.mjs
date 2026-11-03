/* Disposable PG17 + PostgREST: source Solr IDs differ from Worker keys.
 * Uses only fictitious rows. This test NEVER calls ABC, Supabase or Cloudflare.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"Disposable test JWT secret missing");
const enc=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
const epoch=Math.floor(Date.now()/1000);
const unsigned=enc({alg:"HS256",typ:"JWT"})+"."+enc({role:"apd_api_scanner",iat:epoch,exp:epoch+600});
const token=unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
const base="http://127.0.0.1:3300/";
async function rpc(name,body,{expectFailure=false,bearer=token}={}){
 const res=await fetch(new URL("rpc/"+name,base),{
  method:"POST",credentials:"omit",redirect:"error",
  headers:{"Authorization":bearer?"Bearer "+bearer:"",
   "Content-Type":"application/json","Accept":"application/json",
   "Content-Profile":"apd_scanner_api","Accept-Profile":"apd_scanner_api",
   "Prefer":"return=representation"},
  body:JSON.stringify(body)
 });
 const bodyText=await res.text();
 if(expectFailure){assert.ok(!res.ok,name+" unexpectedly succeeded");return res.status;}
 assert.ok(res.ok,name+" failed HTTP "+res.status+" (body omitted)");
 return JSON.parse(bodyText);
}
const run1="00000000-0000-0000-0000-000000001251";
const run2="00000000-0000-0000-0000-000000001252";
const start="2026-11-02T17:00:00Z",finish="2026-11-02T17:01:00Z";
const makeOffer=(id,key,district)=>({
 source_offer_key:key,idoferta:"FAKE_"+id,
 iddetalle:key.slice(2),estado:"Publicada",distrito:district,
 escuela:"ESCUELA DE PRUEBA",cargo:"INFORMATICA",area:"PRUEBA",
 nivel_modalidad:"TECNICA",turno:"TM",jornada:"SIMPLE",hsmodulos:"2",
 cursodivision:"1 A",supl_desde:"",supl_hasta:"",finoferta:"2099-12-31",
 ult_movimiento:"2026-11-02T16:00:00Z",raw:{test:true,solr_id:id}
});
const create=async(run,district,rows)=>{
 assert.equal(await rpc("create_capture",{
  p_run_id:run,p_district:district,p_expected_pages:1,
  p_started_at:start,p_captured_at:finish
 }),run);
 assert.equal(await rpc("stage_capture_page",{
  p_run_id:run,p_page_index:0,p_source_total:rows.length,p_rows:rows
 }),1);
 assert.equal(await rpc("seal_capture",{p_run_id:run}),rows.length);
};
const pairs=[
 {id:"SOLR_ABC_1001",source_offer_key:"D_1001"},
 {id:"SOLR_ABC_1002",source_offer_key:"D_1002"}
];
await create(run1,"LA MATANZA",[
 makeOffer(pairs[0].id,pairs[0].source_offer_key,"LA MATANZA"),
 makeOffer(pairs[1].id,pairs[1].source_offer_key,"LA MATANZA")
]);
// Two old RPCs were privileged in previous pilot. They must no longer work.
assert.ok((await rpc("register_source_identity",{
 p_run_id:run1,p_ids:["D_1001","D_1002"]
},{expectFailure:true}))>=400);
assert.ok((await rpc("revalidate_source_identity",{
 p_run_id:run1,p_ids:["D_1001","D_1002"]
},{expectFailure:true}))>=400);
assert.equal(await rpc("commit_capture",{p_run_id:run1},{expectFailure:true}),400);
// Equal total but duplicate Solr ID or key must reject registration.
for(const invalid of [
 [pairs[0],{id:pairs[0].id,source_offer_key:"D_1002"}],
 [pairs[0],{id:"SOLR_DIFFERENT",source_offer_key:pairs[0].source_offer_key}],
 [pairs[0],{id:"SOLR_DIFFERENT",source_offer_key:"O_2000"}],
 [pairs[0],{id:"SOLR_DIFFERENT",source_offer_key:"D_999999"}]
]){
 // Last sample is a valid pair but doesn't cover the second staged offer.
 await rpc("register_source_pairs",{p_run_id:run1,p_pairs:invalid},{expectFailure:true});
}
assert.equal(await rpc("register_source_pairs",{p_run_id:run1,p_pairs:pairs}),2);
assert.equal(await rpc("commit_capture",{p_run_id:run1},{expectFailure:true}),400);
// Same public Solr ID, different Worker key (same count): must fail.
await rpc("revalidate_source_pairs",{p_run_id:run1,
 p_pairs:[pairs[0],{...pairs[1],source_offer_key:"D_1999"}]
},{expectFailure:true});
// Same keys but different Solr source document also fails.
await rpc("revalidate_source_pairs",{p_run_id:run1,
 p_pairs:[pairs[0],{...pairs[1],id:"SOLR_REPLACED"}]
},{expectFailure:true});
await rpc("commit_capture",{p_run_id:run1},{expectFailure:true});
// Only exact pairs allow commit, order independent.
assert.equal(await rpc("revalidate_source_pairs",{p_run_id:run1,p_pairs:[...pairs].reverse()}),2);
assert.deepEqual(await rpc("commit_capture",{p_run_id:run1}),[{upserted:2,pruned:0}]);
await rpc("commit_capture",{p_run_id:run1},{expectFailure:true});

// Other district tries to claim an existing Worker key: no reassignment.
const hostilePair={id:"SOLR_OTHER_DISTRICT",source_offer_key:"D_1001"};
await create(run2,"AVELLANEDA",[
 makeOffer(hostilePair.id,hostilePair.source_offer_key,"AVELLANEDA")
]);
assert.equal(await rpc("register_source_pairs",{p_run_id:run2,p_pairs:[hostilePair]}),1);
assert.equal(await rpc("revalidate_source_pairs",{p_run_id:run2,p_pairs:[hostilePair]}),1);
await rpc("commit_capture",{p_run_id:run2},{expectFailure:true});
// Unauthenticated requests cannot even register or revalidate identities.
await rpc("register_source_pairs",{p_run_id:run2,p_pairs:[hostilePair]},
 {expectFailure:true,bearer:null});
console.log("APD_PG17_PAIR_IDENTITY_GATE_PASSED: distinct source IDs/Worker keys, duplicate and remap blocked, cross-district rollback, no pruning");

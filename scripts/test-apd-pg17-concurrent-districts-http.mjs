/* All test records, credentials and DB are invented/disposable.
 * Concurrent PostgREST requests to two districts; one forced failure
 * AFTER minimal upsert must roll back completely, with other unaffected.
 * Two districts racing on one source key must yield exactly one winner.
 * Never connects to production and never uses external ABC.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"Fake test-only signing secret absent");
const encode=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
const now=Math.floor(Date.now()/1000);
const unsigned=encode({alg:"HS256",typ:"JWT"})+"."+
  encode({role:"apd_api_scanner",iat:now,exp:now+600});
const bearer=unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
const endpoint="http://127.0.0.1:3300/";
async function rpc(name,args){
 const response=await fetch(new URL("rpc/"+name,endpoint),{
   method:"POST",credentials:"omit",redirect:"error",
   headers:{"Authorization":"Bearer "+bearer,
    "Content-Type":"application/json","Accept":"application/json",
    "Content-Profile":"apd_scanner_api","Accept-Profile":"apd_scanner_api",
    "Prefer":"return=representation"},
   body:JSON.stringify(args)
 });
 const result=response.ok?await response.json():null;
 return {ok:response.ok,status:response.status,data:result};
}
async function ensure(name,args){
 const outcome=await rpc(name,args);
 assert.equal(outcome.ok,true,name+" failed HTTP "+outcome.status);
 return outcome.data;
}
const UUID=n=>"00000000-0000-0000-0000-"+String(n).padStart(12,"0");
const pair=(id,key)=>({id,source_offer_key:key});
const mockOffer=(source,district)=>({
 source_offer_key:source.source_offer_key,
 idoferta:"FAKE_"+source.id,
 iddetalle:source.source_offer_key.slice(2),
 estado:"Publicada",distrito:district,
 escuela:"ESCUELA FICTICIA",cargo:"INFORMATICA",area:"PRUEBA",
 nivel_modalidad:"TECNICA",turno:"TM",jornada:"SIMPLE",hsmodulos:"2",
 cursodivision:"1 A",supl_desde:"",supl_hasta:"",
 finoferta:"2099-12-31",ult_movimiento:"2026-11-02T17:00:00Z",
 raw:{ci:true,solr_id:source.id}
});
async function prepare({number,district,source,minute}){
 const run=UUID(number);
 const start="2026-11-02T"+String(minute).padStart(2,"0")+":00:00Z";
 const finish="2026-11-02T"+String(minute).padStart(2,"0")+":01:00Z";
 assert.equal(await ensure("create_capture",{
  p_run_id:run,p_district:district,p_expected_pages:1,
  p_started_at:start,p_captured_at:finish
 }),run);
 assert.equal(await ensure("stage_capture_page",{
  p_run_id:run,p_page_index:0,p_source_total:1,
  p_rows:[mockOffer(source,district)]
 }),1);
 assert.equal(await ensure("seal_capture",{p_run_id:run}),1);
 assert.equal(await ensure("register_source_pairs",{
  p_run_id:run,p_pairs:[source]
 }),1);
 assert.equal(await ensure("revalidate_source_pairs",{
  p_run_id:run,p_pairs:[source]
 }),1);
 return run;
}
// Both manifests are ready before either concurrent request is issued.
const deliberateFailure=await prepare({
 number:3001,district:"AVELLANEDA",source:pair("SOLR_FAKE_A","D_7001"),minute:18
});
const independentSuccess=await prepare({
 number:3002,district:"LA MATANZA",source:pair("SOLR_FAKE_B","D_7002"),minute:18
});
const forced=await Promise.all([
 rpc("commit_capture",{p_run_id:deliberateFailure}),
 rpc("commit_capture",{p_run_id:independentSuccess})
]);
assert.equal(forced[0].ok,false,"Fault-injected district must not commit");
assert.equal(forced[1].ok,true,"Unaffected district must commit");
assert.deepEqual(forced[1].data,[{upserted:1,pruned:0}]);

// Shared Worker key between TWO distinct districts, at once.
const sameKey="D_8001";
const left=await prepare({
 number:3003,district:"LA MATANZA",
 source:pair("SOLR_FAKE_C",sameKey),minute:19
});
const right=await prepare({
 number:3004,district:"AVELLANEDA",
 source:pair("SOLR_FAKE_D",sameKey),minute:19
});
const collision=await Promise.all([
 rpc("commit_capture",{p_run_id:left}),
 rpc("commit_capture",{p_run_id:right})
]);
assert.equal(collision.filter(x=>x.ok).length,1,
 "Cross-district same-key concurrent commits must have exactly one winner");
assert.equal(collision.filter(x=>!x.ok).length,1,
 "A concurrent cross-district duplicate must fail closed");
const accepted=collision.find(x=>x.ok);
assert.deepEqual(accepted.data,[{upserted:1,pruned:0}]);
const winnerRun=collision[0].ok?left:right;
const losingRun=collision[0].ok?right:left;
console.log(JSON.stringify({
 scenario_1:{distinct_key_other_district_commit:true,
   injected_failed_district_rejected:!forced[0].ok,
   unaffected_district_upserted:1},
 scenario_2:{same_key_concurrent_winners:1,
   same_key_concurrent_rejected:1},
 disposable_run_ids:{successful_independent:independentSuccess,
   failed_injection:deliberateFailure,winner:winnerRun,loser:losingRun},
 production_modified:false,
 no_pruning:true,
 note:"Lab-only HTTP outcomes; SQL asserts durable transaction state"
}));

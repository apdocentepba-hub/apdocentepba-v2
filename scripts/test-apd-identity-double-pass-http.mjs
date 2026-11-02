/* Real PostgREST + PG17, source identity comparison with equal numFound.
 * All sources and identifiers are fictitious, not from production ABC.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";

const base="http://127.0.0.1:3300/";
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"CI signing secret missing");
const enc=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
const iat=Math.floor(Date.now()/1000);
const unsigned=enc({alg:"HS256",typ:"JWT"})+"."+enc({role:"apd_api_scanner",iat,exp:iat+600});
const auth=unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
const headers={"Authorization":"Bearer "+auth,"Content-Type":"application/json",
  "Accept":"application/json","Accept-Profile":"apd_scanner_api",
  "Content-Profile":"apd_scanner_api","Prefer":"return=representation"};
async function rpc(name,payload,{allowError=false,token=auth}={}){
 const res=await fetch(new URL("rpc/"+name,base),{method:"POST",redirect:"error",
  credentials:"omit",headers:{...headers,...(token?{"Authorization":"Bearer "+token}:{"Authorization":""})},
  body:JSON.stringify(payload)});
 const txt=await res.text();
 if(!res.ok){if(allowError)return {failed:true,http:res.status};
  throw Error("HTTP "+res.status+" "+name+": "+txt.slice(0,250));}
 return JSON.parse(txt);
}
const run="00000000-0000-0000-0000-000000000951";
const start="2026-11-02T16:00:00Z",finished="2026-11-02T16:04:00Z";
const sourceKeys=["TEST_AAA","TEST_BBB"];
const changedKeys=["TEST_AAA","TEST_CCC"]; // Same numFound=2, different identity.
const offer=id=>({
 source_offer_key:id,idoferta:"FAKE_"+id,iddetalle:id,
 estado:"Publicada",distrito:"AVELLANEDA",
 escuela:"ESCUELA FICTICIA",cargo:"INFORMATICA",area:"EDUCACION",
 nivel_modalidad:"TECNICA",turno:"TM",jornada:"SIMPLE",hsmodulos:"2",
 cursodivision:"1 A",supl_desde:"",supl_hasta:"",finoferta:"2099-12-31",
 ult_movimiento:"2026-11-02T12:00:00Z",raw:{test:true,identity:id}
});
assert.equal(await rpc("create_capture",{p_run_id:run,p_district:"AVELLANEDA",
 p_expected_pages:1,p_started_at:start,p_captured_at:finished}),run);
assert.equal(await rpc("stage_capture_page",{p_run_id:run,p_page_index:0,p_source_total:2,
 p_rows:sourceKeys.map(offer)}),1);
assert.equal(await rpc("seal_capture",{p_run_id:run}),2);
// Commit cannot proceed after seal until exact source IDs are independently rechecked.
assert.equal((await rpc("commit_capture",{p_run_id:run},{allowError:true})).failed,true);
assert.equal(await rpc("register_source_identity",{p_run_id:run,p_ids:sourceKeys}),2);
// Still no commit after first manifest pass.
assert.equal((await rpc("commit_capture",{p_run_id:run},{allowError:true})).failed,true);
// Same count, different IDs -> rejected, no verified_at and no writes.
assert.equal((await rpc("revalidate_source_identity",
 {p_run_id:run,p_ids:changedKeys},{allowError:true})).failed,true);
assert.equal((await rpc("commit_capture",{p_run_id:run},{allowError:true})).failed,true);
// Duplicate identities (even if length matches) are rejected.
assert.equal((await rpc("revalidate_source_identity",
 {p_run_id:run,p_ids:["TEST_AAA","TEST_AAA"]},{allowError:true})).failed,true);
// Order is irrelevant; exact membership and uniqueness are required.
assert.equal(await rpc("revalidate_source_identity",
 {p_run_id:run,p_ids:["TEST_BBB","TEST_AAA"]}),2);
assert.deepEqual(await rpc("commit_capture",{p_run_id:run}),[{upserted:2,pruned:0}]);
assert.equal((await rpc("commit_capture",{p_run_id:run},{allowError:true})).failed,true);
// Token without role cannot create identity proof or write offers.
const denied=await rpc("register_source_identity",{p_run_id:run,p_ids:sourceKeys},
 {allowError:true,token:null});
assert.equal(denied.failed,true);
console.log("PASS: two public-index-like snapshots with equal numFound but differing ID sets deny commit; exact second pass allows 2 atomic offers, 0 deletions.");

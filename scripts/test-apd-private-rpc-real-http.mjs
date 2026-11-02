/* Actual HTTP security contract against PG17/PostgREST on localhost only.
 * The only data sent are 650 synthetic offers; no production credentials.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const BASE=new URL("http://127.0.0.1:3300/");
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"Local CI JWT secret required");
const base64url=x=>Buffer.from(x).toString("base64url");
function token(role){
 const head=base64url(JSON.stringify({alg:"HS256",typ:"JWT"}));
 const now=Math.floor(Date.now()/1000);
 const payload=base64url(JSON.stringify({role,iat:now,exp:now+600}));
 const body=head+"."+payload;
 return body+"."+createHmac("sha256",secret).update(body).digest("base64url");
}
const USER=token("apd_api_authenticated");
const SCANNER=token("apd_api_scanner");
const allowHeaders={"Content-Type":"application/json","Content-Profile":"apd_scanner_api",
 "Accept-Profile":"apd_scanner_api","Accept":"application/json","Prefer":"return=representation"};
async function request(path,method="POST",body={},jwt=SCANNER,headers={}){
 const url=new URL(path,BASE);
 assert.equal(url.hostname,"127.0.0.1");
 return fetch(url,{method,redirect:"error",credentials:"omit",headers:{
  ...allowHeaders,...headers,...(jwt?{"Authorization":"Bearer "+jwt}:{})
 },...(method==="POST"?{body:JSON.stringify(body)}:{})});
}
const call=async(name,payload)=>{
 const res=await request("rpc/"+name,"POST",payload);
 const text=await res.text();
 if(!res.ok)throw Error(name+" request failed HTTP "+res.status+": "+text.slice(0,300));
 try{return JSON.parse(text);}catch{throw Error("Invalid JSON response from "+name);}
};
// Anonymous and ordinary authenticated users must never invoke or enumerate capture RPCs.
for(const [label,jwt] of [["anon",null],["authenticated",USER]]){
 for(const fn of ["create_capture","stage_capture_page","seal_capture","commit_capture"]){
  const result=await request("rpc/"+fn,"POST",{},jwt);
  assert.ok(!result.ok,label+" unexpectedly called "+fn+" (HTTP "+result.status+")");
 }
 const probe=await request("runs?select=run_id&limit=1","GET",{},jwt);
 assert.ok(!probe.ok,label+" unexpectedly accessed internal runs table");
}
// Even a scanner token cannot read private tables through the HTTP API.
for(const endpoint of [
 "runs?select=run_id&limit=1",
 "current_offers_full?select=source_offer_key&limit=1",
 "current_offers?select=source_offer_key&limit=1",
 "rpc/finalize_full_district"
]){
 const res=await request(endpoint,endpoint.startsWith("rpc/")?"POST":"GET",{p_run_id:"00000000-0000-0000-0000-000000000925"});
 assert.ok(!res.ok,"Scanner could reach an internal table/private function: "+endpoint);
}
const hidden=await request("current_offers_full?select=source_offer_key","GET",{},
 SCANNER,{"Accept-Profile":"apd_scanner_pilot"});
assert.ok(!hidden.ok,"Scanner must not select unexposed private schema via Accept-Profile");

const RUN="00000000-0000-0000-0000-000000000925";
const start="2026-11-02T16:00:00Z",captured="2026-11-02T16:05:00Z";
const created=await call("create_capture",{
 p_run_id:RUN,p_district:"MATANZA",p_expected_pages:5,
 p_started_at:start,p_captured_at:captured
});
assert.equal(created,RUN);
function offer(index){
 const number=index+1;
 return {
  source_offer_key:"D_"+number,idoferta:"O"+number,iddetalle:String(number),
  estado:"Publicada",distrito:"MATANZA",escuela:"ESCUELA FICTICIA "+number,
  cargo:"INFORMATICA",area:"DOCENCIA",nivel_modalidad:"TECNICA",
  turno:"TT",jornada:"SIMPLE",hsmodulos:"2",cursodivision:"1 A",
  supl_desde:"",supl_hasta:"",finoferta:"2099-12-31",
  ult_movimiento:"2026-11-02T15:00:00Z",raw:{synthetic:true,source:"CI",nested:{n:number}}
 };
}
for(let page=0;page<5;page++){
 const items=Array.from({length:Math.min(150,650-150*page)},(_,j)=>offer(page*150+j));
 const payload={p_run_id:RUN,p_page_index:page,p_source_total:650,p_rows:items};
 assert.equal(await call("stage_capture_page",payload),page+1);
 if(page===0)assert.equal(await call("stage_capture_page",payload),1,"Exact retry must not double-count");
}
assert.equal(await call("seal_capture",{p_run_id:RUN}),650);
const committed=await call("commit_capture",{p_run_id:RUN});
assert.deepEqual(committed,[{upserted:650,pruned:0}]);
const retry=await request("rpc/commit_capture","POST",{p_run_id:RUN});
assert.ok(!retry.ok,"Second finalize must be rejected");
const illegalPrune=await request("rpc/commit_capture","POST",{p_run_id:RUN,p_prune:true});
assert.ok(!illegalPrune.ok,"Exposed commit API must not accept pruning parameter");
console.log("PASS: four API RPCs only, no private table exposure, anon/auth denied, 650 full offers over HTTPS-like local HTTP, no deletions");

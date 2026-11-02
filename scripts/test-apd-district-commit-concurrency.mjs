/* Genuine concurrent HTTP commits against disposable PG17 and PostgREST.
 * Two overlapping MATANZA runs: exactly one may commit. Independently, an
 * AVELLANEDA capture can commit under a different district lock.
 * All records and JWTs are disposable; never query production endpoints.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";

const BASE="http://127.0.0.1:3300/";
const SECRET=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(SECRET&&SECRET.length>=32);
const base64url=x=>Buffer.from(x).toString("base64url");
const now=Math.floor(Date.now()/1000);
const unsigned=base64url(JSON.stringify({alg:"HS256",typ:"JWT"}))+"."+
 base64url(JSON.stringify({role:"apd_api_scanner",iat:now,exp:now+600}));
const token=unsigned+"."+createHmac("sha256",SECRET).update(unsigned).digest("base64url");
const HEADERS={"Content-Type":"application/json","Content-Profile":"apd_scanner_api",
 "Accept-Profile":"apd_scanner_api","Accept":"application/json",
 "Prefer":"return=representation","Authorization":"Bearer "+token};
async function call(name,body){
 const url=new URL("rpc/"+name,BASE);
 assert.equal(url.hostname,"127.0.0.1");
 const res=await fetch(url,{method:"POST",redirect:"error",credentials:"omit",
  headers:HEADERS,body:JSON.stringify(body)});
 const txt=await res.text();
 if(!res.ok){
  // Return HTTP code and a bounded, non-sensitive server error classification.
  const safe=txt.includes("Overlapping or stale district capture rejected")
   ?"STALE_OR_OVERLAPPING":("HTTP_"+res.status);
  throw Error(safe);
 }
 return JSON.parse(txt);
}
const runs={
 A:"00000000-0000-0000-0000-000000000931",
 B:"00000000-0000-0000-0000-000000000932",
 C:"00000000-0000-0000-0000-000000000933",
 D:"00000000-0000-0000-0000-000000000934",
 AV:"00000000-0000-0000-0000-000000000935"
};
function record(key,district,tag){
 return {
  source_offer_key:key,idoferta:"SIM_"+key,iddetalle:key,
  estado:"Publicada",distrito:district,escuela:"FICTICIA "+tag,
  cargo:"INFORMATICA",area:"TECNICA",nivel_modalidad:"TECNICA",
  turno:"TT",jornada:"SIMPLE",hsmodulos:"2",cursodivision:"1 A",
  supl_desde:"",supl_hasta:"",finoferta:"2099-12-31",
  ult_movimiento:"2026-11-02T16:00:00Z",
  raw:{synthetic:true,test:"concurrency",tag}
 };
}
async function stageRun(id,district,start,finish,keys){
 await call("create_capture",{p_run_id:id,p_district:district,
  p_expected_pages:Math.ceil(keys.length/150),
  p_started_at:start,p_captured_at:finish});
 for(let page=0;page<Math.ceil(keys.length/150);page++){
  const rows=keys.slice(page*150,(page+1)*150).map(k=>record(k,district,id));
  assert.equal(await call("stage_capture_page",{
   p_run_id:id,p_page_index:page,p_source_total:keys.length,p_rows:rows
  }),page+1);
 }
 assert.equal(await call("seal_capture",{p_run_id:id}),keys.length);
}
const moments={
 A:["2026-11-02T16:00:00Z","2026-11-02T16:04:00Z"],
 B:["2026-11-02T16:02:00Z","2026-11-02T16:06:00Z"],
 C:["2026-11-02T16:10:00Z","2026-11-02T16:12:00Z"],
 D:["2026-11-02T15:59:00Z","2026-11-02T16:01:00Z"],
 AV:["2026-11-02T16:01:00Z","2026-11-02T16:05:00Z"]
};
const keysA=Array.from({length:180},(_,i)=>"SIM_A_"+i);
const keysB=Array.from({length:190},(_,i)=>"SIM_B_"+i);
await stageRun(runs.A,"MATANZA",...moments.A,keysA);
await stageRun(runs.B,"MATANZA",...moments.B,keysB);
await stageRun(runs.AV,"AVELLANEDA",...moments.AV,["SIM_AV_NEW"]);

// CI holds the MATANZA advisory lock for a few seconds while these
// requests begin. Requests issue at once. Only one can complete.
const result=await Promise.allSettled([
 call("commit_capture",{p_run_id:runs.A}),
 call("commit_capture",{p_run_id:runs.B}),
 call("commit_capture",{p_run_id:runs.AV})
]);
const [a,b,av]=result;
const winnerCount=[a,b].filter(x=>x.status==="fulfilled").length;
assert.equal(winnerCount,1,"Exactly one of two overlapping captures must commit");
const loser=[a,b].find(x=>x.status==="rejected");
assert.match(loser.reason?.message||"",/STALE_OR_OVERLAPPING/);
const accepted=[a,b].find(x=>x.status==="fulfilled").value;
assert.equal(accepted.length,1);
assert.equal(accepted[0].pruned,0);
assert.equal(av.status,"fulfilled","Independent district must finalize");
assert.deepEqual(av.value,[{upserted:1,pruned:0}]);
console.log("PASS concurrent: 1/2 overlapping MATANZA committed; 1 rejected; AVELLANEDA committed; no pruning.");

// Next scan starts after either winner's finish: should commit as normal.
await stageRun(runs.C,"MATANZA",...moments.C,["D_OLD","SIM_NEXT"]);
const next=await call("commit_capture",{p_run_id:runs.C});
assert.deepEqual(next,[{upserted:2,pruned:0}]);
console.log("PASS sequential: strictly later scan accepted.");

// An old run staged after newer commits must NOT replace the current set.
await stageRun(runs.D,"MATANZA",...moments.D,["SIM_STALE"]);
await assert.rejects(()=>call("commit_capture",{p_run_id:runs.D}),/STALE_OR_OVERLAPPING/);
await assert.rejects(()=>call("commit_capture",{p_run_id:runs.C}),/HTTP_4/);
console.log("PASS stale: older capture rejected without writes; confirmed run cannot execute twice.");

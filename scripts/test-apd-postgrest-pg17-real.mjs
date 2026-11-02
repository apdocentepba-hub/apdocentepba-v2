/* Real HTTP/PostgREST integration against a disposable PG17 database.
 * REQUIRES localhost port 3300 PostgREST, never accepts production hosts.
 */
import assert from "node:assert/strict";
import {createAtomicStagePilotClient} from "./apd-atomic-stage-rest-adapter.mjs";

const baseUrl="http://127.0.0.1:3300/";
const client=createAtomicStagePilotClient({baseUrl,enabled:true,fetchImpl:fetch});
const RUN="00000000-0000-0000-0000-000000000901";
const started="2026-11-02T15:00:00Z",completed="2026-11-02T15:15:00Z";
const rowsForPage=index=>Array.from({length:Math.min(150,650-index*150)},(_,j)=>({
 source_offer_key:"APD_TEST_"+String(index*150+j+1),
 distrito:"MATANZA",estado:"Publicada"
}));
console.log("HTTP PostgREST pilot: creating isolated run; no user data or production URL.");
const created=await client.createRun({
 runId:RUN,district:"MATANZA",expectedPages:5,
 captureStartedAt:started,capturedAt:completed
});
assert.ok(Array.isArray(created)&&created.length===1);
for(let index=0;index<5;index++){
 const page=rowsForPage(index);
 const number=await client.stagePage({runId:RUN,pageIndex:index,sourceTotal:650,rows:page});
 assert.equal(number,index+1);
 if(index===0){
  const replay=await client.stagePage({runId:RUN,pageIndex:index,sourceTotal:650,rows:page});
  assert.equal(replay,1,"Identical first page replay must not write duplicates");
 }
}
assert.equal(await client.seal(RUN),650);
const result=await client.finalizeWithoutPruning(RUN);
assert.deepEqual(result,{upserted:650,pruned:0});
console.log("PASS: 650 staged rows, five HTTP pages, exact retry, server-side seal, atomic finalize, 0 deletions.");
// A committed finalize must never be run twice, including after an ambiguous network result.
await assert.rejects(()=>client.finalizeWithoutPruning(RUN),/HTTP 4/);
console.log("PASS: Replayed finalize rejected by PostgreSQL, no times_seen inflation.");

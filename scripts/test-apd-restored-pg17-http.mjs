/* Discardable restored PostgreSQL 17 service, never production.
 * Smoke-tests historical status and a NEW private RPC-only transaction.
 */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

if(process.env.GITHUB_ACTIONS!=='true'||
   process.env.GITHUB_REPOSITORY!=='apdocentepba-hub/apdocentepba-v2')
 throw Error('CI-only restored database smoke test');
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(typeof secret==='string'&&secret.length>=32);
const endpoint=new URL('http://127.0.0.1:3301/');
const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const signing=b({alg:'HS256',typ:'JWT'})+'.'+
 b({role:'apd_api_scanner',iat:now,exp:now+300});
const jwt=signing+'.'+createHmac('sha256',secret).update(signing).digest('base64url');
const allowed=new Set(['capture_status','create_capture','stage_capture_page',
 'seal_capture','register_source_pairs','revalidate_source_pairs',
 'register_staged_content','revalidate_staged_content','commit_capture']);
let rejected=0;
async function rpc(name,data,deny=false){
 assert.ok(allowed.has(name));
 const response=await fetch(new URL('rpc/'+name,endpoint),{
  method:'POST',redirect:'error',credentials:'omit',
  headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json',
   'Accept':'application/json',Prefer:'return=representation',
   'Accept-Profile':'apd_scanner_api','Content-Profile':'apd_scanner_api'},
  body:JSON.stringify(data)
 });
 if(deny){
  assert.ok(!response.ok&&response.status>=400&&response.status<500,
   'Restore safety bypass unexpectedly succeeded: '+name);
  rejected++;
  return null;
 }
 assert.ok(response.ok,name+' restored HTTP '+response.status);
 return response.json();
}
const oldRun='00000000-0000-0000-0000-000000009701';
const oldStatus=await rpc('capture_status',{p_run_id:oldRun});
assert.ok(Array.isArray(oldStatus)&&oldStatus.length===1);
assert.equal(oldStatus[0].run_status,'finalized');
await rpc('commit_capture',{p_run_id:oldRun},true);
const run='00000000-0000-0000-0000-000000009801';
const key='D_9801',district='TANDIL';
const pairs=[{id:'RESTORE_LAB_SOLR_ID_9801',source_offer_key:key}];
const row={
 source_offer_key:key,idoferta:'RESTORE_FAKE_9801',iddetalle:'9801',
 estado:'Publicada',distrito:district,escuela:'ESCUELA RESTAURACION FICTICIA',
 cargo:'INFORMATICA',area:'LABORATORIO',nivel_modalidad:'TECNICA',
 turno:'TARDE',jornada:'SIMPLE',hsmodulos:'2',cursodivision:'1°2°',
 supl_desde:'',supl_hasta:'',finoferta:'2099-12-31',
 ult_movimiento:'2026-11-03T18:00:00Z',raw:null
};
assert.equal(await rpc('create_capture',{
 p_run_id:run,p_district:district,p_expected_pages:1,
 p_started_at:'2026-11-03T19:00:00Z',
 p_captured_at:'2026-11-03T19:01:00Z'
}),run);
assert.equal(await rpc('stage_capture_page',{
 p_run_id:run,p_page_index:0,p_source_total:1,p_rows:[row]
}),1);
assert.equal(await rpc('seal_capture',{p_run_id:run}),1);
assert.equal(await rpc('register_source_pairs',{p_run_id:run,p_pairs:pairs}),1);
assert.equal(await rpc('revalidate_source_pairs',{p_run_id:run,p_pairs:pairs}),1);
await rpc('commit_capture',{p_run_id:run},true);
assert.equal(await rpc('register_staged_content',{p_run_id:run,p_rows:[row]}),1);
const changed={...row,cargo:'RESTORE_TAMPER'};
await rpc('revalidate_staged_content',{p_run_id:run,p_rows:[changed]},true);
assert.equal(await rpc('revalidate_staged_content',{p_run_id:run,p_rows:[row]}),1);
assert.deepEqual(await rpc('commit_capture',{p_run_id:run}),[{upserted:1,pruned:0}]);
const newStatus=await rpc('capture_status',{p_run_id:run});
assert.equal(newStatus[0].run_status,'finalized');
console.log(JSON.stringify({
 proof:'restored_pg17_private_rpc_smoke',
 restored_historical_finalized_visible:true,
 new_sanitized_capture_committed:true,
 rejected_unsafe_requests:rejected,
 non_pruning:true,
 production_modified:false,
 fictitious_offers_only:true
}));

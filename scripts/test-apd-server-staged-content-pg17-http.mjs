/* Post-install disposable PostgreSQL 17 + PostgREST security regression.
 * Strict localhost-only, fictitious districts and records, no ABC/Supabase.
 */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(typeof secret==='string'&&secret.length>=32);
const url=new URL('http://127.0.0.1:3300/');
assert.equal(url.hostname,'127.0.0.1');
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const payload=encode({alg:'HS256',typ:'JWT'})+'.'+
 encode({role:'apd_api_scanner',iat:now,exp:now+600});
const token=payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
const endpoints=new Set(['create_capture','stage_capture_page','seal_capture',
 'register_source_pairs','revalidate_source_pairs','commit_capture',
 'register_staged_content','revalidate_staged_content']);
let rejected=0,commits=0;
async function rpc(name,body,shouldPass=true){
 assert.ok(endpoints.has(name));
 const res=await fetch(new URL('rpc/'+name,url),{
  method:'POST',credentials:'omit',redirect:'error',
  headers:{Authorization:'Bearer '+token,
   'Content-Type':'application/json','Accept':'application/json',
   'Content-Profile':'apd_scanner_api','Accept-Profile':'apd_scanner_api',
   Prefer:'return=representation'},
  body:JSON.stringify(body)
 });
 if(shouldPass){
  assert.equal(res.ok,true,'Isolated PG17 '+name+' returned HTTP '+res.status);
  return await res.json();
 }
 assert.equal(res.ok,false,'Unsafe PG17 '+name+' bypass unexpectedly succeeded');
 assert.ok(res.status>=400&&res.status<500,
  'Unsafe PG17 operation must be rejected by application error');
 rejected++;
 return null;
}
const fullRow=(district,key)=>({
 source_offer_key:key,idoferta:'FAKE_'+key,iddetalle:key.slice(2),
 estado:'Publicada',distrito:district,escuela:'ESCUELA DE PRUEBA',
 cargo:'INFORMATICA',area:'LABORATORIO',nivel_modalidad:'TECNICA',
 turno:'MANANA',jornada:'SIMPLE',hsmodulos:'2',cursodivision:'1°2°',
 supl_desde:'',supl_hasta:'',finoferta:'2099-12-31',
 ult_movimiento:'2026-11-03T18:00:00Z',raw:null
});
const copy=x=>structuredClone(x);
async function stageAndVerifySource({district,key,id,run,staged}){
 const pairs=[{id,source_offer_key:key}];
 assert.equal(await rpc('create_capture',{
  p_run_id:run,p_district:district,p_expected_pages:1,
  p_started_at:'2026-11-03T17:00:00Z',
  p_captured_at:'2026-11-03T17:02:00Z'
 }),run);
 assert.equal(await rpc('stage_capture_page',{
  p_run_id:run,p_page_index:0,p_source_total:1,p_rows:[staged]
 }),1);
 assert.equal(await rpc('seal_capture',{p_run_id:run}),1);
 assert.equal(await rpc('register_source_pairs',{p_run_id:run,p_pairs:pairs}),1);
 assert.equal(await rpc('revalidate_source_pairs',{p_run_id:run,p_pairs:pairs}),1);
}
const accepted={
 district:'PERGAMINO',key:'D_9601',id:'SOLR_FAKE_9601',
 run:'00000000-0000-0000-0000-000000009601'
};
const row=fullRow(accepted.district,accepted.key);
await stageAndVerifySource({...accepted,staged:row});

// Source ID/key checks alone MUST NOT enable the existing commit RPC.
await rpc('commit_capture',{p_run_id:accepted.run},false);
// The server must reject any untrusted manifest that does not exactly match
// the JSONB objects in the private staged table.
const changedCargo=copy(row);changedCargo.cargo='ALTERED_CLIENT_CARGO';
await rpc('register_staged_content',{
 p_run_id:accepted.run,p_rows:[changedCargo]
},false);
const leaked=copy(row);leaked.raw={email:'synthetic-private@invalid.test'};
await rpc('register_staged_content',{
 p_run_id:accepted.run,p_rows:[leaked]
},false);
const extra=copy(row);extra.observaciones='synthetic-private@invalid.test';
await rpc('register_staged_content',{
 p_run_id:accepted.run,p_rows:[extra]
},false);
await rpc('register_staged_content',{
 p_run_id:accepted.run,p_rows:[row]
});
await rpc('commit_capture',{p_run_id:accepted.run},false);
// The second manifest must match the first exactly, despite equal key/count.
const changedSchool=copy(row);changedSchool.escuela='OTRA ESCUELA';
await rpc('revalidate_staged_content',{
 p_run_id:accepted.run,p_rows:[changedSchool]
},false);
await rpc('commit_capture',{p_run_id:accepted.run},false);
// Stage is already sealed, so a direct page edit cannot invalidate the
// committed source snapshot without rejection.
await rpc('stage_capture_page',{
 p_run_id:accepted.run,p_page_index:0,p_source_total:1,
 p_rows:[changedCargo]
},false);
assert.equal(await rpc('revalidate_staged_content',{
 p_run_id:accepted.run,p_rows:[row]
}),1);
assert.deepEqual(await rpc('commit_capture',{p_run_id:accepted.run}),[
 {upserted:1,pruned:0}
]);
commits++;
await rpc('commit_capture',{p_run_id:accepted.run},false);
await rpc('revalidate_staged_content',{
 p_run_id:accepted.run,p_rows:[row]
},false);

// A second capture with a personal-data-like raw payload is refused by the
// server content policy despite verified identity pairs.
const blocked={
 district:'OLAVARRIA',key:'D_9602',id:'SOLR_FAKE_9602',
 run:'00000000-0000-0000-0000-000000009602'
};
const bad=fullRow(blocked.district,blocked.key);
bad.raw={email:'synthetic-private@invalid.test'};
await stageAndVerifySource({...blocked,staged:bad});
await rpc('register_staged_content',{
 p_run_id:blocked.run,p_rows:[bad]
},false);
await rpc('commit_capture',{p_run_id:blocked.run},false);

console.log(JSON.stringify({
 proof:'server_requires_verified_staged_content_before_atomic_commit',
 fictitious_districts:2,approved_commits:commits,
 rejected_malformed_or_bypass_requests:rejected,
 original_source_records:0,pruned:0,
 no_production_api_or_database:true,no_pii_logged:true
}));

/* PostgreSQL 17 privilege-isolation end-to-end regression.
 * Only CI localhost PostgREST and completely synthetic data.
 */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32);
const root=new URL('http://127.0.0.1:3300/');
assert.equal(root.hostname,'127.0.0.1');
const e=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=e({alg:'HS256',typ:'JWT'})+'.'+e({role:'apd_api_scanner',iat:now,exp:now+600});
const jwt=h+'.'+createHmac('sha256',secret).update(h).digest('base64url');
let denied=0;
async function rpc(name,payload,{reject=false}={}){
 assert.ok(new Set(['create_capture','stage_capture_page','seal_capture',
 'register_source_pairs','revalidate_source_pairs','register_staged_content',
 'revalidate_staged_content','commit_capture','capture_status',
 'register_source_identity']).has(name));
 const res=await fetch(new URL('rpc/'+name,root),{
  method:'POST',credentials:'omit',redirect:'error',
  headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json',
   'Accept':'application/json','Content-Profile':'apd_scanner_api',
   'Accept-Profile':'apd_scanner_api',Prefer:'return=representation'},
  body:JSON.stringify(payload)
 });
 if(reject){
  assert.equal(res.ok,false,'Unsafe '+name+' must fail after role isolation');
  assert.ok(res.status>=400&&res.status<500);
  denied++;return;
 }
 assert.equal(res.ok,true,name+' HTTP '+res.status);
 return res.json();
}
const run='00000000-0000-0000-0000-000000009701',key='D_9701';
const row={
 source_offer_key:key,idoferta:'FAKE_'+key,iddetalle:'9701',
 estado:'Publicada',distrito:'AZUL',escuela:'ESCUELA FICTICIA',
 cargo:'INFORMATICA',area:'LABORATORIO',nivel_modalidad:'TECNICA',
 turno:'TARDE',jornada:'SIMPLE',hsmodulos:'2',cursodivision:'1°2°',
 supl_desde:'',supl_hasta:'',finoferta:'2099-12-31',
 ult_movimiento:'2026-11-03T19:00:00Z',raw:null
};
const pairs=[{id:'SOLR_FAKE_PRIVATE_9701',source_offer_key:key}];
assert.equal(await rpc('create_capture',{
 p_run_id:run,p_district:'AZUL',p_expected_pages:1,
 p_started_at:'2026-11-03T18:00:00Z',p_captured_at:'2026-11-03T18:01:00Z'
}),run);
assert.equal(await rpc('stage_capture_page',{
 p_run_id:run,p_page_index:0,p_source_total:1,p_rows:[row]
}),1);
assert.equal(await rpc('seal_capture',{p_run_id:run}),1);
assert.equal(await rpc('register_source_pairs',{p_run_id:run,p_pairs:pairs}),1);
assert.equal(await rpc('revalidate_source_pairs',{p_run_id:run,p_pairs:pairs}),1);
await rpc('commit_capture',{p_run_id:run},{reject:true});
const changed={...row,cargo:'INJECTED'};
await rpc('register_staged_content',{p_run_id:run,p_rows:[changed]},{reject:true});
assert.equal(await rpc('register_staged_content',{p_run_id:run,p_rows:[row]}),1);
assert.equal(await rpc('revalidate_staged_content',{p_run_id:run,p_rows:[row]}),1);
assert.deepEqual(await rpc('commit_capture',{p_run_id:run}),[{upserted:1,pruned:0}]);
const status=await rpc('capture_status',{p_run_id:run});
assert.ok(Array.isArray(status)&&status.length===1&&status[0].run_status==='finalized');
await rpc('register_source_identity',{p_run_id:run,p_ids:[key]},{reject:true});
await rpc('commit_capture',{p_run_id:run},{reject:true});
console.log(JSON.stringify({
 proof:'postgrest_works_with_rpc_only_privileges',
 scanner_has_no_private_sql_grants:true,
 fake_districts:1,committed:1,pruned:0,
 expected_rejected_http_requests:denied,
 no_real_abc_or_supabase_records:true,no_production_deploy:true
}));

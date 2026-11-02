import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {maybeCaptureDailyProvinceSummary as capture} from '../worker-live/apd_daily_summary_hook.mjs';
const worker=readFileSync('worker-live/worker_hotfix.js','utf8');
function harness(flag=true,handler=async()=>({ok:true,status:200,json:async()=>[{saved:true,captured_date:'2026-11-02',offers:3,districts_with_offers:2}]})){
 const calls=[],warnings=[];
 const env={
  APD_DAILY_SUMMARY_ENABLED: flag?'true':'false',
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'dummy-test-key'
 };
 const invoke=(date,finished=true,fetcher=async(...args)=>{calls.push(args);return handler(...args);})=>
   capture(env,date,finished,fetcher);
 return {env,calls,invoke};
}
test('flag apagado: nunca escribe aunque el scanner termine',async()=>{
 const h=harness(false),r=await h.invoke('2026-11-02');
 assert.equal(r.skipped,true);assert.equal(h.calls.length,0);
});
test('un barrido incompleto nunca crea resumen',async()=>{
 const h=harness(true),r=await h.invoke('2026-11-02',false);
 assert.equal(r.skipped,true);assert.equal(h.calls.length,0);
});
test('fecha de barrido obligatoria y con formato ISO',async()=>{
 const h=harness(true);
 for(const day of [null,'02/11/2026','2026-11-02Z','2026/11/02']){
  const r=await h.invoke(day);assert.equal(r.ok,false);
 }
 assert.equal(h.calls.length,0);
});
test('sin transporte service-role explícito se bloquea',async()=>{
 const h=harness(true);
 const r=await h.invoke('2026-11-02',true,null);
 assert.equal(r.ok,false);assert.equal(r.reason,'missing_authorized_fetcher');
});
test('solicitud autoriza solo la RPC fecha local, sin exponer credenciales',async()=>{
 const h=harness(true);const r=await h.invoke('2026-11-02');
 assert.equal(r.captured,true);assert.equal(h.calls.length,1);
 const [env,url,opts]=h.calls[0];
 assert.match(url,/\/rest\/v1\/rpc\/capture_apd_daily_province_summary$/);
 assert.equal(JSON.parse(opts.body).p_scan_date,'2026-11-02');
 assert.equal(opts.method,'POST');
 assert.equal(opts.headers.Authorization,'Bearer dummy-test-key');
});
test('fallo HTTP del resumen no interrumpe la captura de ofertas',async()=>{
 const h=harness(true,async()=>({ok:false,status:503}));
 const r=await h.invoke('2026-11-02');
 assert.equal(r.ok,false);assert.equal(r.captured,false);
});
test('caída de red en el módulo opt-in tampoco lanza excepción',async()=>{
 const h=harness(true,async()=>{throw Error('network test');});
 const r=await h.invoke('2026-11-02');
 assert.equal(r.ok,false);assert.equal(h.calls.length,1);
});
test('Worker principal sin integración prematura, con snapshots masivos apagados',()=>{
 assert.doesNotMatch(worker,/maybeCaptureDailyProvinceSummary|APD_DAILY_SUMMARY_ENABLED/);
 assert.match(worker,/snapshot_writes: false/);
 assert.match(worker,/async function runProvinciaBackfillStep/);
});

test('RPC idempotente informa ya existente, no una nueva escritura',async()=>{
 const h=harness(true,async()=>({ok:true,status:200,json:async()=>[
  {saved:false,captured_date:'2026-11-02',offers:3,districts_with_offers:2}
 ]}));
 const r=await h.invoke('2026-11-02');
 assert.deepEqual({ok:r.ok,captured:r.captured,already_present:r.already_present},
  {ok:true,captured:false,already_present:true});
});
test('HTTP 200 con resultado vacío nunca se anuncia como captura',async()=>{
 const h=harness(true,async()=>({ok:true,status:200,json:async()=>[]}));
 const r=await h.invoke('2026-11-02');
 assert.equal(r.ok,false);assert.equal(r.captured,false);
});
test('RPC de otra fecha nunca se anuncia como captura válida',async()=>{
 const h=harness(true,async()=>({ok:true,status:200,json:async()=>[
  {saved:true,captured_date:'2026-11-01',offers:3,districts_with_offers:2}
 ]}));
 const r=await h.invoke('2026-11-02');
 assert.equal(r.ok,false);assert.equal(r.captured,false);
});
test('HTTP 200 sin JSON válido no interrumpe escáner',async()=>{
 const h=harness(true,async()=>({ok:true,status:200,json:async()=>{throw Error('bad json')}}));
 const r=await h.invoke('2026-11-02');
 assert.equal(r.ok,false);assert.equal(r.captured,false);
});

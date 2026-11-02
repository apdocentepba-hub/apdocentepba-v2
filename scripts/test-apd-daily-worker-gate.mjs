import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('worker-live/worker_hotfix.js','utf8');
const begin=source.indexOf('async function maybeCaptureDailyProvinceSummary(');
const end=source.indexOf('async function runProvinciaBackfillStep(',begin);
assert.ok(begin>=0 && end>begin,'No existe captura diaria protegida en Worker');
const functionSource=source.slice(begin,end);

function harness(enabled,fn){
  let calls=0;
  const warnings=[];
  const env={APD_DAILY_SUMMARY_ENABLED:enabled?'true':'false',
             SUPABASE_URL:'https://example.supabase.co',
             SUPABASE_SERVICE_ROLE_KEY:'fake-private-key'};
  const ctx=vm.createContext({
    console:{warn(...args){warnings.push(args);}},
    supabaseFetchWithRetry:async(_env,url,opts)=>{calls++;return fn?fn(_env,url,opts):{ok:true,status:200};}
  });
  const callback=vm.runInContext(functionSource+'\nmaybeCaptureDailyProvinceSummary',ctx);
  return {env,callback,warnings,calls:()=>calls};
}
test('deshabilitado por defecto: ni siquiera consulta Supabase',async()=>{
  const h=harness(false);
  const r=await h.callback(h.env,'2026-11-02',true);
  assert.equal(h.calls(),0);assert.equal(r.skipped,true);
});
test('barrido incompleto: tampoco escribe con la bandera activa',async()=>{
  const h=harness(true);
  const r=await h.callback(h.env,'2026-11-02',false);
  assert.equal(h.calls(),0);assert.equal(r.skipped,true);
});
test('rechaza fecha ausente o inválida antes de usar service_role',async()=>{
  const h=harness(true);
  for(const date of [null,'2026-11-02Z','02/11/2026','2026/11/02']){
    const result=await h.callback(h.env,date,true);
    assert.equal(result.ok,false);
  }
  assert.equal(h.calls(),0);
});
test('captura al finalizar con endpoint RPC y fecha, sin duplicar el catálogo',async()=>{
  let request;
  const h=harness(true,async(env,url,opts)=>{request={env,url,opts};return {ok:true,status:200};});
  const r=await h.callback(h.env,'2026-11-02',true);
  assert.equal(h.calls(),1);assert.equal(r.ok,true);assert.equal(r.captured,true);
  assert.match(request.url,/\/rest\/v1\/rpc\/capture_apd_daily_province_summary$/);
  assert.equal(request.opts.method,'POST');
  assert.equal(JSON.parse(request.opts.body).p_scan_date,'2026-11-02');
  assert.equal(request.opts.headers.apikey,'fake-private-key');
});
test('fallo HTTP de RPC no deshace ni interrumpe el barrido actual',async()=>{
  const h=harness(true,async()=>({ok:false,status:503}));
  const r=await h.callback(h.env,'2026-11-02',true);
  assert.equal(r.ok,false);assert.equal(r.captured,false);assert.equal(h.warnings.length,1);
  assert.match(h.warnings[0].join(' '),/APD_DAILY_SUMMARY_FAILED/);
});
test('excepción de red también se consume sin relanzarla al scanner',async()=>{
  const h=harness(true,async()=>{throw Error('mock network outage');});
  const result=await h.callback(h.env,'2026-11-02',true);
  assert.equal(result.ok,false);assert.equal(h.calls(),1);
});
test('el Worker solo intenta resumir después de persistir estado final',()=>{
  const start=source.indexOf('async function runProvinciaBackfillStep(');
  const end=source.indexOf('async function fetchHistoricoRowsByDistritos(',start);
  const run=source.slice(start,end);
  const positionSave=run.indexOf('await saveScanState(env, {',run.indexOf('const finished ='));
  const positionCapture=run.indexOf('await maybeCaptureDailyProvinceSummary(env, nextNotes.completed_scan_date, finished)');
  const positionReturn=run.indexOf('return {',positionCapture);
  assert.ok(positionSave>=0 && positionCapture>positionSave && positionReturn>positionCapture);
  assert.match(run,/snapshot_writes: false/);
  assert.equal(source.includes('APD_DAILY_SUMMARY_ENABLED'),true);
});

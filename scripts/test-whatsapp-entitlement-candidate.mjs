import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const baseline=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
assert.equal(crypto.createHash('sha256').update(baseline).digest('hex'),
  manifest.modules.find(m=>m.name==='worker_hotfix.js')?.sha256,
  'Baseline must be verified');
const proposed=fs.readFileSync('tmp/apd-whatsapp-entitlement-candidate/worker_hotfix.mjs','utf8');
assert.notEqual(proposed,baseline);
assert.doesNotMatch(baseline,/const resolvedPlanForWhatsApp = await resolverPlanUsuario\(env, userId\)/);
assert.match(proposed,/const resolvedPlanForWhatsApp = await resolverPlanUsuario\(env, userId\)\.catch\(\(\) => null\)/);
assert.match(proposed,/!resolvedPlanForWhatsApp \|\| !isPlanActivo\(resolvedPlanForWhatsApp\)/);

const start=proposed.indexOf('async function runWhatsAppAlertsSweep(env, options = {}) {');
const end=proposed.indexOf('__name(runWhatsAppAlertsSweep,',start);
assert.ok(start>=0 && end>start);
const isolated=proposed.slice(start,end);

function harness({expired=true,lookupFailed=false,configured=true}={}) {
  const sendCalls=[];
  const seen=[];
  const scope={
    WHATSAPP_ALERT_SWEEP_MAX_USERS:20,
    WHATSAPP_ALERTS_PER_USER_MAX:3,
    clampInt:(_value, _min, _max, fallback)=>fallback,
    supabaseSelect:async(_env,path)=>{
      assert.match(path,/user_preferences\?/);
      return [{user_id:'account-valid'},{user_id:'account-inactive'}];
    },
    obtenerUsuario:async(_env,id)=>({id,activo:true,celular:'+5400000000'}),
    resolverPlanUsuario:async(_env,id)=>{
      seen.push(id);
      if(lookupFailed)throw new Error('upstream unavailable');
      return {subscription:{status:id==='account-valid'?'ACTIVE':(expired?'EXPIRED':'ACTIVE')}};
    },
    isPlanActivo:(resolved)=>resolved?.subscription?.status==='ACTIVE',
    construirAlertasParaUsuario:async(_env,id)=>({ok:true,resultados:[{id:'offer-'+id}]}),
    sendWhatsAppAlertForUser:async(_env,user,alert)=>{sendCalls.push(user.id+':'+alert.id);},
    console:{error:()=>{}}
  };
  const sweep=vm.runInNewContext(isolated+'\nrunWhatsAppAlertsSweep',scope);
  const env=configured?{
    WHATSAPP_PHONE_NUMBER_ID:'MOCK',WHATSAPP_ACCESS_TOKEN:'MOCK',
    WHATSAPP_TEMPLATE_ALERTA:'MOCK'
  }:{};
  return {run:()=>sweep(env,{}),sendCalls,seen};
}

test('expired user is rejected; active user keeps receiving WhatsApp',async()=>{
 const x=harness();
 const result=await x.run();
 assert.equal(result.sent_count,1);
 assert.equal(result.skipped_count,1);
 assert.deepEqual(x.sendCalls,['account-valid:offer-account-valid']);
 assert.deepEqual(x.seen,['account-valid','account-inactive']);
});

test('subscription database error fails closed for every user',async()=>{
 const x=harness({lookupFailed:true});
 const result=await x.run();
 assert.equal(result.sent_count,0);
 assert.equal(result.skipped_count,2);
 assert.deepEqual(x.sendCalls,[]);
});

test('active exceptions remain eligible under the same plan policy',async()=>{
 const x=harness({expired:false});
 const result=await x.run();
 assert.equal(result.sent_count,2);
 assert.equal(result.skipped_count,0);
});

test('not configured channel cannot initiate sends',async()=>{
 const x=harness({configured:false});
 const result=await x.run();
 assert.equal(result.skipped,true);
 assert.equal(result.reason,'not_configured');
 assert.deepEqual(x.sendCalls,[]);
});

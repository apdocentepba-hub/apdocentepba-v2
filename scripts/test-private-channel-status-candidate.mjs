import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const baseline=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
const candidate=fs.readFileSync('tmp/apd-private-channel-status-candidate/worker_hotfix.mjs','utf8');
assert.notEqual(candidate,baseline,'Candidate must differ from live source');
function handler(source,name){
  const start=source.indexOf('async function '+name+'(');
  const end=source.indexOf('\n__name(',start);
  assert.ok(start>=0&&end>start,'Missing handler: '+name);
  return source.slice(start,end);
}
const telegram=handler(candidate,'handleTelegramStatus');
const whatsapp=handler(candidate,'handleWhatsAppStatus');
const sweep=handler(candidate,'runWhatsAppAlertsSweep');
for (const h of [telegram,whatsapp]){
  assert.match(h,/if \(!authUser\?\.id\) return json2\(/);
  assert.doesNotMatch(h,/if \(!user && requestedUserId\)/);
}

function channelHarness(name, {role='none'}={}){
  const calls={userReads:[],states:0,entitlement:0};
  const self={id:'self',es_admin:role==='admin',activo:true,celular:'+541155555555'};
  const other={id:'other',es_admin:false,activo:true,celular:'+541144444444'};
  const scope={
    URL, Response,
    getSessionUserByBearer:async()=>role==='none'?null:self,
    obtenerUsuario:async(_env,id)=>{calls.userReads.push(id);return id==='other'?other:null;},
    obtenerPreferenciasUsuario:async()=>({alertas_telegram:true,alertas_whatsapp:true}),
    getTelegramState:async()=>{calls.states++;return {connected:true,chat_id:'123456789',username:'contacto',first_name:'Usuario'};},
    getWhatsAppState:async()=>{calls.states++;return {connected:true,phone:other.celular};},
    resolveTelegramEntitlement:async()=>{calls.entitlement++;return {allowed:true,source:'trial',plan_code:'PLUS',plan_name:'Plus'};},
    resolveWhatsAppEntitlement:async()=>{calls.entitlement++;return {allowed:true,plan_code:'PLUS',plan_name:'Plus'};},
    maskChatId:()=> '***789',
    maskPhone:()=> '***555',
    buildTelegramBotLink:()=> 'https://t.me/apdbot',
    buildWhatsAppBotNumber:()=> '+541111111111',
    buildWhatsAppBotLink:()=> 'https://wa.me/541111111111',
    json2:(data,status=200)=>new Response(JSON.stringify(data),{status}),
  };
  const nameCode=name==='telegram'?'handleTelegramStatus':'handleWhatsAppStatus';
  const run=vm.runInNewContext(handler(candidate,nameCode)+'\n'+nameCode,scope);
  const query=async id=>{
    const url='https://example.invalid/api/'+name+'/status'+(id?'?user_id='+encodeURIComponent(id):'');
    const r=await run(new Request(url),{});
    return {status:r.status,body:await r.json()};
  };
  return {calls,query};
}

for(const kind of ['telegram','whatsapp']){
 test(kind+' cannot read a targeted account without a valid session',async()=>{
  const h=channelHarness(kind);
  const result=await h.query('other');
  assert.equal(result.status,401);
  assert.equal(result.body.ok,false);
  assert.equal(h.calls.states,0);
  assert.equal(h.calls.entitlement,0);
  assert.equal(h.calls.userReads.length,0);
 });
 test(kind+' rejects cross-account lookup for non-admin',async()=>{
  const h=channelHarness(kind,{role:'user'});
  const r=await h.query('other');
  assert.equal(r.status,403);
  assert.equal(h.calls.states,0);
  assert.equal(h.calls.userReads.length,0);
 });
 test(kind+' preserves self-service and admin lookup',async()=>{
  const user=channelHarness(kind,{role:'user'});
  const own=await user.query('self');
  assert.equal(own.status,200);
  assert.equal(user.calls.userReads.length,0);
  assert.equal(user.calls.states,1);
  const admin=channelHarness(kind,{role:'admin'});
  const other=await admin.query('other');
  assert.equal(other.status,200);
  assert.deepEqual(admin.calls.userReads,['other']);
  assert.equal(admin.calls.states,1);
 });
}

function sweepHarness({expired=true,dbFails=false,configured=true}={}){
 const sent=[],lookups=[];
 const env=configured?{
   WHATSAPP_PHONE_NUMBER_ID:'TEST',WHATSAPP_ACCESS_TOKEN:'TEST',WHATSAPP_TEMPLATE_ALERTA:'TEST'
 }:{};
 const scope={
  WHATSAPP_ALERT_SWEEP_MAX_USERS:20,
  WHATSAPP_ALERTS_PER_USER_MAX:3,
  clampInt:(_value,_min,_max,fallback)=>fallback,
  supabaseSelect:async()=>[{user_id:'valid'},{user_id:'expired'}],
  obtenerUsuario:async(_env,id)=>({id,activo:true,celular:'+5400000000'}),
  resolverPlanUsuario:async(_env,id)=>{lookups.push(id);if(dbFails)throw Error('DB unavailable');return {subscription:{status:id==='valid'?'ACTIVE':(expired?'EXPIRED':'ACTIVE')}};},
  isPlanActivo:resolved=>resolved?.subscription?.status==='ACTIVE',
  construirAlertasParaUsuario:async(_env,id)=>({ok:true,resultados:[{id:'offer-'+id}]}),
  sendWhatsAppAlertForUser:async(_env,user,item)=>sent.push([user.id,item.id]),
  console:{error:()=>{}}
 };
 const execute=vm.runInNewContext(sweep+'\nrunWhatsAppAlertsSweep',scope);
 return {execute:()=>execute(env,{}),sent,lookups};
}
test('WhatsApp cannot send to expired users but keeps paying and manual-grant users',async()=>{
 const h=sweepHarness();
 const result=await h.execute();
 assert.equal(result.sent_count,1);
 assert.equal(result.skipped_count,1);
 assert.equal(h.sent[0][0],'valid');
 assert.equal(h.lookups.length,2);
});
test('WhatsApp lookup errors fail closed',async()=>{
 const h=sweepHarness({dbFails:true});
 const r=await h.execute();
 assert.equal(r.sent_count,0);
 assert.equal(h.sent.length,0);
});
test('WhatsApp preserves all entitled users',async()=>{
 const h=sweepHarness({expired:false});
 const r=await h.execute();
 assert.equal(r.sent_count,2);
});
test('unconfigured WhatsApp channel sends nothing',async()=>{
 const h=sweepHarness({configured:false});
 const r=await h.execute();
 assert.equal(r.reason,'not_configured');
 assert.equal(h.sent.length,0);
});
test('canonical Worker remains untouched and current route patch is still present',()=>{
 const hash=fs.readFileSync('worker-live/manifest.json','utf8');
 assert.match(hash,/"sha256"/);
 assert.match(candidate,/\/account\/marketing-preferences/);
 assert.equal(baseline.includes('if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId);'),true);
});

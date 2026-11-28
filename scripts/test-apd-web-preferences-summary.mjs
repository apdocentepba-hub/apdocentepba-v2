import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {effectiveCommercialPreferences} from './apd-commercial-effective-preferences.mjs';
const source=readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
const start=source.indexOf('function summarizeDashboardPreferences('),end=source.indexOf('function renderDashboard(data)',start);
assert.ok(start>=0&&end>start);
const ctx=vm.createContext({});
vm.runInContext(source.slice(start,end),ctx);
const summarize=(pref,plan)=>JSON.parse(JSON.stringify(ctx.summarizeDashboardPreferences(pref,plan)));
const pref={distrito_principal:'A',otros_distritos_arr:['B','C'],cargos_arr:['MAT','FIS','INF'],materias_arr:['MAT','LEN','HIS','GEO']};
const snapshot=code=>({ok:true,access_active:true,subscription:{plan_code:code,source:'verified'},plan:{code,max_distritos:code==='FREE'?1:5,max_cargos:code==='FREE'?1:10}});
test('free summary equals server projection and retains additional counts without mutation',()=>{
 const before=JSON.stringify(pref),s=summarize(pref,snapshot('FREE'));
 const server=effectiveCommercialPreferences({distrito_principal:'A',otros_distritos:['B','C'],cargos:pref.cargos_arr,materias:pref.materias_arr,alertas_activas:true},snapshot('FREE'),true);
 assert.deepEqual(s.districts,[server.distrito_principal,...server.otros_distritos]);assert.deepEqual(s.roles,server.cargos);
 assert.equal(s.extraDistricts,2);assert.equal(s.extraRoles,5);assert.equal(s.projected,true);assert.equal(JSON.stringify(pref),before);
});
test('trial and complete restore saved selections, legacy remains unchanged',()=>{
 for(const code of ['TRIAL_14D','COMPLETO','INSIGNE']){
 const s=summarize(pref,snapshot(code));assert.equal(s.districts.length,3);assert.equal(s.roles.length,6);assert.equal(s.extraDistricts,0);
 }
});
test('unknown or fallback plan never claims selections are active',()=>{
 for(const plan of [null,{...snapshot('FREE'),access_active:false},{...snapshot('FREE'),subscription:{plan_code:'FREE',source:'fallback_frontend'}},{...snapshot('FREE'),plan:{code:'COMPLETO'}}]){
 const s=summarize(pref,plan);assert.equal(s.projected,false);assert.equal(s.verified,false);assert.equal(s.roles.length,6);
 }
});
test('unexpected plan limits do not present a fabricated active projection',()=>{
 const p=snapshot('FREE');p.plan.max_cargos=2;assert.equal(summarize(pref,p).projected,false);
});

test('channel permission helpers never promote an unverified or denied plan',()=>{
 for(const [file,fn] of [['telegram_feature_patch.js','safeAllowed'],['telegram_live_refresh_patch.js','allowedByPlan']]){
  const src=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const match=src.match(new RegExp('function '+fn+'\\(status, channel\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(match,file);
  const c=vm.createContext({});vm.runInContext(match[0],c);
  for(const channel of ['telegram','whatsapp']){
   for(const status of [null,{}, {plan_code:'INSIGNE',allowed_by_plan:false},{plan_code:'COMPLETO'}])assert.equal(c[fn](status,channel),false);
   assert.equal(c[fn]({plan_code:'FREE',allowed_by_plan:true},channel),true);
  }
 }
});
test('commercial catalog payload is never rewritten by the legacy Telegram patch',()=>{
 const src=readFileSync(new URL('../telegram_feature_patch.js',import.meta.url),'utf8');
 const match=src.match(/function patchPlanesPayload\(data\) \{[\s\S]*?\n  \}/);
 assert.ok(match);const c=vm.createContext({});vm.runInContext(match[0],c);
 const catalog={planes:[{code:'COMPLETO',feature_flags:{whatsapp:true}},{code:'FREE',feature_flags:{whatsapp:false}}]};
 assert.equal(c.patchPlanesPayload(catalog),catalog);
});

test('dashboard adapter retains verified channel fields without inventing authorization',()=>{
 const a=source.indexOf('function adaptarPreferencias(prefRaw)'),b=source.indexOf('function setPanelLoading',a);
 assert.ok(a>=0&&b>a);const c=vm.createContext({formatNivelesResumen:()=>''});vm.runInContext(source.slice(a,b),c);
 const out=c.adaptarPreferencias({cargos:['MAT'],alertas_telegram:true,telegram_allowed_by_plan:true,telegram_connected:true,whatsapp_allowed_by_plan:false,whatsapp_connected:true,whatsapp_plan_code:'FREE',telegram_plan_code:'FREE'});
 assert.equal(out.alertas_telegram,true);assert.equal(out.telegram_allowed_by_plan,true);assert.equal(out.whatsapp_allowed_by_plan,false);
 assert.equal(out.whatsapp_connected,true);assert.equal(out.whatsapp_plan_code,'FREE');
 const absent=c.adaptarPreferencias({});assert.equal(absent.telegram_allowed_by_plan,false);assert.equal(absent.whatsapp_allowed_by_plan,false);
 assert.equal(c.adaptarPreferencias({telegram_allowed_by_plan:'true'}).telegram_allowed_by_plan,false);
});

test('preference save never replaces authoritative plan from a partial response and ignores switched session',async()=>{
 const a=source.indexOf('async function guardarPreferencias(e)'),b=source.indexOf('function buildPreferenciasPayload()',a);
 assert.ok(a>=0&&b>a);
 for(const scenario of ['verified','unverified','switched']){
  const plan={ok:true,access_active:scenario!=='unverified',subscription:{source:'verified',plan_code:'FREE'},plan:{code:'FREE'}};
  let user='fixture',bearer='fixture-session',saves=0,reloads=0;const messages=[];
  const c=vm.createContext({planActual:plan,window:{obtenerSessionToken:()=>bearer},obtenerToken:()=>user,btnLoad:()=>{},btnRestore:()=>{},showMsg:(...v)=>messages.push(v),buildPreferenciasPayload:()=>({}),guardarPreferenciasServidor:async()=>{saves++;if(scenario==='switched')bearer='different';return {plan:{code:'COMPLETO'}};},cargarDashboard:async()=>{reloads++;},console});
  vm.runInContext(source.slice(a,b),c);
  await c.guardarPreferencias({preventDefault:()=>{},submitter:{}});
  assert.equal(c.planActual,plan);
  assert.equal(saves,scenario==='unverified'?0:1);assert.equal(reloads,scenario==='verified'?1:0);
  if(scenario==='switched')assert.equal(messages.some(m=>m[2]==='ok'),false);
 }
});

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

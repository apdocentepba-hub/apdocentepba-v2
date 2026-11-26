import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCommercialStoredRows as filter,stageCommercialStoredAlerts} from './apd-commercial-stage-stored-alerts.mjs';
import {effectiveCommercialPreferences as project} from './apd-commercial-effective-preferences.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const prefs={distrito_principal:'AVELLANEDA',otros_distritos:['QUILMES'],cargos:['MAT','FIS'],alertas_activas:true};
const plan=code=>({subscription:{plan_code:code},plan:{code,max_distritos:code==='FREE'?1:5,max_cargos:code==='FREE'?1:10}});
const rows=[{offer_payload:{raw:{distrito:'AVELLANEDA',cargo:'MAT'}}},{offer_payload:{raw:{distrito:'QUILMES',cargo:'MAT'}}},{offer_payload:{raw:{distrito:'AVELLANEDA',cargo:'FIS'}}}];
const deps=code=>({resolve:async()=>plan(code),active:()=>true,preferences:async()=>prefs,project,canonical:p=>p,catalog:async()=>[],districts:p=>[p.distrito_principal,...p.otros_distritos].filter(Boolean),match:(o,p)=>({match:[p.distrito_principal,...p.otros_distritos].includes(o.distrito)&&p.cargos.includes(o.cargo)})});
test('free plan filters previously stored alerts, full access restores all matching alerts without mutation',async()=>{const before=JSON.stringify(rows);assert.equal((await filter({},'u',rows,deps('FREE'))).length,1);for(const c of ['TRIAL_14D','COMPLETO','INSIGNE'])assert.equal((await filter({},'u',rows,deps(c))).length,3);assert.equal(JSON.stringify(rows),before);});
test('unverified or empty selection fails closed',async()=>{assert.deepEqual(await filter({},'u',rows,{...deps('FREE'),active:()=>false}),[]);assert.deepEqual(await filter({},'u',rows,{...deps('FREE'),preferences:async()=>({...prefs,cargos:[]})}),[]);await assert.rejects(filter({},'u',rows,{...deps('FREE'),resolve:async()=>null}));assert.deepEqual(await filter({},'u',rows,{...deps('FREE'),canonical:p=>({...p,cargos:[]})}),[]);});
const fixture=['async function getUserPrefs(env,userId) {\n return rows?.[0] ? adaptarPreferenciasRow2(rows[0]) : null;\n}\n__name(getUserPrefs,"fixture");',...['loadStoredEmailAlerts','loadTelegramStoredAlerts','waLoadStoredAlerts','fetchStoredOffers'].map(n=>'async function '+n+'(env2,userId) {\n const rows=await read("user_offer_state?is_active=eq.true&select=offer_payload");\n return (Array.isArray(rows) ? rows : []).map((row) => ({x:row}));\n}\n__name('+n+',"fixture");'),'async function sendPendingEmailDigests(env,user) {\n const rows=await supabaseSelect(env, '+String.fromCharCode(96)+'user_offer_state?user_id=eq.${encodeURIComponent(user.id)}&is_active=eq.true&select=offer_payload'+String.fromCharCode(96)+');\n return rows;\n}\n__name(sendPendingEmailDigests,"fixture");'].join('\n');
test('five stored-reader paths and shared preference reader staged exactly, with reversible source',()=>{const r=stageCommercialStoredAlerts(fixture);assert.equal(r.storedReaders,5);assert.equal(r.unrelatedBytesPreserved,true);verifyTrialCandidateSyntax(r.candidate);assert.throws(()=>stageCommercialStoredAlerts(fixture.replace('waLoadStoredAlerts','unknown')));});

test('current worker without legacy direct mail reader still requires all four known active readers; unknown read blocks',()=>{
 const noDirect=fixture.slice(0,fixture.indexOf('async function sendPendingEmailDigests('));
 assert.equal(stageCommercialStoredAlerts(noDirect).storedReaders,4);
 assert.throws(()=>stageCommercialStoredAlerts(noDirect+'\nasync function unknown() { const rows=await read("user_offer_state?is_active=eq.true&select=offer_payload"); }'));
});

test('pending digest filtering is at the verified database read, not a particular downstream variable',()=>{
 const r=stageCommercialStoredAlerts(fixture);
 assert.match(r.candidate,/await apdFilterStoredCommercialV1\(env,user.id, await supabaseSelect/);
 assert.throws(()=>stageCommercialStoredAlerts(fixture.replace('encodeURIComponent(user.id)','encodeURIComponent(other.id)')));
});

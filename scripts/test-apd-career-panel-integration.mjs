import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const panel=readFileSync(new URL('../apd_comparador_panel.mjs',import.meta.url),'utf8');
test('career host unique and gated, other features retained',()=>{
 assert.equal((html.match(/id="apd-perfil-carrera"/g)||[]).length,1);
 assert.match(html,/id="apd-perfil-carrera"[^>]* hidden/);
 assert.match(html,/const accountCareerReleaseEnabled=false;/);
 assert.match(html,/if\(accountCareerReleaseEnabled&&!careerClient&&!careerPending\)/);
 assert.match(html,/const accountDiaryReleaseEnabled=true;/);
 assert.match(html,/const accountFavoritesReleaseEnabled=true;/);
 assert.match(html,/epoch!==careerEpoch/);
 assert.match(html,/epoch===careerEpoch&&careerCurrent\(\)\?bearer:null/);
 assert.match(html,/const careerCurrent=\(\)=>careerScope\(\)&&careerAccess\?\.\(planActual\)===true/);
 assert.match(html,/careerAccess=hasCareerPanelAccess/);
 assert.match(html,/APD_accountScheduleUpdated/);
 assert.match(panel,/window\.dispatchEvent\(new Event\('APD_accountScheduleUpdated'\)\)/);
 let parsed=0;
 for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script.includes('const accountCareerReleaseEnabled=')){new Script(script);parsed++;}
 assert.equal(parsed,1);
});
test('confirmed career projection remains disabled or conservative',()=>{
 const start=panel.indexOf('function loadPrivatePlanner(){'),end=panel.indexOf('function clearPersonalHistory()',start);
 assert.ok(start>=0&&end>start);
 const base={jobs:[],moduleSchedule:['M1-2']};
 let context=null,merges=0;
 const run=()=>runInNewContext(panel.slice(start,end)+'\nloadPrivatePlanner()',{
  loadLegacyPlanner:()=>base,confirmedCareerContext:context,
  mergeConfirmedCareerPlanner:(b,r)=>{merges++;return {...b,revision:r.revision};},verifiedSchoolKey:()=>null
 });
 assert.equal(run(),base);
 context={isCurrent:()=>false,getRecord:()=>{throw Error('must not read');}};
 assert.equal(run().jobs[0].school,'Carrera sin confirmar');
 context={isCurrent:()=>true,getRecord:()=>null};assert.equal(run().jobs[0].school,'Carrera sin confirmar');
 context={isCurrent:()=>true,getRecord:()=>({revision:1})};assert.equal(run().revision,1);
 assert.equal(merges,1);assert.equal(base.jobs.length,0);
});

test('free recovery is separate, authenticated and reset on logout',()=>{
 assert.equal((html.match(/id="apd-perfil-horarios-recuperacion"/g)||[]).length,1);
 assert.match(html,/id="apd-perfil-horarios-recuperacion" hidden/);
 assert.match(html,/const accountScheduleRecoveryEnabled=true;/);
 assert.match(html,/if\(accountScheduleRecoveryEnabled&&accountScheduleClient&&recoveryCurrent\(\)\)/);
 assert.match(html,/const recoveryCurrent=\(\)=>dashboardLoadedOwner===owner&&obtenerToken\(\)===owner&&readBearer\(\)===bearer&&planActual\?\.access_active===true/);
 assert.match(html,/addEventListener\('click',resetRecovery,true\)/);
 assert.match(html,/resetRecovery\(\);resetCareer\(\);accountScheduleClient=null/);
 assert.match(html,/recoveryCoordinator\.sync\(\{host:document\.getElementById\('apd-perfil-horarios-recuperacion'\),client:accountScheduleClient/);
 assert.match(panel,/if\(!hasInsignePlannerAccess\(planInfo\)\)\{\s*profileScheduleClient=null;\s*host\.replaceChildren/);
});

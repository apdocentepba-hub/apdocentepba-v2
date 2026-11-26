// Read-only production verification after catalog activation. No login, checkout, or cron.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {OLD,NEXT,NEXT_HASH,worker,activeVersion,inspectCrons,verifyVersion} from './apd-commercial-release-contracts.mjs';
const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH||'','utf8'));
if(process.env.GITHUB_REPOSITORY!=='apdocentepba-hub/apdocentepba-v2'||process.env.GITHUB_EVENT_NAME!=='pull_request'||event.pull_request?.head?.repo?.full_name!==process.env.GITHUB_REPOSITORY||event.pull_request?.head?.ref!=='qa/commercial-postactivation-20261126')throw Error('Unexpected read-only context');
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token)throw Error('Missing auth');
async function cf(path){
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Cloudflare GET '+r.status);
 const j=await r.json();assert.equal(j.success,true);return j.result;
}
const accounts=await cf('/accounts?per_page=50');
const id=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:'');
assert.ok(id&&accounts.some(a=>a.id===id),'Account not verified');
const root='/accounts/'+encodeURIComponent(id)+'/workers/';
const route=root+'scripts/'+worker+'/deployments';
async function live(){assert.equal(activeVersion(await cf(route)),NEXT);inspectCrons(await cf(root+'scripts/'+worker+'/schedules'));}
await live();
verifyVersion(await cf(root+'workers/'+worker+'/versions/'+NEXT+'?include=modules'),NEXT,NEXT_HASH,902908);
const origin='https://'+worker+'.apdocentepba.workers.dev',site='https://alertasapd.com.ar';
async function get(url){
 const r=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
 return r;
}
const r=await get(origin+'/api/planes');
assert.equal(r.status,200);
const d=await r.json();
assert.equal(d.ok,true);assert.equal(d.commercial_model,'free_complete_v1');assert.equal(d.trial_days,14);assert.equal(d.commercial_enrollment_open,false);
assert.deepEqual(d.planes.map(p=>p.code),['FREE','COMPLETO']);
for(const [code,price,districts,cargos] of [['FREE',0,1,1],['COMPLETO',2000,5,10]]){
 const p=d.planes.find(p=>p.code===code);assert.equal(Number(p.price_ars),price);assert.equal(Number(p.max_distritos),districts);assert.equal(Number(p.max_cargos),cargos);
}
const paths=['/api/mi-plan','/api/account/profile','/api/account/preferences','/api/account/application-diary','/api/mis-alertas','/api/historico-resumen'];
for(const p of paths){const r=await get(origin+p);assert.equal(r.status,401,p);await r.body?.cancel();}
const assets=[['/','index.html'],['/plan_checkout_patch.js?v=5','plan_checkout_patch.js'],['/apd_comparador_panel.mjs?v=20261126-commercial1','apd_comparador_panel.mjs'],['/scripts/apd-insigne-planner-entitlement.mjs?v=20261126-commercial1','scripts/apd-insigne-planner-entitlement.mjs']];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [url,file] of assets){const r=await get(site+url);assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),sha(fs.readFileSync(file)),file);}
await live();
console.log('APD_COMMERCIAL_PUBLIC_CATALOG_CLOSED_PASS '+JSON.stringify({active:NEXT,plans:d.planes.map(p=>({code:p.code,price_ars:p.price_ars,max_distritos:p.max_distritos,max_cargos:p.max_cargos})),trialDays:14,admissionOpen:false,privateRoutes:6,publicAssets:4,bindings:29,crons:4,writes:0,providerCalls:0}));

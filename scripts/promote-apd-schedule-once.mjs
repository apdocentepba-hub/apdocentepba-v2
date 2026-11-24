/** Promote only the exact previously authenticated-tested Worker version. No reupload or force. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const old='8d0d65d9-a338-45d2-b7e9-68879f35b6d8',candidate='49a33cc8-0b0a-4c07-9b8b-3492bf0c2132';
const worker='ancient-wildflower-cd37',origin='https://alertasapd.com.ar',live='https://'+worker+'.apdocentepba.workers.dev';
const preview='https://apd-schedule-pr304-'+worker+'.apdocentepba.workers.dev';
const token=process.env.CLOUDFLARE_API_TOKEN;let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
assert.equal(process.env.GITHUB_HEAD_REF,'release/schedule-worker-20261124');
assert.ok(token,'Cloudflare release token missing');
const api=async(path,body)=>{
 const res=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 if(!res.ok)throw Error('Cloudflare HTTP '+res.status);
 const j=await res.json();if(!j.success)throw Error('Cloudflare API rejected');return j.result;
};
const accounts=await api('/accounts?per_page=50');
assert.ok(Array.isArray(accounts)&&accounts.length>0,'Cloudflare account inaccessible');
if(!account){assert.equal(accounts.length,1,'Cloudflare account ambiguous');account=String(accounts[0].id);}
assert.ok(/^[a-f0-9]{32}$/i.test(account)&&accounts.some(x=>x.id===account),'Cloudflare account mismatch');
const prefix='/accounts/'+account+'/workers/',deployment=prefix+'scripts/'+worker+'/deployments';
const active=async()=>{const a=(await api(deployment))?.deployments?.[0]?.versions?.filter(v=>Number(v.percentage)>0);assert.ok(a?.length===1&&Number(a[0].percentage)===100,'Unexpected traffic distribution');return a[0].version_id;};
const cronExpected=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8')).schedules.slice().sort();
async function cron(){const j=await api(prefix+'scripts/'+worker+'/schedules');assert.deepEqual((Array.isArray(j)?j:j?.schedules||[]).map(x=>x.cron).sort(),cronExpected);}
const bindingKeys=x=>(x.bindings||[]).map(b=>b.name+':'+b.type+':'+(b.namespace_id||b.id||'')).sort();
const checks=[['GET','/api/account/schedule',401],['PUT','/api/account/schedule',401],['DELETE','/api/account/schedule',405],['GET','/api/account/home',401],['GET','/api/account/profile',401],['GET','/api/mis-alertas',401],['GET','/api/mi-plan',401],['GET','/api/historico-resumen',401],['GET','/api/version',200],['GET','/api/planes',200]];
async function smoke(base,withSchedule=true){
 for(const [method,path,status] of checks.filter(x=>withSchedule||!x[1].endsWith('/schedule'))){
  const r=await fetch(base+path,{method,redirect:'error',cache:'no-store',headers:{Origin:origin,...(method==='PUT'?{'Content-Type':'application/json'}:{})},...(method==='PUT'?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)});
  if(r.status!==status)throw Error(path+' HTTP '+r.status);
  if(method==='GET'&&path==='/api/version')assert.equal((await r.json()).ok,true);
  if(withSchedule&&path.endsWith('/schedule')){assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.match(r.headers.get('cache-control')||'',/no-store/);}
 }
 if(withSchedule){
  const headers={Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'};
  const r=await fetch(base+'/api/account/schedule',{method:'OPTIONS',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.ok(r.ok);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.match(r.headers.get('access-control-allow-methods')||'',/PUT/i);
  const allowed=r.headers.get('access-control-allow-headers')||'';assert.match(allowed,/authorization/i);assert.match(allowed,/content-type/i);
  const f=await fetch(base+'/api/account/schedule',{method:'OPTIONS',headers:{...headers,Origin:'https://untrusted.invalid'},redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(f.headers.get('access-control-allow-origin'),null);
 }
}
async function switchTo(id){const d=await api(deployment,{strategy:'percentage',versions:[{version_id:id,percentage:100}]});assert.ok(d?.id,'Deployment response not confirmed');}
async function settled(id,fn){let last;for(let i=0;i<5;i++){try{assert.equal(await active(),id);await fn();return;}catch(e){last=e;await new Promise(r=>setTimeout(r,4000));}}throw last;}
assert.equal(await active(),old,'Active baseline changed; stop');
await cron();const [a,b]=await Promise.all([old,candidate].map(id=>api(prefix+'workers/'+worker+'/versions/'+id+'?include=modules')));
assert.equal(bindingKeys(a).length,29);assert.deepEqual(bindingKeys(a),bindingKeys(b));
assert.ok(b.modules?.length===1&&Buffer.from(b.modules[0].content_base64,'base64').toString('utf8').includes('handleAccountScheduleSecureV1'));
await smoke(live,false);await smoke(preview,true);
console.log('APD_RELEASE_PREFLIGHT_PASS exact version, 29 bindings, four crons, authenticated QA evidence run 45418646403');
assert.equal(await active(),old,'Concurrent production change; stop');
let attempted=false;
try{
 attempted=true;await switchTo(candidate);
 await settled(candidate,async()=>{await cron();await smoke(live,true);});
 console.log('APD_SCHEDULE_PRODUCTION_PASS '+JSON.stringify({version:candidate,previous:old,traffic:100,checks:checks.length+2,bindings:29,crons:4}));
}catch(e){
 console.error('APD_SCHEDULE_RELEASE_FAILED; checking active deployment before rollback');
 if(attempted){
  const id=await active();
  if(id===candidate){await switchTo(old);await settled(old,async()=>{await cron();await smoke(live,false);});console.log('APD_SCHEDULE_ROLLBACK_PASS');}
  else if(id!==old)throw Error('Unknown concurrent deployment; manual inspection required');
 }
 throw Error('Promotion did not pass; keep frontend gate false');
}

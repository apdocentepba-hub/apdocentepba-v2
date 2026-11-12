/**
 * APD 2026-11-12: readonly production Worker baseline attestation.
 * Never exports Worker module contents or Cloudflare binding values.
 * Does not deploy, change traffic, modify data or create a secret-containing artifact.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const WORKER='ancient-wildflower-cd37';
const PINNED_VERSION='8d0d65d9-a338-45d2-b7e9-68879f35b6d8';
const ROLLBACK_VERSION='3bbc9f42-9f65-4eda-83d1-2a0cf7ff25b2';
const ROOT='tmp/apd-worker-baseline-audit';
const HASH=b=>crypto.createHash('sha256').update(b).digest('hex');
const header=(token)=>({Authorization:'Bearer '+token});
const timeout=()=>AbortSignal.timeout(20000);
async function api(token,pathname){
 const r=await fetch('https://api.cloudflare.com/client/v4'+pathname,{
  method:'GET',headers:header(token),signal:timeout()
 });
 if(!r.ok)throw Error('Cloudflare metadata HTTP '+r.status);
 const parsed=await r.json();
 if(parsed?.success!==true)throw Error('Cloudflare metadata unsuccessful');
 return parsed.result;
}
function onlyOneDeployment(raw){
 const active=(raw?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 if(active.length!==1||Number(active[0].percentage)!==100)
  throw Error('No single 100% production version; refusing attestation');
 return active[0].version_id;
}
function safeBindings(raw,baseline){
 const now=Array.isArray(raw)?raw:[];
 const prior=Array.isArray(baseline?.bindings)?baseline.bindings:[];
 const current=new Map(now.map(b=>[b.name+':'+b.type,b]));
 if(now.length!==29||current.size!==29||prior.length!==29)
  throw Error('Unexpected Worker bindings count or duplicated types');
 for(const old of prior){
  const actual=current.get(old.name+':'+old.type);
  if(!actual)throw Error('Missing or retyped canonical binding '+old.name);
  if(old.namespace_id&&old.namespace_id!==String(actual.namespace_id||actual.id||''))
   throw Error('Unexpected KV namespace for '+old.name);
 }
 const safe=now.map(b=>({
  name:String(b.name),type:String(b.type),
  ...(b.type==='kv_namespace'?{namespace_id:String(b.namespace_id||b.id||'')}:{})
 })).sort((a,b)=>a.name.localeCompare(b.name));
 if(safe.some(b=>!b.name||!b.type||b.type==='kv_namespace'&&!b.namespace_id))
  throw Error('Incomplete binding metadata');
 return safe;
}
function safeCode(module,manifest,details){
 if(!module||typeof module.content_base64!=='string')
  throw Error('Active Worker source unavailable');
 const source=Buffer.from(module.content_base64,'base64');
 const code=source.toString('utf8');
 if(source.length<100000||source.length>3000000||
    !code.includes('getSessionUserByBearer')||
    !code.includes('handleAccountHomeSecureV1')||
    !code.includes('user_home_reference?user_id=eq.')||
    !code.includes('cors["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS"')||
    !code.includes('handleAccountProfileSecureV1')||
    !code.includes('handleAccountPreferencesSecureV1')||
    !code.includes('async fetch(request, env, ctx)')||
    !code.includes('scheduled('))
  throw Error('Missing security/cron anchors from approved Worker');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(code)||
    /\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b/.test(code))
  throw Error('Source appears to include an embedded credential; refuse capture');
 const name=String(module.name||'');
 if(!/^[\w.-]+\.m?js$/.test(name)||name.includes('..')||
    String(details.main_module||'')!==name)
  throw Error('Unexpected current Cloudflare module name/entrypoint');
 if(manifest.main_module!=='worker_hotfix.js')
  throw Error('Existing repository canonical source identity changed');
 return {name,bytes:source.length,sha256:HASH(source)};
}
function safeCron(result){
 const raw=Array.isArray(result)?result:
  Array.isArray(result?.schedules)?result.schedules:
  Array.isArray(result?.crons)?result.crons:[];
 const cron=raw.map(x=>typeof x==='string'?x:String(x?.cron||'')).sort();
 const expected=['0 01 * * *','0 17 * * *','0 21 * * *','1-59/2 * * * *'].sort();
 if(JSON.stringify(cron)!==JSON.stringify(expected))
  throw Error('Active Worker cron schedules do not match the four approved triggers');
 return cron;
}
async function status(method,path){
 const url='https://'+WORKER+'.apdocentepba.workers.dev'+path;
 const res=await fetch(url,{method,redirect:'manual',signal:timeout()});
 await res.body?.cancel();
 return res.status;
}
async function main(){
 const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
 if(!token)throw Error('Cloudflare readonly token is required');
 const accountList=await api(token,'/accounts?per_page=50');
 let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
 if(!account){
  if(!Array.isArray(accountList)||accountList.length!==1)
   throw Error('Cloudflare account is ambiguous');
  account=String(accountList[0].id||'');
 }
 if(!Array.isArray(accountList)||!accountList.some(x=>x.id===account))
  throw Error('Configured Cloudflare account is inaccessible');
 const base='/accounts/'+encodeURIComponent(account)+'/workers/';
 const deployed=await api(token,base+'scripts/'+WORKER+'/deployments');
 const active=onlyOneDeployment(deployed);
 if(active!==PINNED_VERSION)
  throw Error('Production version drifted from approved 12 November release');
 const live=await api(token,base+'workers/'+WORKER+'/versions/'+PINNED_VERSION+'?include=modules');
 if(live?.id!==PINNED_VERSION||!Array.isArray(live.modules)||live.modules.length!==1)
  throw Error('Active version details unexpectedly changed');
 const previous=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
 const modules=safeCode(live.modules[0],previous,live);
 // Independently attested and committed after a successful readonly audit.
 const pinned=JSON.parse(fs.readFileSync(
  'docs/APD_WORKER_APPROVED_LIVE_BASELINE_20261112.json','utf8'));
 if(pinned.active_version!==PINNED_VERSION||
    modules.name!==pinned.module.name||
    modules.bytes!==pinned.module.bytes||
    modules.sha256!==pinned.module.sha256)
  throw Error('Cloudflare active code diverges from independently pinned release');
 const bindings=safeBindings(live.bindings,previous);
 const crons=safeCron(await api(token,base+'scripts/'+WORKER+'/schedules'));
 const checks=[
  ['GET','/api/account/home',401],['POST','/api/account/home',405],
  ['GET','/api/account/profile',401],['GET','/api/mis-alertas',401],
  ['GET','/api/version',200],['GET','/api/planes',200]
 ];
 for(const [method,path,expected] of checks){
  const got=await status(method,path);
  if(got!==expected)throw Error('Production HTTP contract '+method+' '+path+' expected '+expected+' got '+got);
 }
 const second=onlyOneDeployment(await api(token,base+'scripts/'+WORKER+'/deployments'));
 if(second!==PINNED_VERSION)throw Error('Live Worker moved during readonly attestation');
 const report={
  schema:1,worker:WORKER,
  active_version:PINNED_VERSION,rollback_version:ROLLBACK_VERSION,
  production_traffic_percent:100,module:modules,
  bindings,crons,http_checks:checks.length,
  verified_at:new Date().toISOString(),
  scope:'read_only_metadata_no_source_saved_no_user_data'
 };
 fs.mkdirSync(ROOT,{recursive:true});
 fs.writeFileSync(ROOT+'/baseline.json',JSON.stringify(report,null,2)+'\n');
 console.log('APD_WORKER_LIVE_BASELINE_PASS '+JSON.stringify({
  version:report.active_version,rollback:report.rollback_version,
  module:report.module,bindings:report.bindings.length,
  crons:report.crons.length,http_checks:report.http_checks,
  production_traffic_percent:100,
  source_saved:false
 }));
}
await main();

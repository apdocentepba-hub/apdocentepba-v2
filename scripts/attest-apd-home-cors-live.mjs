/**
 * Read-only attestation for the actual production CORS hotfix release.
 * Reports only UUID, module name, byte length, SHA-256 and metadata counts.
 * Never exports executable Worker source, secret binding values or user rows.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
const WORKER='ancient-wildflower-cd37';
const PINNED='8d0d65d9-a338-45d2-b7e9-68879f35b6d8';
const PREVIOUS='3bbc9f42-9f65-4eda-83d1-2a0cf7ff25b2';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
if(!token)throw Error('Cloudflare token missing');
const get=async path=>{
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{
  headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)
 });
 if(!r.ok)throw Error('Cloudflare metadata HTTP '+r.status);
 const j=await r.json();
 if(j.success!==true)throw Error('Cloudflare metadata unsuccessful');
 return j.result;
};
const accounts=await get('/accounts?per_page=50');
const configured=String(process.env.CLOUDFLARE_ACCOUNT_ID||'');
const account=configured||(accounts.length===1?accounts[0].id:'');
if(!account||!Array.isArray(accounts)||!accounts.some(a=>a.id===account))
 throw Error('Cloudflare account ambiguous');
const prefix='/accounts/'+encodeURIComponent(account)+'/workers/';
const active=async()=>{
 const dep=await get(prefix+'scripts/'+WORKER+'/deployments');
 const versions=(dep?.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
 if(versions.length!==1||Number(versions[0].percentage)!==100)
  throw Error('Cloudflare production traffic not pinned at 100%');
 return String(versions[0].version_id||'');
};
if(await active()!==PINNED)throw Error('Active Worker no longer matches deployed CORS hotfix');
const info=await get(prefix+'workers/'+WORKER+'/versions/'+PINNED+'?include=modules');
if(info?.id!==PINNED||!Array.isArray(info.modules)||info.modules.length!==1)
 throw Error('Unexpected source module count');
const mod=info.modules[0],source=Buffer.from(mod.content_base64||'','base64');
const code=source.toString('utf8');
const sha256=crypto.createHash('sha256').update(source).digest('hex');
if(source.length<100000||source.length>3000000||
   !code.includes('handleAccountHomeSecureV1')||
   !code.includes('getSessionUserByBearer')||
   !code.includes('cors["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS"'))
 throw Error('Scoped CORS or account access code missing');
const previous=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const bindings=info.bindings||[];
const bindingsMap=new Map(bindings.map(b=>[b.name+':'+b.type,b]));
if(bindings.length!==29||bindingsMap.size!==29||
 previous.bindings?.some(b=>{
  const current=bindingsMap.get(b.name+':'+b.type);
  return !current||(b.namespace_id&&String(current.namespace_id||current.id||'')!==b.namespace_id);
 }))throw Error('Live bindings differ from canonical baseline');
const sched=await get(prefix+'scripts/'+WORKER+'/schedules');
const crons=(Array.isArray(sched)?sched:sched.schedules||[])
 .map(x=>typeof x==='string'?x:String(x?.cron||'')).sort();
const approved=["0 01 * * *","0 17 * * *","0 21 * * *","1-59/2 * * * *"].sort();
if(JSON.stringify(crons)!==JSON.stringify(approved))
 throw Error('Live schedules diverge from approved four');
if(await active()!==PINNED)throw Error('Active Worker changed during audit');
const metadata={version:PINNED,rollback:PREVIOUS,module:String(mod.name),
 main_module:String(info.main_module),bytes:source.length,sha256,
 binding_count:bindings.length,crons:crons.length,
 scope:'Cloudflare production metadata only; no source or secrets',
 production_percent:100};
if(metadata.module!==metadata.main_module||!/^[-\w.]+\.m?js$/.test(metadata.module))
 throw Error('Unexpected Cloudflare module naming');
console.log('APD_CORS_ACTIVE_WORKER_ATTESTATION '+JSON.stringify(metadata));

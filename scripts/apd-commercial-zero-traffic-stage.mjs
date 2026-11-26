// Explicitly authorized version upload only; never promotes, never changes schedules.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const branch='feat/commercial-consolidation-20261125';
const tag='apd-commercial-65006ce5607c';
export async function stageZeroTraffic({candidate,envelope,details,manifest,account,worker,get,root,activeVersion,inspectCrons}){
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH||'', 'utf8'));
 if(process.env.GITHUB_REPOSITORY!=='apdocentepba-hub/apdocentepba-v2'||process.env.GITHUB_EVENT_NAME!=='pull_request'||
    event.number!==334||event.pull_request?.head?.repo?.full_name!==process.env.GITHUB_REPOSITORY||
    event.pull_request?.head?.ref!==branch||process.env.APD_STAGE_COMMERCIAL_ZERO_TRAFFIC!=='1')throw Error('Unapproved staging context');
 const {receipt,candidateConfig}=envelope;
 if(receipt.candidateSha256!=='65006ce5607cd348bff9fd7a606381b7c4fda1af2f9e27f7b473faad99f162ac'||
    hash(Buffer.from(candidate))!==receipt.candidateSha256||
    receipt.configSha256!=='6d5a3846d6513986be8ad36cd689cfa4b46a4e0bea2e6ddc9d1fb2c2d87cb0be'||
    hash(Buffer.from(candidateConfig))!==receipt.configSha256||
    receipt.rollbackVersion!==receipt.baseVersion)throw Error('Approved envelope drift');
 const route=root+'scripts/'+worker+'/deployments', schedules=root+'scripts/'+worker+'/schedules';
 const versionsRoute=root+'workers/'+worker+'/versions?per_page=50';
 async function unchanged(){
  if(activeVersion(await get(route))!==receipt.baseVersion)throw Error('Production traffic changed; no promotion attempted');
  inspectCrons(await get(schedules));
 }
 async function tagged(){
  const v=await get(versionsRoute), all=Array.isArray(v)?v:v?.versions;
  if(!Array.isArray(all))throw Error('Version inventory unavailable');
  const matches=all.filter(x=>x.annotations?.['workers/tag']===tag);
  if(matches.length>1)throw Error('Ambiguous staged version tag');
  return matches[0]?.id||null;
 }
 await unchanged();
 let staged=await tagged(), uploaded=false;
 if(!staged){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apd-commercial-stage-'));
  try{
   const entry=path.join(dir,'worker-diary-candidate.js'), config=path.join(dir,'wrangler.toml');
   fs.writeFileSync(entry,candidate,{mode:0o600,flag:'wx'});
   fs.writeFileSync(config,candidateConfig,{mode:0o600,flag:'wx'});
   await unchanged();
   const result=spawnSync('npx',['--no-install','wrangler','versions','upload','--config',config,
    '--keep-vars','--no-bundle','--strict','--tag',tag,'--message','APD commercial candidate; zero traffic'],{
     cwd:process.cwd(),env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account},stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:8*1024*1024});
   // CLI stdout/stderr can contain legacy plaintext credentials: never emit either.
   await unchanged();
   if(result.status!==0)throw Error('Version upload unsuccessful; output withheld; inspect version inventory before retry');
   uploaded=true;
   staged=await tagged();
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 if(!staged||staged===receipt.baseVersion)throw Error('Zero-traffic version not identified');
 const d=await get(root+'workers/'+worker+'/versions/'+encodeURIComponent(staged)+'?include=modules');
 if(d.id!==staged||!Array.isArray(d.modules)||d.modules.length!==1||d.main_module!==d.modules[0].name||
    typeof d.modules[0].content_base64!=='string'||hash(Buffer.from(d.modules[0].content_base64,'base64'))!==receipt.candidateSha256)throw Error('Uploaded source differs from approved candidate');
 const old=details.bindings, now=d.bindings;
 if(!Array.isArray(old)||!Array.isArray(now)||old.length!==29||now.length!==29||
    new Set(now.map(b=>b.name)).size!==29)throw Error('Staged binding inventory mismatch');
 const map=new Map(now.map(b=>[b.name+':'+b.type,b]));
 for(const b of old){
  const n=map.get(b.name+':'+b.type);
  if(!n)throw Error('Staged binding missing');
  if(b.type==='kv_namespace'&&String(b.namespace_id||b.id||'')!==String(n.namespace_id||n.id||''))throw Error('Staged KV target differs');
  if(b.type==='plain_text'&&b.text!==n.text)throw Error('Staged scalar binding differs');
 }
 if(d.compatibility_date!==details.compatibility_date||
    JSON.stringify((d.compatibility_flags||[]).slice().sort())!==JSON.stringify((details.compatibility_flags||[]).slice().sort()))throw Error('Staged runtime compatibility differs');
 await unchanged();
 console.log('APD_COMMERCIAL_ZERO_TRAFFIC_PASS '+JSON.stringify({version:staged,activeVersion:receipt.baseVersion,trafficPercent:0,sha256:receipt.candidateSha256,bindings:29,crons:4,uploaded,productionWrites:0,approvedForPromotion:false}));
}

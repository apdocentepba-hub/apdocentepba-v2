// Verify public immutable bytes and commercial admission without accounts or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const site='https://alertasapd.com.ar';
const worker='https://ancient-wildflower-cd37.apdocentepba.workers.dev';
const files=['index.html','plan_checkout_patch.js','apd_comparador_panel.mjs','scripts/apd-insigne-planner-entitlement.mjs'];
const read=(name,ref)=>ref?execFileSync('git',['show',ref+':'+name]):fs.readFileSync(name);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function refs(readFile){
 const html=readFile(files[0]).toString('utf8'),panel=readFile(files[2]).toString('utf8');
 const plan=html.match(/<script src="(plan_checkout_patch\.js\?v=\d+)"><\/script>/g);
 const comp=html.match(/import\('\.\/(apd_comparador_panel\.mjs\?v=[a-zA-Z0-9-]+)'\)/g);
 const ent=panel.match(/from '\.\/(scripts\/apd-insigne-planner-entitlement\.mjs(?:\?v=[a-zA-Z0-9-]+)?)'/g);
 assert.equal(plan?.length,1);assert.equal(comp?.length,1);assert.equal(ent?.length,1);
 return [plan[0].match(/src="([^"]+)"/)[1],comp[0].match(/'\.\/([^']+)'/)[1],ent[0].match(/'\.\/([^']+)'/)[1]];
}
const current=refs(n=>read(n));
assert.deepEqual(current,['plan_checkout_patch.js?v=5','apd_comparador_panel.mjs?v=20261126-commercial1','scripts/apd-insigne-planner-entitlement.mjs?v=20261126-commercial1']);
console.log('APD_FRONTEND_CACHE_CHAIN_CONTRACT_PASS');
const baseline=process.argv.includes('--baseline');
const ref=baseline?'93be1dd9ac9ccf3e9e17ec4e17fccaa581127292':null;
const expected=refs(n=>read(n,ref));
const revision=baseline?'baseline93be1dd9':String(process.env.GITHUB_SHA||'').slice(0,12);
async function get(url){
 const r=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
 if(r.status!==200)throw Error('HTTP '+r.status+' at '+new URL(url).pathname);
 return Buffer.from(await r.arrayBuffer());
}
async function verify(){
 const checks=[];
 const paths=['/',...expected.map(x=>'/'+x)];
 for(let i=0;i<files.length;i++){
  const want=sha(read(files[i],ref));
  // Baseline cache bust is deliberate; after deployment verify actual referenced URLs too.
  const path=paths[i]+(paths[i].includes('?')?'&':'?')+'apd_verify='+revision;
  const fresh=sha(await get(site+path));
  if(fresh!==want)throw Error('Fresh asset fingerprint mismatch: '+files[i]);
  if(!baseline&&sha(await get(site+paths[i]))!==want)throw Error('Referenced URL fingerprint mismatch: '+files[i]);
  checks.push({asset:files[i],sha256:want});
 }
 const data=JSON.parse((await get(worker+'/api/planes')).toString('utf8'));
 assert.ok(Array.isArray(data.planes)&&data.planes.length===7,'Legacy catalog not preserved');
 assert.ok(!data.planes.some(p=>['FREE','COMPLETO','TRIAL_14D'].includes(String(p.code))),'New plans prematurely visible');
 assert.notEqual(data.commercial_enrollment_open,true,'Admission opened');
 console.log('APD_PUBLIC_FRONTEND_VERIFIED '+JSON.stringify({baseline,checks,legacyPublicPlans:7,admissionOpen:false,requests:'GET only'}));
}
let last;
for(let i=0;i<(baseline?2:12);i++){
 try{await verify();last=null;break;}catch(e){last=e;console.log('Frontend verification attempt '+(i+1)+': '+String(e.message).slice(0,250));if(i+1<(baseline?2:12))await new Promise(r=>setTimeout(r,10000));}
}
if(last)throw last;

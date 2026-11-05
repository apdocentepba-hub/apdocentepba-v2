// One-time, fail-closed hotfix of the CURRENT active APD Worker.
// No DB writes; no notifications; only the deadline guard function may change.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';

const NAME='ancient-wildflower-cd37';
const OLD_ID='0b289fe2-e978-414a-a1ae-9f849d7354ae';
const OLD_SHA='00a4e730198e2c4577ada85c2d63c9b646ae2cf44e1dcc5527e2e74ce17ed713';
const TAG='apd-email-deep-expiry-20261105';
const ROOT='tmp/apd-live-email-hotfix-20261105';
const metaPath=path.join(ROOT,'metadata.json');
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const token=process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Cloudflare auth token not configured');
let account=process.env.CLOUDFLARE_ACCOUNT_ID||'';

async function apiGet(uri){
  if (!account) {
    const r=await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=50',{headers:{Authorization:'Bearer '+token}});
    const j=await r.json();
    if (!r.ok||!j.success||!Array.isArray(j.result)||j.result.length!==1) throw new Error('Cloudflare account discovery failed closed');
    account=j.result[0].id;
  }
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+uri,{headers:{Authorization:'Bearer '+token}});
  const j=await r.json();
  if (!r.ok||!j.success) throw new Error('Cloudflare read-only GET failed: HTTP '+r.status);
  return j.result;
}
async function liveId(){
  const r=await apiGet('/workers/scripts/'+NAME+'/deployments');
  const v=(r.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
  if(v.length!==1||Number(v[0].percentage)!==100)throw new Error('Production is not on one version @ 100%');
  return v[0].version_id;
}
async function moduleInfo(id){
  const v=await apiGet('/workers/workers/'+NAME+'/versions/'+id+'?include=modules');
  if(v.main_module!=='worker_hotfix.js')throw new Error('Unexpected Worker entrypoint');
  const m=(v.modules||[]).find(x=>x.name===v.main_module);
  if(!m?.content_base64)throw new Error('Worker main module missing');
  return {source:Buffer.from(m.content_base64,'base64').toString('utf8'),bindings:v.bindings||[]};
}

const replacement=String.raw`function apdOfferDeadlineStatus(offer, nowMs=Date.now()) {
  // Source dates survive multiple wrappers added by email normalization.
  // Fail closed on unknown states and dates; do not infer from display labels.
  const root=offer && typeof offer==='object' ? offer : {};
  const seen=new Set(), pending=[{value:root,depth:0}], layers=[];
  for(let i=0;i<pending.length && layers.length<128;i++){
    const {value,depth}=pending[i];
    if(!value || typeof value!=='object' || depth>32 || seen.has(value)) continue;
    seen.add(value); layers.push(value);
    if(value.offer_payload && typeof value.offer_payload==='object')
      pending.push({value:value.offer_payload,depth:depth+1});
    if(value.raw && typeof value.raw==='object')
      pending.push({value:value.raw,depth:depth+1});
  }
  const keys=['estado','estado_oferta','estado_actual','estado_raw'];
  const states=layers.flatMap(layer=>keys.map(key=>layer[key]))
    .map(value=>String(value??'').trim().toUpperCase()).filter(Boolean);
  if(!states.length || states.some(state=>state!=='PUBLICADA'))
    return {eligible:false,reason:'not_published'};
  const deepest=layers.slice().reverse();
  const pick=key=>deepest.map(layer=>String(layer?.[key]??'').trim()).find(Boolean)||'';
  const rawDeadline=pick('finoferta')||pick('fecha_cierre_raw');
  const parsed=parseApdDeadlineInstant(rawDeadline,{abcWallTime:true});
  if(!parsed.ok)return {eligible:false,reason:parsed.reason};
  if(parsed.instant_ms<=Number(nowMs))
    return {eligible:false,reason:'deadline_reached',closes_at_ms:parsed.instant_ms};
  return {eligible:true,reason:'verified_open',closes_at_ms:parsed.instant_ms};
}`;

function extract(source,name){
  const from=source.indexOf('function '+name+'(');
  const to=source.indexOf('\n__name('+name+',',from);
  if(from<0||to<0||source.indexOf('function '+name+'(',from+1)!==-1)
    throw new Error('Expected one unambiguous '+name+' function');
  return {from,to,body:source.slice(from,to).trimEnd()};
}
function tests(parser,oldFunction,newFunction){
  const compile=body=>vm.runInNewContext(parser+'\n'+body+'\n;apdOfferDeadlineStatus;',{}, {timeout:3000});
  const old=compile(oldFunction),fixed=compile(newFunction);
  const now=Date.parse('2026-11-05T17:00:00Z');
  const make=(fin='2026-11-06T07:30:00Z',estado='Publicada',depth=7)=>{
    let src={estado,finoferta:fin};
    for(let i=0;i<depth;i++)src={estado:'Publicada',raw:src};
    return {offer_payload:src};
  };
  const sample=make();
  assert.equal(old(sample,now).eligible,false,'regression must reproduce broken old deep source');
  assert.equal(old(sample,now).reason,'missing_deadline');
  for(let i=0;i<6;i++){
    const outcome=fixed(make('2026-11-06T07:30:00Z','Publicada',5+i),now);
    assert.equal(outcome.eligible,true,'one of six stored APD shapes must stay visible');
    assert.equal(outcome.closes_at_ms,Date.parse('2026-11-06T10:30:00Z'),'ABC 07:30 local Argentina preserved');
  }
  assert.equal(fixed(make('2026-11-04T07:30:00Z'),now).eligible,false,'closed offer rejected');
  assert.equal(fixed(make('', 'Publicada'),now).eligible,false,'missing deadline rejected');
  assert.equal(fixed(make('2026-11-06T07:30:00Z','Cancelada'),now).eligible,false,'cancelled offer rejected');
  assert.equal(fixed(make('INVALID_DATE'),now).eligible,false,'malformed deadline rejected');
  console.log('REGRESSION: RED on active Worker; GREEN on patched Worker; 6 stored shapes + 4 negative tests');
}
async function prepare(){
  assert.equal(await liveId(),OLD_ID,'Active Worker version changed: abort, do not patch');
  const {source,bindings}=await moduleInfo(OLD_ID);
  assert.equal(hash(Buffer.from(source)),OLD_SHA,'Active source changed: abort, do not patch');
  assert.equal(bindings.length,29,'Unexpected production binding count');
  const old=extract(source,'apdOfferDeadlineStatus');
  const parser=extract(source,'parseApdDeadlineInstant');
  tests(parser.body,old.body,replacement);
  const patched=source.slice(0,old.from)+replacement+source.slice(old.to);
  assert.equal(patched.replace(replacement,old.body),source,'Outside-function bytes changed');
  fs.mkdirSync(ROOT,{recursive:true});
  const file=path.join(ROOT,'worker_hotfix.js');
  fs.writeFileSync(file,patched);
  const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
  assert.equal(manifest.worker_name,NAME);
  assert.equal(manifest.bindings.length,29);
  const crons=manifest.schedules;
  assert.deepEqual([...crons].sort(),['0 01 * * *','0 17 * * *','0 21 * * *','1-59/2 * * * *'].sort());
  const kv=manifest.bindings.find(x=>x.name==='EMAIL_SWEEP_STATE' && x.type==='kv_namespace');
  const actualKv=bindings.find(x=>x.name==='EMAIL_SWEEP_STATE' && x.type==='kv_namespace');
  assert.equal(actualKv?.namespace_id,kv.namespace_id,'KV namespace drift');
  const cfg=[
    'name = "'+NAME+'"',
    'main = "worker_hotfix.js"',
    'compatibility_date = "2026-04-01"',
    'workers_dev = true',
    'keep_vars = true',
    '[observability]',
    'enabled = true',
    '[triggers]',
    'crons = '+JSON.stringify(crons),
    '[[kv_namespaces]]',
    'binding = "EMAIL_SWEEP_STATE"',
    'id = '+JSON.stringify(kv.namespace_id),
    ''
  ].join('\n');
  fs.writeFileSync(path.join(ROOT,'wrangler.toml'),cfg);
  const meta={old_id:OLD_ID,old_sha:OLD_SHA,new_sha:hash(Buffer.from(patched)),tag:TAG,expected_bindings:29,tests_ok:true};
  fs.writeFileSync(metaPath,JSON.stringify(meta,null,2));
  console.log('PATCH_PREPARED '+JSON.stringify(meta));
}
async function verify(){
  const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));
  assert.equal(await liveId(),OLD_ID,'Production unexpectedly changed before promotion');
  const result=await apiGet('/workers/workers/'+NAME+'/versions?per_page=100');
  const versions=Array.isArray(result)?result:result.versions||[];
  const found=versions.filter(v=>v.annotations?.['workers/tag']===TAG);
  assert.equal(found.length,1,'Expected exactly one tagged candidate');
  const candidate=found[0].id;
  const {source,bindings}=await moduleInfo(candidate);
  assert.equal(hash(Buffer.from(source)),meta.new_sha,'Uploaded module differs from tested source');
  assert.equal(bindings.length,29,'Candidate lost bindings');
  const {bindings:oldBindings}=await moduleInfo(OLD_ID);
  assert.deepEqual(bindings.map(x=>x.name+':'+x.type).sort(),oldBindings.map(x=>x.name+':'+x.type).sort(),'Candidate resources changed');
  const kv=bindings.find(x=>x.name==='EMAIL_SWEEP_STATE');
  const oldKv=oldBindings.find(x=>x.name==='EMAIL_SWEEP_STATE');
  assert.equal(kv?.namespace_id,oldKv?.namespace_id,'Candidate KV changed');
  for(const [p,expected] of [['/api/version',200],['/api/planes',200],['/api/mis-alertas?user_id=00000000-0000-4000-8000-000000000000',401]]){
    const u='https://'+candidate.slice(0,8)+'-'+NAME+'.apdocentepba.workers.dev'+p;
    const res=await fetch(u);
    assert.equal(res.status,expected,'Preview smoke failed '+p+' HTTP '+res.status);
  }
  fs.appendFileSync(process.env.GITHUB_ENV,'APD_NEW_ID='+candidate+'\nAPD_OLD_ID='+OLD_ID+'\n');
  console.log('CANDIDATE_VERIFIED '+JSON.stringify({version_id:candidate,module_sha:meta.new_sha,bindings:29,preview_smoke:'pass'}));
}
async function check(expected){
  const id=await liveId();
  assert.equal(id,expected,'Production traffic is not on expected Worker version');
  console.log('TRAFFIC_VERIFIED '+id+' @ 100%');
}
const mode=process.argv[2];
if(mode==='prepare')await prepare();
else if(mode==='verify')await verify();
else if(mode==='check-old')await check(OLD_ID);
else if(mode==='check-new'){
  const id=process.env.APD_NEW_ID;
  if(!id)throw new Error('Candidate version missing');
  await check(id);
  for(const [p,expected] of [['/api/version',200],['/api/planes',200],['/api/mis-alertas?user_id=00000000-0000-4000-8000-000000000000',401]]){
    const r=await fetch('https://'+NAME+'.apdocentepba.workers.dev'+p);
    assert.equal(r.status,expected,'Post-deploy smoke failed '+p);
  }
  console.log('PRODUCTION_HTTP_SMOKE_PASS');
}
else throw new Error('Unknown operation');
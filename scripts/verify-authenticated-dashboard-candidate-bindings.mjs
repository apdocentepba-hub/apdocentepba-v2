// Compare all Cloudflare bindings of a zero-traffic candidate to the
// last verified production capture. No secrets are printed or inspected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const name=String(process.env.WORKER_NAME||'').trim();
const tag=String(process.env.CANDIDATE_TAG||'').trim();
if (!token||!account||!name||!tag) throw new Error('Missing validation context');
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
async function getJson(path){
  const response=await fetch(base+path,{
    headers:{Authorization:'Bearer '+token},
    redirect:'error'
  });
  const json=await response.json();
  if(!response.ok||!json.success)throw new Error('Cloudflare API metadata read failed');
  return json.result;
}
const capture=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const versionsResult=await getJson('/workers/workers/'+encodeURIComponent(name)+'/versions?per_page=50');
const versions=Array.isArray(versionsResult)?versionsResult:versionsResult.versions;
assert.ok(Array.isArray(versions),'Version list unavailable');
const candidate=versions.find(x=>x.annotations?.['workers/tag']===tag);
assert.ok(candidate?.id,'Expected tagged candidate not found');
const details=await getJson('/workers/workers/'+encodeURIComponent(name)+'/versions/'+candidate.id+'?include=modules');
const bindings=new Map((details.bindings||[]).map(x=>[x.name+':'+x.type,x]));
for(const expected of capture.bindings||[]){
  const id=expected.name+':'+expected.type;
  const b=bindings.get(id);
  assert.ok(b,'Missing required binding: '+id);
  if(expected.namespace_id){
    assert.equal(String(b.namespace_id||b.id||''),String(expected.namespace_id),
      'KV namespace changed: '+expected.name);
  }
}
console.log('Candidate bindings verified against canonical snapshot: '+bindings.size+' total.');

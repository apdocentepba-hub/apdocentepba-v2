import test from 'node:test';
import assert from 'node:assert/strict';
import {
 auditMobileAbcExactLookupReadOnlyLab
} from './apd-mobile-abc-exact-lookup-readonly-lab.mjs';

const json=(doc,num=1,extra={})=>new Response(JSON.stringify({
 responseHeader:{status:0,...extra},
 response:{numFound:num,docs:num===0?[]:[doc]}
}),{status:200,headers:{'content-type':'application/json'}});
const sample=()=>({
 id:'solr-999',iddetalle:'123',idoferta:'456',
 estado:'Publicada',finoferta:'08/11/2026 09:00',
 descdistrito:'AVELLANEDA',descripcioncargo:'PRECEPTOR'
});
function fixture({first=sample(),follow=sample(),sourceOffline=false,
 noPublished=false,notFound=false,ambiguous=false,malformed=false}={}){
 const requests=[];
 const fetchImpl=async(url,opts)=>{
  const u=new URL(url);
  requests.push({url:u,opts});
  assert.equal(u.origin,'https://servicios3.abc.gob.ar');
  assert.equal(u.pathname,'/valoracion.docente/api/apd.oferta.encabezado/select');
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.cache,'no-store');
  assert.ok(opts.signal);
  if(sourceOffline)throw Error('DO_NOT_ECHO_REAL_SERVER_RESPONSE_OR_URL');
  if(malformed)return new Response('<html>bad</html>',{
   status:200,headers:{'content-type':'text/html'}
  });
  if(requests.length===1){
   assert.equal(u.searchParams.get('q'),'estado:"Publicada"');
   assert.equal(u.searchParams.get('rows'),'1');
   if(noPublished)return json(null,0);
   return json(first);
  }
  assert.equal(u.searchParams.get('rows'),'2');
  assert.equal(u.searchParams.get('wt'),'json');
  if(notFound)return json(null,0);
  if(ambiguous)return new Response(JSON.stringify({
   responseHeader:{status:0},
   response:{numFound:2,docs:[follow,follow]}
  }),{status:200,headers:{'content-type':'application/json'}});
  return json(follow);
 };
 return {requests,fetchImpl};
}
test('single published sample and exact current D_ key can be verified read-only',async()=>{
 const f=fixture();
 const r=await auditMobileAbcExactLookupReadOnlyLab({
  fetchImpl:f.fetchImpl,now:()=>Date.parse('2026-11-08T10:00:00Z')
 });
 assert.equal(r.source_reachable,true);
 assert.equal(r.sample_available,true);
 assert.equal(r.source_key_supported,true);
 assert.equal(r.exact_key_lookup_verified,true);
 assert.equal(r.source_contract_verified,true);
 assert.equal(r.provider_calls,0);
 assert.equal(r.production_modified,false);
 assert.equal(r.credentials_used,false);
 assert.equal(r.personal_data_requested,false);
 assert.equal(r.offer_ids_logged,false);
 assert.equal(r.reads,2);
 assert.equal(f.requests[1].url.searchParams.get('q'),'iddetalle:"123"');
 for(const forbidden of [
  '123','999','456','PRECEPTOR','AVELLANEDA',
  'DO_NOT_ECHO_REAL_SERVER_RESPONSE_OR_URL'
 ])assert.ok(!JSON.stringify(r).includes(forbidden),forbidden);
});
test('missing published sample is unknown, not a verified source contract',async()=>{
 const f=fixture({noPublished:true});
 const r=await auditMobileAbcExactLookupReadOnlyLab({fetchImpl:f.fetchImpl});
 assert.equal(r.source_reachable,true);
 assert.equal(r.sample_available,false);
 assert.equal(r.source_contract_verified,false);
 assert.equal(r.reads,1);
});
test('noncanonical public sample leaves lookup unverified',async()=>{
 const f=fixture({first:{id:'-',idoferta:'x',estado:'Publicada'}});
 const r=await auditMobileAbcExactLookupReadOnlyLab({fetchImpl:f.fetchImpl});
 assert.equal(r.source_reachable,true);
 assert.equal(r.source_key_supported,false);
 assert.equal(r.source_contract_verified,false);
 assert.equal(r.reads,1);
});
test('ABC 503 remains unknown and never emits source content',async()=>{
 const f=fixture({sourceOffline:true});
 const r=await auditMobileAbcExactLookupReadOnlyLab({fetchImpl:f.fetchImpl});
 assert.equal(r.source_reachable,false);
 assert.equal(r.failure_class,'source_unavailable');
 assert.equal(r.source_contract_verified,false);
 assert.equal(r.reads,1);
 assert.ok(!JSON.stringify(r).includes('DO_NOT_ECHO'));
});
for(const [name,opts] of [
 ['not indexed',{notFound:true}],
 ['ambiguous Solr',{ambiguous:true}],
 ['bad MIME',{malformed:true}],
 ['mismatched key',{follow:{...sample(),iddetalle:'789'}}]
]){
 test(name+' never produces verified true',async()=>{
  const f=fixture(opts);
  const r=await auditMobileAbcExactLookupReadOnlyLab({fetchImpl:f.fetchImpl});
  assert.equal(r.source_contract_verified,false);
  assert.ok(r.reads<=3);
  assert.equal(r.provider_calls,0);
 });
}
test('no authenticated users, passwords, ID filters, postulations or writes appear in source audit',async()=>{
 const f=fixture();
 await auditMobileAbcExactLookupReadOnlyLab({fetchImpl:f.fetchImpl});
 assert.ok(f.requests.length<=3);
 for(const request of f.requests){
  const u=request.url;
  assert.equal(u.searchParams.has('user_id'),false);
  assert.equal(u.searchParams.has('dni'),false);
  assert.equal(u.searchParams.has('documento'),false);
  assert.equal(request.opts.body,undefined);
  assert.ok(!('Authorization' in request.opts.headers));
  assert.ok(!('apikey' in request.opts.headers));
 }
});
test('injected fetch and safe bounds mandatory, no default network',async()=>{
 await assert.rejects(()=>auditMobileAbcExactLookupReadOnlyLab({}),
  /invalid_audit_dependencies/);
 await assert.rejects(()=>auditMobileAbcExactLookupReadOnlyLab({
  fetchImpl:async()=>json(null,0),timeoutMs:100_000
 }),/invalid_audit_dependencies/);
});

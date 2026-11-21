// APD PostgREST real HTTP/JWT integration against disposable PG17 only.
// No production credentials, network destinations, user data or notifications.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {compactCaptureFromPages} from './apd-offer-compact-capture.mjs';
import {prepareOfferAuditBatch} from './apd-offer-audit-batch.mjs';

const base=process.env.APD_LAB_POSTGREST_URL;
const secret=process.env.APD_LAB_JWT_SECRET;
if(base!=='http://127.0.0.1:3000'||typeof secret!=='string'||secret.length<64)
 throw new Error('POSTGREST_LAB_DISABLED: local service and test JWT secret required');

const sign=(role,{expiresIn=120,key=secret}={})=>{
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({
  role,exp:Math.floor(Date.now()/1000)+expiresIn
 })).toString('base64url');
 const data=header+'.'+payload;
 const signature=createHmac('sha256',key).update(data).digest('base64url');
 return data+'.'+signature;
};
const ingest=sign('apd_lab_ingest');
let count=0;
async function request(path,{method='GET',token=null,body}={}){
 assert.ok(path==='/'||/^\/(rpc\/[a-z_]+|captures|audit_events|transition_candidates)(?:\?select=\*)?$/.test(path));
 const headers={Accept:'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined)headers['Content-Type']='application/json';
 const res=await fetch(base+path,{method,headers,
  body:body===undefined?undefined:JSON.stringify(body),redirect:'error',
  signal:AbortSignal.timeout(7000)});
 const raw=await res.text();
 let json=null;
 try{json=JSON.parse(raw)}catch{}
 count++;
 return {status:res.status,json,raw:raw.slice(0,1200)};
}
const success=result=>result.status>=200&&result.status<300;
const denied=result=>!success(result)&&result.status>=400;
const accept=result=>{
 assert.ok(success(result),'Expected successful PostgREST RPC, HTTP '+result.status+
  ', message='+String(result.json?.message||'').slice(0,90));
 assert.ok(Array.isArray(result.json)&&result.json.length===1,
  'RPC must return exactly one row');
 return result.json[0];
};

// Verify the actual exposed API surface, not merely 403/404 responses.
// Internal tables, privileged functions, and test-only fixtures must not be
// present in PostgREST's generated OpenAPI contract at all.
const openapi=await request('/',{token:ingest});
assert.ok(success(openapi),'PostgREST OpenAPI contract unavailable');
const visible=Object.keys(openapi.json?.paths||{}).sort();
assert.deepEqual(visible,['/','/rpc/submit_audit','/rpc/submit_compact'].sort(),
 'The public API must expose exactly two validated functions, no internal tables');

// Prove anonymous and invalid JWT requests cannot read or mutate any data.
const anonymous=await request('/rpc/submit_compact',{method:'POST',
 body:{p_snapshot:{}}});
assert.ok(denied(anonymous),'Anonymous ingest RPC must be denied');
const anonRead=await request('/captures?select=*');
assert.ok(denied(anonRead),'Anonymous table read must be denied');
const badSig=await request('/rpc/submit_compact',{method:'POST',
 token:sign('apd_lab_ingest',{key:'invalid-test-key-with-different-signature'}),
 body:{p_snapshot:{}}});
assert.ok(denied(badSig),'Forged signature must be denied');
const expired=await request('/rpc/submit_compact',{method:'POST',
 token:sign('apd_lab_ingest',{expiresIn:-600}),body:{p_snapshot:{}}});
assert.ok(denied(expired),'Expired JWT must be denied');
const observer=await request('/rpc/submit_compact',{method:'POST',
 token:sign('apd_lab_observer'),body:{p_snapshot:{}}});
assert.ok(denied(observer),'Observer JWT must be denied');
const unknown=await request('/rpc/submit_compact',{method:'POST',
 token:sign('apd_lab_function_owner'),body:{p_snapshot:{}}});
assert.ok(denied(unknown),'Unapproved owner role must be denied');

const direct=await request('/captures?select=*',{token:ingest});
assert.ok(denied(direct),'Ingest JWT must not directly read capture rows');
const auditRead=await request('/audit_events?select=*',{token:ingest});
assert.ok(denied(auditRead),'Ingest JWT must not directly read audit records');
const privateCandidateRead=await request('/transition_candidates?select=*',{token:ingest});
assert.ok(denied(privateCandidateRead),'Ingest JWT cannot read review ledger');
const privateCandidateRPC=await request('/rpc/record_transition_candidate',{
 method:'POST',token:ingest,
 body:{p_candidate:{},p_source_offer_key:'D_1'}
});
assert.ok(denied(privateCandidateRPC),'Private registry writer is not exposed via HTTP');
const directWrite=await request('/captures',{method:'POST',token:ingest,
 body:{scope:'LOMAS DE ZAMORA'}});
assert.ok(denied(directWrite),'Ingest JWT must not write directly to tables');
const bypass=await request('/rpc/save_compact',{method:'POST',token:ingest,
 body:{p_snapshot:{},p_inject_failure_for_test:true}});
assert.ok(denied(bypass),'Original injected-failure function must not be exposed');
const fixture=await request('/rpc/fixture',{method:'POST',token:ingest,body:{}});
assert.ok(denied(fixture),'Test data fixture must not be exposed through API');

// Real HTTP RPC writes are permitted solely through validated functions.
const original={source_offer_key:'D_HTTP_1',estado:'Publicada',
 distrito:'SAN VICENTE',finoferta:'2026-11-12T07:30:00Z',
 turno:'Mañana',cargo:'Preceptor'};
const take=(offer,time)=>compactCaptureFromPages({
 scope:'SAN VICENTE',capturedAt:time,
 pages:[{offset:0,sourceTotal:1,rows:[offer]}]});
const previous=take(original,'2026-11-09T08:00:00Z');
const current=take({...original,turno:'Tarde'},'2026-11-09T09:00:00Z');
const batch=prepareOfferAuditBatch(previous,current,{
 nowMs:Date.parse('2026-11-09T09:03:00Z')});
assert.equal(previous.complete,true);
assert.equal(current.complete,true);
assert.equal(batch.verified,true);
assert.equal(batch.events.length,1);
assert.ok(!JSON.stringify(batch).includes('recipient'));
const first=accept(await request('/rpc/submit_compact',{
 method:'POST',token:ingest,body:{p_snapshot:previous}}));
assert.equal(first.applied,true);
assert.equal(first.retained,1);
const second=accept(await request('/rpc/submit_compact',{
 method:'POST',token:ingest,body:{p_snapshot:current}}));
assert.equal(second.applied,true);
assert.equal(second.retained,2);
const event=accept(await request('/rpc/submit_audit',{
 method:'POST',token:ingest,body:{p_batch:batch}}));
assert.equal(event.added,1);
assert.equal(event.retained,1);
const replay=accept(await request('/rpc/submit_audit',{
 method:'POST',token:ingest,body:{p_batch:batch}}));
assert.equal(replay.added,0);
assert.equal(replay.retained,1);

// Tampered evidence and unexpected private fields must fail over HTTP.
const forged=JSON.parse(JSON.stringify(batch));
forged.events[0].before='FORGED';
const forgedResponse=await request('/rpc/submit_audit',{
 method:'POST',token:ingest,body:{p_batch:forged}});
assert.ok(denied(forgedResponse),'Tampered audit event must fail via API');
const leak=JSON.parse(JSON.stringify(current));
leak.rows[0].cuil='NOT_A_REAL_CUIL';
const leakResponse=await request('/rpc/submit_compact',{
 method:'POST',token:ingest,body:{p_snapshot:leak}});
assert.ok(denied(leakResponse),'Unauthorized personal field must fail');

console.log('APD_POSTGREST_HTTP_NODE_PASSED requests='+count+
 ' captures=2 audit_events=1 unapproved_access_denied=1');

/**
 * Real PostgreSQL 17 two-connection lock test in the disposable CI database.
 * No external network, Supabase credentials, payments or push providers.
 * Runs AFTER test-apd-mobile-dispatch-authorization-pg17.sql.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';

const USER='11111111-1111-4111-8111-111111111111';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='88888888-8888-4888-8888-888888888888';
const TIMEOUT=15_000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function runSync(sql){
 const p=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1','-Atq','-c',sql],{
  encoding:'utf8',timeout:TIMEOUT
 });
 if(p.status!==0)
  throw Error('disposable_pg17_session_failed: '+String(p.stderr||'').slice(0,700));
 return p.stdout.trim();
}
function launch(sql,{waitForLock=false}={}){
 const p=spawn('psql',['-X','-v','ON_ERROR_STOP=1','-Atq'],{
  stdio:['pipe','pipe','pipe']
 });
 let out='',err='',lockDone=false,lockResolve,lockReject;
 const locked=new Promise((resolve,reject)=>{
  lockResolve=resolve;lockReject=reject;
 });
 const guard=setTimeout(()=>p.kill('SIGKILL'),TIMEOUT);
 const done=new Promise((resolve,reject)=>{
  p.stdout.on('data',data=>{
   out+=data.toString();
   if(waitForLock&&!lockDone&&out.includes('LOCK_HELD')){
    lockDone=true;lockResolve();
   }
  });
  p.stderr.on('data',d=>{err+=d.toString();});
  p.on('error',e=>{clearTimeout(guard);lockReject(e);reject(e);});
  p.on('close',(code)=>{
   clearTimeout(guard);
   if(waitForLock&&!lockDone)lockReject(Error('pg_lock_marker_not_emitted'));
   if(code===0)resolve(out.trim());
   else reject(Error('pg17_session_failed: '+err.slice(0,700)));
  });
 });
 p.stdin.end(sql+'\n');
 return {done,locked};
}
function seedEvent(char){
 if(!/^[0-9a-f]{1,8}$/.test(char)||64%char.length!==0)
  throw Error('invalid_synthetic_event_seed');
 const key=char.repeat(64/char.length);
 const stmt=[
  'SET ROLE service_role;',
  'INSERT INTO public.apd_mobile_push_outbox',
  '(event_key,user_id,device_id,offer_fingerprint,',
  'source_offer_key,offer_expires_at,status,attempts,lease_id,leased_until)',
  "VALUES ('"+key+"','"+USER+"','"+DEVICE+"',repeat('e',64),",
  "'APD:LAB:CONCURRENCY',clock_timestamp()+interval '1 day',",
  "'leased',1,'"+LEASE+"',clock_timestamp()+interval '10 minutes');"
 ].join('\n');
 runSync(stmt);
 return key;
}
const locker=key=>[
 'BEGIN;',
 'SET ROLE service_role;',
 "SELECT id FROM public.apd_mobile_push_devices",
 "WHERE id='"+DEVICE+"' FOR UPDATE;",
 "SELECT 'LOCK_HELD';",
 'SELECT pg_sleep(1.5);',
 "SELECT coalesce(public.apd_mobile_prepare_dispatch('"+key+
   "','"+LEASE+"')::text,'DENIED');",
 'COMMIT;'
].join('\n');
const auth=key=>[
 'SET ROLE service_role;',
 "SELECT coalesce(public.apd_mobile_prepare_dispatch('"+key+
   "','"+LEASE+"')::text,'DENIED');"
].join('\n');

const first=seedEvent('f');
const sessionA=launch(locker(first),{waitForLock:true});
await sessionA.locked;
const started=Date.now();
const sessionB=launch(auth(first));
const [resultA,resultB]=await Promise.all([sessionA.done,sessionB.done]);
const waited=Date.now()-started;
assert.ok(resultA.split('\n').some(x=>uuid.test(x)),
 'first concurrent worker should receive a UUID');
assert.equal(resultB,'DENIED','the second concurrent worker must not authorize');
assert.ok(waited>200,'second authorization should be serialized by DB lock');
const output=runSync([
 'SET ROLE service_role;',
 "SELECT count(*)::text||'|'||min(o.status)",
 'FROM public.apd_mobile_dispatch_authorizations a',
 'JOIN public.apd_mobile_push_outbox o USING(event_key)',
 "WHERE a.event_key='"+first+"';"
].join('\n'));
assert.equal(output,'1|dispatching');
console.log('PG17_SIMULTANEOUS_AUTHORIZERS_PASS: one ticket, second denied, exclusive state');

// Concurrent revocation waits for the prepare transaction, then atomically
// cancels it through the existing device revocation trigger.
const second=seedEvent('0');
const sender=launch(locker(second),{waitForLock:true});
await sender.locked;
const revoke=launch([
 'SET ROLE service_role;',
 'UPDATE public.apd_mobile_push_devices',
 'SET enabled=false,opted_in=false,revoked_at=clock_timestamp()',
 "WHERE id='"+DEVICE+"';"
].join('\n'));
const [resultSender]=await Promise.all([sender.done,revoke.done]);
assert.ok(resultSender.split('\n').some(x=>uuid.test(x)),
 'prepared before concurrent revocation');
const state=runSync([
 'SET ROLE service_role;',
 "SELECT o.status||'|'||a.state FROM public.apd_mobile_push_outbox o",
 'JOIN public.apd_mobile_dispatch_authorizations a USING(event_key)',
 "WHERE o.event_key='"+second+"';"
].join('\n'));
assert.equal(state,'cancelled|revoked');
const repeat=runSync(auth(second));
assert.equal(repeat,'DENIED');
console.log('PG17_CONCURRENT_REVOCATION_PASS: prepared token revoked, never reauthorized');


// Race an archive/redaction against a second event attempting to reuse the
// SAME Expo ticket. Both operations need the same per-ticket advisory lock;
// the original correlation or its SHA256 tombstone must always reject reuse.
runSync([
 'SET ROLE service_role;',
 'UPDATE public.apd_mobile_push_devices',
 'SET enabled=true,opted_in=true,revoked_at=NULL',
 "WHERE id='"+DEVICE+"';"
].join('\n'));
const retireEvent=seedEvent('abcd');
const duplicateEvent=seedEvent('cdef');
const retireId=runSync([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_prepare_dispatch('"+retireEvent+
  "','"+LEASE+"');"
].join('\n'));
const duplicateId=runSync([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_prepare_dispatch('"+duplicateEvent+
  "','"+LEASE+"');"
].join('\n'));
assert.match(retireId,uuid);
assert.match(duplicateId,uuid);
const reusedTicket='ticket_concurrent_retire_123';
const setup=runSync([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_expo_record_ticket('"+retireEvent+
  "','"+retireId+"','"+reusedTicket+"');",
 "SELECT public.apd_mobile_expo_record_receipt('"+retireEvent+
  "','"+retireId+"','"+reusedTicket+"','provider_accepted');",
 "SELECT public.apd_mobile_resolve_dispatch('"+retireEvent+
  "','"+retireId+"','accepted');",
 'UPDATE public.apd_mobile_expo_receipt_correlation',
 "SET ticket_recorded_at=clock_timestamp()-interval '101 days'",
 "WHERE event_key='"+retireEvent+"';"
].join('\n'));
assert.deepEqual(setup.split('\n').slice(0,3),['t','t','t']);

const redaction=launch([
 'BEGIN;',
 'SET ROLE service_role;',
 'SELECT event_key FROM public.apd_mobile_push_outbox',
 "WHERE event_key='"+retireEvent+"' FOR UPDATE;",
 "SELECT 'LOCK_HELD';",
 'SELECT pg_sleep(1.5);',
 'SELECT public.apd_mobile_expo_retire_terminal_tickets(10,90);',
 'COMMIT;'
].join('\n'),{waitForLock:true});
await redaction.locked;
const competing=launch([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_expo_record_ticket('"+duplicateEvent+
  "','"+duplicateId+"','"+reusedTicket+"');"
].join('\n'));
const [redacted,attempted]=await Promise.all([
 redaction.done,competing.done
]);
assert.equal(attempted,'f','a concurrent event reused an Expo ticket');
assert.ok(redacted.split('\n').some(x=>x==='1'));
const tombstone=runSync([
 'SET ROLE service_role;',
 'SELECT count(*)::text FROM public.apd_mobile_expo_ticket_tombstones',
 "WHERE event_key='"+retireEvent+"';"
].join('\n'));
assert.equal(tombstone,'1');
const stillBlocked=runSync([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_expo_record_ticket('"+duplicateEvent+
  "','"+duplicateId+"','"+reusedTicket+"');"
].join('\n'));
assert.equal(stillBlocked,'f');
console.log('PG17_EXPO_TICKET_REDACTION_VS_REUSE_PASS: one hash, zero duplicate tickets');

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
 const key=char.repeat(64);
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

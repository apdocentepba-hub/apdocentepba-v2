/**
 * APD mobile inbox — real two-session PostgreSQL 17 concurrency tests.
 * Run only AFTER scripts/test-apd-mobile-inbox-transactional-pg17.sql
 * in a disposable local CI database. Never connect to Supabase.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const LIMIT=18000;
function run(sql){
 const p=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1','-Atq','-c',sql],{
  timeout:LIMIT,encoding:'utf8'
 });
 if(p.status!==0)throw Error('pg17_inbox_query_failed: '+String(p.stderr).slice(0,600));
 return p.stdout.trim();
}
function session(sql,{hold=false}={}){
 const p=spawn('psql',['-X','-v','ON_ERROR_STOP=1','-Atq'],{
  stdio:['pipe','pipe','pipe']
 });
 let stdout='',stderr='',signaled=false,resolveHeld,rejectHeld;
 const locked=new Promise((resolve,reject)=>{
  resolveHeld=resolve;rejectHeld=reject;
 });
 const kill=setTimeout(()=>p.kill('SIGKILL'),LIMIT);
 const done=new Promise((resolve,reject)=>{
  p.stdout.on('data',data=>{
   stdout+=String(data);
   if(hold&&!signaled&&stdout.includes('LOCK_HELD')){
    signaled=true;resolveHeld();
   }
  });
  p.stderr.on('data',data=>{stderr+=String(data);});
  p.on('error',error=>{
   clearTimeout(kill);rejectHeld(error);reject(error);
  });
  p.on('close',code=>{
   clearTimeout(kill);
   if(hold&&!signaled)rejectHeld(Error('lock_ready_signal_missing'));
   if(code===0)resolve(stdout.trim());
   else reject(Error('pg17_inbox_session_failed: '+stderr.slice(0,650)));
  });
 });
 p.stdin.end(sql+'\n');
 return {locked,done};
}
const parseJsonLine=output=>{
 const line=output.split('\n').map(x=>x.trim()).find(x=>x.startsWith('{'));
 assert.ok(line,'missing RPC JSON result: '+output.slice(0,150));
 return JSON.parse(line);
};
// Two simultaneous read ACKs on the same unread item:
// first wins; second must observe alreadyRead=true after waiting on account.
const lockAck=session([
 'BEGIN;',
 'SET ROLE service_role;',
 'SET LOCAL lock_timeout = \'8s\';',
 'SELECT last_cursor FROM public.apd_mobile_inbox_accounts_lab',
 "WHERE user_id='"+A+"' FOR UPDATE;",
 "SELECT 'LOCK_HELD';",
 'SELECT pg_sleep(1.25);',
 "SELECT public.apd_mobile_inbox_ack_read_lab('"+A+"','DEMO-AVISO-002',1);",
 'COMMIT;'
].join('\n'),{hold:true});
await lockAck.locked;
const competingAck=session([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_inbox_ack_read_lab('"+A+"','DEMO-AVISO-002',1);"
].join('\n'));
const [win,again]=await Promise.all([lockAck.done,competingAck.done]);
const first=parseJsonLine(win),second=parseJsonLine(again);
assert.equal(first.accepted,true);
assert.equal(first.alreadyRead,false);
assert.equal(second.accepted,true);
assert.equal(second.alreadyRead,true);
assert.equal(first.cursor,7);
assert.equal(second.cursor,7);
const readCount=run([
 'SET ROLE service_role;',
 'SELECT count(*)::text FROM public.apd_mobile_inbox_events_lab',
 "WHERE user_id='"+A+"' AND notice_id='DEMO-AVISO-002'",
 "AND kind='read';"
].join('\n'));
assert.equal(readCount,'1','two concurrent ACKs created duplicate read events');
console.log('PG17_INBOX_CONCURRENT_READ_ACK_PASS: one event, second idempotent');

// Race cancellation against an old revision ACK. Cancellation wins by
// holding the same per-account row lock; old ACK must not mark read.
const cancel=session([
 'BEGIN;',
 'SET ROLE service_role;',
 'SET LOCAL lock_timeout = \'8s\';',
 'SELECT last_cursor FROM public.apd_mobile_inbox_accounts_lab',
 "WHERE user_id='"+B+"' FOR UPDATE;",
 "SELECT 'LOCK_HELD';",
 'SELECT pg_sleep(1.25);',
 "SELECT public.apd_mobile_inbox_append_event_lab('"+B+
  "','DEMO-AVISO-004','DEMO-APD-004',2,'cancelled');",
 'COMMIT;'
].join('\n'),{hold:true});
await cancel.locked;
const lateAck=session([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_inbox_ack_read_lab('"+B+"','DEMO-AVISO-004',1);"
].join('\n'));
const [cancelled,stale]=await Promise.all([cancel.done,lateAck.done]);
assert.ok(cancelled.split('\n').some(s=>s.trim()==='t'));
const staleResult=parseJsonLine(stale);
assert.deepEqual(staleResult,{accepted:false,reason:'stale_revision'});
const query=run([
 'SET ROLE service_role;',
 "SELECT i.status||'|'||i.read::text||'|'||a.last_cursor::text",
 'FROM public.apd_mobile_inbox_items_lab i',
 'JOIN public.apd_mobile_inbox_accounts_lab a USING(user_id)',
 "WHERE i.user_id='"+B+"' AND i.notice_id='DEMO-AVISO-004';"
].join('\n'));
assert.equal(query,'cancelled|true|2');
const noRead=run([
 'SET ROLE service_role;',
 'SELECT count(*)::text FROM public.apd_mobile_inbox_events_lab',
 "WHERE user_id='"+B+"' AND kind='read';"
].join('\n'));
assert.equal(noRead,'0');
const noRevive=run([
 'SET ROLE service_role;',
 "SELECT public.apd_mobile_inbox_append_event_lab('"+B+
  "','DEMO-AVISO-004','DEMO-APD-004',3,'active');"
].join('\n'));
assert.equal(noRevive,'f');
console.log('PG17_INBOX_CANCEL_BEATS_LATE_READ_PASS: zero read, terminal tombstone');

// Verify an update to B cannot change A's cursor.
const scope=run([
 'SET ROLE service_role;',
 "SELECT (SELECT last_cursor FROM public.apd_mobile_inbox_accounts_lab",
 "WHERE user_id='"+A+"')::text||'|'||",
 "(SELECT last_cursor FROM public.apd_mobile_inbox_accounts_lab",
 "WHERE user_id='"+B+"')::text;"
].join('\n'));
assert.equal(scope,'7|2');
console.log('PG17_INBOX_ACCOUNT_ISOLATION_PASS: independent cursor streams');

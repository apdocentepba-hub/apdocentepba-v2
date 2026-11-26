// Transport is restricted to the dedicated localhost disposable PostgreSQL/PostgREST fixture.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
export function createCommercialPgQa(){
 const base='http://127.0.0.1:3300/';
 const uid='00000000-0000-4000-8000-000000000007';
 const env={PATH:process.env.PATH,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'apd_commercial_full_qa',PGUSER:'postgres',PGPASSWORD:'fixture_only',PGOPTIONS:'-c statement_timeout=8000'};
 const sql=query=>execFileSync('psql',['-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-c',query],{env,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();
 assert.equal(sql("SELECT current_database()||':'||current_user"),'apd_commercial_full_qa:postgres');
 assert.equal(sql("SELECT count(*) FROM public.apd_commercial_qa_guard WHERE marker='disposable-full-module'"),'1');
 const readTables=new Set(['subscription_plans','apd_commercial_release_control','sessions','users','user_subscriptions','user_preferences','notification_delivery_logs','worker_runs','errores_sistema']);
 const postTables=new Set(['mercadopago_webhook_events','rpc/apd_reserve_complete_checkout','rpc/apd_finalize_complete_checkout','rpc/apd_apply_complete_approval','rpc/apd_review_complete_payment']);
 return {
  async request(name,search,init){
   const method=String(init.method||'GET').toUpperCase();
   assert.ok(method==='GET'?readTables.has(name):method==='POST'&&postTables.has(name),'Unexpected disposable API route');
   const headers=new Headers(init.headers);
   // Only the VM fixture credential is accepted. Real credentials cannot be forwarded.
   assert.equal(headers.get('authorization'),'Bearer fixture-db-only');
   headers.delete('authorization');headers.delete('apikey');
   const url=new URL(name+search,base);assert.equal(url.origin,new URL(base).origin);
   return fetch(url,{method,headers,body:method==='POST'?init.body:undefined,redirect:'error',signal:AbortSignal.timeout(8000)});
  },
  expireTrial(){sql("UPDATE public.user_subscriptions SET started_at=clock_timestamp()-interval '15 days',trial_ends_at=clock_timestamp()-interval '1 day' WHERE user_id='"+uid+"' AND plan_code='TRIAL_14D'");},
  pause(){sql("BEGIN; SELECT pg_advisory_xact_lock(170394,20261125); UPDATE public.apd_commercial_release_control SET enrollment_open=false WHERE singleton; COMMIT;");},
  paidCount(){return Number(sql("SELECT count(*) FROM public.user_subscriptions WHERE user_id='"+uid+"' AND plan_code='COMPLETO'"));},
  verifyFinalState(){
   assert.equal(sql("SELECT count(*) FROM public.apd_complete_payment_ledger WHERE payment_id='700' AND amount_ars=2000"),'1');
   assert.equal(sql("SELECT count(*) FROM public.apd_complete_payment_review WHERE payment_id='700' AND disposition='revoke'"),'1');
   assert.equal(sql("SELECT count(*) FROM public.user_subscriptions WHERE user_id='"+uid+"' AND plan_code='COMPLETO' AND status='CANCELLED' AND current_period_ends_at-started_at=interval '720 hours'"),'1');
   assert.equal(sql("SELECT count(*) FROM public.mercadopago_checkout_sessions WHERE user_id='"+uid+"' AND plan_code='COMPLETO' AND status='reversed'"),'1');
   assert.equal(sql("SELECT count(*) FROM public.user_preferences WHERE user_id='"+uid+"' AND distrito_principal='AVELLANEDA' AND otros_distritos=ARRAY['QUILMES'] AND cargos=ARRAY['MAT','FIS']"),'1');
   assert.equal(sql("SELECT count(*) FROM public.apd_complete_trial_claims WHERE user_id='"+uid+"'"),'1');
  }
 };
}

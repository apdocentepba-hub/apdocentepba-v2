// Generates an operator-reviewed SQL transaction; never connects to any database.
import fs from 'node:fs';
import crypto from 'node:crypto';
const order=['CONSOLIDATION','PAYMENT','CHECKOUT','PREFERENCES'];
const parts=order.map(name=>{
 const file='docs/sql/APD_COMMERCIAL_'+name+'_CANDIDATE.sql';
 const sql=fs.readFileSync(file,'utf8');
 const begin=/^BEGIN;\s*$/gm,commit=/^COMMIT;\s*$/gm;
 if((sql.match(begin)||[]).length!==1||(sql.match(commit)||[]).length!==1||!sql.trimEnd().endsWith('COMMIT;'))throw Error('Unexpected transaction shape '+name);
 return '-- '+name+' SHA-256 '+crypto.createHash('sha256').update(sql).digest('hex')+'\n'+sql.replace(begin,'').replace(commit,'');
});
const pre=`BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(170394,20261125);
LOCK TABLE public.subscription_plans,public.user_subscriptions,public.mercadopago_checkout_sessions,public.user_preferences IN SHARE ROW EXCLUSIVE MODE;
DO $pre$
BEGIN
 IF EXISTS(SELECT 1 FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO','TRIAL_14D'))
 THEN RAISE EXCEPTION 'Commercial catalog already present'; END IF;
END $pre$;
CREATE TEMP TABLE apd_before_plans ON COMMIT DROP AS SELECT to_jsonb(p) AS row_data FROM public.subscription_plans p;
CREATE TEMP TABLE apd_before_subs ON COMMIT DROP AS SELECT to_jsonb(s) AS row_data FROM public.user_subscriptions s;
CREATE TEMP TABLE apd_before_checkout ON COMMIT DROP AS SELECT to_jsonb(c) AS row_data FROM public.mercadopago_checkout_sessions c;
CREATE TEMP TABLE apd_before_prefs ON COMMIT DROP AS SELECT to_jsonb(p) AS row_data FROM public.user_preferences p;
`;
const checks=`DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.apd_commercial_release_control WHERE singleton AND NOT enrollment_open)<>1
 OR (SELECT count(*) FROM public.apd_commercial_release_control)<>1
 OR (SELECT count(*) FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO','TRIAL_14D') AND NOT is_active AND NOT public_visible)<>3
 THEN RAISE EXCEPTION 'Installation must remain inactive and closed'; END IF;
 IF EXISTS(TABLE apd_before_plans EXCEPT ALL SELECT to_jsonb(p) FROM public.subscription_plans p WHERE code NOT IN ('FREE','COMPLETO','TRIAL_14D'))
 OR EXISTS(SELECT to_jsonb(p) FROM public.subscription_plans p WHERE code NOT IN ('FREE','COMPLETO','TRIAL_14D') EXCEPT ALL TABLE apd_before_plans)
 OR EXISTS(TABLE apd_before_subs EXCEPT ALL SELECT to_jsonb(s) FROM public.user_subscriptions s)
 OR EXISTS(SELECT to_jsonb(s) FROM public.user_subscriptions s EXCEPT ALL TABLE apd_before_subs)
 OR EXISTS(TABLE apd_before_checkout EXCEPT ALL SELECT to_jsonb(c) FROM public.mercadopago_checkout_sessions c)
 OR EXISTS(SELECT to_jsonb(c) FROM public.mercadopago_checkout_sessions c EXCEPT ALL TABLE apd_before_checkout)
 OR EXISTS(TABLE apd_before_prefs EXCEPT ALL SELECT to_jsonb(p) FROM public.user_preferences p)
 OR EXISTS(SELECT to_jsonb(p) FROM public.user_preferences p EXCEPT ALL TABLE apd_before_prefs)
 THEN RAISE EXCEPTION 'Existing rows changed; rollback entire installation'; END IF;
END $verify$;
DO $rpc$
DECLARE f text; r text;
BEGIN
 FOREACH f IN ARRAY ARRAY['apd_commercial_enrollment_open()','apd_claim_complete_trial(uuid)','apd_apply_complete_approval(text,text,text,numeric,text,timestamptz)','apd_review_complete_payment(text,text,text)','apd_reserve_complete_checkout(uuid)','apd_finalize_complete_checkout(uuid,text,text,text)','apd_save_free_preferences(uuid,jsonb,jsonb)'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_function_privilege(r,'public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected public RPC privilege'; END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'Missing backend RPC privilege'; END IF;
 END LOOP;
END $rpc$;
`;
const acl=fs.readFileSync('scripts/test-apd-commercial-default-acl.sql','utf8');
process.stdout.write(pre+'\n'+parts.join('\n')+'\n'+checks+'\n'+acl+'\nCOMMIT;\n');

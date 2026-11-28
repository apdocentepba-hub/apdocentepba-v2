\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'apd_consolidated_restored' THEN RAISE EXCEPTION 'Wrong restore destination'; END IF;
 IF has_table_privilege('anon','public.sessions','SELECT')
 OR has_table_privilege('authenticated','public.user_career_profile','SELECT')
 OR has_function_privilege('anon','public.apd_grant_legacy_complete_30d(uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.apd_expire_sessions_batch(integer)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.apd_grant_legacy_complete_30d(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Restored privilege drift'; END IF;
 IF to_regclass('public.apd_payment_review_checkout_idx') IS NOT NULL THEN RAISE EXCEPTION 'Index rollback lost'; END IF;
 IF (SELECT count(*) FROM public.apd_complete_payment_review)<>1 THEN RAISE EXCEPTION 'Payment review lost'; END IF;
END $$;
BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF (SELECT array_agg(code ORDER BY code) FROM public.subscription_plans) IS DISTINCT FROM ARRAY['COMPLETO','FREE'] THEN RAISE EXCEPTION 'Restored public catalog drift'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF public.apd_expire_sessions_batch(100)<>0 THEN RAISE EXCEPTION 'Restored maintenance changed state'; END IF;
 IF public.apd_grant_legacy_complete_30d('11111111-1111-4111-8111-111111111111')->>'duplicate' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Restored courtesy missing'; END IF;
 IF (SELECT count(*) FROM public.apd_career_profile_cas('11111111-1111-4111-8111-111111111111','{"schema":1,"seniorityYears":10,"positions":[]}',1))<>0 THEN RAISE EXCEPTION 'Restored CAS accepted stale revision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_career_profile WHERE revision=2) THEN RAISE EXCEPTION 'Career data lost'; END IF;
END $$;
ROLLBACK;
SELECT 'APD_RESTORED_RUNTIME_CONTRACT_PASS' AS result;

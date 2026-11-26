-- Dedicated QA only. Never call on a production database.
INSERT INTO public.users(id,activo) VALUES('00000000-0000-4000-8000-000000000008',true),('00000000-0000-4000-8000-000000000009',true);
SET ROLE service_role;
DO $$ BEGIN
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000008')->>'mode' IS DISTINCT FROM 'create' THEN RAISE EXCEPTION 'Open checkout not created'; END IF;
END $$;
RESET ROLE;
BEGIN;
SELECT pg_advisory_xact_lock(170394,20261125);
UPDATE public.apd_commercial_release_control SET enrollment_open=false WHERE singleton;
COMMIT;
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.apd_commercial_release_control','UPDATE') OR has_table_privilege('service_role','public.apd_commercial_release_control','UPDATE') OR has_function_privilege('anon','public.apd_commercial_enrollment_open()','EXECUTE') THEN RAISE EXCEPTION 'Admission switch permission'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE uid uuid:='00000000-0000-4000-8000-000000000008'; fresh uuid:='00000000-0000-4000-8000-000000000009'; ref text; r jsonb;
BEGIN
 IF public.apd_claim_complete_trial(fresh)->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Trial admitted during freeze'; END IF;
 IF public.apd_reserve_complete_checkout(fresh)->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'New checkout admitted during freeze'; END IF;
 IF (SELECT count(*) FROM public.subscription_plans WHERE is_active AND code IN ('FREE','TRIAL_14D','COMPLETO'))<>3 THEN RAISE EXCEPTION 'Entitlement catalog disabled'; END IF;
 SELECT external_reference INTO ref FROM public.mercadopago_checkout_sessions WHERE user_id=uid AND status='creating';
 r=public.apd_finalize_complete_checkout(uid,ref,'https://www.mercadopago.com/mla/checkout/start?pref_id=fixture','fixture');
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Cannot recover pre-freeze checkout'; END IF;
 r=public.apd_apply_complete_approval('808',ref,'approved',2000,'ARS',clock_timestamp());
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Cannot settle outstanding checkout'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=uid AND plan_code='COMPLETO' AND status='ACTIVE') THEN RAISE EXCEPTION 'Paid rights absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id='00000000-0000-4000-8000-000000000002' AND plan_code='INSIGNE' AND status='ACTIVE') THEN RAISE EXCEPTION 'Legacy rights lost'; END IF;
END $$;
RESET ROLE;
BEGIN;
SELECT pg_advisory_xact_lock(170394,20261125);
UPDATE public.apd_commercial_release_control SET enrollment_open=true WHERE singleton;
COMMIT;
SET ROLE service_role;
DO $$ BEGIN
 IF public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000009')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Resume admission failed'; END IF;
END $$;
RESET ROLE;

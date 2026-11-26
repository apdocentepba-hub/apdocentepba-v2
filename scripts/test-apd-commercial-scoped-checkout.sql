-- Disposable database only. No real users or provider.
DO $$ BEGIN IF current_database()<>'apd_pilot_qa' THEN RAISE EXCEPTION 'Wrong DB'; END IF; END $$;
UPDATE public.subscription_plans SET is_active=true WHERE code IN ('FREE','COMPLETO','TRIAL_14D');
INSERT INTO public.users(id,activo) VALUES ('00000000-0000-4000-8000-000000000071',true),('00000000-0000-4000-8000-000000000072',true),('00000000-0000-4000-8000-000000000073',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.apd_commercial_release_control WHERE enrollment_open) THEN RAISE EXCEPTION 'Gate open'; END IF;
 IF has_table_privilege('service_role','public.apd_commercial_checkout_pilot','INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.apd_commercial_checkout_pilot','SELECT') OR has_function_privilege('anon','public.apd_reserve_complete_checkout(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Privilege leak'; END IF;
END $$;
INSERT INTO public.apd_commercial_checkout_pilot(user_id,valid_until) VALUES ('00000000-0000-4000-8000-000000000071',clock_timestamp()+interval '30 minutes');
INSERT INTO public.apd_commercial_checkout_pilot(user_id,issued_at,valid_until) VALUES ('00000000-0000-4000-8000-000000000073',clock_timestamp()-interval '50 minutes',clock_timestamp()-interval '10 minutes');
SET ROLE service_role;
DO $$ DECLARE a uuid:='00000000-0000-4000-8000-000000000071'; r jsonb; ref text; BEGIN
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000072')->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Other account admitted'; END IF;
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000073')->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Expired permit admitted'; END IF;
 r:=public.apd_reserve_complete_checkout(a);ref:=r->>'reference';
 IF r->>'mode' IS DISTINCT FROM 'create' OR ref IS NULL THEN RAISE EXCEPTION 'Reservation failed'; END IF;
 IF public.apd_reserve_complete_checkout(a)->>'reason' IS DISTINCT FROM 'checkout_in_progress' THEN RAISE EXCEPTION 'Double reservation'; END IF;
 IF public.apd_finalize_complete_checkout(a,ref,'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=fixture','fixture')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Finalization failed'; END IF;
 IF public.apd_reserve_complete_checkout(a)->>'mode' IS DISTINCT FROM 'reuse' THEN RAISE EXCEPTION 'Reuse failed'; END IF;
END $$;
RESET ROLE;
UPDATE public.mercadopago_checkout_sessions SET status='expired' WHERE user_id='00000000-0000-4000-8000-000000000071';
SET ROLE service_role;
DO $$ BEGIN IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000071')->>'reason' IS DISTINCT FROM 'pilot_consumed' THEN RAISE EXCEPTION 'Second checkout admitted'; END IF; END $$;
RESET ROLE;
UPDATE public.apd_commercial_checkout_pilot SET revoked_at=clock_timestamp() WHERE user_id='00000000-0000-4000-8000-000000000071';
SET ROLE service_role;
DO $$ BEGIN IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000071')->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Revoked permit admitted'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.mercadopago_checkout_sessions)<>1 OR EXISTS(SELECT 1 FROM public.apd_commercial_release_control WHERE enrollment_open) THEN RAISE EXCEPTION 'Isolation failure'; END IF; END $$;
SELECT 'APD_SCOPED_CHECKOUT_PILOT_PASS';

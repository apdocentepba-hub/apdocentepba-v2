-- A single synthetic account through the actual candidate SQL functions.
-- Simulate the passage of time by changing only this disposable fixture's timestamps.
INSERT INTO public.users(id,activo) VALUES('00000000-0000-4000-8000-000000000007',true);
SET ROLE service_role;
DO $$ DECLARE u uuid:='00000000-0000-4000-8000-000000000007'; r jsonb; ref text; snapshot jsonb; proposed jsonb; ends timestamptz;
BEGIN
 r=public.apd_claim_complete_trial(u);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Lifecycle trial claim failed: %',r; END IF;
 IF public.apd_claim_complete_trial(u)->>'reason' IS DISTINCT FROM 'existing_history' THEN RAISE EXCEPTION 'Lifecycle trial replay'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=u AND plan_code='TRIAL_14D' AND trial_ends_at-started_at=interval '336 hours') THEN RAISE EXCEPTION 'Trial duration'; END IF;
 UPDATE public.user_subscriptions SET started_at=clock_timestamp()-interval '15 days',trial_ends_at=clock_timestamp()-interval '1 day' WHERE user_id=u AND plan_code='TRIAL_14D';
 INSERT INTO public.user_preferences(user_id,distrito_principal,otros_distritos,cargos,alertas_whatsapp) VALUES(u,'AVELLANEDA',ARRAY['QUILMES'],ARRAY['MAT','FIS'],true);
 SELECT to_jsonb(p) INTO snapshot FROM public.user_preferences p WHERE user_id=u;
 proposed=snapshot||jsonb_build_object('distrito_principal','LANUS');
 r=public.apd_save_free_preferences(u,snapshot,proposed);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Lifecycle preference save: %',r; END IF;
 r=public.apd_reserve_complete_checkout(u);
 IF r->>'mode' IS DISTINCT FROM 'create' THEN RAISE EXCEPTION 'Lifecycle checkout: %',r; END IF;
 ref=r->>'reference';
 r=public.apd_finalize_complete_checkout(u,ref,'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=fixture','fixture');
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Lifecycle finalize: %',r; END IF;
 r=public.apd_apply_complete_approval('700',ref,'approved',2000,'ARS',clock_timestamp());
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'duplicate' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Lifecycle approve: %',r; END IF;
 SELECT current_period_ends_at INTO ends FROM public.user_subscriptions WHERE user_id=u AND plan_code='COMPLETO';
 IF NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=u AND plan_code='COMPLETO' AND status='ACTIVE' AND current_period_ends_at-started_at=interval '720 hours') THEN RAISE EXCEPTION 'Paid duration'; END IF;
 IF public.apd_apply_complete_approval('700',ref,'approved',2000,'ARS',clock_timestamp())->>'duplicate' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Lifecycle approval replay'; END IF;
 IF (SELECT current_period_ends_at FROM public.user_subscriptions WHERE user_id=u AND plan_code='COMPLETO') IS DISTINCT FROM ends THEN RAISE EXCEPTION 'Period extended twice'; END IF;
 r=public.apd_review_complete_payment('700',ref,'revoke');
 IF r->>'disposition' IS DISTINCT FROM 'revoke' THEN RAISE EXCEPTION 'Lifecycle revoke: %',r; END IF;
 IF EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=u AND plan_code='COMPLETO' AND status='ACTIVE') THEN RAISE EXCEPTION 'Access not revoked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_preferences WHERE user_id=u AND distrito_principal='LANUS' AND otros_distritos=ARRAY['QUILMES'] AND cargos=ARRAY['MAT','FIS'] AND alertas_whatsapp) THEN RAISE EXCEPTION 'Preferences lost'; END IF;
END $$;
RESET ROLE;

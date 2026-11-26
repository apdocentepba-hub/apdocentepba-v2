DO $$ BEGIN
 IF has_function_privilege('anon','public.apd_apply_complete_approval(text,text,text,numeric,text,timestamptz)','EXECUTE') OR has_function_privilege('authenticated','public.apd_apply_complete_approval(text,text,text,numeric,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'RPC exposed'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
 IF public.apd_apply_complete_approval('100','qa-a','approved',2000,'ARS',now())->>'reason'<>'release_disabled' THEN RAISE EXCEPTION 'inactive release'; END IF;
END $$;
RESET ROLE;
UPDATE public.subscription_plans SET is_active=true WHERE code='COMPLETO';
SET ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
 IF public.apd_apply_complete_approval('100','qa-a','pending',2000,'ARS',now())->>'reason'<>'invalid_approval' THEN RAISE EXCEPTION 'pending accepted'; END IF;
 IF public.apd_apply_complete_approval('100','qa-a','approved',1999,'ARS',now())->>'reason'<>'invalid_approval' THEN RAISE EXCEPTION 'wrong amount'; END IF;
 IF public.apd_apply_complete_approval('100','qa-a','approved',2000,'USD',now())->>'reason'<>'invalid_approval' THEN RAISE EXCEPTION 'wrong currency'; END IF;
 IF public.apd_apply_complete_approval('100','qa-missing','approved',2000,'ARS',now())->>'reason'<>'unknown_checkout' THEN RAISE EXCEPTION 'unknown reference'; END IF;
 IF public.apd_apply_complete_approval('100','qa-invalid','approved',2000,'ARS',now())->>'reason'<>'checkout_not_eligible' THEN RAISE EXCEPTION 'incorrect saved price'; END IF;
 r=public.apd_apply_complete_approval('100','qa-a','approved',2000,'ARS',now());
 IF r->>'ok'<>'true' OR r->>'duplicate'<>'false' THEN RAISE EXCEPTION 'payment failed: %',r; END IF;
 IF public.apd_apply_complete_approval('100','qa-a','approved',2000,'ARS',now())->>'duplicate'<>'true' THEN RAISE EXCEPTION 'replay failed'; END IF;
 IF public.apd_apply_complete_approval('100','qa-b','approved',2000,'ARS',now())->>'reason'<>'payment_or_checkout_conflict' THEN RAISE EXCEPTION 'payment replay cross session'; END IF;
 IF public.apd_apply_complete_approval('101','qa-a','approved',2000,'ARS',now())->>'reason'<>'payment_or_checkout_conflict' THEN RAISE EXCEPTION 'second payment on same session'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.apd_complete_payment_ledger)<>1 THEN RAISE EXCEPTION 'duplicate ledger'; END IF;
 IF (SELECT count(*) FROM public.user_subscriptions WHERE plan_code='COMPLETO')<>1 THEN RAISE EXCEPTION 'duplicate subscription'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_subscriptions c JOIN public.user_subscriptions t USING(user_id) WHERE c.plan_code='COMPLETO' AND t.plan_code='TRIAL_14D' AND c.started_at=t.trial_ends_at AND c.current_period_ends_at-c.started_at=interval '720 hours') THEN RAISE EXCEPTION 'trial days lost or wrong period'; END IF;
 IF (SELECT status FROM public.mercadopago_checkout_sessions WHERE external_reference='qa-a')<>'approved' THEN RAISE EXCEPTION 'checkout not atomic'; END IF;
END $$;

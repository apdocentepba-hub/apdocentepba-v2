-- Dedicated fixture assertions. No real users.
DO $$
BEGIN
 IF has_function_privilege('anon','public.apd_claim_complete_trial(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.apd_claim_complete_trial(uuid)','EXECUTE') THEN RAISE EXCEPTION 'public RPC access'; END IF;
 IF NOT has_function_privilege('service_role','public.apd_claim_complete_trial(uuid)','EXECUTE') THEN RAISE EXCEPTION 'service role missing'; END IF;
 IF has_table_privilege('anon','public.apd_complete_trial_claims','SELECT') OR has_table_privilege('authenticated','public.apd_complete_trial_claims','INSERT') THEN RAISE EXCEPTION 'claim ledger exposed'; END IF;
 IF (SELECT count(*) FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO','TRIAL_14D') AND NOT is_active AND NOT public_visible)<>3 THEN RAISE EXCEPTION 'unsafe staging catalog'; END IF;
 IF (SELECT max_distritos FROM public.subscription_plans WHERE code='INSIGNE')<>10 OR (SELECT price_ars FROM public.subscription_plans WHERE code='INSIGNE')<>3000 THEN RAISE EXCEPTION 'legacy catalog changed'; END IF;
END $$;
SET ROLE service_role;
DO $$
BEGIN
 IF public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000001')->>'reason'<>'release_disabled' THEN RAISE EXCEPTION 'release gate failed'; END IF;
END $$;
RESET ROLE;
UPDATE public.subscription_plans SET is_active=true WHERE code='TRIAL_14D';
SET ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
 r=public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000001');
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'claim failed: %',r; END IF;
 IF public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000001')->>'reason'<>'existing_history' THEN RAISE EXCEPTION 'duplicate claim'; END IF;
 IF public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000002')->>'reason'<>'existing_history' THEN RAISE EXCEPTION 'legacy contract affected'; END IF;
 IF public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000003')->>'reason'<>'account_unavailable' THEN RAISE EXCEPTION 'disabled user'; END IF;
 IF public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000099')->>'reason'<>'account_unavailable' THEN RAISE EXCEPTION 'unknown user'; END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.apd_complete_trial_claims)<>1 THEN RAISE EXCEPTION 'claim ledger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id='00000000-0000-4000-8000-000000000001' AND trial_ends_at-started_at=interval '336 hours' AND mercadopago_preapproval_id IS NULL AND current_period_ends_at IS NULL) THEN RAISE EXCEPTION 'duration or billing mismatch'; END IF;
 IF (SELECT count(*) FROM public.user_subscriptions WHERE user_id='00000000-0000-4000-8000-000000000002' AND plan_code='INSIGNE' AND source='fixture_legacy')<>1 THEN RAISE EXCEPTION 'legacy row changed'; END IF;
END $$;

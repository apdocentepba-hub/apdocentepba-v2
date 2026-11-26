-- Disposable-only reproduction of the 26 Nov production pilot contract.
-- No real users, secrets, payment IDs, or provider requests. Roll back all fixture data.
BEGIN;
DO $$ BEGIN IF current_database()<>'apd_commercial_qa' THEN RAISE EXCEPTION 'Wrong disposable database'; END IF; END $$;
CREATE TABLE public.apd_commercial_checkout_pilot(
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 valid_until timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK(isfinite(issued_at) AND isfinite(valid_until) AND valid_until>issued_at AND valid_until<=issued_at+interval '1 hour')
);
ALTER TABLE public.apd_commercial_checkout_pilot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_commercial_checkout_pilot FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.apd_commercial_checkout_pilot TO service_role;
CREATE OR REPLACE FUNCTION public.apd_reserve_complete_checkout(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.mercadopago_checkout_sessions%ROWTYPE; v_ref text; v_pilot boolean:=false; v_now timestamptz:=clock_timestamp();
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_user_id AND activo IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','account_unavailable'); END IF;
 IF (SELECT count(*) FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO','TRIAL_14D') AND is_active)<>3
 OR NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE code='COMPLETO' AND price_ars=2000)
 THEN RETURN jsonb_build_object('ok',false,'reason','release_disabled'); END IF;
 IF NOT public.apd_commercial_enrollment_open() THEN
  SELECT EXISTS(SELECT 1 FROM public.apd_commercial_checkout_pilot WHERE user_id=p_user_id AND valid_until>clock_timestamp() AND revoked_at IS NULL) INTO v_pilot;
  IF NOT v_pilot THEN RETURN jsonb_build_object('ok',false,'reason','release_paused'); END IF;
 END IF;
 -- Do not replace any live contract or unresolved recurring arrangement.
 IF EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=p_user_id AND
   (mercadopago_preapproval_id IS NOT NULL OR
   (plan_code NOT IN ('TRIAL_7D','TRIAL_14D','FREE') AND upper(status) IN ('ACTIVE','AUTHORIZED','APPROVED','PENDING','PAUSED','BETA')
    AND (current_period_ends_at IS NULL OR current_period_ends_at>v_now))))
 THEN RETURN jsonb_build_object('ok',false,'reason','existing_contract'); END IF;
 -- Unresolved legacy checkout must be reconciled before a new offer.
 IF EXISTS(SELECT 1 FROM public.mercadopago_checkout_sessions WHERE user_id=p_user_id AND plan_code<>'COMPLETO' AND lower(status) IN ('creating','ready','pending','scheduled'))
 THEN RETURN jsonb_build_object('ok',false,'reason','legacy_checkout_pending'); END IF;
 SELECT * INTO s FROM public.mercadopago_checkout_sessions WHERE user_id=p_user_id AND plan_code='COMPLETO' AND status IN ('creating','ready','pending') FOR UPDATE;
 IF FOUND THEN
  IF s.status='ready' AND s.checkout_url IS NOT NULL THEN
   RETURN jsonb_build_object('ok',true,'mode','reuse','reference',s.external_reference,'checkout_url',s.checkout_url);
  END IF;
  RETURN jsonb_build_object('ok',false,'reason','checkout_in_progress','reference',s.external_reference);
 END IF;
 IF v_pilot AND EXISTS(SELECT 1 FROM public.mercadopago_checkout_sessions WHERE user_id=p_user_id AND plan_code='COMPLETO') THEN RETURN jsonb_build_object('ok',false,'reason','pilot_consumed'); END IF;
 v_ref=p_user_id::text||':COMPLETO:'||floor(extract(epoch FROM v_now)*1000)::bigint::text;
 INSERT INTO public.mercadopago_checkout_sessions(user_id,plan_code,status,provider,external_reference,provider_payload)
 VALUES(p_user_id,'COMPLETO','creating','mercadopago',v_ref,jsonb_build_object('price_ars',2000,'plan_code','COMPLETO'));
 RETURN jsonb_build_object('ok',true,'mode','create','reference',v_ref);
END $function$;
-- CREATE OR REPLACE retains existing function ACL.
DO $$ BEGIN
 IF has_table_privilege('anon','public.apd_commercial_checkout_pilot','SELECT,INSERT,UPDATE,DELETE') OR
 has_table_privilege('authenticated','public.apd_commercial_checkout_pilot','SELECT,INSERT,UPDATE,DELETE') OR
 has_table_privilege('service_role','public.apd_commercial_checkout_pilot','INSERT,UPDATE,DELETE') OR
 has_function_privilege('authenticated','public.apd_reserve_complete_checkout(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Pilot privileges'; END IF;
END $$;
UPDATE public.apd_commercial_release_control SET enrollment_open=false WHERE singleton;
INSERT INTO public.users(id,activo) VALUES
 ('00000000-0000-4000-8000-000000000071',true),
 ('00000000-0000-4000-8000-000000000072',true);
INSERT INTO public.apd_commercial_checkout_pilot(user_id,issued_at,valid_until)
 VALUES ('00000000-0000-4000-8000-000000000071',now(),now()+interval '1 hour');
DO $$ BEGIN
 BEGIN
  UPDATE public.apd_commercial_checkout_pilot SET valid_until=issued_at+interval '2 hours';
  RAISE EXCEPTION 'Unbounded permit accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
SET ROLE service_role;
DO $$ DECLARE uid uuid:='00000000-0000-4000-8000-000000000071'; other uuid:='00000000-0000-4000-8000-000000000072'; r jsonb; ref text;
BEGIN
 IF public.apd_reserve_complete_checkout(other)->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Other user admitted'; END IF;
 IF public.apd_claim_complete_trial(uid)->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Pilot trial admitted'; END IF;
 r=public.apd_reserve_complete_checkout(uid);ref=r->>'reference';
 IF r->>'mode' IS DISTINCT FROM 'create' OR ref IS NULL THEN RAISE EXCEPTION 'Initial pilot reserve'; END IF;
 IF public.apd_reserve_complete_checkout(uid)->>'reason' IS DISTINCT FROM 'checkout_in_progress' THEN RAISE EXCEPTION 'Duplicate creating'; END IF;
 IF public.apd_finalize_complete_checkout(uid,ref,'https://www.mercadopago.com/mla/checkout/start?pref_id=fixture-pilot','fixture-pilot')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Finalize'; END IF;
 r=public.apd_reserve_complete_checkout(uid);
 IF r->>'mode' IS DISTINCT FROM 'reuse' OR r->>'reference' IS DISTINCT FROM ref THEN RAISE EXCEPTION 'Resume changed reference'; END IF;
END $$;
RESET ROLE;
-- Simulate expiry without sleeping or changing any global clock.
UPDATE public.apd_commercial_checkout_pilot SET issued_at=now()-interval '2 hours',valid_until=now()-interval '1 hour';
SET ROLE service_role;
DO $$ BEGIN
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000071')->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Expired permit admitted'; END IF;
END $$;
RESET ROLE;
UPDATE public.apd_commercial_checkout_pilot SET issued_at=now(),valid_until=now()+interval '1 hour';
SET ROLE service_role;
DO $$ BEGIN
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000071')->>'mode' IS DISTINCT FROM 'reuse' THEN RAISE EXCEPTION 'Renewal failed to reuse'; END IF;
END $$;
RESET ROLE;
UPDATE public.apd_commercial_checkout_pilot SET revoked_at=now();
SET ROLE service_role;
DO $$ DECLARE uid uuid:='00000000-0000-4000-8000-000000000071'; ref text; r jsonb;
BEGIN
 IF public.apd_reserve_complete_checkout(uid)->>'reason' IS DISTINCT FROM 'release_paused' THEN RAISE EXCEPTION 'Revoked permit admitted'; END IF;
 SELECT external_reference INTO ref FROM public.mercadopago_checkout_sessions WHERE user_id=uid AND plan_code='COMPLETO';
 r=public.apd_apply_complete_approval('910071',ref,'approved',2000,'ARS',clock_timestamp());
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'duplicate' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Outstanding checkout not settled after revocation'; END IF;
 IF public.apd_apply_complete_approval('910071',ref,'approved',2000,'ARS',clock_timestamp())->>'duplicate' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Approval replay'; END IF;
 IF (SELECT count(*) FROM public.user_subscriptions WHERE user_id=uid AND plan_code='COMPLETO' AND status='ACTIVE' AND current_period_ends_at-started_at=interval '720 hours')<>1 THEN RAISE EXCEPTION 'Expected exactly 30 days'; END IF;
 IF public.apd_review_complete_payment('910071',ref,'revoke')->>'disposition' IS DISTINCT FROM 'revoke' THEN RAISE EXCEPTION 'Refund reconciliation'; END IF;
 IF public.apd_apply_complete_approval('910071',ref,'approved',2000,'ARS',clock_timestamp())->>'reason' IS DISTINCT FROM 'payment_under_review' THEN RAISE EXCEPTION 'Refund replay'; END IF;
 IF (SELECT count(*) FROM public.user_subscriptions WHERE user_id=uid AND plan_code='COMPLETO' AND status='CANCELLED')<>1 THEN RAISE EXCEPTION 'Refund did not revoke rights'; END IF;
END $$;
RESET ROLE;
UPDATE public.apd_commercial_checkout_pilot SET revoked_at=NULL,issued_at=now(),valid_until=now()+interval '1 hour';
SET ROLE service_role;
DO $$ DECLARE uid uuid:='00000000-0000-4000-8000-000000000071';
BEGIN
 IF public.apd_reserve_complete_checkout(uid)->>'reason' IS DISTINCT FROM 'pilot_consumed' THEN RAISE EXCEPTION 'Second pilot checkout permitted'; END IF;
 IF (SELECT count(*) FROM public.mercadopago_checkout_sessions WHERE user_id=uid AND plan_code='COMPLETO')<>1 THEN RAISE EXCEPTION 'Duplicate checkout'; END IF;
 IF public.apd_commercial_enrollment_open() THEN RAISE EXCEPTION 'Global enrollment changed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo APD_PILOT_LIFECYCLE_PASS

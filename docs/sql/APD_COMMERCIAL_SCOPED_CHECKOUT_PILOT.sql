-- Candidate only. No permit inserted, no provider call, no global admission change.
BEGIN;
SELECT pg_advisory_xact_lock(170394,20261125);
CREATE TABLE public.apd_commercial_checkout_pilot (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 valid_until timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK(isfinite(issued_at) AND isfinite(valid_until) AND valid_until>issued_at AND valid_until<=issued_at+interval '60 minutes')
);
ALTER TABLE public.apd_commercial_checkout_pilot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_commercial_checkout_pilot FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.apd_commercial_checkout_pilot TO service_role;
CREATE OR REPLACE FUNCTION public.apd_reserve_complete_checkout(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
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
END $f$;
REVOKE ALL ON FUNCTION public.apd_reserve_complete_checkout(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_reserve_complete_checkout(uuid) TO service_role;
COMMIT;

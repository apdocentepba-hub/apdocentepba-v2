-- Candidate only. No provider calls. A failed/uncertain provider request stays reserved
-- until independently reconciled; never retry a charge or preference blindly.
BEGIN;
CREATE UNIQUE INDEX apd_complete_checkout_ref ON public.mercadopago_checkout_sessions(external_reference) WHERE plan_code='COMPLETO';
CREATE UNIQUE INDEX apd_complete_one_open_checkout ON public.mercadopago_checkout_sessions(user_id)
 WHERE plan_code='COMPLETO' AND status IN ('creating','ready','pending');
CREATE FUNCTION public.apd_reserve_complete_checkout(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE s public.mercadopago_checkout_sessions%ROWTYPE; v_ref text; v_now timestamptz:=clock_timestamp();
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_user_id AND activo IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','account_unavailable'); END IF;
 IF (SELECT count(*) FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO','TRIAL_14D') AND is_active)<>3
 OR NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE code='COMPLETO' AND price_ars=2000)
 THEN RETURN jsonb_build_object('ok',false,'reason','release_disabled'); END IF;
 IF NOT public.apd_commercial_enrollment_open() THEN RETURN jsonb_build_object('ok',false,'reason','release_paused'); END IF;
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
 v_ref=p_user_id::text||':COMPLETO:'||floor(extract(epoch FROM v_now)*1000)::bigint::text;
 INSERT INTO public.mercadopago_checkout_sessions(user_id,plan_code,status,provider,external_reference,provider_payload)
 VALUES(p_user_id,'COMPLETO','creating','mercadopago',v_ref,jsonb_build_object('price_ars',2000,'plan_code','COMPLETO'));
 RETURN jsonb_build_object('ok',true,'mode','create','reference',v_ref);
END $f$;
CREATE FUNCTION public.apd_finalize_complete_checkout(p_user_id uuid,p_reference text,p_url text,p_preference_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE s public.mercadopago_checkout_sessions%ROWTYPE;
BEGIN
 IF p_url IS NULL OR length(p_url)>2000 OR p_url !~ '^https://((www\.)?mercadopago\.com\.ar/checkout/|www\.mercadopago\.com/mla/checkout/start([?]|$))' OR p_preference_id IS NULL OR length(p_preference_id) NOT BETWEEN 1 AND 180
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_provider_response'); END IF;
 PERFORM 1 FROM public.users WHERE id=p_user_id AND activo IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','account_unavailable'); END IF;
 SELECT * INTO s FROM public.mercadopago_checkout_sessions WHERE user_id=p_user_id AND external_reference=p_reference AND plan_code='COMPLETO' AND provider='mercadopago' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unknown_checkout'); END IF;
 IF s.status='ready' AND s.checkout_url=p_url AND s.provider_payload->>'preference_id'=p_preference_id THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 IF s.status<>'creating' THEN RETURN jsonb_build_object('ok',false,'reason','unexpected_status'); END IF;
 UPDATE public.mercadopago_checkout_sessions SET status='ready',checkout_url=p_url,updated_at=clock_timestamp(),provider_payload=provider_payload||jsonb_build_object('preference_id',p_preference_id) WHERE id=s.id;
 RETURN jsonb_build_object('ok',true,'duplicate',false);
END $f$;
REVOKE ALL ON FUNCTION public.apd_reserve_complete_checkout(uuid),public.apd_finalize_complete_checkout(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_reserve_complete_checkout(uuid),public.apd_finalize_complete_checkout(uuid,text,text,text) TO service_role;
COMMIT;

-- APD-004 migration candidate. NOT an automatic production migration.
-- Install only after deploying compatible resolver and verified backup/approval.
BEGIN;
CREATE UNIQUE INDEX apd_one_legacy_transition_grant ON public.user_subscriptions(user_id)
 WHERE plan_code='COMPLETO' AND source='legacy_transition_30d';
CREATE FUNCTION public.apd_grant_legacy_complete_30d(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_now timestamptz; v_end timestamptz; v_existing timestamptz;
 v_codes constant text[]:=ARRAY['PLUS','PREMIUM','INSIGNE','PLUS_ANUAL','PREMIUM_ANUAL','INSIGNE_ANUAL'];
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_user_id AND activo IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','account_unavailable'); END IF;
 v_now:=clock_timestamp();
 SELECT current_period_ends_at INTO v_existing FROM public.user_subscriptions
 WHERE user_id=p_user_id AND plan_code='COMPLETO' AND source='legacy_transition_30d';
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'duplicate',true,'period_ends_at',v_existing); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='COMPLETO' AND is_active IS TRUE AND price_ars=2000)
 THEN RETURN jsonb_build_object('ok',false,'reason','catalog_unavailable'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=p_user_id AND plan_code=ANY(v_codes))
 THEN RETURN jsonb_build_object('ok',false,'reason','no_legacy_history'); END IF;
 -- No destructive rewriting of subscriptions or provider records.
 IF EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=p_user_id AND
  (mercadopago_preapproval_id IS NOT NULL OR plan_code IN ('COMPLETO','TRIAL_14D') OR
   (plan_code=ANY(v_codes) AND upper(status) IN ('ACTIVE','AUTHORIZED','APPROVED') AND (current_period_ends_at IS NULL OR NOT isfinite(current_period_ends_at)))))
 THEN RETURN jsonb_build_object('ok',false,'reason','existing_or_indefinite_right'); END IF;
 IF EXISTS(SELECT 1 FROM public.mercadopago_checkout_sessions WHERE user_id=p_user_id AND lower(status) IN ('creating','ready','pending','scheduled'))
 THEN RETURN jsonb_build_object('ok',false,'reason','checkout_requires_reconciliation'); END IF;
 SELECT max(CASE WHEN plan_code='TRIAL_7D' THEN trial_ends_at ELSE current_period_ends_at END) INTO v_end
 FROM public.user_subscriptions WHERE user_id=p_user_id AND (plan_code=ANY(v_codes) OR plan_code='TRIAL_7D')
 AND upper(status) IN ('ACTIVE','AUTHORIZED','APPROVED');
 IF v_end IS NOT NULL AND NOT isfinite(v_end) THEN RETURN jsonb_build_object('ok',false,'reason','invalid_legacy_end'); END IF;
 v_end:=greatest(v_now,coalesce(v_end,v_now))+interval '720 hours';
 INSERT INTO public.user_subscriptions(user_id,plan_code,status,source,started_at,current_period_ends_at,trial_ends_at,mercadopago_preapproval_id)
 VALUES(p_user_id,'COMPLETO','ACTIVE','legacy_transition_30d',v_now,v_end,NULL,NULL);
 RETURN jsonb_build_object('ok',true,'duplicate',false,'period_ends_at',v_end);
END $f$;
REVOKE ALL ON FUNCTION public.apd_grant_legacy_complete_30d(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_grant_legacy_complete_30d(uuid) TO service_role;
COMMIT;

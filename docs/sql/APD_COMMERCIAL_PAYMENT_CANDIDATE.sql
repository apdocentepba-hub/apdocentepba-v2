-- Isolated candidate. Approval-only ledger; refunds/disputes and checkout creation are separate release blockers.
BEGIN;
CREATE TABLE public.apd_complete_payment_ledger (
 payment_id text PRIMARY KEY,
 checkout_id uuid NOT NULL UNIQUE REFERENCES public.mercadopago_checkout_sessions(id) ON DELETE RESTRICT,
 subscription_id uuid UNIQUE REFERENCES public.user_subscriptions(id) ON DELETE RESTRICT,
 approved_at timestamptz NOT NULL,
 amount_ars numeric NOT NULL CHECK (amount_ars=2000)
);
ALTER TABLE public.apd_complete_payment_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_complete_payment_ledger FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.apd_complete_payment_ledger TO service_role;
CREATE FUNCTION public.apd_apply_complete_approval(p_payment_id text,p_reference text,p_status text,p_amount numeric,p_currency text,p_approved_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE s public.mercadopago_checkout_sessions%ROWTYPE; v_user uuid; v_sub uuid; v_end timestamptz; v_start timestamptz; v_insert text;
BEGIN
 -- Caller must retrieve the payment directly from Mercado Pago after authenticated webhook verification.
 IF p_payment_id IS NULL OR p_payment_id !~ '^[0-9]{1,30}$' OR p_reference IS NULL OR length(p_reference)>180
 OR p_status IS DISTINCT FROM 'approved' OR p_amount IS DISTINCT FROM 2000::numeric OR p_currency IS DISTINCT FROM 'ARS'
 OR p_approved_at IS NULL OR NOT isfinite(p_approved_at) OR p_approved_at>clock_timestamp()+interval '5 minutes'
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_approval'); END IF;
 SELECT user_id INTO v_user FROM public.mercadopago_checkout_sessions WHERE external_reference=p_reference AND plan_code='COMPLETO' AND provider='mercadopago';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unknown_checkout'); END IF;
 IF (SELECT count(*) FROM public.mercadopago_checkout_sessions WHERE external_reference=p_reference)<>1
 THEN RETURN jsonb_build_object('ok',false,'reason','ambiguous_checkout'); END IF;
 -- Serialize by account before locking checkout; all mutations occur within one transaction.
 PERFORM 1 FROM public.users WHERE id=v_user AND activo IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','account_unavailable'); END IF;
 SELECT * INTO s FROM public.mercadopago_checkout_sessions WHERE external_reference=p_reference AND user_id=v_user AND plan_code='COMPLETO' AND provider='mercadopago' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unknown_checkout'); END IF;
 IF EXISTS(SELECT 1 FROM public.apd_complete_payment_ledger WHERE payment_id=p_payment_id AND checkout_id=s.id AND subscription_id IS NOT NULL)
 THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 IF EXISTS(SELECT 1 FROM public.apd_complete_payment_ledger WHERE payment_id=p_payment_id OR checkout_id=s.id)
 THEN RETURN jsonb_build_object('ok',false,'reason','payment_or_checkout_conflict'); END IF;
 IF s.status NOT IN ('ready','pending') OR s.provider_payload->>'price_ars' IS DISTINCT FROM '2000'
 OR s.provider_payload->>'plan_code' IS DISTINCT FROM 'COMPLETO' OR p_approved_at<s.created_at-interval '5 minutes'
 THEN RETURN jsonb_build_object('ok',false,'reason','checkout_not_eligible'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='COMPLETO' AND is_active AND price_ars=2000)
 THEN RETURN jsonb_build_object('ok',false,'reason','release_disabled'); END IF;
 -- Reserve payment and session exactly once, even across different accounts.
 INSERT INTO public.apd_complete_payment_ledger(payment_id,checkout_id,approved_at,amount_ars)
 VALUES(p_payment_id,s.id,p_approved_at,p_amount) ON CONFLICT DO NOTHING RETURNING payment_id INTO v_insert;
 IF v_insert IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','payment_or_checkout_conflict'); END IF;
 -- Preserve remaining confirmed Completo or trial days; no changes to legacy rows.
 SELECT max(CASE WHEN plan_code='TRIAL_14D' THEN trial_ends_at ELSE current_period_ends_at END) INTO v_end
 FROM public.user_subscriptions WHERE user_id=v_user AND plan_code IN ('COMPLETO','TRIAL_14D') AND upper(status) IN ('ACTIVE','APPROVED','AUTHORIZED');
 v_start=greatest(p_approved_at,coalesce(v_end,p_approved_at));
 v_end=v_start+interval '720 hours';
 INSERT INTO public.user_subscriptions(user_id,plan_code,status,source,started_at,current_period_ends_at,external_reference,mercadopago_preapproval_id)
 VALUES(v_user,'COMPLETO','ACTIVE','mercadopago_checkout',v_start,v_end,p_reference,NULL) RETURNING id INTO v_sub;
 UPDATE public.apd_complete_payment_ledger SET subscription_id=v_sub WHERE payment_id=p_payment_id;
 UPDATE public.mercadopago_checkout_sessions SET status='approved',updated_at=clock_timestamp(),provider_payload=coalesce(provider_payload,'{}'::jsonb)||jsonb_build_object('payment_id',p_payment_id,'payment_status','approved') WHERE id=s.id;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'period_ends_at',v_end);
END $fn$;
REVOKE ALL ON FUNCTION public.apd_apply_complete_approval(text,text,text,numeric,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_apply_complete_approval(text,text,text,numeric,text,timestamptz) TO service_role;
COMMIT;

-- Candidate ONLY: run against isolated PostgreSQL fixture, not production.
-- Keep all legacy catalog rows unchanged; activate new rows only after Worker migration.
BEGIN;
INSERT INTO public.subscription_plans
 (code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,is_active,public_visible,sort_order,feature_flags)
VALUES
 ('FREE','Gratis','Acceso básico permanente',0,0,1,1,false,false,10,'{"email":true,"whatsapp":false,"provincia":false}'::jsonb),
 ('COMPLETO','Completo','Acceso completo mensual',2000,0,5,10,false,false,20,'{"email":true,"whatsapp":true,"provincia":true,"insights_plus":true}'::jsonb),
 ('TRIAL_14D','Prueba de Completo','14 días sin cobro automático',0,14,5,10,false,false,30,'{"email":true,"whatsapp":true,"provincia":true,"insights_plus":true}'::jsonb);
-- Persistent one-time claim, even when the trial subscription is no longer current.
CREATE TABLE public.apd_complete_trial_claims (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 claimed_at timestamptz NOT NULL,
 subscription_id uuid NOT NULL UNIQUE REFERENCES public.user_subscriptions(id) ON DELETE RESTRICT
);
ALTER TABLE public.apd_complete_trial_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_complete_trial_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.apd_complete_trial_claims TO service_role;
CREATE UNIQUE INDEX apd_one_complete_trial_per_user ON public.user_subscriptions(user_id)
 WHERE plan_code='TRIAL_14D';
CREATE FUNCTION public.apd_claim_complete_trial(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
 v_time timestamptz;
 v_sub uuid;
BEGIN
 -- Only the authenticated backend can call this RPC; it obtains p_user_id from its session.
 -- Serialize claims for the same account; never update any pre-existing subscription.
 PERFORM 1 FROM public.users WHERE id=p_user_id AND activo IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','account_unavailable'); END IF;
 IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE code='TRIAL_14D' AND is_active IS TRUE AND trial_days=14 AND price_ars=0)
 THEN RETURN jsonb_build_object('ok',false,'reason','release_disabled'); END IF;
 IF EXISTS (SELECT 1 FROM public.apd_complete_trial_claims WHERE user_id=p_user_id)
 OR EXISTS (SELECT 1 FROM public.user_subscriptions WHERE user_id=p_user_id)
 THEN RETURN jsonb_build_object('ok',false,'reason','existing_history'); END IF;
 v_time=clock_timestamp();
 INSERT INTO public.user_subscriptions
 (user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id)
 VALUES (p_user_id,'TRIAL_14D','ACTIVE','trial_complete_14d',v_time,v_time+interval '336 hours',NULL,NULL)
 RETURNING id INTO v_sub;
 INSERT INTO public.apd_complete_trial_claims(user_id,claimed_at,subscription_id) VALUES(p_user_id,v_time,v_sub);
 RETURN jsonb_build_object('ok',true,'plan_code','TRIAL_14D','trial_ends_at',v_time+interval '336 hours');
END
$function$;
REVOKE ALL ON FUNCTION public.apd_claim_complete_trial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apd_claim_complete_trial(uuid) TO service_role;
COMMIT;

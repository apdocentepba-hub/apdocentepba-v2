-- Extension to disposable commercial fixture.
ALTER TABLE public.user_subscriptions ADD COLUMN external_reference text;
CREATE TABLE public.mercadopago_checkout_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.users(id),plan_code text NOT NULL REFERENCES public.subscription_plans(code),status text NOT NULL DEFAULT 'pending',provider text NOT NULL DEFAULT 'mercadopago',checkout_url text,external_reference text,provider_payload jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.mercadopago_checkout_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.mercadopago_checkout_sessions TO service_role;
INSERT INTO public.mercadopago_checkout_sessions(user_id,plan_code,status,external_reference,provider_payload) VALUES
 ('00000000-0000-4000-8000-000000000001','COMPLETO','ready','qa-a','{"price_ars":2000,"plan_code":"COMPLETO"}'),
 ('00000000-0000-4000-8000-000000000001','COMPLETO','ready','qa-b','{"price_ars":2000,"plan_code":"COMPLETO"}'),
 ('00000000-0000-4000-8000-000000000001','COMPLETO','ready','qa-invalid','{"price_ars":1,"plan_code":"COMPLETO"}');

GRANT UPDATE ON public.user_subscriptions TO service_role;

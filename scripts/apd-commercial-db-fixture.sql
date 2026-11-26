-- Dedicated disposable database only. Minimal production-schema subset.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.users(id uuid PRIMARY KEY,activo boolean NOT NULL DEFAULT true);
CREATE TABLE public.subscription_plans(code text PRIMARY KEY,nombre text NOT NULL,descripcion text,price_ars numeric,trial_days integer NOT NULL DEFAULT 0,max_distritos integer NOT NULL DEFAULT 1,max_cargos integer NOT NULL DEFAULT 1,is_active boolean NOT NULL DEFAULT true,public_visible boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 100,feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.user_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,plan_code text NOT NULL REFERENCES public.subscription_plans(code),status text NOT NULL DEFAULT 'active',source text NOT NULL DEFAULT 'manual_beta',started_at timestamptz NOT NULL DEFAULT now(),trial_ends_at timestamptz,current_period_ends_at timestamptz,mercadopago_preapproval_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,UPDATE ON public.users TO service_role;
GRANT SELECT ON public.subscription_plans TO service_role;
GRANT SELECT,INSERT ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
INSERT INTO public.subscription_plans(code,nombre,price_ars,trial_days,max_distritos,max_cargos) VALUES ('TRIAL_7D','Prueba antigua',0,7,1,1),('INSIGNE','Insigne',3000,0,10,10);
INSERT INTO public.users(id,activo) VALUES ('00000000-0000-4000-8000-000000000001',true),('00000000-0000-4000-8000-000000000002',true),('00000000-0000-4000-8000-000000000003',false),('00000000-0000-4000-8000-000000000004',true);
INSERT INTO public.user_subscriptions(user_id,plan_code,status,source) VALUES ('00000000-0000-4000-8000-000000000002','INSIGNE','ACTIVE','fixture_legacy');

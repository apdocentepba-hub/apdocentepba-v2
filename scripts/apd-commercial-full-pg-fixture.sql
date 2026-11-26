-- Only after the disposable commercial schema migrations have been applied.
DO $$ BEGIN IF current_database()<>'apd_commercial_full_qa' THEN RAISE EXCEPTION 'Wrong disposable database'; END IF; END $$;
-- Existing fixture accounts are removed before inserting exact synthetic VM identities.
TRUNCATE public.apd_pref_qa_snapshot,public.user_preferences,public.apd_complete_payment_review,public.apd_complete_payment_ledger,public.mercadopago_checkout_sessions,public.apd_complete_trial_claims,public.user_subscriptions,public.users;
ALTER TABLE public.users ADD COLUMN nombre text,ADD COLUMN apellido text,ADD COLUMN email text,ADD COLUMN celular text,ADD COLUMN es_admin boolean NOT NULL DEFAULT false,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN ultimo_login timestamptz;
CREATE TABLE public.sessions(token text PRIMARY KEY,user_id uuid REFERENCES public.users(id),metodo text DEFAULT 'fixture',created_at timestamptz DEFAULT now(),expires_at timestamptz,activo boolean DEFAULT true);
CREATE TABLE public.notification_delivery_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now());
CREATE TABLE public.worker_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now());
CREATE TABLE public.errores_sistema(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now());
CREATE TABLE public.mercadopago_webhook_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),topic text,action text,resource_id text,payload jsonb,received_at timestamptz);
CREATE TABLE public.apd_commercial_qa_guard(marker text PRIMARY KEY);
INSERT INTO public.apd_commercial_qa_guard VALUES('disposable-full-module');
REVOKE ALL ON public.apd_commercial_qa_guard FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sessions,public.notification_delivery_logs,public.worker_runs,public.errores_sistema TO service_role;
GRANT INSERT ON public.mercadopago_webhook_events TO service_role;
INSERT INTO public.users(id,nombre,apellido,email,activo,es_admin) VALUES
 ('00000000-0000-4000-8000-000000000007','Fixture','QA','fixture@example.invalid',true,false),
 ('00000000-0000-4000-8000-000000000099','Admin QA','Fixture','admin@example.invalid',true,true),
 ('00000000-0000-4000-8000-000000000088','APD QA a','QA322-123','apd-diary-qa-a@example.invalid',false,false);
INSERT INTO public.sessions(token,user_id,expires_at) VALUES
 ('fixture-session-only','00000000-0000-4000-8000-000000000007',now()+interval '1 day'),
 ('fixture-admin-only','00000000-0000-4000-8000-000000000099',now()+interval '1 day');
INSERT INTO public.user_preferences(user_id,distrito_principal,otros_distritos,cargos,alertas_whatsapp,alertas_telegram) VALUES('00000000-0000-4000-8000-000000000007','AVELLANEDA',ARRAY['QUILMES'],ARRAY['MAT','FIS'],true,true);
BEGIN;
SELECT pg_advisory_xact_lock(170394,20261125);
UPDATE public.apd_commercial_release_control SET enrollment_open=true WHERE singleton;
COMMIT;
SET ROLE service_role;
DO $$ BEGIN IF public.apd_claim_complete_trial('00000000-0000-4000-8000-000000000007')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Fixture trial not created'; END IF; END $$;
RESET ROLE;

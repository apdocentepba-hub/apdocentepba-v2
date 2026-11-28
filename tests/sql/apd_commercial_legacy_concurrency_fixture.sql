\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'apd_commercial_race_fixture' THEN RAISE EXCEPTION 'Wrong disposable database'; END IF; END $$;
\ir ../../scripts/apd-commercial-db-fixture.sql
ALTER TABLE public.subscription_plans ADD COLUMN mercadopago_plan_id text;
\ir ../../docs/sql/APD_COMMERCIAL_CONSOLIDATION_CANDIDATE.sql
\ir ../../scripts/apd-commercial-payment-fixture.sql
-- Seed checkout rows are not part of this scenario.
DELETE FROM public.mercadopago_checkout_sessions;
\ir ../../docs/sql/APD_COMMERCIAL_PAYMENT_CANDIDATE.sql
\ir ../../docs/sql/APD_COMMERCIAL_CHECKOUT_CANDIDATE.sql
\ir ../../docs/sql/APD_COMMERCIAL_ACTIVATE_CATALOG_CANDIDATE.sql
-- This is a fixture-only gate; never use these operations in production.
UPDATE public.apd_commercial_release_control SET enrollment_open=true WHERE singleton;
INSERT INTO public.users(id,activo) VALUES
 ('00000000-0000-4000-8000-000000000011',true),
 ('00000000-0000-4000-8000-000000000012',true),
 ('00000000-0000-4000-8000-000000000013',true);
INSERT INTO public.user_subscriptions(user_id,plan_code,status,source,started_at,current_period_ends_at)
SELECT id,'INSIGNE','ACTIVE','fixture_expired',now()-interval '40 days',now()-interval '10 days' FROM public.users WHERE id IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
CREATE TABLE public.original_legacy AS SELECT * FROM public.user_subscriptions;
\ir ../../docs/sql/APD_LEGACY_TRANSITION_CANDIDATE_20261127.sql

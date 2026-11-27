\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.users(id uuid PRIMARY KEY,activo boolean NOT NULL);
CREATE TABLE public.subscription_plans(code text PRIMARY KEY,is_active boolean NOT NULL,price_ars numeric,public_visible boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.users,plan_code text NOT NULL,status text NOT NULL,source text NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),current_period_ends_at timestamptz,trial_ends_at timestamptz,mercadopago_preapproval_id text);
CREATE TABLE public.mercadopago_checkout_sessions(user_id uuid NOT NULL, status text NOT NULL);
GRANT SELECT,UPDATE ON public.users TO service_role;
GRANT SELECT ON public.subscription_plans,public.mercadopago_checkout_sessions TO service_role;
GRANT SELECT,INSERT ON public.user_subscriptions TO service_role;
INSERT INTO public.subscription_plans VALUES('COMPLETO',true,2000,true),('FREE',true,0,true),('TRIAL_14D',true,0,false),('PLUS',true,1000,true),('PREMIUM',true,2000,true),('INSIGNE',true,3000,true),('TRIAL_7D',true,0,true),('BASIC',false,NULL,false),('INSIGNE_ANUAL',true,30000,false),('PLUS_ANUAL',true,10000,false),('PREMIUM_ANUAL',true,20000,false);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_plans_public_read ON public.subscription_plans FOR SELECT TO anon,authenticated USING(true);
GRANT SELECT ON public.subscription_plans TO anon,authenticated;
INSERT INTO public.users SELECT ('00000000-0000-4000-8000-00000000000'||i)::uuid,i<>6 FROM generate_series(1,6) i;
INSERT INTO public.user_subscriptions(user_id,plan_code,status,source,current_period_ends_at) VALUES
('00000000-0000-4000-8000-000000000001','PLUS','ACTIVE','mercadopago_checkout',now()+interval '10 days'),
('00000000-0000-4000-8000-000000000002','INSIGNE','INACTIVE','mercadopago_checkout',now()-interval '1 day'),
('00000000-0000-4000-8000-000000000003','INSIGNE','ACTIVE','manual_admin_grant',NULL),
('00000000-0000-4000-8000-000000000004','PREMIUM','ACTIVE','mercadopago_checkout',now()-interval '1 day'),
('00000000-0000-4000-8000-000000000006','PLUS','ACTIVE','mercadopago_checkout',now()+interval '1 day');
INSERT INTO public.mercadopago_checkout_sessions VALUES('00000000-0000-4000-8000-000000000004','ready');
CREATE TEMP TABLE baseline AS SELECT * FROM public.user_subscriptions;
\ir ../../docs/sql/APD_LEGACY_TRANSITION_CANDIDATE_20261127.sql
SET ROLE service_role;
DO $test$
DECLARE a jsonb;b jsonb;v uuid:='00000000-0000-4000-8000-000000000001'; old_end timestamptz;
BEGIN
 SELECT current_period_ends_at INTO old_end FROM public.user_subscriptions WHERE user_id=v AND plan_code='PLUS';
 a:=public.apd_grant_legacy_complete_30d(v);
 IF a->>'ok' IS DISTINCT FROM 'true' OR (a->>'period_ends_at')::timestamptz<>old_end+interval '720 hours' THEN RAISE EXCEPTION 'paid period shortened'; END IF;
 b:=public.apd_grant_legacy_complete_30d(v);
 IF b->>'duplicate' IS DISTINCT FROM 'true' OR b->>'period_ends_at' IS DISTINCT FROM a->>'period_ends_at' THEN RAISE EXCEPTION 'duplicate extends grant'; END IF;
 a:=public.apd_grant_legacy_complete_30d('00000000-0000-4000-8000-000000000002');
 IF a->>'ok' IS DISTINCT FROM 'true' OR (a->>'period_ends_at')::timestamptz<now()+interval '720 hours' THEN RAISE EXCEPTION 'expired history grant missing'; END IF;
 IF public.apd_grant_legacy_complete_30d('00000000-0000-4000-8000-000000000003')->>'reason' IS DISTINCT FROM 'existing_or_indefinite_right' THEN RAISE EXCEPTION 'indefinite right changed'; END IF;
 IF public.apd_grant_legacy_complete_30d('00000000-0000-4000-8000-000000000004')->>'reason' IS DISTINCT FROM 'checkout_requires_reconciliation' THEN RAISE EXCEPTION 'unresolved checkout ignored'; END IF;
 IF public.apd_grant_legacy_complete_30d('00000000-0000-4000-8000-000000000005')->>'reason' IS DISTINCT FROM 'no_legacy_history' THEN RAISE EXCEPTION 'unqualified account granted'; END IF;
 IF public.apd_grant_legacy_complete_30d('00000000-0000-4000-8000-000000000006')->>'reason' IS DISTINCT FROM 'account_unavailable' THEN RAISE EXCEPTION 'inactive account granted'; END IF;
END $test$;
RESET ROLE;
DO $verify$
BEGIN
 IF EXISTS(SELECT * FROM baseline EXCEPT SELECT * FROM public.user_subscriptions) THEN RAISE EXCEPTION 'historical record changed'; END IF;
 IF (SELECT count(*) FROM public.user_subscriptions WHERE source='legacy_transition_30d')<>2 THEN RAISE EXCEPTION 'wrong grant count'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_subscriptions WHERE source='legacy_transition_30d' AND mercadopago_preapproval_id IS NOT NULL) THEN RAISE EXCEPTION 'recurring reference added'; END IF;
 IF has_function_privilege('anon','public.apd_grant_legacy_complete_30d(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.apd_grant_legacy_complete_30d(uuid)','EXECUTE') THEN RAISE EXCEPTION 'grant publicly callable'; END IF;
END $verify$;
SELECT 'APD_LEGACY_TRANSITION_PG17_PASS' AS result;

CREATE TEMP TABLE full_catalog_baseline AS SELECT * FROM public.subscription_plans;
CREATE TEMP TABLE catalog_baseline AS SELECT code,is_active,price_ars FROM public.subscription_plans;
\ir ../../docs/sql/APD_LEGACY_CATALOG_HIDE_CANDIDATE_20261127.sql
SET ROLE anon;
DO $test$ BEGIN
 IF (SELECT array_agg(code ORDER BY code) FROM public.subscription_plans) IS DISTINCT FROM ARRAY['COMPLETO','FREE'] THEN RAISE EXCEPTION 'anonymous catalog contains legacy plans'; END IF;
END $test$;
RESET ROLE;
SET ROLE authenticated;
DO $test$ BEGIN
 IF (SELECT array_agg(code ORDER BY code) FROM public.subscription_plans) IS DISTINCT FROM ARRAY['COMPLETO','FREE'] THEN RAISE EXCEPTION 'authenticated public catalog contains legacy plans'; END IF;
END $test$;
RESET ROLE;
SET ROLE service_role;
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.subscription_plans)<>11 THEN RAISE EXCEPTION 'historical lookup lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='INSIGNE' AND is_active AND NOT public_visible) THEN RAISE EXCEPTION 'historical rights disabled'; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF EXISTS(SELECT * FROM catalog_baseline EXCEPT ALL SELECT code,is_active,price_ars FROM public.subscription_plans) OR EXISTS(SELECT code,is_active,price_ars FROM public.subscription_plans EXCEPT ALL SELECT * FROM catalog_baseline) THEN RAISE EXCEPTION 'catalog values changed beyond visibility'; END IF;
END $test$;
SELECT 'APD_LEGACY_CATALOG_PG17_PASS' AS result;

\ir ../../docs/sql/APD_LEGACY_CATALOG_EMERGENCY_REVERT_20261127.sql
DO $test$ BEGIN
 IF EXISTS(SELECT * FROM full_catalog_baseline EXCEPT ALL SELECT * FROM public.subscription_plans) OR EXISTS(SELECT * FROM public.subscription_plans EXCEPT ALL SELECT * FROM full_catalog_baseline) THEN RAISE EXCEPTION 'Catalog roundtrip mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans' AND policyname='subscription_plans_public_read' AND qual='true') THEN RAISE EXCEPTION 'Original policy not restored'; END IF;
 IF EXISTS(SELECT * FROM baseline EXCEPT SELECT * FROM public.user_subscriptions) OR (SELECT count(*) FROM public.user_subscriptions WHERE source='legacy_transition_30d')<>2 THEN RAISE EXCEPTION 'Subscription history changed'; END IF;
END $test$;
SELECT 'APD_LEGACY_CATALOG_REVERT_PG17_PASS' AS result;
\ir ../../docs/sql/APD_LEGACY_CATALOG_HIDE_CANDIDATE_20261127.sql

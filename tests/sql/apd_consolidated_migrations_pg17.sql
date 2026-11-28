\set ON_ERROR_STOP on
-- Synthetic schema only, no production connection or records.
DO $$ BEGIN IF current_database()<>'apd_consolidated_fixture' THEN RAISE EXCEPTION 'Wrong disposable database'; END IF; END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.users(id uuid PRIMARY KEY,activo boolean NOT NULL);
CREATE TABLE public.subscription_plans(code text PRIMARY KEY,is_active boolean NOT NULL,price_ars numeric,public_visible boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.users,plan_code text NOT NULL,status text NOT NULL,source text NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),current_period_ends_at timestamptz,trial_ends_at timestamptz,mercadopago_preapproval_id text);
CREATE TABLE public.mercadopago_checkout_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.users,status text NOT NULL);
CREATE TABLE public.sessions(token text PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.users,metodo text NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,activo boolean NOT NULL);
CREATE TABLE public.apd_complete_payment_review(payment_id text PRIMARY KEY,checkout_id uuid NOT NULL REFERENCES public.mercadopago_checkout_sessions(id) ON DELETE RESTRICT,disposition text NOT NULL CHECK(disposition IN ('review','revoke')),observed_at timestamptz NOT NULL);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['alert_history','alert_notifications','mercadopago_webhook_events','user_identity_profile','webpush_subscriptions'] LOOP
  EXECUTE format('CREATE TABLE public.%I(id int PRIMARY KEY,value text)',t);
  EXECUTE format('INSERT INTO public.%I VALUES (1,%L)',t,'fixture');
 END LOOP;
 FOREACH t IN ARRAY ARRAY['alert_history','alert_notifications','mercadopago_checkout_sessions','mercadopago_webhook_events','sessions','user_identity_profile','webpush_subscriptions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO anon,authenticated,service_role',t);
 END LOOP;
END $$;
ALTER TABLE public.apd_complete_payment_review ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.apd_complete_payment_review TO service_role;
GRANT SELECT,UPDATE ON public.users TO service_role;
GRANT SELECT ON public.subscription_plans TO service_role;
GRANT SELECT,INSERT ON public.user_subscriptions TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_plans_public_read ON public.subscription_plans FOR SELECT TO anon,authenticated USING(true);
GRANT SELECT ON public.subscription_plans TO anon,authenticated;
INSERT INTO public.subscription_plans VALUES('COMPLETO',true,2000,true),('FREE',true,0,true),('TRIAL_14D',true,0,false),('PLUS',true,1000,true),('PREMIUM',true,2000,true),('INSIGNE',true,3000,true),('TRIAL_7D',true,0,true),('BASIC',false,NULL,false),('INSIGNE_ANUAL',true,30000,false),('PLUS_ANUAL',true,10000,false),('PREMIUM_ANUAL',true,20000,false);
INSERT INTO public.users VALUES('11111111-1111-4111-8111-111111111111',true),('22222222-2222-4222-8222-222222222222',true);
INSERT INTO public.user_subscriptions(user_id,plan_code,status,source,current_period_ends_at) VALUES
 ('11111111-1111-4111-8111-111111111111','PLUS','ACTIVE','fixture',now()+interval '10 days'),
 ('22222222-2222-4222-8222-222222222222','PREMIUM','ACTIVE','fixture',now()+interval '10 days');
INSERT INTO public.mercadopago_checkout_sessions VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','ready');
INSERT INTO public.apd_complete_payment_review VALUES('fixture-payment','33333333-3333-4333-8333-333333333333','review',now());
INSERT INTO public.sessions VALUES('expired-fixture','11111111-1111-4111-8111-111111111111','password',now()-interval '2 days',now()-interval '1 day',true),('live-fixture','22222222-2222-4222-8222-222222222222','password',now()-interval '1 hour',now()+interval '1 hour',true);
CREATE TEMP TABLE original_subscriptions AS SELECT * FROM public.user_subscriptions;
CREATE TEMP TABLE original_payments AS SELECT * FROM public.apd_complete_payment_review;
-- Compose the reviewed files, not hand-copied migration bodies.
\ir ../../docs/sql/APD_PRIVATE_TABLE_ACL_CANDIDATE_20261127.sql
\ir ../../docs/sql/APD_SESSION_EXPIRY_CANDIDATE_20261127.sql
\ir ../../docs/sql/APD_LEGACY_TRANSITION_CANDIDATE_20261127.sql
\ir ../../docs/sql/APD_LEGACY_CATALOG_HIDE_CANDIDATE_20261127.sql
\ir ../../docs/sql/APD_CAREER_PROFILE_CANDIDATE.sql
SET apd.review_index_authorized='REVIEWED_INDEX_ONLY';
\ir ../../docs/sql/APD_PAYMENT_REVIEW_INDEX_CANDIDATE_20261128.sql
-- Use the existing career contract on the same schema.
\ir apd_career_profile_assert.sql
SET ROLE service_role;
DO $$ DECLARE a jsonb; b jsonb; v uuid:='11111111-1111-4111-8111-111111111111'; BEGIN
 IF public.apd_expire_sessions_batch(100)<>1 THEN RAISE EXCEPTION 'Session maintenance after ACL failed'; END IF;
 IF public.apd_expire_sessions_batch(100)<>0 THEN RAISE EXCEPTION 'Session maintenance not idempotent'; END IF;
 a:=public.apd_grant_legacy_complete_30d(v);
 b:=public.apd_grant_legacy_complete_30d(v);
 IF a->>'ok' IS DISTINCT FROM 'true' OR b->>'duplicate' IS DISTINCT FROM 'true' OR a->>'period_ends_at' IS DISTINCT FROM b->>'period_ends_at' THEN RAISE EXCEPTION 'Courtesy grant after ACL/catalog failed'; END IF;
 IF public.apd_grant_legacy_complete_30d('22222222-2222-4222-8222-222222222222')->>'reason' IS DISTINCT FROM 'checkout_requires_reconciliation' THEN RAISE EXCEPTION 'Pending checkout ignored'; END IF;
 IF (SELECT count(*) FROM public.subscription_plans)<>11 THEN RAISE EXCEPTION 'Historical lookup broken'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE token='live-fixture' AND activo) THEN RAISE EXCEPTION 'Live session lost'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 IF (SELECT array_agg(code ORDER BY code) FROM public.subscription_plans) IS DISTINCT FROM ARRAY['COMPLETO','FREE'] THEN RAISE EXCEPTION 'Public catalog drift'; END IF;
 BEGIN PERFORM * FROM public.sessions; RAISE EXCEPTION 'Session disclosure'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.apd_grant_legacy_complete_30d('11111111-1111-4111-8111-111111111111'); RAISE EXCEPTION 'Public grant execution'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT * FROM original_subscriptions EXCEPT SELECT * FROM public.user_subscriptions) THEN RAISE EXCEPTION 'Original subscriptions altered'; END IF;
 IF (SELECT count(*) FROM public.user_subscriptions WHERE source='legacy_transition_30d')<>1 THEN RAISE EXCEPTION 'Unexpected grants'; END IF;
 IF EXISTS(SELECT * FROM original_payments EXCEPT ALL SELECT * FROM public.apd_complete_payment_review) OR EXISTS(SELECT * FROM public.apd_complete_payment_review EXCEPT ALL SELECT * FROM original_payments) THEN RAISE EXCEPTION 'Payment review changed'; END IF;
 IF to_regclass('public.apd_payment_review_checkout_idx') IS NULL THEN RAISE EXCEPTION 'Index missing'; END IF;
 IF has_table_privilege('authenticated','public.sessions','SELECT') OR has_function_privilege('authenticated','public.apd_expire_sessions_batch(integer)','EXECUTE') THEN RAISE EXCEPTION 'Private access leaked'; END IF;
END $$;
\ir ../../docs/sql/APD_PAYMENT_REVIEW_INDEX_REVERT_20261128.sql
DO $$ BEGIN
 IF to_regclass('public.apd_payment_review_checkout_idx') IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.user_career_profile WHERE revision=2) OR (SELECT count(*) FROM public.apd_complete_payment_review)<>1 THEN RAISE EXCEPTION 'Index rollback disturbed other changes'; END IF;
END $$;
SELECT 'APD_CONSOLIDATED_MIGRATIONS_PG17_PASS' AS result;

-- Operational rollback: stop new changes, never delete issued rights or old sessions.
CREATE TEMP TABLE before_suspend_subs AS SELECT * FROM public.user_subscriptions;
CREATE TEMP TABLE before_suspend_sessions AS SELECT * FROM public.sessions;
SET apd.rpc_control_ack='SUSPEND_REVIEWED_RPC';
\ir ../../docs/sql/APD_NEW_RPC_SUSPEND_CANDIDATE_20261128.sql
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.apd_expire_sessions_batch(100); RAISE EXCEPTION 'Suspended maintenance allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.apd_grant_legacy_complete_30d('11111111-1111-4111-8111-111111111111'); RAISE EXCEPTION 'Suspended grant allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.user_career_profile WHERE revision=2) THEN RAISE EXCEPTION 'Career lost'; END IF;
END $$;
RESET ROLE;
SET apd.rpc_control_ack='RESUME_REVIEWED_RPC';
\ir ../../docs/sql/APD_NEW_RPC_RESUME_CANDIDATE_20261128.sql
SET ROLE service_role;
DO $$ BEGIN
 IF public.apd_expire_sessions_batch(100)<>0 THEN RAISE EXCEPTION 'Unexpected new expiry'; END IF;
 IF public.apd_grant_legacy_complete_30d('11111111-1111-4111-8111-111111111111')->>'duplicate' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Issued courtesy not preserved'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT * FROM before_suspend_subs EXCEPT ALL SELECT * FROM public.user_subscriptions) OR EXISTS(SELECT * FROM public.user_subscriptions EXCEPT ALL SELECT * FROM before_suspend_subs) OR EXISTS(SELECT * FROM before_suspend_sessions EXCEPT ALL SELECT * FROM public.sessions) OR EXISTS(SELECT * FROM public.sessions EXCEPT ALL SELECT * FROM before_suspend_sessions) THEN RAISE EXCEPTION 'Data changed during suspension roundtrip'; END IF;
END $$;
SELECT 'APD_NEW_RPC_SUSPEND_RESUME_PG17_PASS' AS result;

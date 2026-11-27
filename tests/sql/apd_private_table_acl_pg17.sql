\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
DO $fixture$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['alert_history','alert_notifications','mercadopago_checkout_sessions','mercadopago_webhook_events','sessions','user_identity_profile','webpush_subscriptions'] LOOP
  EXECUTE format('CREATE TABLE public.%I (id integer PRIMARY KEY, value text NOT NULL)',t);
  EXECUTE format('INSERT INTO public.%I VALUES (1,%L)',t,'fixture');
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO anon,authenticated,service_role',t);
 END LOOP;
END $fixture$;
CREATE TABLE public.subscription_plans (id int PRIMARY KEY);
INSERT INTO public.subscription_plans VALUES(1);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_catalog ON public.subscription_plans FOR SELECT TO anon, authenticated USING(true);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
\ir ../../docs/sql/APD_PRIVATE_TABLE_ACL_CANDIDATE_20261127.sql
DO $verify$
DECLARE t text; n integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['alert_history','alert_notifications','mercadopago_checkout_sessions','mercadopago_webhook_events','sessions','user_identity_profile','webpush_subscriptions'] LOOP
  IF has_table_privilege('anon','public.'||t,'TRUNCATE') OR has_table_privilege('authenticated','public.'||t,'TRUNCATE') THEN RAISE EXCEPTION 'dangerous ACL retained'; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
  IF n<>1 THEN RAISE EXCEPTION 'fixture changed'; END IF;
 END LOOP;
END $verify$;
SET ROLE anon;
DO $deny$
BEGIN
 BEGIN PERFORM * FROM public.sessions; RAISE EXCEPTION 'anonymous read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.subscription_plans)<>1 THEN RAISE EXCEPTION 'public catalog broken'; END IF;
END $deny$;
RESET ROLE;
SET ROLE authenticated;
DO $deny$
BEGIN
 BEGIN UPDATE public.sessions SET value='forbidden'; RAISE EXCEPTION 'authenticated write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $deny$;
RESET ROLE;
SET ROLE service_role;
INSERT INTO public.sessions VALUES(2,'backend');
UPDATE public.sessions SET value='verified' WHERE id=2;
DO $backend$ BEGIN IF (SELECT count(*) FROM public.sessions WHERE value='verified')<>1 THEN RAISE EXCEPTION 'backend read/write broken'; END IF; END $backend$;
DELETE FROM public.sessions WHERE id=2;
RESET ROLE;
SELECT 'APD_PRIVATE_TABLE_ACL_PG17_PASS' AS result;

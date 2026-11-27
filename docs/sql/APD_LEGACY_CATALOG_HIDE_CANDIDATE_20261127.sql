-- Candidate: remove legacy offers from public catalog, retain historical lookup.
-- No subscription change, payment call or deletion. Requires reviewed production release.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF (SELECT count(*) FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO') AND is_active IS TRUE AND public_visible IS TRUE AND ((code='FREE' AND price_ars=0) OR (code='COMPLETO' AND price_ars=2000)))<>2
 OR NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='TRIAL_14D' AND is_active IS TRUE AND public_visible IS FALSE AND price_ars=0)
 THEN RAISE EXCEPTION 'New catalog not ready'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='subscription_plans' AND c.relrowsecurity)
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans')<>1
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans' AND policyname='subscription_plans_public_read' AND cmd='SELECT' AND qual='true' AND roles @> ARRAY['anon','authenticated']::name[] AND cardinality(roles)=2)
 THEN RAISE EXCEPTION 'Unexpected public policy; review required'; END IF;
 IF NOT has_table_privilege('service_role','public.subscription_plans','SELECT') THEN RAISE EXCEPTION 'Backend read unavailable'; END IF;
END $guard$;
UPDATE public.subscription_plans SET public_visible=false
 WHERE code NOT IN ('FREE','COMPLETO') AND public_visible IS TRUE;
ALTER POLICY subscription_plans_public_read ON public.subscription_plans
 USING (code IN ('FREE','COMPLETO') AND is_active IS TRUE AND public_visible IS TRUE);
COMMIT;

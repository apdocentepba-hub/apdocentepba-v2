-- APD-010: guarded emergency revert. Restores old public visibility; not routine rollback.
-- Requires explicit approval. No subscription, billing or entitlement changes.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.subscription_plans IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF EXISTS(
  WITH expected(code,is_active,public_visible,price_ars) AS (VALUES
  ('BASIC'::text,false,false,NULL::numeric),
  ('COMPLETO'::text,true,true,2000::numeric),
  ('FREE'::text,true,true,0::numeric),
  ('INSIGNE'::text,true,false,3000::numeric),
  ('INSIGNE_ANUAL'::text,true,false,30000::numeric),
  ('PLUS'::text,true,false,1000::numeric),
  ('PLUS_ANUAL'::text,true,false,10000::numeric),
  ('PREMIUM'::text,true,false,2000::numeric),
  ('PREMIUM_ANUAL'::text,true,false,20000::numeric),
  ('TRIAL_14D'::text,true,false,0::numeric),
  ('TRIAL_7D'::text,true,false,0::numeric)
  ), actual AS (SELECT code,is_active,public_visible,price_ars FROM public.subscription_plans)
  (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
  UNION ALL (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
 ) THEN RAISE EXCEPTION 'Catalog state drift; manual review required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.subscription_plans'::regclass AND NOT tgisinternal)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.subscription_plans'::regclass AND relrowsecurity)
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans')<>1
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans' AND policyname='subscription_plans_public_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND with_check IS NULL AND roles @> ARRAY['anon','authenticated']::name[] AND cardinality(roles)=2 AND qual='((code = ANY (ARRAY[''FREE''::text, ''COMPLETO''::text])) AND (is_active IS TRUE) AND (public_visible IS TRUE))')
 THEN RAISE EXCEPTION 'Unexpected post-migration policy or trigger'; END IF;
END $guard$;
UPDATE public.subscription_plans SET public_visible=true WHERE code IN ('INSIGNE','PLUS','PREMIUM','TRIAL_7D') AND public_visible IS FALSE;
ALTER POLICY subscription_plans_public_read ON public.subscription_plans USING(true);
DO $verify$
BEGIN
 IF EXISTS(
  WITH expected(code,is_active,public_visible,price_ars) AS (VALUES
  ('BASIC'::text,false,false,NULL::numeric),
  ('COMPLETO'::text,true,true,2000::numeric),
  ('FREE'::text,true,true,0::numeric),
  ('INSIGNE'::text,true,true,3000::numeric),
  ('INSIGNE_ANUAL'::text,true,false,30000::numeric),
  ('PLUS'::text,true,true,1000::numeric),
  ('PLUS_ANUAL'::text,true,false,10000::numeric),
  ('PREMIUM'::text,true,true,2000::numeric),
  ('PREMIUM_ANUAL'::text,true,false,20000::numeric),
  ('TRIAL_14D'::text,true,false,0::numeric),
  ('TRIAL_7D'::text,true,true,0::numeric)
  ), actual AS (SELECT code,is_active,public_visible,price_ars FROM public.subscription_plans)
  (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
  UNION ALL (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
 ) THEN RAISE EXCEPTION 'Catalog state drift; manual review required'; END IF;
END $verify$;
COMMIT;

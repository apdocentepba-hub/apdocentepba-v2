\set ON_ERROR_STOP on
DO $$
BEGIN
 IF has_table_privilege('anon','public.user_career_profile','SELECT') OR has_table_privilege('authenticated','public.user_career_profile','SELECT') OR has_table_privilege('authenticated','public.user_career_profile','INSERT') OR has_function_privilege('anon','public.apd_career_profile_cas(uuid,jsonb,integer)','EXECUTE') OR has_function_privilege('authenticated','public.apd_career_profile_cas(uuid,jsonb,integer)','EXECUTE') THEN RAISE EXCEPTION 'public grants'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_career_profile'::regclass) THEN RAISE EXCEPTION 'missing RLS'; END IF;
END$$;
SET ROLE service_role;
DO $$
DECLARE a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222';
 p jsonb:='{"schema":1,"seniorityYears":10,"positions":[]}'; n int;
BEGIN
 SELECT count(*) INTO n FROM public.apd_career_profile_cas(a,p,0); IF n<>1 THEN RAISE EXCEPTION 'initial insert'; END IF;
 SELECT count(*) INTO n FROM public.apd_career_profile_cas(a,p,0); IF n<>0 THEN RAISE EXCEPTION 'stale insert'; END IF;
 SELECT count(*) INTO n FROM public.apd_career_profile_cas(a,p,1); IF n<>1 THEN RAISE EXCEPTION 'update'; END IF;
 SELECT count(*) INTO n FROM public.apd_career_profile_cas(a,p,1); IF n<>0 THEN RAISE EXCEPTION 'stale update'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_career_profile WHERE user_id=b) THEN RAISE EXCEPTION 'wrong owner'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_career_profile WHERE user_id=a AND revision=2 AND profile=p) THEN RAISE EXCEPTION 'readback'; END IF;
 BEGIN PERFORM public.apd_career_profile_cas(b,'{"unexpected":true}',0); RAISE EXCEPTION 'invalid shape accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END$$;
RESET ROLE;
SELECT 'APD_CAREER_SQL_PASS' AS result;

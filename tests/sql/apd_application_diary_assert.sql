DO $$
DECLARE r text; p text;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_application_diary'::regclass) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
   IF has_table_privilege(r,'public.user_application_diary',p) THEN RAISE EXCEPTION 'Public ACL'; END IF;
  END LOOP;
  IF has_function_privilege(r,'public.apd_valid_application_diary(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Public helper'; END IF;
 END LOOP;
 FOREACH p IN ARRAY ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
  IF has_table_privilege('service_role','public.user_application_diary',p) THEN RAISE EXCEPTION 'Excess service ACL'; END IF;
 END LOOP;
END $$;
SET ROLE service_role;
DO $$
DECLARE a uuid:='00000000-0000-0000-0000-000000000001'; b uuid:='00000000-0000-0000-0000-000000000002'; good jsonb:='[{"key":"D_1","status":"postulada","origin":"self_reported","updatedAt":"2026-11-24T15:00:00.000Z"}]'; bad jsonb; n int;
BEGIN
 INSERT INTO public.user_application_diary(user_id,entries,revision) VALUES(a,good,1);
 IF EXISTS(SELECT 1 FROM public.user_application_diary WHERE user_id=b) THEN RAISE EXCEPTION 'Unexpected owner'; END IF;
 FOR bad IN SELECT v FROM (VALUES ('null'::jsonb), ('{}'::jsonb), ('[null]'::jsonb), (good||good), (jsonb_set(good,'{0,origin}','"official"'::jsonb)), (jsonb_set(good,'{0,status}','"unknown"'::jsonb)), (jsonb_set(good,'{0,key}','null'::jsonb)), (jsonb_set(good,'{0,updatedAt}','"2026-02-30T15:00:00.000Z"'::jsonb)), (jsonb_set(good,'{0,updatedAt}','"2026-11-24T24:00:00.000Z"'::jsonb)), (jsonb_set(good,'{0,secret}','"not allowed"'::jsonb))) AS q(v) LOOP
  BEGIN
   INSERT INTO public.user_application_diary(user_id,entries,revision) VALUES(b,bad,1);
   RAISE EXCEPTION 'Invalid diary accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 UPDATE public.user_application_diary SET entries='[]',revision=2 WHERE user_id=a AND revision=1;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'CAS failed'; END IF;
 UPDATE public.user_application_diary SET entries=good,revision=2 WHERE user_id=a AND revision=1;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Stale CAS accepted'; END IF;
 IF NOT EXISTS(SELECT FROM public.user_application_diary WHERE user_id=a AND revision=2 AND entries='[]') THEN RAISE EXCEPTION 'Empty revision lost'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS application diary ACL, schema, manual provenance, date validation, CAS and empty revision';

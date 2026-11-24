DO $$
DECLARE r text; p text;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_favorite_offers'::regclass) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
   IF has_table_privilege(r,'public.user_favorite_offers',p) THEN RAISE EXCEPTION 'Unexpected permission % %',r,p; END IF;
  END LOOP;
  IF has_function_privilege(r,'public.apd_valid_favorite_keys(text[])','EXECUTE') THEN RAISE EXCEPTION 'Public helper execute'; END IF;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.user_favorite_offers','SELECT') OR NOT has_table_privilege('service_role','public.user_favorite_offers','INSERT') OR NOT has_table_privilege('service_role','public.user_favorite_offers','UPDATE') OR has_table_privilege('service_role','public.user_favorite_offers','DELETE') THEN RAISE EXCEPTION 'Service permissions'; END IF;
 FOREACH p IN ARRAY ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
  IF has_table_privilege('service_role','public.user_favorite_offers',p) THEN RAISE EXCEPTION 'Excess service privilege %',p; END IF;
 END LOOP;
END $$;
SET ROLE service_role;
DO $$
DECLARE a uuid:='00000000-0000-0000-0000-000000000001'; b uuid:='00000000-0000-0000-0000-000000000002'; bad text[]; n int;
BEGIN
 INSERT INTO public.user_favorite_offers(user_id,keys,revision) VALUES(a,ARRAY['D_1'],1);
 INSERT INTO public.user_favorite_offers(user_id,keys,revision) VALUES(a,ARRAY['D_2'],1) ON CONFLICT(user_id) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Duplicate insert'; END IF;
 UPDATE public.user_favorite_offers SET keys=ARRAY['D_2'],revision=2 WHERE user_id=a AND revision=1;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'CAS failed'; END IF;
 UPDATE public.user_favorite_offers SET keys=ARRAY['D_3'],revision=2 WHERE user_id=a AND revision=1;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Stale CAS accepted'; END IF;
 IF EXISTS(SELECT FROM public.user_favorite_offers WHERE user_id=b) THEN RAISE EXCEPTION 'Wrong owner'; END IF;
 FOR bad IN SELECT v FROM (VALUES (ARRAY['x','x']), (ARRAY['x',NULL]), (ARRAY['']), (ARRAY[E'x\n']), (ARRAY['../x/']), (ARRAY[repeat('x',161)]), (array_fill('x'::text,ARRAY[51])), ('[0:0]={x}'::text[]), (ARRAY[['a','b'],['c','d']])) AS q(v) LOOP
  BEGIN
   INSERT INTO public.user_favorite_offers(user_id,keys,revision) VALUES(b,bad,1);
   RAISE EXCEPTION 'Invalid keys accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 BEGIN
  INSERT INTO public.user_favorite_offers(user_id,keys,revision) VALUES(b,ARRAY['D_1'],9007199254740992);
  RAISE EXCEPTION 'Unsafe revision accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.user_favorite_offers SET keys='{}',revision=3 WHERE user_id=a AND revision=2;
 IF NOT EXISTS(SELECT FROM public.user_favorite_offers WHERE user_id=a AND revision=3 AND cardinality(keys)=0) THEN RAISE EXCEPTION 'Empty revision lost'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.users WHERE id='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT FROM public.user_favorite_offers) THEN RAISE EXCEPTION 'Cascade failed'; END IF; END $$;
-- Recreate fixture for independent concurrent psql sessions.
INSERT INTO public.users VALUES ('00000000-0000-0000-0000-000000000001');
SELECT 'PASS favorites schema, privileges, invalid arrays, revision and cascade' AS result;

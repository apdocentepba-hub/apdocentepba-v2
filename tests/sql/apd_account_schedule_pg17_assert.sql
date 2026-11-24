DO $$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_module_schedule'::regclass) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
 IF has_table_privilege('anon','public.user_module_schedule','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.user_module_schedule','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Public data API permission'; END IF;
 IF NOT (has_table_privilege('service_role','public.user_module_schedule','SELECT') AND has_table_privilege('service_role','public.user_module_schedule','INSERT') AND has_table_privilege('service_role','public.user_module_schedule','UPDATE')) THEN RAISE EXCEPTION 'Service role permissions'; END IF;
END $$;
SET ROLE service_role;
INSERT INTO public.user_module_schedule(user_id,modules,revision) VALUES ('00000000-0000-0000-0000-000000000001',ARRAY['M1-1','T0-2'],1);
DO $$
DECLARE changed integer;
BEGIN
 UPDATE public.user_module_schedule SET modules=ARRAY['M2-1'],revision=2 WHERE user_id='00000000-0000-0000-0000-000000000001' AND revision=1;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'CAS first update failed'; END IF;
 UPDATE public.user_module_schedule SET modules=ARRAY['T1-1'],revision=2 WHERE user_id='00000000-0000-0000-0000-000000000001' AND revision=1;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'CAS stale update succeeded'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_module_schedule WHERE user_id='00000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Wrong account'; END IF;
 BEGIN
  INSERT INTO public.user_module_schedule VALUES ('00000000-0000-0000-0000-000000000002',ARRAY['M0-1'],1,now());
  RAISE EXCEPTION 'Invalid ID accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.user_module_schedule VALUES ('00000000-0000-0000-0000-000000000002',ARRAY['M1-1','M1-1'],1,now());
  RAISE EXCEPTION 'Duplicate accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.user_module_schedule VALUES ('00000000-0000-0000-0000-000000000002',ARRAY['M1-1',NULL],1,now());
  RAISE EXCEPTION 'NULL accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.user_module_schedule SET modules='{}',revision=3 WHERE user_id='00000000-0000-0000-0000-000000000001' AND revision=2;
 IF NOT EXISTS(SELECT 1 FROM public.user_module_schedule WHERE revision=3 AND cardinality(modules)=0) THEN RAISE EXCEPTION 'Empty schedule not saved'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.users WHERE id='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.user_module_schedule) THEN RAISE EXCEPTION 'Account deletion cascade failed'; END IF; END $$;
SELECT 'PASS: PG17 schema, private grants, validation, CAS and cascade' AS result;

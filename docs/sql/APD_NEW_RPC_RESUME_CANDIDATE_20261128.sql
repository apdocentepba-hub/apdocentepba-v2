-- Candidate only. Resume new maintenance/courtesy RPCs; keep issued benefits and session history.
-- Career CAS remains available for compatible clients. No table or row mutations.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $guard$
DECLARE f regprocedure; r text;
BEGIN
 IF current_user <> 'postgres' OR current_setting('apd.rpc_control_ack',true) IS DISTINCT FROM 'RESUME_REVIEWED_RPC' THEN RAISE EXCEPTION 'Explicit operator acknowledgement required'; END IF;
 FOREACH f IN ARRAY ARRAY[to_regprocedure('public.apd_expire_sessions_batch(integer)'),to_regprocedure('public.apd_grant_legacy_complete_30d(uuid)')] LOOP
  IF f IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f AND NOT prosecdef AND proowner='postgres'::regrole AND prokind='f') THEN RAISE EXCEPTION 'Unexpected function identity or security'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected public execution'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND (a.grantee NOT IN ('postgres'::regrole,'service_role'::regrole) OR a.grantor<>'postgres'::regrole OR a.is_grantable)) THEN RAISE EXCEPTION 'Unexpected ACL'; END IF;
  IF has_function_privilege('service_role',f,'EXECUTE') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Unexpected starting privilege'; END IF;
 END LOOP;
END $guard$;
GRANT EXECUTE ON FUNCTION public.apd_expire_sessions_batch(integer), public.apd_grant_legacy_complete_30d(uuid) TO service_role;
DO $verify$
BEGIN
 IF has_function_privilege('service_role','public.apd_expire_sessions_batch(integer)','EXECUTE') IS DISTINCT FROM true OR has_function_privilege('service_role','public.apd_grant_legacy_complete_30d(uuid)','EXECUTE') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unexpected effective privilege'; END IF;
END $verify$;
COMMIT;

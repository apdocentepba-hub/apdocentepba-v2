-- DISPOSABLE PG17 + PostgREST ONLY. Run after server staged-content guard.
-- Split scanner's HTTP EXECUTE permission from private table writes.
-- This is a laboratory privilege exercise, not a Supabase migration.
BEGIN;
CREATE ROLE apd_ci_executor NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
-- Give the non-login function owner ONLY the private privileges required
-- to execute existing SECURITY INVOKER helpers (including the district fence).
GRANT USAGE ON SCHEMA apd_scanner_pilot TO apd_ci_executor;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA apd_scanner_pilot TO apd_ci_executor;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_pilot TO apd_ci_executor;
-- Postgres function ownership transfer may require CREATE on target schema.
GRANT USAGE, CREATE ON SCHEMA apd_scanner_api TO apd_ci_executor;

DO $apd_harden$
DECLARE
  rec record;
  function_count integer:=0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='apd_scanner_api'
      AND p.proname NOT IN (
        'create_capture','stage_capture_page','seal_capture',
        'commit_capture','register_source_identity',
        'revalidate_source_identity','register_source_pairs',
        'revalidate_source_pairs','capture_status',
        'register_staged_content','revalidate_staged_content'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected public API RPC requires manual security review';
  END IF;
  FOR rec IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='apd_scanner_api'
  LOOP
    function_count:=function_count+1;
    EXECUTE format('ALTER FUNCTION %s OWNER TO apd_ci_executor',rec.signature);
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER',rec.signature);
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pg_catalog, apd_scanner_api, apd_scanner_pilot, pg_temp',
      rec.signature
    );
  END LOOP;
  IF function_count<>11 THEN
    RAISE EXCEPTION 'Unexpected public API RPC count: %',function_count;
  END IF;
END;
$apd_harden$;

-- Eliminate every direct SQL access route for the JWT scanner role.
REVOKE ALL ON ALL TABLES IN SCHEMA apd_scanner_pilot FROM apd_api_scanner;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_pilot FROM apd_api_scanner;
REVOKE USAGE ON SCHEMA apd_scanner_pilot FROM apd_api_scanner;
REVOKE CREATE ON SCHEMA apd_scanner_api FROM apd_api_scanner;
REVOKE CREATE ON SCHEMA apd_scanner_api FROM apd_ci_executor;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON ALL TABLES IN SCHEMA apd_scanner_pilot
  FROM apd_ci_executor;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_pilot FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_api FROM PUBLIC;
-- Explicitly preserve retirement of pair-blind endpoints.
REVOKE EXECUTE ON FUNCTION apd_scanner_api.register_source_identity(uuid,jsonb)
  FROM apd_api_scanner;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.revalidate_source_identity(uuid,jsonb)
  FROM apd_api_scanner;
COMMIT;
NOTIFY pgrst, 'reload schema';

DO $apd_privilege_matrix$
DECLARE
  table_name record;
  f record;
BEGIN
  IF pg_has_role('apd_api_scanner','apd_ci_executor','MEMBER')
    OR pg_has_role('apd_api_anon','apd_ci_executor','MEMBER')
    OR pg_has_role('apd_api_authenticated','apd_ci_executor','MEMBER')
    OR has_schema_privilege('apd_api_scanner','apd_scanner_pilot','USAGE')
    OR has_schema_privilege('apd_api_scanner','apd_scanner_api','CREATE')
    OR has_schema_privilege('apd_ci_executor','apd_scanner_api','CREATE')
    OR NOT has_schema_privilege('apd_api_scanner','apd_scanner_api','USAGE')
    OR NOT has_function_privilege('apd_api_scanner',
       'apd_scanner_api.commit_capture(uuid)','EXECUTE')
    OR NOT has_function_privilege('apd_api_scanner',
       'apd_scanner_api.register_staged_content(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('apd_api_scanner',
       'apd_scanner_api.register_source_identity(uuid,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'Scanner/executor role boundary unsafe'; END IF;

  FOR table_name IN SELECT c.oid
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='apd_scanner_pilot'
       AND c.relkind IN ('r','p','v','m','f')
  LOOP
    IF has_table_privilege('apd_api_scanner',table_name.oid,'SELECT')
      OR has_table_privilege('apd_api_scanner',table_name.oid,'INSERT')
      OR has_table_privilege('apd_api_scanner',table_name.oid,'UPDATE')
      OR has_table_privilege('apd_api_scanner',table_name.oid,'DELETE')
      OR has_table_privilege('apd_ci_executor',table_name.oid,'DELETE')
    THEN RAISE EXCEPTION 'Private table accessible to direct SQL scanner'; END IF;
  END LOOP;

  FOR f IN SELECT p.oid,p.prosecdef,p.proowner,
             coalesce(array_to_string(p.proconfig,','),'') AS config
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='apd_scanner_api'
  LOOP
    IF NOT f.prosecdef OR f.proowner<>'apd_ci_executor'::regrole
      OR f.config NOT LIKE '%search_path=pg_catalog, apd_scanner_api, apd_scanner_pilot, pg_temp%'
      OR has_function_privilege('apd_api_anon',f.oid,'EXECUTE')
      OR has_function_privilege('apd_api_authenticated',f.oid,'EXECUTE')
    THEN RAISE EXCEPTION 'Exposed SECURITY DEFINER RPC privilege/search_path unsafe'; END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='apd_scanner_pilot'
      AND has_function_privilege('apd_api_scanner',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION 'Scanner can directly call private helper'; END IF;
END;
$apd_privilege_matrix$;

-- Real SQL execution as the JWT scanner role: attempts must raise 42501.
BEGIN;
SET LOCAL ROLE apd_api_scanner;
DO $apd_sql_direct$
BEGIN
  BEGIN
    EXECUTE 'SELECT 1 FROM apd_scanner_pilot.full_staged_payloads LIMIT 1';
    RAISE EXCEPTION 'Direct scanner SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'UPDATE apd_scanner_pilot.current_offers_full SET cargo = ''ALTERED'' WHERE source_offer_key = ''D_9601''';
    RAISE EXCEPTION 'Direct scanner UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'DELETE FROM apd_scanner_pilot.current_offers_full WHERE source_offer_key = ''D_9601''';
    RAISE EXCEPTION 'Direct scanner DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT apd_scanner_pilot.canonical_staged_payloads(''[]''::jsonb)';
    RAISE EXCEPTION 'Direct scanner private helper unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$apd_sql_direct$;
COMMIT;
SELECT 'PASS: scanner role has EXECUTE-only exposed RPCs; no direct SQL reads/writes/helpers' AS result;

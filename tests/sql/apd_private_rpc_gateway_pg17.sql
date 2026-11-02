-- APDocentePBA ISOLATED CI ONLY — PostgreSQL 17 + PostgREST pilot.
-- A dedicated exposed API schema with SECURITY INVOKER RPCs; tables remain
-- in apd_scanner_pilot, which PostgREST must NOT expose.
-- NEVER apply to production Supabase or copy lab role grants to production.
BEGIN;
CREATE SCHEMA apd_scanner_api;

CREATE ROLE apd_api_anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE apd_api_authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE apd_api_scanner NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT apd_api_anon, apd_api_authenticated, apd_api_scanner TO apd_ci;

-- All SQL objects live in the private, unexposed pilot schema, protected by grants.
REVOKE ALL ON SCHEMA apd_scanner_pilot FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA apd_scanner_pilot FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_pilot FROM PUBLIC;
REVOKE ALL ON SCHEMA apd_scanner_api FROM PUBLIC;

GRANT USAGE ON SCHEMA apd_scanner_pilot TO apd_api_scanner;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA apd_scanner_pilot TO apd_api_scanner;
-- SECURITY INVOKER only. Direct SQL permissions are required by the inner RPCs,
-- but no table is reachable over the HTTP Data API (schema not exposed).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_pilot TO apd_api_scanner;
-- Never authorize direct table deletion, including the scanner role.
REVOKE DELETE ON ALL TABLES IN SCHEMA apd_scanner_pilot FROM apd_api_scanner;

CREATE FUNCTION apd_scanner_api.create_capture(
  p_run_id uuid,
  p_district text,
  p_expected_pages integer,
  p_started_at timestamptz,
  p_captured_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
BEGIN
  IF p_run_id IS NULL OR p_district IS NULL OR
     p_district !~ '^[A-Z0-9 ÁÉÍÓÚÜÑ()/.,-]{2,100}$' OR
     p_expected_pages IS NULL OR p_expected_pages NOT BETWEEN 1 AND 700 OR
     p_started_at IS NULL OR p_captured_at IS NULL OR
     p_started_at > p_captured_at THEN
    RAISE EXCEPTION 'Invalid capture plan';
  END IF;
  INSERT INTO apd_scanner_pilot.runs
    (run_id,distrito,expected_offers,expected_pages,completed_pages,
     capture_started_at,captured_at,stage_verified,allow_prune,status)
  VALUES (p_run_id,p_district,0,p_expected_pages,0,
          p_started_at,p_captured_at,false,false,'ready');
  RETURN p_run_id;
END;
$$;

CREATE FUNCTION apd_scanner_api.stage_capture_page(
  p_run_id uuid,p_page_index integer,p_source_total integer,p_rows jsonb
) RETURNS integer
LANGUAGE sql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
 SELECT apd_scanner_pilot.stage_full_page(p_run_id,p_page_index,p_source_total,p_rows);
$$;

CREATE FUNCTION apd_scanner_api.seal_capture(
  p_run_id uuid
) RETURNS integer
LANGUAGE sql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
 SELECT apd_scanner_pilot.seal_capture(p_run_id);
$$;

CREATE FUNCTION apd_scanner_api.commit_capture(
  p_run_id uuid
) RETURNS TABLE(upserted integer,pruned integer)
LANGUAGE sql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
 SELECT * FROM apd_scanner_pilot.finalize_full_district(p_run_id,false);
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- These REVOKEs are in the same transaction as CREATE, before API exposure.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_api FROM PUBLIC;
GRANT USAGE ON SCHEMA apd_scanner_api TO apd_api_scanner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_api TO apd_api_scanner;
COMMIT;

-- Security assertions run as actual PostgreSQL privilege queries.
DO $$
DECLARE
  anonymous_name text;
  rpc record;
BEGIN
  FOREACH anonymous_name IN ARRAY ARRAY['apd_api_anon','apd_api_authenticated'] LOOP
    IF has_schema_privilege(anonymous_name,'apd_scanner_api','USAGE') OR
       has_schema_privilege(anonymous_name,'apd_scanner_pilot','USAGE') OR
       has_table_privilege(anonymous_name,'apd_scanner_pilot.current_offers_full','SELECT') OR
       has_table_privilege(anonymous_name,'apd_scanner_pilot.current_offers_full','INSERT') OR
       has_function_privilege(anonymous_name,'apd_scanner_api.commit_capture(uuid)','EXECUTE') OR
       has_function_privilege(anonymous_name,
          'apd_scanner_api.stage_capture_page(uuid,integer,integer,jsonb)','EXECUTE') THEN
      RAISE EXCEPTION 'Unauthorized public role % has private grants',anonymous_name;
    END IF;
  END LOOP;
  IF NOT has_schema_privilege('apd_api_scanner','apd_scanner_api','USAGE') OR
     NOT has_function_privilege('apd_api_scanner','apd_scanner_api.commit_capture(uuid)','EXECUTE') OR
     has_table_privilege('apd_api_scanner','apd_scanner_pilot.current_offers','DELETE') OR
     has_table_privilege('apd_api_scanner','apd_scanner_pilot.current_offers_full','DELETE') THEN
    RAISE EXCEPTION 'Scanner RPC grants invalid';
  END IF;
  IF (SELECT count(*) FROM information_schema.tables
       WHERE table_schema='apd_scanner_api')<>0 THEN
    RAISE EXCEPTION 'API schema must contain no tables';
  END IF;
  FOR rpc IN
    SELECT p.proname AS name,p.prosecdef AS elevated
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='apd_scanner_api'
  LOOP
    IF rpc.elevated THEN RAISE EXCEPTION 'RPC % must not be SECURITY DEFINER',rpc.name; END IF;
  END LOOP;
END;
$$;
SELECT 'PASS: only scanner role can call four SECURITY INVOKER API RPCs; private tables not exposed' AS result;

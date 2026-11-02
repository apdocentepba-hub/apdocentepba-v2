-- DISPOSABLE CI DATABASE ONLY. Never run in production Supabase.
-- Separate read roles for unauthenticated/authenticated callers and scanner service.
BEGIN;
CREATE ROLE apd_pilot_anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE apd_pilot_authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE apd_pilot_scanner NOLOGIN NOSUPERUSER NOBYPASSRLS;

-- PostgREST's disposable DB authenticator must be allowed to switch roles.
GRANT apd_pilot_anon, apd_pilot_authenticated, apd_pilot_scanner TO apd_ci;

-- PostgreSQL functions are EXECUTE PUBLIC by default. Always revoke explicitly.
REVOKE ALL ON SCHEMA apd_scanner_pilot FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA apd_scanner_pilot FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA apd_scanner_pilot FROM PUBLIC;

GRANT USAGE ON SCHEMA apd_scanner_pilot TO apd_pilot_scanner;
-- LAB ONLY: SECURITY INVOKER procedures need these table privileges. Production
-- must use a dedicated private schema and further scoped server-only API.
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA apd_scanner_pilot TO apd_pilot_scanner;
-- Deliberately do NOT grant DELETE: even scanner token cannot prune at table level.
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.stage_page(uuid,integer,integer,jsonb)
 TO apd_pilot_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.stage_full_page(uuid,integer,integer,jsonb)
 TO apd_pilot_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.seal_capture(uuid) TO apd_pilot_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.finalize_district(uuid,boolean,boolean)
 TO apd_pilot_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.finalize_full_district(uuid,boolean)
 TO apd_pilot_scanner;
COMMIT;

DO $$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['apd_pilot_anon','apd_pilot_authenticated'] LOOP
  IF has_schema_privilege(r,'apd_scanner_pilot','USAGE') OR
     has_table_privilege(r,'apd_scanner_pilot.current_offers_full','SELECT') OR
     has_table_privilege(r,'apd_scanner_pilot.current_offers_full','INSERT') OR
     has_function_privilege(r,'apd_scanner_pilot.finalize_full_district(uuid,boolean)','EXECUTE') OR
     has_function_privilege(r,'apd_scanner_pilot.stage_full_page(uuid,integer,integer,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Unauthorized role % can access capture objects',r;
  END IF;
 END LOOP;
 IF NOT has_schema_privilege('apd_pilot_scanner','apd_scanner_pilot','USAGE') OR
    NOT has_function_privilege('apd_pilot_scanner',
      'apd_scanner_pilot.finalize_full_district(uuid,boolean)','EXECUTE') OR
    has_table_privilege('apd_pilot_scanner',
      'apd_scanner_pilot.current_offers_full','DELETE') OR
    has_table_privilege('apd_pilot_scanner',
      'apd_scanner_pilot.current_offers','DELETE') THEN
   RAISE EXCEPTION 'Scanner role privilege matrix invalid';
 END IF;
END$$;
SELECT 'PASS: anon/auth denied, scanner-only execution, no SQL DELETE grants' AS result;

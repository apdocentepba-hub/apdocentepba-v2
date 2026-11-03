-- DISPOSABLE PG17 LAB ONLY: PostgREST read-only capture reconciliation.
-- A lost HTTP commit response must be reconciled by reading the run status,
-- not by automatically replaying the write. NEVER deploy this SQL to Supabase.
BEGIN;
CREATE FUNCTION apd_scanner_api.capture_status(p_run_id uuid)
RETURNS TABLE (
  run_status text,
  canonical_district text,
  completed_pages integer,
  expected_pages integer,
  source_pairs_verified boolean
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $apd_status$
  SELECT r.status,r.distrito,r.completed_pages,r.expected_pages,
    (p.verified_at IS NOT NULL)
  FROM apd_scanner_pilot.runs r
  LEFT JOIN apd_scanner_pilot.source_id_key_pairs p
    ON p.run_id=r.run_id
  WHERE r.run_id=p_run_id;
$apd_status$;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.capture_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apd_scanner_api.capture_status(uuid) TO apd_api_scanner;
COMMIT;

DO $apd_check$
BEGIN
 IF has_function_privilege('apd_api_anon',
    'apd_scanner_api.capture_status(uuid)','EXECUTE') OR
    has_function_privilege('apd_api_authenticated',
    'apd_scanner_api.capture_status(uuid)','EXECUTE') OR
    NOT has_function_privilege('apd_api_scanner',
    'apd_scanner_api.capture_status(uuid)','EXECUTE') OR
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='apd_scanner_api' AND p.proname='capture_status')
 THEN RAISE EXCEPTION 'Read-only status RPC ACL or invoker contract unsafe'; END IF;
END;
$apd_check$;
SELECT 'PASS: capture status is scanner-only, stable and invoker-scoped' AS result;

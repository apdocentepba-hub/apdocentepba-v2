-- APDocentePBA · CONCURRENCY PILOT ONLY, disposable PostgreSQL 17.
-- Must run AFTER apd_private_rpc_gateway_pg17.sql. Never apply to live Supabase.
-- The previous API serialized district writes but allowed an OLDER, overlapping
-- capture to commit after a NEWER one. This explicit fence rejects that replay.
BEGIN;
CREATE TABLE apd_scanner_pilot.district_commit_fence (
  distrito text PRIMARY KEY,
  run_id uuid NOT NULL UNIQUE REFERENCES apd_scanner_pilot.runs(run_id),
  capture_started_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  CHECK (captured_at >= capture_started_at)
);
REVOKE ALL ON apd_scanner_pilot.district_commit_fence FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON apd_scanner_pilot.district_commit_fence
  TO apd_api_scanner;
-- Deliberately no DELETE or TRUNCATE for the scanner service.

CREATE OR REPLACE FUNCTION apd_scanner_api.commit_capture(p_run_id uuid)
RETURNS TABLE(upserted integer,pruned integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  previous apd_scanner_pilot.district_commit_fence%ROWTYPE;
  n_upserted integer;
  n_pruned integer;
BEGIN
  -- Keep lock order compatible with the existing finalize_* functions:
  -- capture run first, then district advisory lock.
  SELECT * INTO r FROM apd_scanner_pilot.runs
    WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture run'; END IF;
  IF r.status <> 'ready' OR NOT r.stage_verified OR
     r.completed_pages <> r.expected_pages OR
     r.captured_at < r.capture_started_at THEN
    RAISE EXCEPTION 'Capture incomplete or already finalized';
  END IF;

  -- The same advisory lock key is used inside finalize_district().
  -- It is TRANSACTION-scoped: guarded check, all row writes and watermark
  -- commit/roll back together, including when concurrent HTTP calls race.
  PERFORM pg_advisory_xact_lock(hashtextextended(r.distrito,0));

  SELECT * INTO previous
    FROM apd_scanner_pilot.district_commit_fence
    WHERE distrito=r.distrito FOR UPDATE;
  IF FOUND AND (r.capture_started_at <= previous.captured_at OR
       r.captured_at <= previous.captured_at) THEN
    RAISE EXCEPTION 'Overlapping or stale district capture rejected';
  END IF;

  -- Existing function performs 24-column + minimal table upserts atomically.
  -- It does not prune by default. NO DELETE is exposed through this RPC.
  SELECT x.upserted,x.pruned INTO n_upserted,n_pruned
    FROM apd_scanner_pilot.finalize_full_district(p_run_id,false) x;
  IF NOT FOUND OR n_upserted IS NULL OR n_pruned <> 0 THEN
    RAISE EXCEPTION 'Unsafe or incomplete district finalize';
  END IF;

  INSERT INTO apd_scanner_pilot.district_commit_fence AS f
    (distrito,run_id,capture_started_at,captured_at)
  VALUES (r.distrito,p_run_id,r.capture_started_at,r.captured_at)
  ON CONFLICT(distrito) DO UPDATE SET
    run_id=EXCLUDED.run_id,
    capture_started_at=EXCLUDED.capture_started_at,
    captured_at=EXCLUDED.captured_at;
  RETURN QUERY SELECT n_upserted,n_pruned;
END;
$$;

-- CREATE OR REPLACE preserves existing ACLs, but make the contract explicit.
REVOKE EXECUTE ON FUNCTION apd_scanner_api.commit_capture(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apd_scanner_api.commit_capture(uuid)
  TO apd_api_scanner;
COMMIT;

DO $$
BEGIN
  IF has_schema_privilege('apd_api_anon','apd_scanner_pilot','USAGE')
   OR has_table_privilege('apd_api_authenticated',
      'apd_scanner_pilot.district_commit_fence','SELECT')
   OR has_table_privilege('apd_api_scanner',
      'apd_scanner_pilot.district_commit_fence','DELETE')
   OR has_function_privilege('apd_api_anon',
      'apd_scanner_api.commit_capture(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'District fence permission matrix unsafe';
  END IF;
END$$;
SELECT 'PASS: district fence is private; scanner has commit RPC without DELETE' AS result;

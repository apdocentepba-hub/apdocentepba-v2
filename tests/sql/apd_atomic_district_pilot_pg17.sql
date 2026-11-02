-- APDocentePBA: PostgreSQL 17 ISOLATED PROTOTYPE ONLY.
-- This file MUST NOT be applied to production Supabase.
-- Everything is created in a disposable apd_scanner_pilot schema.
BEGIN;
CREATE SCHEMA apd_scanner_pilot;

CREATE TABLE apd_scanner_pilot.current_offers (
  source_offer_key text PRIMARY KEY,
  distrito text NOT NULL CHECK (length(distrito) > 0),
  estado text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  times_seen bigint NOT NULL DEFAULT 1 CHECK (times_seen > 0)
);

CREATE TABLE apd_scanner_pilot.runs (
  run_id uuid PRIMARY KEY,
  distrito text NOT NULL CHECK (length(distrito) > 0),
  expected_offers int NOT NULL CHECK (expected_offers >= 0),
  expected_pages int NOT NULL CHECK (expected_pages > 0),
  completed_pages int NOT NULL CHECK (completed_pages >= 0),
  capture_started_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  stage_verified boolean NOT NULL DEFAULT false,
  allow_prune boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','finalized'))
);

CREATE TABLE apd_scanner_pilot.staged_offers (
  run_id uuid NOT NULL REFERENCES apd_scanner_pilot.runs(run_id),
  source_offer_key text NOT NULL,
  distrito text NOT NULL,
  estado text NOT NULL,
  PRIMARY KEY (run_id, source_offer_key)
);

-- One call = one PG transaction. SECURITY INVOKER: no privilege escalation.
CREATE FUNCTION apd_scanner_pilot.finalize_district(
  p_run_id uuid,
  p_prune boolean DEFAULT false,
  p_inject_error_for_test boolean DEFAULT false
)
RETURNS TABLE (upserted integer, pruned integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, apd_scanner_pilot
AS $$
DECLARE
  v_run apd_scanner_pilot.runs%ROWTYPE;
  v_count int;
  v_upserted int;
  v_pruned int := 0;
BEGIN
  SELECT * INTO v_run
  FROM apd_scanner_pilot.runs
  WHERE run_id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture run'; END IF;
  IF v_run.status <> 'ready' THEN
    RAISE EXCEPTION 'Run already finalized';
  END IF;
  IF NOT v_run.stage_verified OR
     v_run.completed_pages <> v_run.expected_pages OR
     v_run.captured_at < v_run.capture_started_at THEN
    RAISE EXCEPTION 'Capture incomplete or not verified';
  END IF;

  -- Serialize concurrent finalization for the same canonical district.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_run.distrito, 0));

  SELECT count(*)::int INTO v_count
  FROM apd_scanner_pilot.staged_offers
  WHERE run_id = p_run_id;
  IF v_count <> v_run.expected_offers THEN
    RAISE EXCEPTION 'Staged count does not match completed scan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM apd_scanner_pilot.staged_offers s
    WHERE s.run_id = p_run_id AND s.distrito <> v_run.distrito
  ) THEN RAISE EXCEPTION 'Stage contains a different district'; END IF;

  IF EXISTS (
    SELECT 1
    FROM apd_scanner_pilot.staged_offers s
    JOIN apd_scanner_pilot.current_offers c USING (source_offer_key)
    WHERE s.run_id = p_run_id AND c.distrito <> v_run.distrito
  ) THEN RAISE EXCEPTION 'Existing source key belongs to another district'; END IF;

  -- Preserve first_seen_at and the canonical district of existing records.
  INSERT INTO apd_scanner_pilot.current_offers AS dst
    (source_offer_key, distrito, estado, first_seen_at, last_seen_at, times_seen)
  SELECT s.source_offer_key, v_run.distrito, s.estado,
    v_run.captured_at, v_run.captured_at, 1
  FROM apd_scanner_pilot.staged_offers s
  WHERE s.run_id = p_run_id
  ON CONFLICT (source_offer_key)
  DO UPDATE SET
    estado = EXCLUDED.estado,
    last_seen_at = EXCLUDED.last_seen_at,
    times_seen = dst.times_seen + 1;
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  -- Test-only forced error proves upserts are rolled back atomically.
  IF p_inject_error_for_test THEN
    RAISE EXCEPTION 'INJECTED_AFTER_UPSERT';
  END IF;

  -- Explicit opt-in only; no pruning of empty scans or incomplete stages.
  IF p_prune THEN
    IF NOT v_run.allow_prune OR v_run.expected_offers = 0 THEN
      RAISE EXCEPTION 'Pruning requires explicit nonempty, authorized capture';
    END IF;
    DELETE FROM apd_scanner_pilot.current_offers c
    WHERE c.distrito = v_run.distrito
      AND c.last_seen_at < v_run.capture_started_at
      AND NOT EXISTS (
        SELECT 1 FROM apd_scanner_pilot.staged_offers s
        WHERE s.run_id = p_run_id AND s.source_offer_key = c.source_offer_key
      );
    GET DIAGNOSTICS v_pruned = ROW_COUNT;
  END IF;

  UPDATE apd_scanner_pilot.runs
  SET status = 'finalized'
  WHERE run_id = p_run_id;
  RETURN QUERY SELECT v_upserted, v_pruned;
END;
$$;
COMMIT;

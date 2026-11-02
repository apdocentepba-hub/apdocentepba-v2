-- ISOLATED PG17 / PostgREST ONLY. NEVER run in production Supabase.
-- Adds exact (not probabilistic-hash) set comparison of ALL published source keys
-- before allowing any atomic district commit. Source_total alone is insufficient.
BEGIN;
CREATE TABLE apd_scanner_pilot.source_identity_manifests (
  run_id uuid PRIMARY KEY REFERENCES apd_scanner_pilot.runs(run_id),
  source_keys jsonb NOT NULL CHECK (jsonb_typeof(source_keys)='array'),
  captured_count integer NOT NULL CHECK (captured_count >= 0),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON apd_scanner_pilot.source_identity_manifests FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON apd_scanner_pilot.source_identity_manifests TO apd_api_scanner;

-- Arrays are exact sorted sets. No ID is logged and no hash collision is possible.
CREATE FUNCTION apd_scanner_pilot.canonical_identity_set(p_ids jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_pilot
AS $$
DECLARE
  n integer;
  unique_n integer;
  malformed integer;
  ordered jsonb;
BEGIN
  IF p_ids IS NULL OR jsonb_typeof(p_ids)<>'array'
      OR jsonb_array_length(p_ids)>10000 THEN
    RAISE EXCEPTION 'Invalid identity manifest array';
  END IF;
  SELECT count(*)::integer, count(DISTINCT item #>> '{}')::integer,
      count(*) FILTER (WHERE jsonb_typeof(item)<>'string'
         OR length(item #>> '{}')<3 OR length(item #>> '{}')>300
         OR btrim(item #>> '{}')<>item #>> '{}')::integer
  INTO n,unique_n,malformed
  FROM jsonb_array_elements(p_ids) AS entries(item);
  IF n<>unique_n OR malformed>0 THEN
    RAISE EXCEPTION 'Duplicate or malformed source identities';
  END IF;
  SELECT coalesce(jsonb_agg(source_id ORDER BY source_id),'[]'::jsonb)
    INTO ordered
  FROM (SELECT item #>> '{}' AS source_id
        FROM jsonb_array_elements(p_ids) AS entries(item)) x;
  RETURN ordered;
END;
$$;

CREATE FUNCTION apd_scanner_api.register_source_identity(
  p_run_id uuid,p_ids jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  canonical jsonb;
  n integer;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'ready' OR NOT r.stage_verified OR
     r.completed_pages<>r.expected_pages THEN
    RAISE EXCEPTION 'Source manifest requires a sealed capture';
  END IF;
  canonical:=apd_scanner_pilot.canonical_identity_set(p_ids);
  n:=jsonb_array_length(canonical);
  IF r.source_total IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Manifest count differs from ABC source total';
  END IF;
  IF EXISTS (SELECT 1 FROM apd_scanner_pilot.source_identity_manifests
       WHERE run_id=p_run_id) THEN
    RAISE EXCEPTION 'Source manifest already registered';
  END IF;
  INSERT INTO apd_scanner_pilot.source_identity_manifests
    (run_id,source_keys,captured_count)
  VALUES(p_run_id,canonical,n);
  RETURN n;
END;
$$;

CREATE FUNCTION apd_scanner_api.revalidate_source_identity(
  p_run_id uuid,p_ids jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  current_ids jsonb;
  expected_ids jsonb;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'ready' OR NOT r.stage_verified THEN
    RAISE EXCEPTION 'Source revalidation requires a sealed pending capture';
  END IF;
  current_ids:=apd_scanner_pilot.canonical_identity_set(p_ids);
  SELECT source_keys INTO expected_ids FROM apd_scanner_pilot.source_identity_manifests
    WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'First source manifest not registered'; END IF;
  IF expected_ids IS DISTINCT FROM current_ids THEN
    -- No UPDATE: a failed second pass leaves the manifest unverified.
    RAISE EXCEPTION 'ABC identity set changed even though count may be unchanged';
  END IF;
  UPDATE apd_scanner_pilot.source_identity_manifests
    SET verified_at=clock_timestamp()
    WHERE run_id=p_run_id;
  RETURN jsonb_array_length(current_ids);
END;
$$;

-- Replace ONLY the disposable API commit function from PR #225. Protect
-- the identity freshness inside the SAME DB transaction as the district fence
-- and full 24-column upsert. Never expose p_prune or test error parameters.
CREATE OR REPLACE FUNCTION apd_scanner_api.commit_capture(p_run_id uuid)
RETURNS TABLE(upserted integer,pruned integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  previous apd_scanner_pilot.district_commit_fence%ROWTYPE;
  manifest apd_scanner_pilot.source_identity_manifests%ROWTYPE;
  n_upserted integer;
  n_pruned integer;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs
    WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'ready' OR NOT r.stage_verified OR
      r.completed_pages <> r.expected_pages OR
      r.captured_at < r.capture_started_at THEN
    RAISE EXCEPTION 'Capture incomplete or already finalized';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(r.distrito,0));
  SELECT * INTO previous FROM apd_scanner_pilot.district_commit_fence
    WHERE distrito=r.distrito FOR UPDATE;
  IF FOUND AND (r.capture_started_at <= previous.captured_at OR
      r.captured_at <= previous.captured_at) THEN
    RAISE EXCEPTION 'Overlapping or stale district capture rejected';
  END IF;

  SELECT * INTO manifest FROM apd_scanner_pilot.source_identity_manifests
    WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR manifest.captured_count IS DISTINCT FROM r.source_total OR
     manifest.verified_at IS NULL OR
     manifest.verified_at < clock_timestamp() - interval '120 seconds' OR
     manifest.verified_at > clock_timestamp() + interval '10 seconds' THEN
    RAISE EXCEPTION 'Source identity manifest absent, stale or not revalidated';
  END IF;

  SELECT f.upserted,f.pruned INTO n_upserted,n_pruned
    FROM apd_scanner_pilot.finalize_full_district(p_run_id,false) f;
  IF NOT FOUND OR n_upserted IS NULL OR n_pruned<>0 THEN
    RAISE EXCEPTION 'Unsafe district commit rejected';
  END IF;

  INSERT INTO apd_scanner_pilot.district_commit_fence AS fence
    (distrito,run_id,capture_started_at,captured_at)
  VALUES (r.distrito,p_run_id,r.capture_started_at,r.captured_at)
  ON CONFLICT(distrito) DO UPDATE SET
    run_id=EXCLUDED.run_id,
    capture_started_at=EXCLUDED.capture_started_at,
    captured_at=EXCLUDED.captured_at;
  RETURN QUERY SELECT n_upserted,n_pruned;
END;
$$;

-- Both publicly exposed RPCs and private helper must be explicitly restricted.
REVOKE EXECUTE ON FUNCTION apd_scanner_pilot.canonical_identity_set(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.register_source_identity(uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.revalidate_source_identity(uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.commit_capture(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.canonical_identity_set(jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_api.register_source_identity(uuid,jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_api.revalidate_source_identity(uuid,jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_api.commit_capture(uuid) TO apd_api_scanner;
COMMIT;

DO $$
BEGIN
  IF has_function_privilege('apd_api_anon',
       'apd_scanner_api.revalidate_source_identity(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('apd_api_authenticated',
       'apd_scanner_api.register_source_identity(uuid,jsonb)','EXECUTE')
    OR has_table_privilege('apd_api_scanner',
       'apd_scanner_pilot.source_identity_manifests','DELETE')
    OR NOT has_function_privilege('apd_api_scanner',
       'apd_scanner_api.revalidate_source_identity(uuid,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'Identity verification privilege matrix unsafe'; END IF;
END$$;
SELECT 'PASS: second-pass identity API gated, full commit requires fresh exact set matching' AS result;

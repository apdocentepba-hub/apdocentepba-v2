-- Laboratory-only optional hardening installed AFTER legacy regression cases.
-- Never use on real Supabase. Enforces consistency with twice-submitted,
-- sanitized staged content; cannot independently establish ABC authenticity.
BEGIN;

CREATE TABLE apd_scanner_pilot.source_payload_manifests (
  run_id uuid PRIMARY KEY REFERENCES apd_scanner_pilot.runs(run_id),
  canonical_rows jsonb NOT NULL CHECK (jsonb_typeof(canonical_rows)='array'),
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz
);
REVOKE ALL ON apd_scanner_pilot.source_payload_manifests FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON apd_scanner_pilot.source_payload_manifests TO apd_api_scanner;

CREATE FUNCTION apd_scanner_pilot.canonical_staged_payloads(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_pilot
AS $apd_content$
DECLARE
  item jsonb;
  normalized jsonb;
  n integer;
  distinct_keys integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR
     jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>10000 THEN
    RAISE EXCEPTION 'Staged content manifest invalid or empty';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(item)<>'object' OR
       NOT (item ?& ARRAY['source_offer_key','idoferta','iddetalle','estado','distrito','escuela','cargo','area','nivel_modalidad','turno','jornada','hsmodulos','cursodivision','supl_desde','supl_hasta','finoferta','ult_movimiento','raw']) OR
       EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS k(name)
               WHERE name NOT IN ('source_offer_key','idoferta','iddetalle','estado','distrito','escuela','cargo','area','nivel_modalidad','turno','jornada','hsmodulos','cursodivision','supl_desde','supl_hasta','finoferta','ult_movimiento','raw')) OR
       jsonb_typeof(item->'source_offer_key')<>'string' OR
       jsonb_typeof(item->'iddetalle')<>'string' OR
       jsonb_typeof(item->'distrito')<>'string' OR
       jsonb_typeof(item->'estado')<>'string' OR
       item->>'estado'<>'Publicada' OR
       jsonb_typeof(item->'raw')<>'null' OR
       (item->>'source_offer_key') !~ '^D_[0-9]+$' OR
       (item->>'source_offer_key') IS DISTINCT FROM 'D_'||(item->>'iddetalle') OR
       length(item->>'distrito')<2 OR
       EXISTS (
         SELECT 1 FROM jsonb_each(item) AS field(name,value)
         WHERE field.name<>'raw' AND jsonb_typeof(field.value) NOT IN ('string','null')
       )
    THEN RAISE EXCEPTION 'Staged payload rejected by server content contract'; END IF;
  END LOOP;

  SELECT count(*)::integer,
         count(DISTINCT e.item->>'source_offer_key')::integer
    INTO n,distinct_keys
    FROM jsonb_array_elements(p_rows) AS e(item);
  IF n<>distinct_keys THEN RAISE EXCEPTION 'Duplicate staged content keys'; END IF;
  SELECT jsonb_agg(e.item ORDER BY e.item->>'source_offer_key')
    INTO normalized FROM jsonb_array_elements(p_rows) AS e(item);
  RETURN normalized;
END;
$apd_content$;

CREATE FUNCTION apd_scanner_pilot.assert_staged_content_matches(
 p_run_id uuid,p_canonical jsonb
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_pilot
AS $apd_assert$
DECLARE
  existing jsonb;
  current_pairs jsonb;
  current_count integer;
  source_n integer;
  staged_n integer;
BEGIN
  SELECT coalesce(jsonb_agg(s.payload ORDER BY s.source_offer_key),'[]'::jsonb),
         count(*)::integer
    INTO existing,current_count
    FROM apd_scanner_pilot.full_staged_payloads s
   WHERE s.run_id=p_run_id;
  IF current_count=0 OR apd_scanner_pilot.canonical_staged_payloads(existing)
      IS DISTINCT FROM p_canonical THEN
    RAISE EXCEPTION 'Staged content does not match database';
  END IF;
  SELECT p.source_pairs,p.source_total INTO current_pairs,source_n
    FROM apd_scanner_pilot.source_id_key_pairs p
   WHERE p.run_id=p_run_id AND p.verified_at IS NOT NULL;
  IF NOT FOUND OR source_n<current_count THEN
    RAISE EXCEPTION 'Staged content lacks verified source pairs';
  END IF;
  SELECT count(*)::integer INTO staged_n
    FROM jsonb_array_elements(p_canonical) AS e(item)
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(current_pairs) AS p(pair)
     WHERE p.pair->>'source_offer_key'=e.item->>'source_offer_key'
   );
  IF staged_n<>0 THEN
    RAISE EXCEPTION 'Staged content key absent from source pairs';
  END IF;
  RETURN current_count;
END;
$apd_assert$;

CREATE FUNCTION apd_scanner_api.register_staged_content(
 p_run_id uuid,p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $apd_register$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  canonical jsonb;
  n integer;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'ready' OR NOT r.stage_verified OR
     r.completed_pages<>r.expected_pages THEN
    RAISE EXCEPTION 'Content registration requires sealed capture';
  END IF;
  canonical:=apd_scanner_pilot.canonical_staged_payloads(p_rows);
  n:=apd_scanner_pilot.assert_staged_content_matches(p_run_id,canonical);
  IF n IS DISTINCT FROM r.expected_offers THEN
    RAISE EXCEPTION 'Content manifest count differs from sealed stage';
  END IF;
  INSERT INTO apd_scanner_pilot.source_payload_manifests(run_id,canonical_rows)
  VALUES(p_run_id,canonical);
  RETURN n;
END;
$apd_register$;

CREATE FUNCTION apd_scanner_api.revalidate_staged_content(
 p_run_id uuid,p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $apd_recheck$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  manifest apd_scanner_pilot.source_payload_manifests%ROWTYPE;
  canonical jsonb;
  n integer;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'ready' OR NOT r.stage_verified THEN
    RAISE EXCEPTION 'Content revalidation requires sealed pending capture';
  END IF;
  SELECT * INTO manifest FROM apd_scanner_pilot.source_payload_manifests
   WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Content manifest not registered'; END IF;
  canonical:=apd_scanner_pilot.canonical_staged_payloads(p_rows);
  IF canonical IS DISTINCT FROM manifest.canonical_rows THEN
    RAISE EXCEPTION 'Staged content changed between submitted passes';
  END IF;
  n:=apd_scanner_pilot.assert_staged_content_matches(p_run_id,canonical);
  IF n IS DISTINCT FROM r.expected_offers THEN
    RAISE EXCEPTION 'Content recheck count differs from sealed stage';
  END IF;
  UPDATE apd_scanner_pilot.source_payload_manifests
     SET verified_at=clock_timestamp() WHERE run_id=p_run_id;
  RETURN n;
END;
$apd_recheck$;

-- Replace the existing restricted commit RPC; preserve previous advisory locks,
-- source identity validation, atomic UPSERT and no-prune behavior.
CREATE OR REPLACE FUNCTION apd_scanner_api.commit_capture(p_run_id uuid)
RETURNS TABLE(upserted integer,pruned integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  previous apd_scanner_pilot.district_commit_fence%ROWTYPE;
  manifest apd_scanner_pilot.source_identity_manifests%ROWTYPE;
  pair_manifest apd_scanner_pilot.source_id_key_pairs%ROWTYPE;
  content_manifest apd_scanner_pilot.source_payload_manifests%ROWTYPE;
  staged_payloads jsonb;
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

  SELECT * INTO pair_manifest FROM apd_scanner_pilot.source_id_key_pairs
    WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR pair_manifest.source_total IS DISTINCT FROM r.source_total OR
     pair_manifest.verified_at IS NULL OR
     pair_manifest.verified_at < clock_timestamp() - interval '120 seconds' OR
     pair_manifest.verified_at > clock_timestamp() + interval '10 seconds' THEN
    RAISE EXCEPTION 'Pair manifest absent or stale';
  END IF;

  SELECT * INTO content_manifest FROM apd_scanner_pilot.source_payload_manifests
    WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR content_manifest.verified_at IS NULL OR
     content_manifest.verified_at < clock_timestamp() - interval '120 seconds' OR
     content_manifest.verified_at > clock_timestamp() + interval '10 seconds' THEN
    RAISE EXCEPTION 'Staged content manifest absent or stale';
  END IF;
  SELECT coalesce(jsonb_agg(s.payload ORDER BY s.source_offer_key),'[]'::jsonb)
    INTO staged_payloads
    FROM apd_scanner_pilot.full_staged_payloads s WHERE s.run_id=p_run_id;
  IF apd_scanner_pilot.canonical_staged_payloads(staged_payloads)
     IS DISTINCT FROM content_manifest.canonical_rows OR
     jsonb_array_length(content_manifest.canonical_rows) IS DISTINCT FROM r.expected_offers THEN
    RAISE EXCEPTION 'Staged rows differ from twice-registered content';
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


REVOKE EXECUTE ON FUNCTION apd_scanner_pilot.canonical_staged_payloads(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_scanner_pilot.assert_staged_content_matches(uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.register_staged_content(uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.revalidate_staged_content(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.canonical_staged_payloads(jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.assert_staged_content_matches(uuid,jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_api.register_staged_content(uuid,jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_api.revalidate_staged_content(uuid,jsonb) TO apd_api_scanner;
COMMIT;
NOTIFY pgrst, 'reload schema';

DO $apd_permissions$
BEGIN
 IF has_function_privilege('apd_api_anon',
     'apd_scanner_api.register_staged_content(uuid,jsonb)','EXECUTE') OR
    has_function_privilege('apd_api_authenticated',
     'apd_scanner_api.revalidate_staged_content(uuid,jsonb)','EXECUTE') OR
    NOT has_function_privilege('apd_api_scanner',
     'apd_scanner_api.revalidate_staged_content(uuid,jsonb)','EXECUTE') OR
    has_table_privilege('apd_api_anon',
     'apd_scanner_pilot.source_payload_manifests','SELECT') OR
    has_table_privilege('apd_api_scanner',
     'apd_scanner_pilot.source_payload_manifests','DELETE') THEN
    RAISE EXCEPTION 'Staged content server-side privilege matrix unsafe';
 END IF;
END;
$apd_permissions$;
SELECT 'PASS: server-side staged payload guard installed in disposable PG17' AS result;

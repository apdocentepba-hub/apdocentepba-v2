-- DISPOSABLE PostgreSQL 17 / PostgREST ONLY. NEVER deploy to Supabase.
-- Fixes the pilot's false assumption: Solr id !== Worker source_offer_key.
-- Requires the earlier isolated pilot and exact-ID double-pass SQL.
BEGIN;

CREATE TABLE apd_scanner_pilot.source_id_key_pairs (
  run_id uuid PRIMARY KEY REFERENCES apd_scanner_pilot.runs(run_id),
  source_pairs jsonb NOT NULL CHECK (jsonb_typeof(source_pairs)='array'),
  source_total integer NOT NULL CHECK (source_total>=0),
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz
);
REVOKE ALL ON apd_scanner_pilot.source_id_key_pairs FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON apd_scanner_pilot.source_id_key_pairs TO apd_api_scanner;

CREATE FUNCTION apd_scanner_pilot.canonical_source_pairs(p_pairs jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_pilot
AS $$
DECLARE
 item jsonb;
 source_id text;
 mapped_key text;
 n integer;
 unique_ids integer;
 unique_keys integer;
 normalized jsonb;
BEGIN
 IF p_pairs IS NULL OR jsonb_typeof(p_pairs)<>'array'
    OR jsonb_array_length(p_pairs)>10000 THEN
   RAISE EXCEPTION 'Invalid source pair array';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
   IF jsonb_typeof(item)<>'object' OR
      NOT (item ?& ARRAY['id','source_offer_key']) OR
      EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS k(key_name)
              WHERE key_name NOT IN ('id','source_offer_key')) OR
      jsonb_typeof(item->'id')<>'string' OR
      jsonb_typeof(item->'source_offer_key')<>'string'
   THEN RAISE EXCEPTION 'Invalid source pair object'; END IF;
   source_id:=item->>'id';
   mapped_key:=item->>'source_offer_key';
   IF length(source_id)<1 OR length(source_id)>300 OR
      source_id<>btrim(source_id) OR
      length(mapped_key)>220 OR mapped_key !~ '^D_[0-9]+$'
   THEN RAISE EXCEPTION 'Malformed public ID or Worker key'; END IF;
 END LOOP;
 SELECT count(*)::integer,
        count(DISTINCT entry.value->>'id')::integer,
        count(DISTINCT entry.value->>'source_offer_key')::integer
 INTO n,unique_ids,unique_keys
 FROM jsonb_array_elements(p_pairs) AS entry(value);
 IF n<>unique_ids OR n<>unique_keys THEN
   RAISE EXCEPTION 'Duplicate source IDs or mapped Worker keys';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',value->>'id','source_offer_key',value->>'source_offer_key')
   ORDER BY value->>'id'),'[]'::jsonb)
 INTO normalized FROM jsonb_array_elements(p_pairs) AS entry(value);
 RETURN normalized;
END;
$$;

CREATE FUNCTION apd_scanner_api.register_source_pairs(
 p_run_id uuid,p_pairs jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
DECLARE
 r apd_scanner_pilot.runs%ROWTYPE;
 canonical jsonb;
 mapped_keys jsonb;
 n integer;
BEGIN
 SELECT * INTO r FROM apd_scanner_pilot.runs
 WHERE run_id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'ready' OR NOT r.stage_verified OR
    r.completed_pages<>r.expected_pages THEN
   RAISE EXCEPTION 'Pair manifest requires sealed pending capture';
 END IF;
 canonical:=apd_scanner_pilot.canonical_source_pairs(p_pairs);
 n:=jsonb_array_length(canonical);
 IF n IS DISTINCT FROM r.source_total OR n=0 THEN
   RAISE EXCEPTION 'Pair manifest count differs from raw ABC source total';
 END IF;
 IF EXISTS (
   SELECT 1 FROM apd_scanner_pilot.staged_offers s
   WHERE s.run_id=p_run_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(canonical) AS e(item)
       WHERE e.item->>'source_offer_key'=s.source_offer_key
     )
 ) THEN RAISE EXCEPTION 'Staged Worker key absent from source pair manifest'; END IF;
 IF EXISTS (SELECT 1 FROM apd_scanner_pilot.source_identity_manifests
            WHERE run_id=p_run_id) OR
    EXISTS (SELECT 1 FROM apd_scanner_pilot.source_id_key_pairs
            WHERE run_id=p_run_id) THEN
   RAISE EXCEPTION 'Source manifest already registered'; END IF;
 SELECT jsonb_agg(e.item->>'source_offer_key' ORDER BY e.item->>'source_offer_key')
 INTO mapped_keys FROM jsonb_array_elements(canonical) AS e(item);
 INSERT INTO apd_scanner_pilot.source_identity_manifests(
   run_id,source_keys,captured_count
 ) VALUES(p_run_id,mapped_keys,n);
 INSERT INTO apd_scanner_pilot.source_id_key_pairs(run_id,source_pairs,source_total)
 VALUES(p_run_id,canonical,n);
 RETURN n;
END;
$$;

CREATE FUNCTION apd_scanner_api.revalidate_source_pairs(
 p_run_id uuid,p_pairs jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_api,apd_scanner_pilot
AS $$
DECLARE
 r apd_scanner_pilot.runs%ROWTYPE;
 normalized jsonb;
 prior apd_scanner_pilot.source_id_key_pairs%ROWTYPE;
BEGIN
 SELECT * INTO r FROM apd_scanner_pilot.runs
 WHERE run_id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'ready' OR NOT r.stage_verified
 THEN RAISE EXCEPTION 'Pair recheck requires sealed pending capture'; END IF;
 normalized:=apd_scanner_pilot.canonical_source_pairs(p_pairs);
 SELECT * INTO prior FROM apd_scanner_pilot.source_id_key_pairs
 WHERE run_id=p_run_id FOR UPDATE;
 IF NOT FOUND OR prior.source_pairs IS DISTINCT FROM normalized OR
    prior.source_total IS DISTINCT FROM jsonb_array_length(normalized) THEN
   RAISE EXCEPTION 'Source ID to Worker key mapping changed between passes';
 END IF;
 -- Both markers become fresh inside one atomic transaction.
 UPDATE apd_scanner_pilot.source_id_key_pairs
 SET verified_at=clock_timestamp() WHERE run_id=p_run_id;
 UPDATE apd_scanner_pilot.source_identity_manifests
 SET verified_at=clock_timestamp() WHERE run_id=p_run_id;
 RETURN prior.source_total;
END;
$$;

-- Retire the old pair-blind public RPCs. The existing commit_capture RPC
-- still requires a freshly verified source_identity_manifests row, which
-- can now only be populated through the pair-aware RPC over PostgREST.
REVOKE EXECUTE ON FUNCTION apd_scanner_api.register_source_identity(uuid,jsonb) FROM PUBLIC,apd_api_scanner;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.revalidate_source_identity(uuid,jsonb) FROM PUBLIC,apd_api_scanner;
REVOKE EXECUTE ON FUNCTION apd_scanner_pilot.canonical_source_pairs(jsonb) FROM PUBLIC;
-- PostgreSQL grants EXECUTE to PUBLIC on new RPC functions by default.
-- Remove it BEFORE granting the scanner-specific permission.
REVOKE EXECUTE ON FUNCTION apd_scanner_api.register_source_pairs(uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_scanner_api.revalidate_source_pairs(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apd_scanner_api.register_source_pairs(uuid,jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_api.revalidate_source_pairs(uuid,jsonb) TO apd_api_scanner;
GRANT EXECUTE ON FUNCTION apd_scanner_pilot.canonical_source_pairs(jsonb) TO apd_api_scanner;
COMMIT;

DO $$
BEGIN
 IF has_function_privilege('apd_api_scanner',
      'apd_scanner_api.register_source_identity(uuid,jsonb)','EXECUTE')
   OR has_function_privilege('apd_api_scanner',
      'apd_scanner_api.revalidate_source_identity(uuid,jsonb)','EXECUTE')
   OR NOT has_function_privilege('apd_api_scanner',
      'apd_scanner_api.register_source_pairs(uuid,jsonb)','EXECUTE')
   OR has_function_privilege('apd_api_anon',
      'apd_scanner_api.register_source_pairs(uuid,jsonb)','EXECUTE')
   OR has_function_privilege('apd_api_authenticated',
      'apd_scanner_api.revalidate_source_pairs(uuid,jsonb)','EXECUTE')
   OR has_table_privilege('apd_api_scanner',
      'apd_scanner_pilot.source_id_key_pairs','DELETE')
 THEN RAISE EXCEPTION 'Pair-aware source identity RPC privilege matrix unsafe'; END IF;
END$$;
SELECT 'PASS: source IDs and Worker keys bound together; old pair-blind RPCs revoked' AS result;

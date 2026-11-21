-- APDocentePBA: DISPOSABLE PostgreSQL 17 TEST ONLY.
-- NEVER execute against the production Supabase project.
-- Two compact observations per district, no raw offers, no teacher data.
BEGIN;
CREATE SCHEMA apd_change_lab;
REVOKE ALL ON SCHEMA apd_change_lab FROM PUBLIC;

CREATE TABLE apd_change_lab.captures (
 scope text NOT NULL CHECK(length(scope) BETWEEN 1 AND 120),
 captured_at timestamptz NOT NULL,
 source_total integer NOT NULL CHECK(source_total BETWEEN 0 AND 1500),
 rows jsonb NOT NULL CHECK(jsonb_typeof(rows)='array'),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{32}$'),
 payload_bytes integer NOT NULL CHECK(payload_bytes BETWEEN 2 AND 1048576),
 PRIMARY KEY(scope,captured_at)
);
ALTER TABLE apd_change_lab.captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA apd_change_lab FROM PUBLIC;

-- One function call = one transaction; no SECURITY DEFINER or external APIs.
CREATE FUNCTION apd_change_lab.save_compact(
 p_snapshot jsonb,p_inject_failure_for_test boolean DEFAULT false
)
RETURNS TABLE (applied boolean, retained integer, total_bytes bigint)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, apd_change_lab
AS $$
DECLARE
 v_scope text;
 v_stamp timestamptz;
 v_raw_stamp text;
 v_total int;
 v_rows jsonb;
 v_sorted jsonb;
 v_item jsonb;
 v_key text;
 v_field text;
 v_digest text;
 v_old apd_change_lab.captures%ROWTYPE;
 v_max timestamptz;
 v_count integer;
 v_bytes integer;
 v_allowed text[] := ARRAY[
  'source_offer_key','estado','finoferta','turno','jornada','hsmodulos',
  'cursodivision','supl_desde','supl_hasta','escuela','distrito',
  'cargo','area','nivel_modalidad'];
BEGIN
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object' OR
    p_snapshot->'complete'<>'true'::jsonb OR
    p_snapshot->>'fieldCount'<>'14' OR
    (SELECT count(*) FROM jsonb_object_keys(p_snapshot))<>7 OR
    EXISTS (SELECT 1 FROM jsonb_object_keys(p_snapshot) k
      WHERE k <> ALL(ARRAY['complete','fieldCount','scope',
        'capturedAt','sourceTotal','rows','digest'])) THEN
  RAISE EXCEPTION 'Invalid compact capture envelope';
 END IF;
 v_scope:=btrim(p_snapshot->>'scope');
 v_raw_stamp:=p_snapshot->>'capturedAt';
 IF v_scope IS NULL OR length(v_scope) NOT BETWEEN 1 AND 120 OR
    v_scope ~ '[[:cntrl:]]' OR
    v_raw_stamp IS NULL OR
    v_raw_stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$' OR
    (p_snapshot->>'sourceTotal') !~ '^[0-9]{1,5}$' OR
    (p_snapshot->>'digest') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid compact capture metadata';
 END IF;
 v_total:=(p_snapshot->>'sourceTotal')::int;
 IF v_total>1500 THEN RAISE EXCEPTION 'District compact limit exceeded'; END IF;
 BEGIN
  v_stamp:=v_raw_stamp::timestamptz;
 EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'Invalid captured_at instant';
 END;
 v_rows:=p_snapshot->'rows';
 IF v_rows IS NULL OR jsonb_typeof(v_rows)<>'array' OR
    jsonb_array_length(v_rows)<>v_total THEN
  RAISE EXCEPTION 'Incomplete or invalid compact payload';
 END IF;
 v_bytes:=octet_length(v_rows::text);
 IF v_bytes>1048576 THEN RAISE EXCEPTION 'Compact payload over 1 MiB'; END IF;
 IF (SELECT count(DISTINCT btrim(value->>'source_offer_key'))
     FROM jsonb_array_elements(v_rows) AS t(value))<>v_total THEN
  RAISE EXCEPTION 'Duplicate offer identity';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
  IF jsonb_typeof(v_item)<>'object' OR
     (SELECT count(*) FROM jsonb_object_keys(v_item))<>14 OR
     EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k <> ALL(v_allowed)) OR
     EXISTS(SELECT 1 FROM jsonb_each(v_item) AS item(field,value)
       WHERE jsonb_typeof(value)<>'string' OR length(value #>> '{}')>512) THEN
   RAISE EXCEPTION 'Unexpected, sensitive, or oversized compact field';
  END IF;
  v_key:=btrim(v_item->>'source_offer_key');
  IF length(v_key) NOT BETWEEN 1 AND 160 OR
     upper(btrim(v_item->>'distrito'))<>upper(v_scope) THEN
   RAISE EXCEPTION 'Offer identity or district mismatch';
  END IF;
  -- Only one identity per district and scan. Checked above without temp tables.
 END LOOP;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'source_offer_key'),'[]'::jsonb)
 INTO v_sorted FROM jsonb_array_elements(v_rows) AS t(value);
 -- Server-computed checksum; never trust caller-supplied JS digest for authorization.
 v_digest:=md5(v_sorted::text);

 -- Serialize same-district commits, including the initial capture with no row to lock.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope,32619));
 SELECT * INTO v_old FROM apd_change_lab.captures
 WHERE scope=v_scope AND captured_at=v_stamp;
 IF FOUND THEN
  IF v_old.fingerprint<>v_digest OR v_old.rows<>v_sorted OR
     v_old.source_total<>v_total THEN
   RAISE EXCEPTION 'Conflicting retry at same capture timestamp';
  END IF;
  RETURN QUERY SELECT false,count(*)::int,coalesce(sum(payload_bytes),0)::bigint
   FROM apd_change_lab.captures WHERE scope=v_scope;
  RETURN;
 END IF;
 SELECT max(captured_at) INTO v_max FROM apd_change_lab.captures WHERE scope=v_scope;
 IF v_max IS NOT NULL AND v_stamp<=v_max THEN
  RAISE EXCEPTION 'Out-of-order capture rejected';
 END IF;
 INSERT INTO apd_change_lab.captures(scope,captured_at,source_total,rows,fingerprint,payload_bytes)
 VALUES(v_scope,v_stamp,v_total,v_sorted,v_digest,v_bytes);
 IF p_inject_failure_for_test THEN
  RAISE EXCEPTION 'INJECTED_AFTER_INSERT';
 END IF;
 -- Retention is part of the same commit; failure cannot delete the prior pair.
 DELETE FROM apd_change_lab.captures AS c
 WHERE c.scope=v_scope AND c.captured_at NOT IN (
  SELECT captured_at FROM apd_change_lab.captures
  WHERE scope=v_scope ORDER BY captured_at DESC LIMIT 2
 );
 RETURN QUERY SELECT true,count(*)::int,coalesce(sum(payload_bytes),0)::bigint
 FROM apd_change_lab.captures WHERE scope=v_scope;
END
$$;
REVOKE ALL ON FUNCTION apd_change_lab.save_compact(jsonb,boolean) FROM PUBLIC;
COMMIT;

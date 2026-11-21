-- APDocentePBA AUDIT-ONLY event ledger in DISPOSABLE PostgreSQL 17.
-- Absolutely no sender, subscription lookup, transport, or production Supabase write.
-- Requires apd_change_compact_pg17.sql in the same isolated test database.
BEGIN;
CREATE TABLE apd_change_lab.audit_events (
 scope text NOT NULL,
 event_key text NOT NULL CHECK(event_key ~ '^[0-9a-f]{64}$'),
 source_offer_key text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('offer_modified','official_state_changed')),
 field text NOT NULL,
 before_value text NOT NULL,
 after_value text NOT NULL,
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{32}$'),
 observed_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at > observed_at),
 status text NOT NULL DEFAULT 'audit_only' CHECK(status='audit_only'),
 PRIMARY KEY(scope,event_key)
);
CREATE INDEX audit_events_scope_expiry_idx
 ON apd_change_lab.audit_events(scope,expires_at);
ALTER TABLE apd_change_lab.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON apd_change_lab.audit_events FROM PUBLIC;

CREATE FUNCTION apd_change_lab.record_audit_batch(
 p_batch jsonb, p_inject_failure_for_test boolean DEFAULT false
)
RETURNS TABLE (added integer, retained integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,apd_change_lab
AS $$
DECLARE
 v_scope text;
 v_captured_text text;
 v_events jsonb;
 v_prev apd_change_lab.captures%ROWTYPE;
 v_cur apd_change_lab.captures%ROWTYPE;
 v_item jsonb;
 v_previous_offer jsonb;
 v_current_offer jsonb;
 v_id text;
 v_event_key text;
 v_type text;
 v_field text;
 v_before text;
 v_after text;
 v_real_before text;
 v_real_after text;
 v_digest text;
 v_count int:=0;
 v_inserted int;
 v_retained int;
 v_allowed_fields text[]:=ARRAY[
  'finoferta','turno','jornada','hsmodulos','cursodivision',
  'supl_desde','supl_hasta','escuela','distrito','cargo','area','nivel_modalidad'];
BEGIN
 IF p_batch IS NULL OR jsonb_typeof(p_batch)<>'object' OR
    p_batch->'verified' <> 'true'::jsonb OR
    (SELECT count(*) FROM jsonb_object_keys(p_batch))<>4 OR
    EXISTS(SELECT 1 FROM jsonb_object_keys(p_batch) k
      WHERE k<>ALL(ARRAY['verified','scope','capturedAt','events'])) THEN
  RAISE EXCEPTION 'Unverified or invalid audit envelope';
 END IF;
 v_scope:=p_batch->>'scope';
 v_captured_text:=p_batch->>'capturedAt';
 v_events:=p_batch->'events';
 IF v_scope IS NULL OR length(v_scope) NOT BETWEEN 1 AND 120 OR
    v_captured_text IS NULL OR
    v_captured_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$' OR
    jsonb_typeof(v_events)<>'array' OR jsonb_array_length(v_events)>500 THEN
  RAISE EXCEPTION 'Invalid scope, capture timestamp or audit batch size';
 END IF;

 -- Lock whole district, also covering the zero-event case.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope,32619));
 SELECT * INTO v_cur FROM apd_change_lab.captures
 WHERE scope=v_scope ORDER BY captured_at DESC LIMIT 1;
 SELECT * INTO v_prev FROM apd_change_lab.captures
 WHERE scope=v_scope ORDER BY captured_at DESC OFFSET 1 LIMIT 1;
 IF v_cur.scope IS NULL OR v_prev.scope IS NULL OR
    v_cur.captured_at<>v_captured_text::timestamptz OR
    v_cur.captured_at<=v_prev.captured_at OR
    v_cur.captured_at-v_prev.captured_at>interval '48 hours' THEN
  RAISE EXCEPTION 'Missing, stale, or incomparable pair of captures';
 END IF;
 IF (SELECT count(DISTINCT value->>'event_key')
      FROM jsonb_array_elements(v_events) AS t(value))<>jsonb_array_length(v_events) THEN
  RAISE EXCEPTION 'Duplicate audit event within batch';
 END IF;

 -- TTL/pruning is transactional: a failure cannot remove previous evidence.
 DELETE FROM apd_change_lab.audit_events
 WHERE scope=v_scope AND expires_at<=v_cur.captured_at;

 FOR v_item IN SELECT value FROM jsonb_array_elements(v_events) LOOP
  IF jsonb_typeof(v_item)<>'object' OR
     (SELECT count(*) FROM jsonb_object_keys(v_item))<>6 OR
     EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k
      WHERE k<>ALL(ARRAY['event_key','source_offer_key','type','field','before','after'])) THEN
   RAISE EXCEPTION 'Audit event contains unexpected or personal fields';
  END IF;
  v_id:=v_item->>'source_offer_key';
  v_event_key:=v_item->>'event_key';
  v_type:=v_item->>'type';
  v_field:=v_item->>'field';
  v_before:=v_item->>'before';
  v_after:=v_item->>'after';
  IF v_id IS NULL OR length(v_id) NOT BETWEEN 1 AND 160 OR
     v_event_key IS NULL OR v_event_key !~ '^[0-9a-f]{64}$' OR
     v_type NOT IN ('offer_modified','official_state_changed') OR
     v_field IS NULL OR v_before IS NULL OR v_after IS NULL OR
     length(v_before)>512 OR length(v_after)>512 THEN
   RAISE EXCEPTION 'Invalid private event fields';
  END IF;
  SELECT value INTO v_previous_offer
    FROM jsonb_array_elements(v_prev.rows) AS t(value)
    WHERE value->>'source_offer_key'=v_id;
  SELECT value INTO v_current_offer
    FROM jsonb_array_elements(v_cur.rows) AS t(value)
    WHERE value->>'source_offer_key'=v_id;
  IF v_previous_offer IS NULL OR v_current_offer IS NULL THEN
   RAISE EXCEPTION 'Missing offer in one of the two snapshots';
  END IF;

  IF v_type='offer_modified' THEN
   IF v_field<>ALL(v_allowed_fields) OR
      upper(btrim(v_previous_offer->>'estado'))<>'PUBLICADA' OR
      upper(btrim(v_current_offer->>'estado'))<>'PUBLICADA' THEN
    RAISE EXCEPTION 'Unverified field or offer state';
   END IF;
  ELSE
   IF v_field<>'estado' OR
      upper(btrim(v_previous_offer->>'estado'))<>'PUBLICADA' OR
      upper(btrim(v_current_offer->>'estado'))<>ALL(ARRAY[
        'ANULADA','ANULADO','CANCELADA','CANCELADO',
        'DESIERTA','DESIERTO','DESIGNADA','DESIGNADO','CERRADA','CERRADO']) THEN
    RAISE EXCEPTION 'No explicit terminal state in source';
   END IF;
  END IF;
  v_real_before:=v_previous_offer->>v_field;
  v_real_after:=v_current_offer->>v_field;
  IF v_real_before IS NULL OR v_real_after IS NULL OR
    btrim(v_real_before)='' OR btrim(v_real_after)='' OR
    v_real_before=v_real_after OR
    v_real_before<>v_before OR v_real_after<>v_after THEN
    RAISE EXCEPTION 'Event values not proven by two snapshots';
  END IF;

  -- Database-calculated payload digest detects event_key collisions / forged retries.
  v_digest:=md5(jsonb_build_array(v_scope,v_id,v_type,v_field,v_before,v_after)::text);
  INSERT INTO apd_change_lab.audit_events AS dst
    (scope,event_key,source_offer_key,event_type,field,before_value,
     after_value,payload_digest,observed_at,expires_at)
  VALUES(v_scope,v_event_key,v_id,v_type,v_field,v_before,
     v_after,v_digest,v_cur.captured_at,v_cur.captured_at+interval '7 days')
  ON CONFLICT(scope,event_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  IF v_inserted=0 AND NOT EXISTS(
    SELECT 1 FROM apd_change_lab.audit_events
    WHERE scope=v_scope AND event_key=v_event_key AND payload_digest=v_digest) THEN
   RAISE EXCEPTION 'Conflicting event hash reuse';
  END IF;
  v_count:=v_count+v_inserted;
 END LOOP;

 IF p_inject_failure_for_test THEN
  RAISE EXCEPTION 'INJECTED_AFTER_AUDIT_INSERT';
 END IF;

 -- Retain at most 1,000 audit records per district, never deliver any.
 DELETE FROM apd_change_lab.audit_events e
 WHERE scope=v_scope AND event_key NOT IN (
  SELECT event_key FROM apd_change_lab.audit_events
  WHERE scope=v_scope ORDER BY observed_at DESC,event_key LIMIT 1000
 );
 SELECT count(*)::int INTO v_retained
 FROM apd_change_lab.audit_events WHERE scope=v_scope;
 RETURN QUERY SELECT v_count,v_retained;
END
$$;
REVOKE ALL ON FUNCTION apd_change_lab.record_audit_batch(jsonb,boolean) FROM PUBLIC;
COMMIT;

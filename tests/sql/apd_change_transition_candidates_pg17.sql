-- APD transition candidate evidence ledger: DISPOSABLE PG17 CI ONLY.
-- No senders, no queue, no migrations. NOT a claim of ABC atomicity.
-- Requires the existing private apd_change_lab.captures schema.
BEGIN;
CREATE TABLE apd_change_lab.transition_candidates (
 scope text NOT NULL,
 evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[0-9a-f]{64}$'),
 source_offer_key text NOT NULL CHECK(source_offer_key ~ '^D_[0-9]{1,18}$'),
 previous_observed_at timestamptz NOT NULL,
 later_verified_at timestamptz NOT NULL,
 previous_capture_fingerprint text NOT NULL CHECK(previous_capture_fingerprint ~ '^[0-9a-f]{32}$'),
 server_fingerprint text NOT NULL CHECK(server_fingerprint ~ '^[0-9a-f]{32}$'),
 status text NOT NULL DEFAULT 'review_only' CHECK(status='review_only'),
 source_attested boolean NOT NULL DEFAULT false CHECK(source_attested=false),
 historic_transition_proven boolean NOT NULL DEFAULT false CHECK(historic_transition_proven=false),
 delivery_allowed boolean NOT NULL DEFAULT false CHECK(delivery_allowed=false),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(scope,evidence_hash),
 -- Never let two different hashes masquerade as independent transitions
 -- of the SAME offer from the SAME published observation.
 UNIQUE(scope,source_offer_key,previous_observed_at),
 CHECK(later_verified_at>previous_observed_at),
 CHECK(later_verified_at-previous_observed_at<=interval '48 hours'),
 CHECK(expires_at>later_verified_at)
);
ALTER TABLE apd_change_lab.transition_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON apd_change_lab.transition_candidates FROM PUBLIC;
CREATE INDEX apd_transition_candidates_expiry
 ON apd_change_lab.transition_candidates(scope,expires_at);

-- Restricted lab entrypoint. SECURITY INVOKER, private schema, no application
-- grants or RLS policy; only CI administrator can stage candidate records.
CREATE FUNCTION apd_change_lab.record_transition_candidate(
 p_candidate jsonb,p_source_offer_key text,
 p_inject_failure_for_test boolean DEFAULT false
)
RETURNS TABLE(added integer,retained integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_change_lab,pg_temp
AS $$
DECLARE
 v_scope text;
 v_claim_hash text;
 v_prev_text text;
 v_later_text text;
 v_prev timestamptz;
 v_later timestamptz;
 v_stored apd_change_lab.captures%ROWTYPE;
 v_row jsonb;
 v_fingerprint text;
 v_count int;
 v_added int;
 v_retained int;
 v_allowed text[]:=ARRAY[
  'verified','reviewCandidate','evidenceHash','sourceScope',
  'previousObservedState','laterObservedState','previousObservedAt',
  'laterVerifiedAt','evidence','originalCaptureAttestedByABC',
  'exactStateTransitionTimeKnown','historicTransitionProven',
  'notificationAllowed','candidateOnly','recordsStored','eventsCreated'
 ];
BEGIN
 IF p_candidate IS NULL OR jsonb_typeof(p_candidate)<>'object' OR
    (SELECT count(*) FROM jsonb_object_keys(p_candidate))<>16 OR
    EXISTS(SELECT 1 FROM jsonb_object_keys(p_candidate) k
      WHERE k<>ALL(v_allowed)) OR
    p_candidate->'verified'<>'true'::jsonb OR
    p_candidate->'reviewCandidate'<>'true'::jsonb OR
    p_candidate->'candidateOnly'<>'true'::jsonb OR
    p_candidate->'originalCaptureAttestedByABC'<>'false'::jsonb OR
    p_candidate->'exactStateTransitionTimeKnown'<>'false'::jsonb OR
    p_candidate->'historicTransitionProven'<>'false'::jsonb OR
    p_candidate->'notificationAllowed'<>'false'::jsonb OR
    p_candidate->'recordsStored'<>'0'::jsonb OR
    p_candidate->'eventsCreated'<>'0'::jsonb OR
    p_candidate->>'previousObservedState'<>'PUBLICADA' OR
    p_candidate->>'laterObservedState'<>'ANULADA' OR
    p_candidate->>'evidence'<>'compact_capture_then_targeted_abc_double_read'
 THEN RAISE EXCEPTION 'Only explicitly non-deliverable review candidates allowed'; END IF;

 v_scope:=p_candidate->>'sourceScope';
 v_claim_hash:=p_candidate->>'evidenceHash';
 v_prev_text:=p_candidate->>'previousObservedAt';
 v_later_text:=p_candidate->>'laterVerifiedAt';
 IF v_scope IS NULL OR length(v_scope) NOT BETWEEN 1 AND 120 OR
    v_scope ~ '[[:cntrl:]]' OR
    p_source_offer_key IS NULL OR p_source_offer_key !~ '^D_[0-9]{1,18}$' OR
    v_claim_hash IS NULL OR v_claim_hash !~ '^[0-9a-f]{64}$' OR
    v_prev_text IS NULL OR
    v_prev_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$' OR
    v_later_text IS NULL OR
    v_later_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
 THEN RAISE EXCEPTION 'Invalid source identity, claim hash or timestamps'; END IF;
 BEGIN
  v_prev:=v_prev_text::timestamptz;
  v_later:=v_later_text::timestamptz;
 EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'Invalid candidate timestamp';
 END;
 IF v_later<=v_prev OR v_later-v_prev>interval '48 hours' OR
    v_later>statement_timestamp()+interval '5 minutes' OR
    statement_timestamp()-v_later>interval '12 hours' THEN
  RAISE EXCEPTION 'Untrusted temporal observation window';
 END IF;

 -- Serialize per district with the existing capture/audit lock.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope,32619));
 SELECT * INTO v_stored FROM apd_change_lab.captures
 WHERE scope=v_scope AND captured_at=v_prev;
 IF v_stored.scope IS NULL THEN
  RAISE EXCEPTION 'Prior compact capture not stored in private database';
 END IF;
 SELECT value INTO v_row FROM jsonb_array_elements(v_stored.rows) AS r(value)
 WHERE value->>'source_offer_key'=p_source_offer_key;
 IF v_row IS NULL OR upper(btrim(v_row->>'estado'))<>'PUBLICADA' OR
    upper(btrim(v_row->>'distrito'))<>upper(v_scope) THEN
  RAISE EXCEPTION 'Prior published source offer not present';
 END IF;

 -- This is a SERVER-created fingerprint, independent of the untrusted
 -- caller-provided evidenceHash. Not an ABC signature.
 -- Exclude later read instant so a repeated double check stays idempotent.
 v_fingerprint:=md5(jsonb_build_array(v_scope,v_claim_hash,
  p_source_offer_key,v_prev,v_stored.fingerprint,
  'PUBLICADA','ANULADA')::text);
 DELETE FROM apd_change_lab.transition_candidates
 WHERE scope=v_scope AND expires_at<=v_later;
 INSERT INTO apd_change_lab.transition_candidates AS dst(
  scope,evidence_hash,source_offer_key,previous_observed_at,
  later_verified_at,previous_capture_fingerprint,server_fingerprint,
  expires_at)
 VALUES(v_scope,v_claim_hash,p_source_offer_key,v_prev,v_later,
  v_stored.fingerprint,v_fingerprint,v_later+interval '7 days')
 ON CONFLICT(scope,evidence_hash) DO NOTHING;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 IF v_added=0 AND NOT EXISTS(
  SELECT 1 FROM apd_change_lab.transition_candidates
  WHERE scope=v_scope AND evidence_hash=v_claim_hash
    AND server_fingerprint=v_fingerprint
 ) THEN RAISE EXCEPTION 'Conflicting candidate fingerprint reuse'; END IF;

 IF p_inject_failure_for_test THEN
  RAISE EXCEPTION 'INJECTED_AFTER_TRANSITION_CANDIDATE_INSERT';
 END IF;
 DELETE FROM apd_change_lab.transition_candidates x
 WHERE x.scope=v_scope AND x.evidence_hash NOT IN (
  SELECT evidence_hash FROM apd_change_lab.transition_candidates
  WHERE scope=v_scope ORDER BY later_verified_at DESC,evidence_hash LIMIT 500
 );
 SELECT count(*)::int INTO v_retained
 FROM apd_change_lab.transition_candidates WHERE scope=v_scope;
 RETURN QUERY SELECT v_added,v_retained;
END
$$;
REVOKE ALL ON FUNCTION apd_change_lab.record_transition_candidate(jsonb,text,boolean)
 FROM PUBLIC;
COMMIT;

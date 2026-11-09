-- Strictly disposable PostgreSQL 17 load test, after transition lab schema.
-- 501 DISTINCT synthetic offers -> at most 500 retained review-only records.
-- No actual ABC data, Supabase credentials, mail, schedules or production writes.
\set ON_ERROR_STOP on
DO $lab$
DECLARE
 v_scope text:='ENSENADA';
 v_prior timestamptz:=clock_timestamp()-interval '1 hour';
 v_later timestamptz:=clock_timestamp();
 v_prior_str text;
 v_later_str text;
 v_rows jsonb;
 v_candidate jsonb;
 v_key text;
 v_hash text;
 v_result record;
 v_other_before integer;
 v_i integer;
 v_started timestamptz:=clock_timestamp();
 v_size bigint;
BEGIN
 v_prior_str:=to_char(v_prior AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 v_later_str:=to_char(v_later AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

 SELECT jsonb_agg(jsonb_build_object(
  'source_offer_key','D_'||g.i::text,
  'estado','Publicada',
  'finoferta','2026-11-12T07:30:00Z',
  'turno','Mañana',
  'jornada','Simple',
  'hsmodulos','4',
  'cursodivision','1A',
  'supl_desde','2026-11-09',
  'supl_hasta','2026-11-16',
  'escuela','Escuela de prueba',
  'distrito',v_scope,
  'cargo','PRECEPTOR',
  'area','General',
  'nivel_modalidad','Secundaria'
 ) ORDER BY g.i) INTO v_rows
 FROM generate_series(1,501) AS g(i);

 IF jsonb_array_length(v_rows)<>501 THEN
  RAISE EXCEPTION 'Missing synthetic source rows in load fixture';
 END IF;
 SELECT * INTO v_result FROM apd_change_lab.save_compact(
  jsonb_build_object('complete',true,'fieldCount',14,'scope',v_scope,
    'capturedAt',v_prior_str,'sourceTotal',501,'rows',v_rows,
    'digest',repeat('a',64)));
 IF NOT v_result.applied OR v_result.retained<>1 THEN
  RAISE EXCEPTION 'Large compact source capture not accepted';
 END IF;

 SELECT count(*) INTO v_other_before
 FROM apd_change_lab.transition_candidates WHERE scope='MERLO';
 IF v_other_before<>1 THEN
  RAISE EXCEPTION 'Existing district must retain original candidate';
 END IF;

 FOR v_i IN 1..501 LOOP
  v_key:='D_'||v_i::text;
  v_hash:=lpad(to_hex(v_i),64,'0');
  v_candidate:=jsonb_build_object(
   'verified',true,'reviewCandidate',true,
   'evidenceHash',v_hash,'sourceScope',v_scope,
   'previousObservedState','PUBLICADA','laterObservedState','ANULADA',
   'previousObservedAt',v_prior_str,'laterVerifiedAt',v_later_str,
   'evidence','compact_capture_then_targeted_abc_double_read',
   'originalCaptureAttestedByABC',false,
   'exactStateTransitionTimeKnown',false,
   'historicTransitionProven',false,'notificationAllowed',false,
   'candidateOnly',true,'recordsStored',0,'eventsCreated',0
  );
  SELECT * INTO v_result
   FROM apd_change_lab.record_transition_candidate(v_candidate,v_key);
  IF v_result.added<>1 OR
     v_result.retained<>LEAST(v_i,500) THEN
   RAISE EXCEPTION 'Retention incorrect at insert % (added %, retained %)',
    v_i,v_result.added,v_result.retained;
  END IF;
 END LOOP;

 IF (SELECT count(*) FROM apd_change_lab.transition_candidates
    WHERE scope=v_scope)<>500 OR
    EXISTS(SELECT 1 FROM apd_change_lab.transition_candidates
      WHERE scope=v_scope AND (
       status<>'review_only' OR delivery_allowed OR
       source_attested OR historic_transition_proven OR
       expires_at<=later_verified_at)) OR
    EXISTS(SELECT 1 FROM apd_change_lab.transition_candidates
      WHERE scope=v_scope AND evidence_hash=lpad(to_hex(1),64,'0')) OR
    NOT EXISTS(SELECT 1 FROM apd_change_lab.transition_candidates
      WHERE scope=v_scope AND evidence_hash=lpad(to_hex(501),64,'0'))
 THEN RAISE EXCEPTION '501->500 deterministic retention or status failed'; END IF;
 IF (SELECT count(*) FROM apd_change_lab.transition_candidates
      WHERE scope='MERLO')<>v_other_before THEN
  RAISE EXCEPTION 'District-isolation violation in retention';
 END IF;
 IF (SELECT count(*) FROM apd_change_lab.transition_candidates
    WHERE scope=v_scope AND source_offer_key IN('D_1','D_501'))<>1 THEN
  RAISE EXCEPTION 'Unexpected offer identities at retention boundary';
 END IF;

 -- Different hash for an already recorded offer and previous capture must
 -- NOT create a second candidate for the same observed transition.
 v_candidate:=jsonb_set(v_candidate,'{evidenceHash}',
   to_jsonb(repeat('f',64)));
 BEGIN
  PERFORM * FROM apd_change_lab.record_transition_candidate(
    v_candidate,'D_501');
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN unique_violation THEN NULL;
   WHEN OTHERS THEN
    IF SQLERRM='EXPECTED_REJECTION_NOT_RAISED' THEN RAISE; END IF;
    RAISE;
 END;

 IF (SELECT count(*) FROM apd_change_lab.transition_candidates
    WHERE scope=v_scope)<>500 THEN
  RAISE EXCEPTION 'Rejected hash reuse changed retained evidence';
 END IF;

 v_size:=pg_total_relation_size('apd_change_lab.transition_candidates'::regclass);
 RAISE NOTICE
  'APD_TRANSITION_LOAD_PG17_PASSED requested=501 retained=500 evicted=1 other_district=% bytes=% elapsed_ms=%',
  v_other_before,v_size,
  round(extract(epoch FROM clock_timestamp()-v_started)*1000);
END
$lab$;

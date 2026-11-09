#!/usr/bin/env bash
# Only disposable PG17 CI. Does not touch Supabase/Worker/users.
set -euo pipefail
if [[ "${PGHOST:-}" != "localhost" || "${PGDATABASE:-}" != "apd_ci" ||
      "${PGUSER:-}" != "apd_ci" || "${PGPORT:-}" != "5432" ||
      -z "${PG_SERVICE_CONTAINER:-}" ]]; then
 echo 'APD_TRANSITION_STORE_DISABLED' >&2; exit 2
fi
if [[ "$(docker inspect --format '{{.Config.Image}}' "$PG_SERVICE_CONTAINER")" != "postgres:17" ]]; then
 echo 'APD_TRANSITION_STORE_DISABLED: Docker image mismatch' >&2; exit 2
fi
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_change_transition_candidates_pg17.sql

payload="$(node --input-type=module <<'JS'
import {compactCaptureFromPages} from './scripts/apd-offer-compact-capture.mjs';
import {createABCOfficialStatusVerifier} from './scripts/apd-abc-official-status-verifier.mjs';
import {createABCTransitionCorrelator} from './scripts/apd-abc-transition-correlator.mjs';
const now=Date.now(),scope='MERLO',keys=['D_70321','D_70322'];
const rows=keys.map(k=>({source_offer_key:k,estado:'Publicada',distrito:scope,
 finoferta:'2026-11-12T07:30:00Z',turno:'Mañana',cargo:'Preceptor'}));
const previous=compactCaptureFromPages({scope,
 capturedAt:new Date(now-3600000).toISOString(),
 pages:[{offset:0,sourceTotal:rows.length,rows}]});
if(!previous.complete)throw Error('Invalid compact fixture');
const fetchImpl=async(url)=>{
 const params=Object.fromEntries(new URL(url).searchParams);
 const id=params.q.split('iddetalle:')[1];
 return new Response(JSON.stringify({
  responseHeader:{status:0,params},
  response:{numFound:1,start:0,docs:[{
   iddetalle:id,idoferta:'900001',estado:'Anulada',descdistrito:scope
  }]}
 }),{status:200,headers:{'content-type':'application/json'}});
};
const verifier=createABCOfficialStatusVerifier({enabled:true,fetchImpl,maxChecks:3});
const correlator=createABCTransitionCorrelator({enabled:true,verifier,clock:()=>now});
const candidates=[];
for(const key of keys){
 const c=await correlator.inspect({previousCapture:previous,sourceOfferKey:key});
 if(!c.verified||c.notificationAllowed||c.historicTransitionProven)
  throw Error('Candidate must be non-deliverable');
 candidates.push(c);
}
console.log(JSON.stringify({previous,first:candidates[0],second:candidates[1],
 key1:keys[0],key2:keys[1]}));
JS
)"
psql -X -v ON_ERROR_STOP=1 -v payload="$payload" <<'SQL'
CREATE TEMP TABLE apd_transition_inputs AS SELECT :'payload'::jsonb AS doc;
SELECT * FROM apd_change_lab.save_compact(
 (SELECT doc->'previous' FROM apd_transition_inputs));
CREATE TEMP TABLE apd_transition_inserted AS SELECT *
 FROM apd_change_lab.record_transition_candidate(
   (SELECT doc->'first' FROM apd_transition_inputs),
   (SELECT doc->>'key1' FROM apd_transition_inputs));
DO $verify$
DECLARE r record; v jsonb; b int;
BEGIN
 IF (SELECT added FROM apd_transition_inserted)<>1 OR
    (SELECT count(*) FROM apd_change_lab.transition_candidates
       WHERE scope='MERLO' AND status='review_only' AND
        source_attested=false AND historic_transition_proven=false
        AND delivery_allowed=false)<>1 THEN
  RAISE EXCEPTION 'Candidate is not private review-only';
 END IF;
 SELECT * INTO r FROM apd_change_lab.record_transition_candidate(
  (SELECT doc->'first' FROM apd_transition_inputs),
  (SELECT doc->>'key1' FROM apd_transition_inputs));
 IF r.added<>0 OR r.retained<>1 THEN
  RAISE EXCEPTION 'Identical candidate replay failed';
 END IF;
 SELECT doc->'first' INTO v FROM apd_transition_inputs;
 v:=jsonb_set(v,'{laterVerifiedAt}',to_jsonb(
  to_char((v->>'laterVerifiedAt')::timestamptz+interval '60 seconds',
   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 SELECT * INTO r FROM apd_change_lab.record_transition_candidate(
  v,(SELECT doc->>'key1' FROM apd_transition_inputs));
 IF r.added<>0 OR r.retained<>1 THEN
  RAISE EXCEPTION 'Repeated status check produced a duplicate';
 END IF;
 -- An existing offer with a different source key cannot reuse this hash.
 BEGIN
  PERFORM * FROM apd_change_lab.record_transition_candidate(
   (SELECT doc->'first' FROM apd_transition_inputs),
   (SELECT doc->>'key2' FROM apd_transition_inputs));
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='EXPECTED_REJECTION_NOT_RAISED' THEN RAISE; END IF;
 END;
 -- Reject forged proof, notifications, extra personal data and other states.
 FOR v IN SELECT value FROM (VALUES
  (jsonb_set((SELECT doc->'first' FROM apd_transition_inputs),
    '{notificationAllowed}','true'::jsonb)),
  (jsonb_set((SELECT doc->'first' FROM apd_transition_inputs),
    '{historicTransitionProven}','true'::jsonb)),
  ((SELECT doc->'first' FROM apd_transition_inputs)||
    '{"cuil":"not-a-real-value"}'::jsonb),
  (jsonb_set((SELECT doc->'first' FROM apd_transition_inputs),
    '{laterObservedState}','"DESIERTA"'::jsonb))
 ) AS x(value) LOOP
  BEGIN
   PERFORM * FROM apd_change_lab.record_transition_candidate(
    v,(SELECT doc->>'key1' FROM apd_transition_inputs));
   RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='EXPECTED_REJECTION_NOT_RAISED' THEN RAISE; END IF;
  END;
 END LOOP;
 SELECT count(*) INTO b FROM apd_change_lab.transition_candidates;
 BEGIN
  PERFORM * FROM apd_change_lab.record_transition_candidate(
   (SELECT doc->'second' FROM apd_transition_inputs),
   (SELECT doc->>'key2' FROM apd_transition_inputs),true);
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'INJECTED_AFTER_TRANSITION_CANDIDATE_INSERT' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM apd_change_lab.transition_candidates)<>b THEN
  RAISE EXCEPTION 'Rollback failed after injected insert';
 END IF;
 IF has_schema_privilege('apd_lab_ingest','apd_change_lab','USAGE') OR
    has_table_privilege('apd_lab_ingest',
     'apd_change_lab.transition_candidates','SELECT,INSERT,UPDATE,DELETE') OR
    has_function_privilege('apd_lab_ingest',
     'apd_change_lab.record_transition_candidate(jsonb,text,boolean)','EXECUTE') OR
    has_table_privilege('apd_lab_observer',
     'apd_change_lab.transition_candidates','SELECT') OR
    NOT (SELECT relrowsecurity FROM pg_class
      WHERE oid='apd_change_lab.transition_candidates'::regclass) THEN
  RAISE EXCEPTION 'Transition ledger exposed to API role or RLS disabled';
 END IF;
END $verify$;

-- Simulate expired evidence in ONLY the disposable database, check pruning.
UPDATE apd_change_lab.transition_candidates
 SET expires_at=later_verified_at+interval '1 second'
 WHERE scope='MERLO';
SELECT * FROM apd_change_lab.record_transition_candidate(
 jsonb_set((SELECT doc->'second' FROM apd_transition_inputs),
  '{laterVerifiedAt}',to_jsonb(to_char(
   ((SELECT doc->'second' FROM apd_transition_inputs)
    ->>'laterVerifiedAt')::timestamptz+interval '2 seconds',
   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
 (SELECT doc->>'key2' FROM apd_transition_inputs));
DO $verify$
BEGIN
 IF (SELECT count(*) FROM apd_change_lab.transition_candidates
  WHERE scope='MERLO')<>1 OR
  (SELECT source_offer_key FROM apd_change_lab.transition_candidates
  WHERE scope='MERLO')<>(SELECT doc->>'key2' FROM apd_transition_inputs) OR
  (SELECT count(*) FROM apd_change_lab.transition_candidates WHERE
   status<>'review_only' OR delivery_allowed OR source_attested
   OR historic_transition_proven)<>0 THEN
  RAISE EXCEPTION 'TTL or review-only invariant failed';
 END IF;
END $verify$;
SELECT 'APD_TRANSITION_LEDGER_PG17_PASSED' AS marker;
SQL
echo 'APD_TRANSITION_LEDGER_PG17_PASSED'

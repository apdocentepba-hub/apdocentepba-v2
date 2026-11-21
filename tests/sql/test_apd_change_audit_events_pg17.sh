#!/usr/bin/env bash
# Disposable PostgreSQL 17 only; executes after test_apd_change_compact_pg17.sh.
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_change_audit_events_pg17.sql

payload="$(node --input-type=module <<'JS'
import {compactCaptureFromPages} from './scripts/apd-offer-compact-capture.mjs';
import {prepareOfferAuditBatch} from './scripts/apd-offer-audit-batch.mjs';
const a={source_offer_key:'D_AUD_1',estado:'Publicada',distrito:'AVELLANEDA',
 finoferta:'2026-11-12T07:30:00Z',turno:'Mañana',cargo:'Preceptor'};
const b={...a,source_offer_key:'D_AUD_2'};
const take=(rows,stamp)=>compactCaptureFromPages({
 scope:'AVELLANEDA',capturedAt:stamp,
 pages:[{offset:0,sourceTotal:rows.length,rows}]});
const previous=take([a,b],'2026-11-09T10:00:00Z');
const current=take([{...a,turno:'Tarde'},{...b,estado:'Anulada'}],
 '2026-11-09T11:00:00Z');
const third=take([{...a,turno:'Noche'},{...b,estado:'Anulada'}],
 '2026-11-09T12:00:00Z');
const batch=prepareOfferAuditBatch(previous,current,
 {nowMs:Date.parse('2026-11-09T11:02:00Z')});
const nextBatch=prepareOfferAuditBatch(current,third,
 {nowMs:Date.parse('2026-11-09T12:02:00Z')});
if(!previous.complete||!current.complete||!third.complete||
 !batch.verified||batch.events.length!==2||
 !nextBatch.verified||nextBatch.events.length!==1)
 throw Error('Synthetic audit batch precondition failed');
console.log(JSON.stringify({previous,current,third,batch,nextBatch}));
JS
)"
psql -X -v ON_ERROR_STOP=1 -v payload="$payload" <<'SQL'
CREATE TEMP TABLE apd_audit_inputs AS SELECT :'payload'::jsonb AS doc;
CREATE TEMP TABLE apd_first_capture AS
 SELECT * FROM apd_change_lab.save_compact((SELECT doc->'previous' FROM apd_audit_inputs));
CREATE TEMP TABLE apd_second_capture AS
 SELECT * FROM apd_change_lab.save_compact((SELECT doc->'current' FROM apd_audit_inputs));
CREATE TEMP TABLE apd_first_audit AS
 SELECT * FROM apd_change_lab.record_audit_batch((SELECT doc->'batch' FROM apd_audit_inputs));
DO $verify$
DECLARE replay record;
BEGIN
 IF (SELECT count(*) FROM apd_change_lab.audit_events WHERE scope='AVELLANEDA')<>2 OR
    (SELECT added FROM apd_first_audit)<>2 OR
    (SELECT retained FROM apd_first_audit)<>2 THEN
  RAISE EXCEPTION 'Two verified events not staged';
 END IF;
 IF (SELECT count(*) FROM apd_change_lab.audit_events WHERE status<>'audit_only')<>0 OR
    (SELECT count(*) FROM apd_change_lab.audit_events
     WHERE event_type='official_state_changed' AND after_value='Anulada')<>1 THEN
  RAISE EXCEPTION 'Unsafe delivery status or missing explicit cancellation';
 END IF;
 SELECT * INTO replay FROM apd_change_lab.record_audit_batch(
  (SELECT doc->'batch' FROM apd_audit_inputs));
 IF replay.added<>0 OR replay.retained<>2 THEN
  RAISE EXCEPTION 'Audit replay is not idempotent';
 END IF;
 -- Tampered source proof must be rejected: no silent fake school change.
 BEGIN
  PERFORM * FROM apd_change_lab.record_audit_batch(
   jsonb_set((SELECT doc->'batch' FROM apd_audit_inputs),
    '{events,0,before}','"Forged value"'::jsonb));
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='EXPECTED_REJECTION_NOT_RAISED' THEN RAISE; END IF;
 END;
END $verify$;

-- Inject failure after INSERT: no additional audit record may survive.
CREATE TEMP TABLE apd_third_capture AS
 SELECT * FROM apd_change_lab.save_compact((SELECT doc->'third' FROM apd_audit_inputs));
DO $verify$
DECLARE out_count int;
BEGIN
 SELECT count(*) INTO out_count FROM apd_change_lab.audit_events;
 BEGIN
  PERFORM * FROM apd_change_lab.record_audit_batch(
   (SELECT doc->'nextBatch' FROM apd_audit_inputs),true);
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'INJECTED_AFTER_AUDIT_INSERT' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM apd_change_lab.audit_events)<>out_count THEN
  RAISE EXCEPTION 'Failed audit transaction left a partial event';
 END IF;
END $verify$;
CREATE TEMP TABLE apd_next_audit AS
 SELECT * FROM apd_change_lab.record_audit_batch(
  (SELECT doc->'nextBatch' FROM apd_audit_inputs));
DO $verify$
BEGIN
 IF (SELECT added FROM apd_next_audit)<>1 OR
    (SELECT count(*) FROM apd_change_lab.audit_events WHERE scope='AVELLANEDA')<>3 OR
    (SELECT count(*) FROM apd_change_lab.captures WHERE scope='AVELLANEDA')<>2 THEN
  RAISE EXCEPTION 'Retry after audit rollback failed or snapshot retention broken';
 END IF;
 IF EXISTS (SELECT 1 FROM apd_change_lab.audit_events
    WHERE status<>'audit_only' OR expires_at<=observed_at) THEN
  RAISE EXCEPTION 'Not audit-only or invalid TTL';
 END IF;
END $verify$;

-- Other district has only one saved snapshot: reject forged event data.
DO $verify$
DECLARE input jsonb;
BEGIN
 input:=jsonb_build_object('verified',true,'scope','QUILMES',
  'capturedAt','2026-11-09T06:00:00Z','events','[]'::jsonb);
 BEGIN
  PERFORM * FROM apd_change_lab.record_audit_batch(input);
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Missing, stale, or incomparable pair of captures' THEN RAISE; END IF;
 END;
END $verify$;

CREATE ROLE apd_change_audit_guest NOLOGIN;
DO $verify$
BEGIN
 IF has_schema_privilege('apd_change_audit_guest','apd_change_lab','USAGE') OR
    has_table_privilege('apd_change_audit_guest',
     'apd_change_lab.audit_events','SELECT') OR
    has_function_privilege('apd_change_audit_guest',
     'apd_change_lab.record_audit_batch(jsonb,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Unauthenticated roles can reach private event audit';
 END IF;
 IF (SELECT relrowsecurity FROM pg_class
     WHERE oid='apd_change_lab.audit_events'::regclass) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Missing RLS on private events';
 END IF;
END $verify$;
SELECT 'PASS: private audit events, verified source pair, idempotency, rollback, no delivery' AS result;
SQL
echo 'APD_AUDIT_PG17_PASSED'

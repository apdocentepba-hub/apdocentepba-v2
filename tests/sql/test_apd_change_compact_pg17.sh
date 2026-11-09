#!/usr/bin/env bash
# Disposable PostgreSQL 17 container only. No production credentials.
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_change_compact_pg17.sql

psql -X -v ON_ERROR_STOP=1 <<'SQL'
SET client_min_messages TO warning;
-- Test-only fixtures use the same 14-key shape as compactCaptureFromPages.
CREATE FUNCTION apd_change_lab.fixture_row(p_key text,p_scope text,p_turno text DEFAULT 'Mañana')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
 SELECT jsonb_build_object(
  'source_offer_key',p_key,'estado','Publicada',
  'finoferta','2026-11-12T07:30:00Z','turno',p_turno,
  'jornada','JS','hsmodulos','4','cursodivision','A',
  'supl_desde','2026-11-04','supl_hasta','2027-02-28',
  'escuela','0045MS0013','distrito',p_scope,
  'cargo','Preceptor','area','/PR','nivel_modalidad','Secundaria'
 );
$fn$;
CREATE FUNCTION apd_change_lab.fixture(p_scope text,p_stamp text,p_rows jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
 SELECT jsonb_build_object('complete',true,'scope',p_scope,
  'capturedAt',p_stamp,'sourceTotal',jsonb_array_length(p_rows),
  'rows',p_rows,'fieldCount',14,'digest',repeat('a',64));
$fn$;

-- A district can safely store at most two fresh, complete snapshots.
DO $test$
DECLARE snap jsonb; status record;
BEGIN
 snap:=apd_change_lab.fixture('AVELLANEDA','2026-11-09T07:00:00Z',
  jsonb_build_array(apd_change_lab.fixture_row('D_1','AVELLANEDA')));
 SELECT * INTO status FROM apd_change_lab.save_compact(snap);
 IF NOT status.applied OR status.retained<>1 THEN RAISE EXCEPTION 'First capture not saved'; END IF;
 SELECT * INTO status FROM apd_change_lab.save_compact(snap);
 IF status.applied OR status.retained<>1 THEN RAISE EXCEPTION 'Identical retry not idempotent'; END IF;

 -- An exception after INSERT must roll back that INSERT and preserve old data.
 BEGIN
  PERFORM * FROM apd_change_lab.save_compact(
   apd_change_lab.fixture('AVELLANEDA','2026-11-09T08:00:00Z',
    jsonb_build_array(apd_change_lab.fixture_row('D_1','AVELLANEDA','Tarde'))),true);
  RAISE EXCEPTION 'EXPECTED_FAILURE_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'INJECTED_AFTER_INSERT' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM apd_change_lab.captures WHERE scope='AVELLANEDA')<>1 THEN
  RAISE EXCEPTION 'Failed transaction did not roll back'; END IF;

 SELECT * INTO status FROM apd_change_lab.save_compact(
  apd_change_lab.fixture('AVELLANEDA','2026-11-09T08:00:00Z',
   jsonb_build_array(apd_change_lab.fixture_row('D_1','AVELLANEDA','Tarde'))));
 IF NOT status.applied OR status.retained<>2 THEN RAISE EXCEPTION 'Second capture failed'; END IF;

 -- Third snapshot drops oldest within SAME transaction and ONLY this district.
 SELECT * INTO status FROM apd_change_lab.save_compact(
  apd_change_lab.fixture('AVELLANEDA','2026-11-09T09:00:00Z',
   jsonb_build_array(apd_change_lab.fixture_row('D_1','AVELLANEDA','Noche'))));
 IF NOT status.applied OR status.retained<>2 OR
  (SELECT min(captured_at) FROM apd_change_lab.captures WHERE scope='AVELLANEDA')
   <>'2026-11-09T08:00:00Z'::timestamptz THEN
  RAISE EXCEPTION 'Oldest retention failed'; END IF;

 -- Unrelated district remains isolated.
 PERFORM * FROM apd_change_lab.save_compact(
  apd_change_lab.fixture('QUILMES','2026-11-09T06:00:00Z',
   jsonb_build_array(apd_change_lab.fixture_row('D_Q','QUILMES'))));
 IF (SELECT count(*) FROM apd_change_lab.captures WHERE scope='QUILMES')<>1 THEN
  RAISE EXCEPTION 'District isolation failed'; END IF;
END $test$;

-- Negative cases must fail without changing stored capture count or payload.
DO $test$
DECLARE snap jsonb; baseline text; bad jsonb; new_stamp text:='2026-11-09T10:00:00Z';
BEGIN
 SELECT string_agg(scope||':'||captured_at::text||':'||fingerprint,'|' ORDER BY scope,captured_at)
 INTO baseline FROM apd_change_lab.captures;
 snap:=apd_change_lab.fixture('AVELLANEDA',new_stamp,
  jsonb_build_array(apd_change_lab.fixture_row('D_1','AVELLANEDA')));
 FOR bad IN
 SELECT value FROM jsonb_array_elements(jsonb_build_array(
  snap||jsonb_build_object('sourceTotal',2), -- truncated page set
  snap||jsonb_build_object('extraSensitive','no'), -- extra envelope data
  snap||jsonb_build_object('fieldCount',15),
  snap||jsonb_build_object('capturedAt','2026-11-09T10:00:00'),
  snap||jsonb_build_object('rows',jsonb_build_array(
    apd_change_lab.fixture_row('D_1','AVELLANEDA')||
      jsonb_build_object('email','someone@example.test'))),
  snap||jsonb_build_object('rows',jsonb_build_array(
    apd_change_lab.fixture_row('D_1','QUILMES'))),
  snap||jsonb_build_object('rows',jsonb_build_array(
    apd_change_lab.fixture_row('D_1','AVELLANEDA'),
    apd_change_lab.fixture_row('D_1','AVELLANEDA')),'sourceTotal',2)
 )) LOOP
  BEGIN
   PERFORM * FROM apd_change_lab.save_compact(bad);
   RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='EXPECTED_REJECTION_NOT_RAISED' THEN RAISE; END IF;
  END;
 END LOOP;
 -- Old timestamp with different body must not be inserted or silently overwrite.
 BEGIN
  PERFORM * FROM apd_change_lab.save_compact(
   apd_change_lab.fixture('AVELLANEDA','2026-11-09T08:30:00Z',
    jsonb_build_array(apd_change_lab.fixture_row('D_1','AVELLANEDA'))));
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Out-of-order capture rejected' THEN RAISE; END IF;
 END;
 -- Reusing an existing instant with changed content is a conflict, not an update.
 BEGIN
  PERFORM * FROM apd_change_lab.save_compact(
   apd_change_lab.fixture('AVELLANEDA','2026-11-09T09:00:00Z',
    jsonb_build_array(apd_change_lab.fixture_row('D_1','AVELLANEDA','Tarde'))));
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Conflicting retry at same capture timestamp' THEN RAISE; END IF;
 END;
 IF (SELECT string_agg(scope||':'||captured_at::text||':'||fingerprint,'|'
   ORDER BY scope,captured_at) FROM apd_change_lab.captures)<>baseline THEN
  RAISE EXCEPTION 'Rejected capture changed persistent state'; END IF;
END $test$;

-- Zero-offer district is accepted only as an explicitly complete empty capture.
DO $test$
DECLARE s record;
BEGIN
 SELECT * INTO s FROM apd_change_lab.save_compact(
  apd_change_lab.fixture('LANUS','2026-11-09T09:00:00Z','[]'::jsonb));
 IF NOT s.applied OR s.retained<>1 THEN RAISE EXCEPTION 'Empty verified scope rejected'; END IF;
END $test$;

-- Neither unauthenticated nor ordinary application roles receive access.
CREATE ROLE apd_change_lab_guest NOLOGIN;
DO $test$
BEGIN
 IF has_schema_privilege('apd_change_lab_guest','apd_change_lab','USAGE') OR
    has_table_privilege('apd_change_lab_guest','apd_change_lab.captures','SELECT') OR
    has_function_privilege('apd_change_lab_guest',
      'apd_change_lab.save_compact(jsonb,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Private lab API permission exposure'; END IF;
 IF (SELECT relrowsecurity FROM pg_class
     WHERE oid='apd_change_lab.captures'::regclass) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'RLS disabled on compact capture storage'; END IF;
END $test$;

SELECT 'PASS: PG17 compact snapshots, retention<=2/district, idempotency, rollback, isolation, privacy' AS result;
SQL

# Explicit integration: persist envelopes produced by the real Node compact engine.
snapshot="$(node --input-type=module <<'JS'
import {compactCaptureFromPages} from './scripts/apd-offer-compact-capture.mjs';
const o={source_offer_key:'D_NODE_01',distrito:'BERAZATEGUI',estado:'Publicada',
 finoferta:'2026-11-12T07:30:00Z',cargo:'Preceptor',turno:'Mañana',raw:{secret:'no'}};
const c=compactCaptureFromPages({scope:'BERAZATEGUI',capturedAt:'2026-11-09T09:00:00Z',
 pages:[{offset:0,sourceTotal:1,rows:[o]}]});
if(!c.complete)throw Error('Node compact capture rejected');
console.log(JSON.stringify(c));
JS
)"
psql -X -v ON_ERROR_STOP=1 -v snapshot="$snapshot" <<'SQL'
DO $test$
DECLARE c record;
BEGIN
 SELECT * INTO c FROM apd_change_lab.save_compact(:'snapshot'::jsonb);
 IF NOT c.applied OR c.retained<>1 OR
  (SELECT rows::text LIKE '%secret%' FROM apd_change_lab.captures
   WHERE scope='BERAZATEGUI') THEN RAISE EXCEPTION 'Node->PG17 round trip invalid'; END IF;
END $test$;
SQL
echo 'APD_COMPACT_PG17_TRANSACTION_PASSED'

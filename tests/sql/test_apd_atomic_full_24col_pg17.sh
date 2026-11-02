#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_atomic_district_pilot_pg17.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_atomic_stage_pages_pg17.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_atomic_full_24col_pg17.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
SET client_min_messages TO warning;

-- Existing synthetic alert record must retain history on a new published capture.
INSERT INTO apd_scanner_pilot.current_offers
  (source_offer_key,distrito,estado,first_seen_at,last_seen_at,times_seen)
VALUES
 ('D_1','MATANZA','Anulada','2026-01-01','2026-10-01',4),
 ('D_STALE','MATANZA','Publicada','2026-01-01','2026-10-01',2);
INSERT INTO apd_scanner_pilot.current_offers_full
  (source_offer_key,idoferta,iddetalle,estado,distrito,escuela,cargo,area,
   nivel_modalidad,turno,jornada,hsmodulos,cursodivision,supl_desde,supl_hasta,
   finoferta,ult_movimiento,first_seen_at,last_seen_at,last_state_change_at,
   times_seen,state_changes,raw,updated_at)
VALUES
 ('D_1','I1','1','Anulada','MATANZA','ESCUELA ANTERIOR','CARGO ANTERIOR',
 'AREA','SECUNDARIA','TM','SIMPLE','2','1 A','','','2099-12-31','2026-10-01',
 '2026-01-01','2026-10-01','2026-10-01',4,2,'{"old":true}'::jsonb,'2026-10-01'),
 ('D_STALE','IS','S','Publicada','MATANZA','OTRA','BIBLIOTECA',
 'AREA','SECUNDARIA','TM','SIMPLE','2','','','','2099-12-31','2026-10-01',
 '2026-01-01','2026-10-01','2026-10-01',2,0,'{"old":true}'::jsonb,'2026-10-01');

INSERT INTO apd_scanner_pilot.runs
  (run_id,distrito,expected_offers,expected_pages,completed_pages,
   capture_started_at,captured_at,stage_verified)
VALUES
 ('00000000-0000-0000-0000-000000000801','MATANZA',0,2,0,
 '2026-11-02 15:00Z','2026-11-02 15:05Z',false),
 ('00000000-0000-0000-0000-000000000802','MATANZA',0,1,0,
 '2026-11-02 15:10Z','2026-11-02 15:15Z',false);

DO $$
DECLARE
  r1 jsonb;
  r2 jsonb;
BEGIN
 r1 := jsonb_build_array(jsonb_build_object(
   'source_offer_key','D_1','idoferta','I1','iddetalle','1',
   'estado','Publicada','distrito','MATANZA','escuela','ESCUELA NUEVA',
   'cargo','INFORMATICA','area','TECNICA','nivel_modalidad','TECNICA',
   'turno','TT','jornada','COMPLETA','hsmodulos','4','cursodivision','2 B',
   'supl_desde','2026-11-02','supl_hasta','2026-12-30','finoferta','2099-12-31',
   'ult_movimiento','2026-11-02T12:01:00Z',
   'raw',jsonb_build_object('sample','ficticio','nested',jsonb_build_object('x',42))));
 r2 := jsonb_build_array(jsonb_build_object(
   'source_offer_key','D_2','idoferta','I2','iddetalle','2',
   'estado','Publicada','distrito','MATANZA','escuela','ESCUELA 2',
   'cargo','PRECEPTOR','area','COMUN','nivel_modalidad','SECUNDARIA',
   'turno','TM','jornada','SIMPLE','hsmodulos','2','cursodivision','3 A',
   'supl_desde','','supl_hasta','','finoferta','2099-12-31',
   'ult_movimiento','2026-11-02T12:02:00Z',
   'raw',jsonb_build_object('sample','ficticio2','array',jsonb_build_array(1,2,3))));
 IF apd_scanner_pilot.stage_full_page('00000000-0000-0000-0000-000000000801',0,2,r1)<>1 THEN
   RAISE EXCEPTION 'Full stage page 0 failed';
 END IF;
 IF apd_scanner_pilot.stage_full_page('00000000-0000-0000-0000-000000000801',0,2,r1)<>1 THEN
   RAISE EXCEPTION 'Identical page replay failed';
 END IF;
 IF apd_scanner_pilot.stage_full_page('00000000-0000-0000-0000-000000000801',1,2,r2)<>2 THEN
   RAISE EXCEPTION 'Full stage page 1 failed';
 END IF;
 IF apd_scanner_pilot.seal_capture('00000000-0000-0000-0000-000000000801')<>2 THEN
   RAISE EXCEPTION 'Full capture not sealed';
 END IF;
 -- A changed retry must fail before altering stage or run.
 BEGIN
   PERFORM apd_scanner_pilot.stage_full_page(
     '00000000-0000-0000-0000-000000000801',0,2,
     jsonb_build_array(jsonb_set(r1->0,'{escuela}','"ESCUELA ALTERADA"'::jsonb)));
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('Run sealed or finalized','Retried page content changed') THEN RAISE; END IF;
 END;
END$$;

DO $$
DECLARE outcome record;
BEGIN
 SELECT * INTO outcome FROM apd_scanner_pilot.finalize_full_district(
   '00000000-0000-0000-0000-000000000801');
 IF outcome.upserted<>2 OR outcome.pruned<>0 THEN
   RAISE EXCEPTION 'Unexpected full finalization: %',row_to_json(outcome);
 END IF;
 IF (SELECT count(*) FROM apd_scanner_pilot.current_offers_full)<>3 THEN
   RAISE EXCEPTION 'Default operation removed rows or did not insert';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM apd_scanner_pilot.current_offers_full
   WHERE source_offer_key='D_1'
     AND first_seen_at='2026-01-01'::timestamptz
     AND times_seen=5 AND state_changes=3
     AND last_state_change_at='2026-11-02 15:05Z'::timestamptz
     AND estado='Publicada' AND turno='TT'
     AND escuela='ESCUELA NUEVA'
     AND cargo='INFORMATICA' AND nivel_modalidad='TECNICA'
     AND raw->'nested'->>'x'='42'
     AND updated_at='2026-11-02 15:05Z'::timestamptz
 ) THEN RAISE EXCEPTION 'Existing full record fields/history not preserved'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM apd_scanner_pilot.current_offers_full
   WHERE source_offer_key='D_2' AND times_seen=1 AND state_changes=0
     AND first_seen_at='2026-11-02 15:05Z'::timestamptz
     AND raw->'array' = '[1,2,3]'::jsonb
 ) THEN RAISE EXCEPTION 'New full record missing or JSONB corrupted'; END IF;
END$$;

DO $$
DECLARE payload jsonb;
BEGIN
 payload := jsonb_build_array(jsonb_build_object(
   'source_offer_key','D_3','idoferta','I3','iddetalle','3',
   'estado','Publicada','distrito','MATANZA','escuela','ESCUELA 3',
   'cargo','DOCENTE','area','AREA','nivel_modalidad','SECUNDARIA',
   'turno','TM','jornada','SIMPLE','hsmodulos','2','cursodivision','3 B',
   'supl_desde','','supl_hasta','','finoferta','2099-12-31',
   'ult_movimiento','2026-11-02T12:03:00Z','raw',jsonb_build_object('x',3)));
 PERFORM apd_scanner_pilot.stage_full_page(
   '00000000-0000-0000-0000-000000000802',0,1,payload);
 PERFORM apd_scanner_pilot.seal_capture('00000000-0000-0000-0000-000000000802');
 BEGIN
   PERFORM * FROM apd_scanner_pilot.finalize_full_district(
     '00000000-0000-0000-0000-000000000802',true);
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'INJECTED_FULL_ROW_FAILURE' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers_full WHERE source_offer_key='D_3')
   OR EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_3')
   OR (SELECT status FROM apd_scanner_pilot.runs
      WHERE run_id='00000000-0000-0000-0000-000000000802')<>'ready' THEN
   RAISE EXCEPTION 'Full-record transaction rollback failed';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers_full
  WHERE source_offer_key='D_STALE') THEN
   RAISE EXCEPTION 'Old records were pruned unexpectedly';
 END IF;
END$$;
SELECT 'PASS: 24-column schema, JSONB, first_seen, state_changes, atomic rollback and no-prune' AS result;
SQL

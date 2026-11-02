#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_atomic_district_pilot_pg17.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
SET client_min_messages TO warning;
INSERT INTO apd_scanner_pilot.current_offers
 (source_offer_key,distrito,estado,first_seen_at,last_seen_at,times_seen)
VALUES
 ('D_STALE','MATANZA','Publicada','2026-01-01','2026-01-01',1),
 ('D_100','MATANZA','Publicada','2026-01-01','2026-10-01',4),
 ('D_OTHER','AVELLANEDA','Publicada','2026-01-01','2026-10-01',2);
INSERT INTO apd_scanner_pilot.runs
 (run_id,distrito,expected_offers,expected_pages,completed_pages,capture_started_at,captured_at,stage_verified,allow_prune)
VALUES
 ('00000000-0000-0000-0000-000000000001','MATANZA',2,2,2,'2026-11-02 15:00Z','2026-11-02 15:05Z',true,false),
 ('00000000-0000-0000-0000-000000000002','MATANZA',2,2,2,'2026-11-02 15:10Z','2026-11-02 15:15Z',true,false),
 ('00000000-0000-0000-0000-000000000003','MATANZA',2,2,2,'2026-11-02 15:20Z','2026-11-02 15:25Z',true,true),
 ('00000000-0000-0000-0000-000000000004','MATANZA',2,1,1,'2026-11-02 15:30Z','2026-11-02 15:35Z',true,false),
 ('00000000-0000-0000-0000-000000000005','MATANZA',1,1,1,'2026-11-02 15:40Z','2026-11-02 15:45Z',true,false),
 ('00000000-0000-0000-0000-000000000006','MATANZA',0,1,1,'2026-11-02 15:50Z','2026-11-02 15:55Z',true,true);
INSERT INTO apd_scanner_pilot.staged_offers(run_id,source_offer_key,distrito,estado) VALUES
 ('00000000-0000-0000-0000-000000000001','D_100','MATANZA','Publicada'),
 ('00000000-0000-0000-0000-000000000001','D_200','MATANZA','Publicada'),
 ('00000000-0000-0000-0000-000000000002','D_100','MATANZA','Publicada'),
 ('00000000-0000-0000-0000-000000000002','D_300','MATANZA','Publicada'),
 ('00000000-0000-0000-0000-000000000003','D_100','MATANZA','Publicada'),
 ('00000000-0000-0000-0000-000000000003','D_200','MATANZA','Publicada'),
 ('00000000-0000-0000-0000-000000000004','D_400','MATANZA','Publicada'),
 ('00000000-0000-0000-0000-000000000005','D_OTHER','MATANZA','Publicada');

DO $$
DECLARE v record;
BEGIN
 SELECT * INTO v FROM apd_scanner_pilot.finalize_district('00000000-0000-0000-0000-000000000001');
 IF v.upserted<>2 OR v.pruned<>0 THEN RAISE EXCEPTION 'Unexpected first result'; END IF;
 IF NOT EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_STALE') THEN
   RAISE EXCEPTION 'Default unexpectedly deleted old offer';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM apd_scanner_pilot.current_offers
   WHERE source_offer_key='D_100' AND times_seen=5 AND first_seen_at='2026-01-01'::timestamptz) THEN
   RAISE EXCEPTION 'Existing first seen and counter not preserved';
 END IF;
END$$;

DO $$
BEGIN
 BEGIN
   PERFORM * FROM apd_scanner_pilot.finalize_district('00000000-0000-0000-0000-000000000002',false,true);
   RAISE EXCEPTION 'TEST_DID_NOT_FAIL';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'INJECTED_AFTER_UPSERT' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_300')
 OR (SELECT times_seen FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_100')<>5 THEN
   RAISE EXCEPTION 'PostgreSQL retained partial upsert after forced error';
 END IF;
 IF (SELECT status FROM apd_scanner_pilot.runs
   WHERE run_id='00000000-0000-0000-0000-000000000002')<>'ready' THEN
   RAISE EXCEPTION 'Failed transaction incorrectly finalized';
 END IF;
END$$;

DO $$
DECLARE v record;
BEGIN
 SELECT * INTO v FROM apd_scanner_pilot.finalize_district('00000000-0000-0000-0000-000000000003',true);
 IF v.upserted<>2 OR v.pruned<>1 THEN RAISE EXCEPTION 'Expected 2 upserts, 1 prune'; END IF;
 IF EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_STALE')
 OR NOT EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_OTHER' AND distrito='AVELLANEDA')
 OR (SELECT count(*) FROM apd_scanner_pilot.current_offers)<>3 THEN
   RAISE EXCEPTION 'Pruning affected another district or fresh row';
 END IF;
END$$;

DO $$
BEGIN
 BEGIN
   PERFORM * FROM apd_scanner_pilot.finalize_district('00000000-0000-0000-0000-000000000004');
   RAISE EXCEPTION 'TEST_DID_NOT_FAIL';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Staged count does not match completed scan' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM * FROM apd_scanner_pilot.finalize_district('00000000-0000-0000-0000-000000000005');
   RAISE EXCEPTION 'TEST_DID_NOT_FAIL';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Existing source key belongs to another district' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM * FROM apd_scanner_pilot.finalize_district('00000000-0000-0000-0000-000000000006',true);
   RAISE EXCEPTION 'TEST_DID_NOT_FAIL';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Pruning requires explicit nonempty, authorized capture' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM * FROM apd_scanner_pilot.finalize_district('00000000-0000-0000-0000-000000000003',true);
   RAISE EXCEPTION 'TEST_DID_NOT_FAIL';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Run already finalized' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers
   WHERE source_offer_key IN ('D_400','D_300')) OR
 (SELECT times_seen FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_100')<>6 OR
 (SELECT count(*) FROM apd_scanner_pilot.current_offers)<>3 THEN
   RAISE EXCEPTION 'Failed or replayed runs changed current rows';
 END IF;
END$$;
SELECT 'PASS: real PG17 rollback, default no pruning, scoped delete, collision, stage count, idempotency' AS result;
SQL

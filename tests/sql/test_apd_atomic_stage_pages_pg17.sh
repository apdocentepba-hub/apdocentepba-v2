#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_atomic_district_pilot_pg17.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_atomic_stage_pages_pg17.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
SET client_min_messages TO warning;
INSERT INTO apd_scanner_pilot.current_offers
 (source_offer_key,distrito,estado,first_seen_at,last_seen_at,times_seen)
VALUES ('D_1','MATANZA','Publicada','2026-01-01','2026-10-01',4),
       ('D_STALE','MATANZA','Publicada','2026-01-01','2026-10-01',1),
       ('D_OTHER','AVELLANEDA','Publicada','2026-01-01','2026-10-01',3);

INSERT INTO apd_scanner_pilot.runs
 (run_id,distrito,expected_offers,expected_pages,completed_pages,capture_started_at,captured_at,stage_verified)
VALUES
 ('00000000-0000-0000-0000-000000000101','MATANZA',0,5,0,'2026-11-02 15:00Z','2026-11-02 15:05Z',false),
 ('00000000-0000-0000-0000-000000000102','MATANZA',0,2,0,'2026-11-02 15:06Z','2026-11-02 15:07Z',false),
 ('00000000-0000-0000-0000-000000000103','MATANZA',0,2,0,'2026-11-02 15:08Z','2026-11-02 15:09Z',false);

-- Rehearse five real pages of 150,150,150,150,50 (source 650).
DO $$
DECLARE idx integer; n integer; payload jsonb; result integer;
BEGIN
 FOR idx IN 0..4 LOOP
   n := least(150,650-idx*150);
   SELECT jsonb_agg(jsonb_build_object(
       'source_offer_key','D_'||(idx*150+j),
       'distrito','MATANZA','estado','Publicada') ORDER BY j)
   INTO payload FROM generate_series(1,n) j;
   result:=apd_scanner_pilot.stage_page(
     '00000000-0000-0000-0000-000000000101',idx,650,payload);
   IF result<>idx+1 THEN RAISE EXCEPTION 'Page progress mismatch'; END IF;
   IF idx=0 THEN
     result:=apd_scanner_pilot.stage_page(
       '00000000-0000-0000-0000-000000000101',idx,650,payload);
     IF result<>1 THEN RAISE EXCEPTION 'Identical replay changed progress'; END IF;
   END IF;
 END LOOP;
 IF (SELECT count(*) FROM apd_scanner_pilot.staged_offers
     WHERE run_id='00000000-0000-0000-0000-000000000101')<>650 THEN
   RAISE EXCEPTION 'Expected 650 staged unique offers';
 END IF;
 IF apd_scanner_pilot.seal_capture('00000000-0000-0000-0000-000000000101')<>650
 OR apd_scanner_pilot.seal_capture('00000000-0000-0000-0000-000000000101')<>650 THEN
   RAISE EXCEPTION 'Seal should accept full capture and exact retry';
 END IF;
END$$;

-- No production-style deletion unless explicitly requested.
DO $$
DECLARE v record;
BEGIN
 SELECT * INTO v FROM apd_scanner_pilot.finalize_district(
   '00000000-0000-0000-0000-000000000101');
 IF v.upserted<>650 OR v.pruned<>0 THEN RAISE EXCEPTION 'Finalize count mismatch'; END IF;
 IF (SELECT count(*) FROM apd_scanner_pilot.current_offers)<>652 OR
    NOT EXISTS(SELECT 1 FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_STALE') OR
    (SELECT first_seen_at FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_1') <>
      '2026-01-01'::timestamptz OR
    (SELECT times_seen FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_1')<>5 OR
    (SELECT distrito FROM apd_scanner_pilot.current_offers WHERE source_offer_key='D_OTHER')<>'AVELLANEDA'
 THEN RAISE EXCEPTION 'Non-destructive apply changed existing data unexpectedly'; END IF;
END$$;

-- Second run: rejected partial progress, source count drift, changed replay.
DO $$
DECLARE first_page jsonb:='[{"source_offer_key":"D_701","distrito":"MATANZA","estado":"Publicada"}]'::jsonb;
BEGIN
 IF apd_scanner_pilot.stage_page('00000000-0000-0000-0000-000000000102',0,2,first_page)<>1 THEN
   RAISE EXCEPTION 'First page did not stage'; END IF;
 BEGIN
   PERFORM apd_scanner_pilot.seal_capture('00000000-0000-0000-0000-000000000102');
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Capture pages incomplete' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM apd_scanner_pilot.stage_page('00000000-0000-0000-0000-000000000102',1,3,
     '[{"source_offer_key":"D_702","distrito":"MATANZA","estado":"Publicada"}]'::jsonb);
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Invalid page index or changed source count' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM apd_scanner_pilot.stage_page('00000000-0000-0000-0000-000000000102',0,2,
     '[{"source_offer_key":"D_999","distrito":"MATANZA","estado":"Publicada"}]'::jsonb);
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Retried page content changed' THEN RAISE; END IF;
 END;
 IF (SELECT completed_pages FROM apd_scanner_pilot.runs
    WHERE run_id='00000000-0000-0000-0000-000000000102')<>1 OR
    (SELECT count(*) FROM apd_scanner_pilot.staged_offers
    WHERE run_id='00000000-0000-0000-0000-000000000102')<>1 THEN
   RAISE EXCEPTION 'Invalid pages left partial stage';
 END IF;
END$$;

-- Duplicate offer across pages must roll back the whole offending page.
DO $$
BEGIN
 PERFORM apd_scanner_pilot.stage_page('00000000-0000-0000-0000-000000000103',0,2,
  '[{"source_offer_key":"D_801","distrito":"MATANZA","estado":"Publicada"}]'::jsonb);
 BEGIN
   PERFORM apd_scanner_pilot.stage_page('00000000-0000-0000-0000-000000000103',1,2,
    '[{"source_offer_key":"D_801","distrito":"MATANZA","estado":"Publicada"}]'::jsonb);
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (SELECT completed_pages FROM apd_scanner_pilot.runs
     WHERE run_id='00000000-0000-0000-0000-000000000103')<>1 THEN
   RAISE EXCEPTION 'Duplicate page advanced progress';
 END IF;
 PERFORM apd_scanner_pilot.stage_page('00000000-0000-0000-0000-000000000103',1,2,
    '[{"source_offer_key":"D_802","distrito":"MATANZA","estado":"Publicada"}]'::jsonb);
 IF apd_scanner_pilot.seal_capture('00000000-0000-0000-0000-000000000103')<>2 THEN
   RAISE EXCEPTION 'Valid retry after rejected duplicate failed';
 END IF;
END$$;

-- Failed atomic finalization must not upsert any partial row.
DO $$
BEGIN
 BEGIN
   PERFORM * FROM apd_scanner_pilot.finalize_district(
    '00000000-0000-0000-0000-000000000103',false,true);
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'INJECTED_AFTER_UPSERT' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM apd_scanner_pilot.current_offers
   WHERE source_offer_key IN ('D_801','D_802')) OR
  (SELECT status FROM apd_scanner_pilot.runs
   WHERE run_id='00000000-0000-0000-0000-000000000103')<>'ready' THEN
   RAISE EXCEPTION 'Atomic rollback failed';
 END IF;
END$$;

-- Idempotent stage replay is forbidden once already sealed/finalized.
DO $$
BEGIN
 BEGIN
   PERFORM apd_scanner_pilot.stage_page(
    '00000000-0000-0000-0000-000000000101',0,650,'[]'::jsonb);
   RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Run sealed or finalized' THEN RAISE; END IF;
 END;
END$$;

SELECT 'PASS: 650 offers in 5 pages; stable source count; idempotent retry; real PG17 atomic finalize rollback' AS result;
SQL

\set ON_ERROR_STOP on
-- ONLY FOR EPHEMERAL CI DATABASE; NEVER RUN ON PRODUCTION.
-- Probe that newly added objects can be rolled back transactionally, while
-- all preexisting scan/offer data and captured test row survive intact.
DO $assert$
BEGIN
 IF current_database() <> 'apd_history_test' THEN
   RAISE EXCEPTION 'RECOVERY_DRILL_REFUSED: requires apd_history_test';
 END IF;
 IF to_regclass('public.apd_daily_province_summary') IS NULL
    OR to_regprocedure('public.capture_apd_daily_province_summary(date)') IS NULL THEN
   RAISE EXCEPTION 'RECOVERY_DRILL_REFUSED: migration not present';
 END IF;
 IF (SELECT count(*) FROM public.apd_daily_province_summary) <> 1 THEN
   RAISE EXCEPTION 'RECOVERY_DRILL_REFUSED: fixture daily row missing';
 END IF;
END;
$assert$;

BEGIN;
SAVEPOINT recovery_probe;
DROP FUNCTION public.capture_apd_daily_province_summary(date);
DROP TABLE public.apd_daily_province_summary;
DO $assert$
BEGIN
 IF to_regclass('public.apd_daily_province_summary') IS NOT NULL
   OR to_regprocedure('public.capture_apd_daily_province_summary(date)') IS NOT NULL THEN
   RAISE EXCEPTION 'New objects survived schema recovery probe';
 END IF;
 IF (SELECT count(*) FROM public.apd_ofertas_global_current) <> 4
    OR (SELECT count(*) FROM public.apd_global_scan_state WHERE scope='PROVINCIA_FULL') <> 1 THEN
   RAISE EXCEPTION 'Existing scanner data changed during recovery probe';
 END IF;
END;
$assert$;
ROLLBACK TO SAVEPOINT recovery_probe;

DO $assert$
BEGIN
 IF to_regclass('public.apd_daily_province_summary') IS NULL
   OR to_regprocedure('public.capture_apd_daily_province_summary(date)') IS NULL
   OR (SELECT count(*) FROM public.apd_daily_province_summary) <> 1 THEN
   RAISE EXCEPTION 'Transactional rollback did not restore new objects and fixture';
 END IF;
 IF (SELECT count(*) FROM public.apd_ofertas_global_current) <> 4
   OR (SELECT count(*) FROM public.apd_global_scan_state WHERE scope='PROVINCIA_FULL') <> 1 THEN
   RAISE EXCEPTION 'Scanner base changed after rollback';
 END IF;
END;
$assert$;
ROLLBACK;

DO $assert$
BEGIN
 IF to_regclass('public.apd_daily_province_summary') IS NULL
   OR (SELECT count(*) FROM public.apd_daily_province_summary) <> 1
   OR (SELECT count(*) FROM public.apd_ofertas_global_current) <> 4 THEN
   RAISE EXCEPTION 'Recovery smoke failed after transaction rollback';
 END IF;
END;
$assert$;
SELECT 'APD_HISTORY_DDL_RECOVERY_ISOLATED_OK' AS result;

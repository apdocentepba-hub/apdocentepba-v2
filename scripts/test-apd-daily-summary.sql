\set ON_ERROR_STOP on
-- Base aislada temporal del CI. JAMAS ejecutar contra Supabase productivo.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
-- El rol real de Supabase posee BYPASSRLS: simularlo en CI.
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.apd_global_scan_state (
  scope text PRIMARY KEY, status text, mode text, started_at timestamptz,
  finished_at timestamptz, total_districts integer,
  districts_completed integer, offers_processed bigint, notes jsonb
);
CREATE TABLE public.apd_ofertas_global_current (
  source_offer_key text PRIMARY KEY, distrito text,
  last_seen_at timestamptz NOT NULL
);
-- El servicio obtiene lectura del estado y de las ofertas, igual que el Worker real.
GRANT USAGE ON SCHEMA public TO service_role;
-- SELECT FOR UPDATE requires UPDATE privilege on the locked table.
-- Real Supabase service_role has this; the CI simulation must mirror it.
GRANT SELECT, UPDATE ON public.apd_global_scan_state TO service_role;
GRANT SELECT ON public.apd_ofertas_global_current TO service_role;
\ir ../sql/apd_daily_province_summary_20261102.sql
INSERT INTO public.apd_global_scan_state
(scope,status,mode,started_at,finished_at,total_districts,districts_completed,offers_processed,notes)
VALUES ('PROVINCIA_FULL','finished','current_published','2026-11-02T03:01:16Z',
'2026-11-02T07:33:18Z',137,137,3,'{"completed_scan_date":"2026-11-02"}');
INSERT INTO public.apd_ofertas_global_current
(source_offer_key,distrito,last_seen_at)
VALUES ('a1','AVELLANEDA','2026-11-02T04:00:00Z'),
('a2','AVELLANEDA','2026-11-02T05:00:00Z'),
('a3','QUILMES','2026-11-02T07:00:00Z');

DO $test$
DECLARE r record; summary record;
BEGIN
 SELECT * INTO r FROM public.capture_apd_daily_province_summary('2026-11-02');
 IF r.saved IS DISTINCT FROM true OR r.offers <> 3 OR r.districts_with_offers <> 2 THEN
  RAISE EXCEPTION 'summary error %',to_jsonb(r);
 END IF;
 SELECT * INTO summary FROM public.apd_daily_province_summary WHERE scan_date='2026-11-02';
 IF summary.total_districts<>137 OR summary.offers_total<>3
   OR summary.district_offer_counts->>'AVELLANEDA'<>'2'
   OR summary.district_offer_counts->>'QUILMES'<>'1'
   OR (SELECT count(*) FROM jsonb_object_keys(summary.district_offer_counts))<>2 THEN
  RAISE EXCEPTION 'counts error %',to_jsonb(summary);
 END IF;
 -- Idempotente: un reintento NO crea ni reescribe el mismo día.
 SELECT * INTO r FROM public.capture_apd_daily_province_summary('2026-11-02');
 IF r.saved IS DISTINCT FROM false THEN RAISE EXCEPTION 'duplicate snapshot'; END IF;
 IF (SELECT count(*) FROM public.apd_daily_province_summary)<>1 THEN
  RAISE EXCEPTION 'duplicate daily row';
 END IF;
 IF has_table_privilege('anon','public.apd_daily_province_summary','SELECT')
   OR has_table_privilege('authenticated','public.apd_daily_province_summary','SELECT')
   OR has_function_privilege('anon','public.capture_apd_daily_province_summary(date)','EXECUTE')
   OR has_function_privilege('authenticated','public.capture_apd_daily_province_summary(date)','EXECUTE') THEN
  RAISE EXCEPTION 'RLS/grants public exposure';
 END IF;
END;
$test$;

-- Repetir la escritura con el rol REAL del Worker, no solamente postgres.
-- Solo en la base efímera de CI: borrar la fila ficticia y volver a capturarla.
DELETE FROM public.apd_daily_province_summary WHERE scan_date='2026-11-02';
SET ROLE service_role;
DO $test$
DECLARE r record; saved_count bigint;
BEGIN
 SELECT * INTO r FROM public.capture_apd_daily_province_summary('2026-11-02');
 IF r.saved IS DISTINCT FROM true OR r.offers<>3 OR r.districts_with_offers<>2 THEN
  RAISE EXCEPTION 'service_role no pudo guardar resumen: %',to_jsonb(r);
 END IF;
 SELECT count(*) INTO saved_count FROM public.apd_daily_province_summary;
 IF saved_count<>1 THEN RAISE EXCEPTION 'service_role no puede leer su resumen'; END IF;
 SELECT * INTO r FROM public.capture_apd_daily_province_summary('2026-11-02');
 IF r.saved IS DISTINCT FROM false THEN RAISE EXCEPTION 'service_role duplicó resumen'; END IF;
END;
$test$;
RESET ROLE;

-- Un escaneo parcial se rechaza, sin escribir la tabla.
UPDATE public.apd_global_scan_state SET status='running';
DO $test$
BEGIN
 BEGIN
  PERFORM public.capture_apd_daily_province_summary('2026-11-02');
  RAISE EXCEPTION 'Expected rejection for running scan';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Expected rejection for running scan' THEN RAISE; END IF;
 END;
END;
$test$;

UPDATE public.apd_global_scan_state SET status='finished',offers_processed=4;
DO $test$
BEGIN
 BEGIN
  PERFORM public.capture_apd_daily_province_summary('2026-11-02');
  RAISE EXCEPTION 'Expected rejection for mismatch';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Expected rejection for mismatch' THEN RAISE; END IF;
 END;
END;
$test$;

UPDATE public.apd_global_scan_state SET offers_processed=3;
DO $test$
BEGIN
 BEGIN
  PERFORM public.capture_apd_daily_province_summary('2026-11-01');
  RAISE EXCEPTION 'Expected rejection for stale date';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Expected rejection for stale date' THEN RAISE; END IF;
 END;
END;
$test$;

-- Seguridad: fuera de las horas de la captura no se agregan ofertas por error.
INSERT INTO public.apd_ofertas_global_current
(source_offer_key,distrito,last_seen_at)
VALUES ('old','LANUS','2026-10-30T04:00:00Z');
UPDATE public.apd_global_scan_state SET finished_at='2026-11-02T07:45:00Z';
DO $test$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM public.capture_apd_daily_province_summary('2026-11-02');
 IF NOT r.saved OR r.offers<>3 OR r.districts_with_offers<>2 THEN
  RAISE EXCEPTION 'old records leaked into today';
 END IF;
 IF (SELECT count(*) FROM public.apd_daily_province_summary)<>1 THEN
  RAISE EXCEPTION 'unexpected duplicate';
 END IF;
END;
$test$;
SELECT 'APD_DAILY_SUMMARY_POSTGRES_OK' AS result;

-- APDocentePBA / HISTORY / READ-ONLY PREFLIGHT.
-- Solo SELECT; no migración, RPC, cron, cambios de permisos ni escrituras.
-- "ready_to_review_migration" NO autoriza ni implica activar producción.
WITH scan AS (
 SELECT scope, status, mode, started_at, finished_at, total_districts,
        districts_completed, offers_processed, notes->>'completed_scan_date' scan_date
 FROM public.apd_global_scan_state
 WHERE scope='PROVINCIA_FULL'
 LIMIT 1
), counts AS (
 SELECT count(*)::bigint all_current,
   count(*) FILTER (WHERE o.last_seen_at BETWEEN s.started_at AND s.finished_at)::bigint within_scan,
   count(*) FILTER (WHERE o.last_seen_at BETWEEN s.started_at AND s.finished_at
                   AND nullif(btrim(o.distrito),'') IS NULL)::bigint missing_district,
   count(DISTINCT btrim(o.distrito)) FILTER (
     WHERE o.last_seen_at BETWEEN s.started_at AND s.finished_at
   )::integer districts_with_offers
 FROM public.apd_ofertas_global_current o CROSS JOIN scan s
), checks AS (
 SELECT s.*, c.*,
   (s.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date local_start_day,
   (s.finished_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date local_end_day,
   (s.status='finished' AND s.mode='current_published'
      AND s.total_districts>0 AND s.districts_completed=s.total_districts
      AND s.started_at IS NOT NULL AND s.finished_at>s.started_at
      AND s.scan_date IS NOT NULL
      AND to_char(s.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD')=s.scan_date
      AND to_char(s.finished_at AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD')=s.scan_date
      AND c.within_scan=s.offers_processed
      AND c.missing_district=0 AND c.districts_with_offers <= s.total_districts
   ) IS TRUE scan_consistent
 FROM scan s CROSS JOIN counts c
)
SELECT
 scope, status, mode, scan_date, local_start_day, local_end_day,
 total_districts, districts_completed, offers_processed,
 all_current, within_scan, missing_district, districts_with_offers,
 scan_consistent,
 pg_size_pretty(pg_database_size(current_database())) database_size,
 pg_size_pretty(pg_total_relation_size('public.apd_ofertas_global_snapshots')) legacy_snapshot_size,
 to_regclass('public.apd_daily_province_summary') IS NOT NULL summary_table_exists,
 to_regprocedure('public.capture_apd_daily_province_summary(date)') IS NOT NULL summary_rpc_exists,
 coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.apd_daily_province_summary')),false) summary_rls_enabled,
 has_table_privilege('service_role','public.apd_global_scan_state','SELECT,UPDATE') service_can_lock_scan,
 has_table_privilege('service_role','public.apd_ofertas_global_current','SELECT') service_can_read_offers,
 coalesce(has_function_privilege('service_role',to_regprocedure('public.capture_apd_daily_province_summary(date)'),'EXECUTE'),false) service_can_execute_rpc,
 (scan_consistent
   AND has_table_privilege('service_role','public.apd_global_scan_state','SELECT,UPDATE')
   AND has_table_privilege('service_role','public.apd_ofertas_global_current','SELECT')) ready_to_review_migration
FROM checks;

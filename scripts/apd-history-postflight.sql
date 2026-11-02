-- APDocentePBA: comprobacion READ-ONLY posterior a instalar la migracion.
-- Solo ejecutar tras crear tabla y RPC: si faltan, la consulta debe FALLAR.
-- No captura datos ni altera permisos; devuelve dos banderas diferenciadas:
--   security_ok: tabla privada + RPC solo server + RLS/PK/security invoker.
--   empty_for_first_capture: no hay resúmenes previos (solo fase inicial).
WITH access AS (
 SELECT
   has_table_privilege('service_role','public.apd_daily_province_summary','SELECT') AS svc_read,
   has_table_privilege('service_role','public.apd_daily_province_summary','INSERT') AS svc_insert,
   has_table_privilege('service_role','public.apd_daily_province_summary','UPDATE') AS svc_update,
   has_function_privilege('service_role','public.capture_apd_daily_province_summary(date)','EXECUTE') AS svc_execute,
   NOT (
     has_table_privilege('anon','public.apd_daily_province_summary','SELECT') OR
     has_table_privilege('anon','public.apd_daily_province_summary','INSERT') OR
     has_table_privilege('anon','public.apd_daily_province_summary','UPDATE') OR
     has_table_privilege('anon','public.apd_daily_province_summary','DELETE') OR
     has_table_privilege('authenticated','public.apd_daily_province_summary','SELECT') OR
     has_table_privilege('authenticated','public.apd_daily_province_summary','INSERT') OR
     has_table_privilege('authenticated','public.apd_daily_province_summary','UPDATE') OR
     has_table_privilege('authenticated','public.apd_daily_province_summary','DELETE')
   ) AS no_client_table_access,
   NOT (
     has_function_privilege('anon','public.capture_apd_daily_province_summary(date)','EXECUTE') OR
     has_function_privilege('authenticated','public.capture_apd_daily_province_summary(date)','EXECUTE')
   ) AS no_client_rpc_access
), structure AS (
 SELECT
   c.relrowsecurity AS rls_enabled,
   (SELECT count(*)::integer FROM pg_policy WHERE polrelid=c.oid) AS policy_count,
   EXISTS (
     SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary
   ) AS primary_key_present
 FROM pg_class c WHERE c.oid='public.apd_daily_province_summary'::regclass
), function_meta AS (
 SELECT NOT p.prosecdef AS security_invoker
 FROM pg_proc p
 WHERE p.oid='public.capture_apd_daily_province_summary(date)'::regprocedure
), counts AS (
 SELECT count(*)::bigint AS daily_rows FROM public.apd_daily_province_summary
)
SELECT
 a.svc_read,a.svc_insert,a.svc_update,a.svc_execute,
 a.no_client_table_access,a.no_client_rpc_access,
 s.rls_enabled,s.policy_count,s.primary_key_present,
 f.security_invoker,c.daily_rows,
 (a.svc_read AND a.svc_insert AND a.svc_update AND a.svc_execute
   AND a.no_client_table_access AND a.no_client_rpc_access
   AND s.rls_enabled AND s.policy_count=0
   AND s.primary_key_present AND f.security_invoker) AS security_ok,
 (c.daily_rows=0) AS empty_for_first_capture
FROM access a CROSS JOIN structure s CROSS JOIN function_meta f CROSS JOIN counts c;

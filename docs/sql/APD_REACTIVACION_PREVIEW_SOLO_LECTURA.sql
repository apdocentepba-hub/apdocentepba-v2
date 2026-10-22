-- APDocente — cohorte de reactivación, VISTA PREVIA / SOLO LECTURA.
-- Nunca ejecuta envíos ni edita datos. Los resultados se consultan únicamente
-- en el proyecto privado por el administrador. No exportar datos personales a GitHub.
--
-- IMPORTANTE:
--   * alertas_email=true significa preferencias de alertas docentes, NO
--     autorización automáticamente demostrada para marketing/reactivación.
--   * consentimiento_datos NO equivale a consentimiento comercial.
--   * No hay campo verificado de opt-in de marketing, ni de supresión de Brevo.
--     Hasta resolverlo, TODOS los candidatos tienen envio_autorizado=false.
--   * Recalcular al momento de cada eventual envío; nunca usar una lista guardada.
--
-- A. DISTRIBUCIÓN DE LA AUDIENCIA CANDIDATA.
WITH subscription_rollup AS (
 SELECT u.id, u.activo, u.es_admin, u.email, u.ultimo_login,
    COALESCE(bool_or(
      upper(s.status)='BETA'
      OR (upper(s.status)='ACTIVE' AND upper(s.plan_code)='INSIGNE'
        AND s.source='manual_admin_grant' AND s.current_period_ends_at IS NULL)
      OR (upper(s.status) IN ('ACTIVE','TRIALING')
        AND (upper(s.plan_code)='TRIAL_7D' OR upper(s.status)='TRIALING')
        AND s.trial_ends_at>=now())
      OR (upper(s.status) IN ('ACTIVE','AUTHORIZED','PENDING','PAUSED')
        AND upper(s.plan_code)<>'TRIAL_7D'
        AND s.current_period_ends_at>=now())
    ),false) AS vigente,
    COALESCE(bool_or(s.source='manual_admin_grant'
      OR s.current_period_ends_at >= '2099-01-01'::timestamptz),false) AS excepcion,
    max(CASE WHEN upper(s.plan_code)='TRIAL_7D' OR upper(s.status)='TRIALING'
      THEN s.trial_ends_at ELSE s.current_period_ends_at END) AS ultimo_vencimiento
 FROM public.users u LEFT JOIN public.user_subscriptions s ON s.user_id=u.id
 GROUP BY u.id
), audit AS (
 SELECT x.id,x.ultimo_vencimiento,latest.plan_code,
     pref.alertas_email,pref.alertas_activas,
     EXISTS(SELECT 1 FROM public.notification_delivery_logs log
       WHERE log.user_id=x.id
         AND log.template_code IN ('apd_subscription_expired_v1','apd_reactivation_202610_v1')
         AND (log.status LIKE 'sent_%' OR log.status LIKE 'sending_%')) AS aviso_previo,
     EXISTS(SELECT 1 FROM public.notification_delivery_logs log
       WHERE log.user_id=x.id AND log.status LIKE 'failed_%') AS envios_fallidos
 FROM subscription_rollup x
 JOIN LATERAL (SELECT s.plan_code FROM public.user_subscriptions s
   WHERE s.user_id=x.id ORDER BY s.created_at DESC,s.id DESC LIMIT 1) latest ON true
 LEFT JOIN public.user_preferences pref ON pref.user_id=x.id
 WHERE x.activo IS TRUE AND x.es_admin IS NOT TRUE
   AND NOT x.vigente AND NOT x.excepcion
   AND x.ultimo_vencimiento < now()-interval '7 days'
   AND x.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
)
SELECT upper(plan_code) AS ultimo_plan,COUNT(*) AS candidatos,
   count(*) FILTER(WHERE alertas_email IS TRUE) AS alertas_email_activadas,
   count(*) FILTER(WHERE alertas_email IS FALSE) AS alertas_email_desactivadas,
   count(*) FILTER(WHERE alertas_email IS NULL) AS sin_preferencia_de_email,
   count(*) FILTER(WHERE aviso_previo) AS avisados_antes,
   count(*) FILTER(WHERE envios_fallidos) AS registrar_error_de_envio,
   false AS envio_autorizado
FROM audit GROUP BY upper(plan_code) ORDER BY ultimo_plan;

-- B. RESUMEN: NO TRAE DIRECCIONES DE CORREO NI NOMBRES.
WITH candidates AS (
 SELECT u.id,u.email,u.activo,u.es_admin,
    COALESCE(bool_or(s.status='BETA'
      OR (s.status='ACTIVE' AND s.plan_code='INSIGNE' AND s.source='manual_admin_grant'
        AND s.current_period_ends_at IS NULL)
      OR (s.status IN ('ACTIVE','TRIALING') AND
        (s.plan_code='TRIAL_7D' OR s.status='TRIALING') AND s.trial_ends_at>now())
      OR (s.status IN ('ACTIVE','AUTHORIZED','PENDING','PAUSED')
        AND s.plan_code<>'TRIAL_7D' AND s.current_period_ends_at>now())),false) AS active,
    COALESCE(bool_or(s.source='manual_admin_grant'
      OR s.current_period_ends_at>='2099-01-01'::timestamptz),false) AS special,
    max(CASE WHEN s.plan_code='TRIAL_7D' THEN s.trial_ends_at
      ELSE s.current_period_ends_at END) AS expired_at
 FROM public.users u LEFT JOIN public.user_subscriptions s ON s.user_id=u.id
 GROUP BY u.id
)
SELECT COUNT(*) FILTER(WHERE activo IS TRUE AND es_admin IS NOT TRUE AND NOT active
 AND NOT special AND expired_at<now()-interval '7 days'
 AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') AS candidatos_validos_de_formato,
 0::integer AS envios_habilitados_hasta_integrar_consentimiento_y_bajas
FROM candidates;

-- C. PARA REVISIÓN INDIVIDUAL PRIVADA EN SUPABASE SOLAMENTE:
-- elaborar luego una consulta autorizada de cada cuenta, sin reutilizar
-- informes exportados ni considerar alertas_email un consentimiento comercial.
-- No se adjuntan listas nominales ni direcciones en este repositorio.

-- APDocente — auditoría SOLO LECTURA. Ninguna operación de modificación.
-- Re-ejecutar con rol de auditoría server-side autorizado.
-- IMPORTANTE: no considerar status='ACTIVE' suficiente sin comprobar fechas.

-- A. Suscripciones y acceso efectivo, según la lógica vigente del Worker.
WITH derechos AS (
  SELECT u.id,
  COALESCE(bool_or(
    s.status='BETA'
    OR (s.status='ACTIVE' AND s.plan_code='INSIGNE'
      AND s.source='manual_admin_grant' AND s.current_period_ends_at IS NULL)
    OR (s.status IN ('ACTIVE','TRIALING')
      AND (s.plan_code='TRIAL_7D' OR s.status='TRIALING')
      AND s.trial_ends_at >= now())
    OR (s.status IN ('ACTIVE','AUTHORIZED','PENDING','PAUSED')
      AND s.plan_code<>'TRIAL_7D'
      AND s.current_period_ends_at >= now())
  ),false) AS tiene_derecho
  FROM public.users u
  LEFT JOIN public.user_subscriptions s ON s.user_id=u.id
  GROUP BY u.id
)
SELECT count(*) AS usuarios,
count(*) FILTER(WHERE tiene_derecho) AS con_derecho_vigente,
count(*) FILTER(WHERE NOT tiene_derecho) AS sin_derecho_vigente
FROM derechos;

-- B. Correo: envíos sin fila que justifique vigencia al momento de enviarse.
-- Es una comprobación retrospectiva aproximada con el status ACTUAL de las filas.
SELECT count(*) AS correos_digest_30d,
count(DISTINCT l.user_id) AS usuarios_receptores,
count(*) FILTER (WHERE NOT EXISTS (
  SELECT 1 FROM public.user_subscriptions s WHERE s.user_id=l.user_id
  AND upper(s.status) IN ('ACTIVE','TRIALING','AUTHORIZED','PENDING','PAUSED','BETA')
  AND (
    upper(s.status)='BETA'
    OR (upper(s.status)='ACTIVE' AND upper(s.plan_code)='INSIGNE'
      AND s.source='manual_admin_grant' AND s.current_period_ends_at IS NULL)
    OR ((upper(s.plan_code)='TRIAL_7D' OR upper(s.status)='TRIALING')
      AND s.trial_ends_at >= l.created_at)
    OR ((upper(s.plan_code)<>'TRIAL_7D' AND upper(s.status)<>'TRIALING')
      AND s.current_period_ends_at >= l.created_at)
  )
)) AS digests_sin_fila_vigente_al_enviar
FROM public.notification_delivery_logs l
WHERE l.created_at >= now()-interval '30 days'
AND l.status='sent_alert_digest';

-- C. Avisos de vencimiento; NO tomar este resultado como autorización de envíos.
WITH uplan AS (
 SELECT u.id,u.activo,u.es_admin,
 COALESCE(bool_or(
  s.status='BETA'
  OR (s.status='ACTIVE' AND s.plan_code='INSIGNE'
     AND s.source='manual_admin_grant' AND s.current_period_ends_at IS NULL)
  OR (s.status IN ('ACTIVE','TRIALING')
    AND (s.plan_code='TRIAL_7D' OR s.status='TRIALING')
    AND s.trial_ends_at >= now())
  OR (s.status IN ('ACTIVE','AUTHORIZED','PENDING','PAUSED')
    AND s.plan_code<>'TRIAL_7D' AND s.current_period_ends_at >=now())
 ), false) AS tiene_derecho,
 max(CASE WHEN s.plan_code='TRIAL_7D' THEN s.trial_ends_at
 ELSE s.current_period_ends_at END) AS ultima_fecha_fin
 FROM public.users u
 LEFT JOIN public.user_subscriptions s ON s.user_id=u.id
 GROUP BY u.id,u.activo,u.es_admin
)
SELECT count(*) FILTER(WHERE NOT tiene_derecho AND activo AND NOT es_admin
 AND ultima_fecha_fin < now()-interval '7 days') AS vencidos_mas_de_7d,
count(*) FILTER(WHERE NOT tiene_derecho AND activo AND NOT es_admin
 AND ultima_fecha_fin < now()-interval '7 days'
 AND NOT EXISTS (SELECT 1 FROM public.notification_delivery_logs l
 WHERE l.user_id=uplan.id AND l.status='sent_expiry_notice'
 AND l.template_code='apd_subscription_expired_v1')) AS vencidos_sin_aviso_registrado
FROM uplan;

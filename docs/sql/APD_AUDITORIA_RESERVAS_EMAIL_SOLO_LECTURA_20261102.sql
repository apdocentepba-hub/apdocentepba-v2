-- APDocentePBA / AUDITORIA DE ENTREGA / SOLO LECTURA.
-- No consulta direcciones, usuarios, contenido, payload ni identificadores de mensajes.
-- No envía/reintenta correos; no actualiza reservas ni altera claves de deduplicación.

-- A. Estados agregados del canal email en las últimas dos semanas.
SELECT channel, status,
       count(*) AS total,
       count(*) FILTER (WHERE provider_message_id IS NOT NULL) AS con_id_proveedor,
       min(created_at) AS primer_registro,
       max(created_at) AS ultimo_registro
FROM public.notification_delivery_logs
WHERE channel='email' AND created_at>=now()-interval '14 days'
GROUP BY channel,status
ORDER BY total DESC, status;

-- B. Reservas que nunca recibieron estado terminal, incluso fuera de la ventana anterior.
WITH reservadas AS (
 SELECT id,created_at,dedupe_key
 FROM public.notification_delivery_logs
 WHERE channel='email' AND status='sending_alert_digest'
), pendientes AS (
 SELECT r.*,
   EXISTS (
     SELECT 1
     FROM public.notification_delivery_logs other
     WHERE other.id<>r.id
       AND other.dedupe_key=r.dedupe_key
       AND other.status='sent_alert_digest'
   ) AS tiene_otro_registro_enviado
 FROM reservadas r
)
SELECT count(*) AS reservas_indeterminadas,
       count(*) FILTER(WHERE created_at<now()-interval '2 hours') AS mayores_dos_horas,
       count(*) FILTER(WHERE created_at<now()-interval '24 hours') AS mayores_24_horas,
       count(*) FILTER(WHERE tiene_otro_registro_enviado) AS con_envio_confirmado_en_otra_fila,
       min(created_at) AS mas_antigua,
       max(created_at) AS mas_reciente
FROM pendientes;

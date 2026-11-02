# APDocentePBA — Auditoría de reservas email indeterminadas (2/11/2026)

**Alcance:** lectura de `notification_delivery_logs`; sin acceder a destinos, correos, usuarios individuales, mensajes ni claves. Sin envío, reintento ni escritura.

## Resultados observados (base de producción, 2/11/2026)

- Últimos 14 días: **109** filas `sent_alert_digest` (todas con ID del proveedor Brevo); **35** `sent_expiry_notice`; **1** `sending_alert_digest`.
- Todo el historial: **6** filas `sending_alert_digest` abiertas por más de 24 horas, entre el 25/6/2026 y el 30/10/2026.
- Ninguna de las 6 reservas tiene otra fila con el mismo `dedupe_key` marcada como `sent_alert_digest`.
- Los 109 ID de proveedor significan que se obtuvo una respuesta de aceptación/identificación; **no prueban entrega en bandeja de entrada**.
- `pending_notifications` tiene 30 filas `sent` antiguas de abril; son otra vía, no equiparables a `sent_alert_digest` sin revisar el motor.

## Riesgo técnico confirmado en el código

En el Worker compilado actual, `reserveEmailDigestDeliveryLog` inserta una fila `sending_alert_digest` con `dedupe_key` antes de llamar a Brevo. `finishEmailDigestDeliveryLog` intenta actualizarla a `sent_alert_digest` o `failed_alert_digest`. Si falla esa actualización, el error se absorbe y la reserva queda en estado indeterminado; un intento posterior con el mismo `dedupe_key` se descarta por duplicación.

**No sabemos si esas 6 reservas representan correos aceptados o intentos fallidos.** Reenviar automáticamente sería inseguro.

## Resolución propuesta (NO ejecutada)

1. Mantener reservas indeterminadas en estado no reenviable; no levantar el índice único.
2. Consultar los registros de transacción del proveedor, cuando exista autorización segura para revisar mensajes individuales y su trazabilidad, antes de decidir si fueron entregados/rechazados.
3. Agregar alarma agregada para reservas `sending_alert_digest` con antigüedad mayor a 2 horas; sin destinos ni PII.
4. Diseñar un estado terminal `unknown_delivery` en un futuro PR, preservando `dedupe_key` para no reenviar sin evidencia.
5. En etapa separada, instrumentar eventos de entrega/rebote de Brevo con autenticación y validación de webhook, sin alterar el envío actual hasta superar pruebas.
6. No contactar a terceros ni modificar estados productivos sin autorización.

## Consulta reproducible

`docs/sql/APD_AUDITORIA_RESERVAS_EMAIL_SOLO_LECTURA_20261102.sql`

Este archivo contiene únicamente agregaciones SELECT. Se contrastó la estructura de la reserva y finalización con el archivo `worker-live/worker_hotfix.js`. Solo describe lo conocido y no interpreta `sent` como `delivered`.

# Telegram APDocentePBA — diagnóstico y candidato (07/11/2026)

## Alcance y estado
- Se confirmó en Supabase que cinco cuentas habilitaron Telegram; tres tienen plan vigente y ofertas activas almacenadas. No hay registros de entrega `channel=telegram` en `notification_delivery_logs`.
- El bundle canónico versionado bajo `worker-live/` implementa **Telegram por consulta manual** (`ALERTAS`), no difusión programada. El snapshot `manifest.json` se capturó el 24/10/2026: NO constituye verificación de la versión actual de Cloudflare.
- El frontend no puede declarar un canal operativo solo por `alertas_telegram=true`; también exige `connected=true`, un `chat_id` guardado en KV y webhook funcional.

## Defectos corregidos en el candidato de rama
1. **Seguridad webhook:** `requireTelegramWebhookSecret` antes permitía una petición sin firma si faltaba la variable `TELEGRAM_WEBHOOK_SECRET`. El candidato falla cerrado (HTTP 503) hasta que se configure.
2. **Vinculación falsa:** antes se guardaba `connected=true` y se devolvía éxito incluso cuando `sendTelegramText` fallaba silenciosamente. El candidato confirma el envío antes de persistir el vínculo; el webhook puede reintentar errores transitorios.
3. **Idempotencia:** el update de `/start` se marca procesado únicamente después de la confirmación y persistencia exitosas. Los comandos restantes conservan su deduplicación actual.
4. **Entrega engañosa:** la respuesta `ALERTAS` ya no indica `delivered:true` si `sendTelegramLongText` falló; conserva la respuesta alternativa de consultar el panel.

## Diagnóstico seguro
- Ejecutar `scripts/check-telegram-webhook-readonly.mjs` con `TELEGRAM_BOT_TOKEN` provisto **solo mediante variable de entorno segura**. Nunca pegar tokens en chats, issues o logs.
- Solo invoca `getWebhookInfo`; comprueba endpoint, suscripción a `message`, actualizaciones pendientes y existencia de un error reciente, sin mostrar URL ni token.
- Confirmar por separado en Cloudflare: versión realmente al 100 %, variable `TELEGRAM_WEBHOOK_SECRET`, `EMAIL_SWEEP_STATE` y vinculaciones KV `telegram:user:*` (sin imprimir chat IDs).
- Probar `/start` y `ALERTAS` exclusivamente con una cuenta propia autorizada. **No probar con usuarios reales ajenos.**

## Pruebas y prohibiciones
- `scripts/test-telegram-webhook-integrity.mjs`: regresión de firma obligatoria, dedupe de `/start`, honestidad del estado de entrega, preservación de rutas.
- `scripts/test-check-telegram-webhook-readonly.mjs`: diagnósticos sintéticos sin envíos.
- Este cambio es un candidato: NO fue desplegado, no cambió KV, no insertó mensajes, no tocó suscripciones ni envió alertas.
- No desplegar hasta comprobar drift del módulo productivo, autorización, CI y pruebas aisladas. La modificación del snapshot no actualiza automáticamente la versión de Cloudflare.
- PENDIENTE DE SEGURIDAD: el enlace original `/start <user_id>` usa UUID de cuenta como identificador de vinculación. Antes de ampliar distribución o publicar esta rama, reemplazarlo por nonce de vinculación de un solo uso generado bajo sesión autenticada.
- Para rollback, conservar identificador de versión activa y distribución de tráfico anteriores, restaurándolos si falla cualquier smoke test.

## Criterio para considerar resuelto
`getWebhookInfo` confirma el webhook correcto y cero errores recientes, el secreto es obligatorio, una cuenta de prueba conecta y consulta sin reportar entregas falsas, los permisos de planes y el email/WhatsApp no sufren regresiones, y el deploy queda auditado y autorizado por el propietario.

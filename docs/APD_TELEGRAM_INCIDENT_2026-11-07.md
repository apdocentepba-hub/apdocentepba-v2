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

## Ampliación de seguridad — continuación del 07/11/2026

- La PR ahora reemplaza el enlace heredado `/start <UUID de usuario>` por `/start apd_<32 hex>` (código opaco de 128 bits generado por `crypto.randomUUID`).
- Los códigos se generan exclusivamente desde `GET /api/telegram/status` autenticado o desde la respuesta de preferencias cuando existe una sesión Bearer coincidente con el usuario. Nunca se expone el UUID en el enlace.
- Cada código se guarda en `EMAIL_SWEEP_STATE` con caducidad de 600 segundos y se elimina después de confirmar el mensaje al chat y guardar la vinculación.
- No se aceptan códigos antiguos construidos a partir del UUID ni códigos expirados. El usuario debe abrir un enlace nuevo desde el panel.
- Una revinculación a un chat nuevo revoca la asociación inversa del chat anterior. Cada mensaje entrante vuelve a comprobar que el chat sigue siendo el actualmente vinculado a esa cuenta, evitando que un índice KV antiguo autorice consultas.
- El frontend del candidato informa correctamente que Telegram actualmente funciona **por consulta manual** escribiendo `ALERTAS`; la promesa previa de alertas automáticas era incorrecta.
- Pruebas aisladas: cinco casos de nonce, cinco de regresión del webhook y cinco controles específicos de revinculación y permisos se comprobaron en V8, con resultados positivos. Es **evidencia sintética**, no una prueba con Telegram real.

### Limitación antes de desplegar

Cloudflare KV no ofrece consumo transaccional atómico ni lectura global inmediatamente consistente. Borrar el código después de usarlo limita su reutilización, pero no garantiza protección absoluta ante solicitudes simultáneas desde distintas ubicaciones. Para un código de un solo uso **estricto**, migrar el consumo a una operación atómica (por ejemplo, tabla transaccional en Supabase) y comprobar el contrato en staging. También hace falta validar la entrega real de `getWebhookInfo`/webhook, el estado actual del Worker, logs de Cloudflare y que no existan regresiones.

No se cambió producción, no se desplegó el frontend y no se enviaron mensajes. El código candidato se genera únicamente en `tmp/`, conservando inmutable `worker-live/worker_hotfix.js`.

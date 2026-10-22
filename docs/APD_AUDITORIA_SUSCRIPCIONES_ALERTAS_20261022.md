# APDocente — auditoría de suscripciones y envíos (22/10/2026)

**Alcance:** lectura de base Supabase y revisión de código de Worker productivo. No se modificaron cuentas, preferencias, pagos, vencimientos ni notificaciones. Conteos y evaluación puntuales al 22/10/2026 (últimos 30 días para digest).

## Hallazgos

| Verificación | Resultado |
| --- | ---: |
| Usuarios registrados | 48 |
| Filas de suscripciones | 53 |
| Cuentas con dos suscripciones | 5 |
| Cuentas con derecho vigente según `elegirSuscripcionVigente` | 4 |
| Cuentas sin derecho vigente | 44 |
| `sent_alert_digest` email (30 días) | 221 |
| Destinatarios distintos de esos digest | 3 |
| Digest sin fila que habilitara servicio al momento del envío | **0** |
| Avisos `sent_expiry_notice` registrados | 1 |
| Vencimientos de los últimos 7 días elegibles para aviso | 1, ya avisado |
| Vencimientos anteriores a 7 días, no administrativos, sin aviso registrado | 43 |
| Cuentas sin derecho actual con digest en últimos 7 días | 0 |

**Interpretación:** `user_subscriptions.status = ACTIVE` **no es prueba de vigencia**: en múltiples registros las fechas están vencidas. El Worker de digest de correo llama a `resolverPlanUsuario` + `isPlanActivo` antes de enviar y el contraste temporal de 221 registros no mostró envíos sin acceso habilitado.

Las cuentas con más de una suscripción requieren resolver vigencia por usuario, no contar cada fila como un cliente activo. Hay beneficios `INSIGNE` extendidos hasta años futuros y un `manual_admin_grant` sin fecha de fin; jamás revocar beneficios únicamente porque `trial_ends_at` aparezca vencida cuando el plan aplicable sea Insigne.

## Brecha de WhatsApp

La función `runWhatsAppAlertsSweep` de la copia productiva comprobaba cuenta activa, teléfono y preferencias, pero **no comprobaba el plan**. No se identificaron envíos WhatsApp en `notification_delivery_logs` de los últimos 30 días y la función no aparece invocada en el bundle actual: es una **vulnerabilidad latente**, no evidencia de una notificación indebida.

Este PR agrega un generador de **versión candidata aislada y no desplegada**, introduciendo `resolverPlanUsuario` + `isPlanActivo` con comportamiento **fail-closed** en la rutina. Incluye pruebas contra casos: suscripción vencida, cuenta habilitada, error de base, canal no configurado. No se toca la captura `worker-live`, las tareas programadas ni Cloudflare de producción.

## Avisos de vencimiento pendientes

`apdProcessExpiryNotices` contempla solamente registros vencidos durante los últimos siete días y limita a tres envíos por ciclo. Encontramos 43 cuentas vencidas con anterioridad a ese plazo y **sin aviso de vencimiento registrado**. No significa necesariamente que todas quieran recibir campañas.

**No habilitar envíos masivos automáticamente.** Una campaña controlada de recuperación necesitaría deduplicación, revisión de bajas/consentimiento, cupos, elegibilidad a la fecha de envío, registro de entregas y aprobación específica. Debe excluir cuentas administrativas, activas, manuales y excepciones, y evitar avisar de nuevo a quienes ya fueron contactados.

## Pruebas y pendientes

1. Testear y aprobar la versión candidata de WhatsApp en CI; publicar mediante procedimiento específico y con rollback antes de habilitar el canal, nunca reemplazando directamente el Worker productivo.
2. Auditar rutas alternativas de Telegram y notificaciones diferidas antes de habilitar canales nuevos.
3. Mantener auditoría semanal de registros `sent_alert_digest` sin vigencia en el momento, usando el SQL de solo lectura de este PR.
4. Diseñar una campaña optativa y controlada para los 43 vencimientos históricos: sin envíos hasta aprobar destinatarios, contenido y cupos.

**Privacidad:** este informe no incluye IDs de usuarios, emails, teléfonos ni datos personales identificables.

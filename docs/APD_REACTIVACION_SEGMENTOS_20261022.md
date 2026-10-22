# APDocente — audiencia de reactivación (22/10/2026)

**Estado:** solo preparación. **0 envíos**. No se enviaron correos. Sin cambios en producción, usuarios, suscripciones, consentimiento o notificaciones.

## Cruce de base: 43 cuentas históricamente vencidas

| Segmento de última suscripción | Cuentas | Alertas por email activas | Email desactivado | Sin selección de email |
|---|---:|---:|---:|---:|
| Prueba TRIAL_7D | 39 | 7 | 3 | 29 |
| PLUS | 1 | 1 | 0 | 0 |
| INSIGNE | 3 | 3 | 0 | 0 |
| **Total** | **43** | **11** | **3** | **29** |

Características de este subconjunto:
- Cuentas activas, no administradoras, sin derecho vigente, sin asignaciones manuales y sin fechas extendidas desde 2099; último vencimiento hace más de 7 días.
- Correos con sintaxis válida: 43 (esto NO demuestra entregabilidad).
- Aviso de expiración/reincorporación ya registrado: 0.
- Historial de errores de algún envío: 1 (requiere revisión de proveedor).
- Sesión en últimos 30 días: 5; en últimos 90 días: 11.
- Se encontró una casilla `consentimiento_datos` en perfiles, pero **no representa una autorización específica de marketing**; para estas 43 cuentas no había un registro afirmativo en ese campo.
- No se encontraron tablas o campos de bajas promocionales en el esquema público examinado.
- No se verificó la lista de bloqueados/opt-outs externa de Brevo. No concluir que una cuenta sea contactable sólo porque tenga email y `alertas_email=true`.

## Decisión de privacidad y entregabilidad

**43 candidatos teóricos != 43 destinatarios autorizados.** Dejar los envíos en **0** hasta comprobar la base legal aplicable, el propósito de contacto, la voluntad del destinatario, el registro de exclusiones y el mecanismo funcional de baja.

Para revisiones internas, los 11 que habían habilitado avisos docentes son un grupo *a revisar primero*, **no un permiso demostrado para recibir marketing**. Las 3 cuentas que desactivaron avisos deben quedar excluidas de un envío de recuperación salvo autorización separada y validada. Las 29 sin selección requieren especial cautela.

## Flujo que se propone, pero NO se activa

1. Crear grupo de consentimiento específico de ofertas/reactivación en Brevo y una página de baja/actualización de preferencias que funcione, sin afectar notificaciones esenciales.
2. Documentar procedencia, fecha y finalidad de cada permiso de contacto; integrar lista de bloqueados de Brevo. Consultar obligaciones para comunicaciones publicitarias según la normativa argentina vigente.
3. Recalcular elegibilidad **inmediatamente antes de cada envío**, sin incluir a quien ya renovó, tiene excepción, está dado de baja, tiene dirección inválida o ya fue contactado por esta campaña.
4. Exigir aprobación manual de contenido y segmentación, prueba sólo a dirección propia y envío por lotes pequeños con idempotencia/registro.
5. Ofrecer variantes de mensaje para quienes tuvieron prueba gratuita (39) y quienes tuvieron un plan pago (4). No introducir descuentos ni plazos ficticios.
6. Conservar un registro de auditoría agregado sin exportar a GitHub ni a chats listas nominales, emails o IDs.

## Archivos de esta preparación

- `docs/sql/APD_REACTIVACION_PREVIEW_SOLO_LECTURA.sql`: dos consultas ejecutadas correctamente sobre Supabase el 22/10/2026. No devuelve nombres ni destinatarios.
- `docs/APD_REACTIVACION_EMAIL_BORRADOR_20261022.md`: dos mensajes sin enviar, con marcador de baja aún no implementado.
- `scripts/test-reactivation-preview-guard.mjs`: contrato de seguridad que falla si desaparece el bloqueo de envío o se añaden sentencias SQL de mutación.
- `.github/workflows/apd-reactivation-preview-guard.yml`: pruebas CI sin claves ni llamadas a servicios de correo.

**Nunca enviar desde este PR ni implementar un endpoint de envío automático sin revisión y consentimiento adecuado.**

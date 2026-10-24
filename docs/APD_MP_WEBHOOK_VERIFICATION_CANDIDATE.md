# Mercado Pago — validación de webhook y acreditación (candidato, no desplegado)

## Evidencia observada el 24/10/2026

- La última notificación en la tabla `mercadopago_webhook_events` es del 25/06/2026.
- Hay 56 sesiones de checkout, de las que 5 figuran aprobadas.
- Las 5 aprobadas tienen suscripción asociada. De 6 suscripciones `mercadopago_checkout`, una no coincide con una sesión histórica y **no debe borrarse automáticamente**.
- El Worker canónico no valida `x-signature`. En `applyMercadoPagoPayment` usa `external_reference` como alternativa cuando no encuentra checkout; no debe autorizar suscripciones nuevas de ese modo.
- No se ha ejecutado ningún pago de prueba ni enviado ninguna notificación.

## Implementación propuesta

`node scripts/create-mp-validation-candidate.mjs` genera un archivo temporal sin tocar `worker-live/`.

El candidato:
1. Exige la firma HMAC-SHA256 del webhook usando `MERCADOPAGO_WEBHOOK_SECRET`, `x-signature`, `x-request-id` y `data.id`.
2. Si falta la clave, la firma no coincide o no está presente la solicitud, devuelve 401 **antes** de escribir logs o actualizar el estado de la compra.
3. Para la acreditación exige `mercadopago_checkout_sessions.external_reference` existente y que su usuario y plan coincidan con la referencia de Mercado Pago.
4. No altera pagos anteriores, excepciones administrativas ni suscripciones de la base de datos.

## Requisitos antes de desplegar

- Configurar la **clave secreta de firma de Webhooks** obtenida en la integración propia de Mercado Pago como secret de Cloudflare, exclusivamente del lado del servidor. Nunca colocarla en GitHub, variables públicas ni frontend.
- Confirmar en Mercado Pago que la URL de notificación (la configurada o la de cada preferencia) apunta al Worker correcto y que el evento **Payments** está habilitado.
- En un entorno de prueba, generar un pago real de prueba y verificar la cadena: firma válida, lectura autenticada de la API de Mercado Pago, checkout coincidente, suscripción válida, `/api/mi-plan`, alertas.
- Probar rechazos de firma, pagos sin checkout, pagos repetidos, reembolsos, y que las concesiones `manual_admin_grant` sigan vigentes.
- Desplegar exclusivamente por la vía segura de versiones del Worker con vista previa, comparación de bindings, smoke tests y rollback; conservar el snapshot canónico.
- No activar el envío retroactivo de correos todavía.

**Estado:** código candidato y pruebas de CI. No se modifica el Worker en producción hasta verificar clave de firma y prueba integral. Fuente oficial: https://www.mercadopago.com.ar/developers/es/docs/split-payments/additional-content/your-integrations/notifications/webhooks?scope=prod

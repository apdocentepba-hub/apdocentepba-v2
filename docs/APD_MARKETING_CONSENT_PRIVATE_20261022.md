# APDocente — Consentimiento comercial independiente (22/10/2026)

## Base de datos: IMPLEMENTADO y VERIFICADO

**Migración productiva Supabase:** `apd_marketing_preferences_private_default_deny_20261022`.

Se creó `public.user_marketing_preferences` con `user_id` FK a `public.users`, estado de consentimiento, origen, estado de bloqueo del proveedor, fechas de solicitud, confirmación y baja, versión de texto del consentimiento y fecha de actualización.

Reglas:
- Sin registro significa `not_requested` y **no permite correos comerciales**.
- `pending_confirmation` no es permiso; `subscribed` exige una confirmación explícita documentada (`confirmed_at` y `consent_version`).
- `unsubscribed` exige fecha de baja. `provider_status=blocked` impide campañas.
- RLS activado sin políticas públicas. `anon` / `authenticated` no pueden leer o modificar la tabla.
- Solo `service_role` tiene acceso; no se insertaron filas ni se infirió consentimiento a partir de `alertas_email`.

Validación después de aplicar: **48 usuarios, 53 suscripciones y 0 filas de marketing**, RLS activo, sin acceso a `anon` o `authenticated`, permisos de servidor preservados.

## Backend: CANDIDATO AISLADO, AÚN NO PUBLICADO

`scripts/build-marketing-preferences-candidate.mjs` verifica el SHA-256 de la captura del Worker real y crea un archivo temporal fuera de `worker-live/`.

Ruta propuesta: `/api/account/marketing-preferences` con Bearer de sesión de APDocente; la identidad proviene **solo de sesión validada**, nunca de un `user_id` enviado en JSON.

- GET muestra estado, sin acceder a preferencias de terceros.
- POST `{ "action": "opt_out" }`: baja local y bloqueo preventivo del contacto; **no sincroniza automáticamente Brevo todavía**.
- POST `{ "action": "request_confirmation" }`: registra una intención, pero mantiene `pending_confirmation` y `eligible_for_campaign=false`; **no envía un DOI** porque falta configurar la plantilla y lista Brevo.
- No permite `subscribe`, confirmaciones firmadas por el usuario ni poner `provider_status=eligible` mediante la API de navegador.
- Errores de Supabase = HTTP 503; falta de sesión = HTTP 401. Ninguna ruta envía correo o habilita campañas.

**Importante:** NO se puede ofrecer una baja autooperable al público hasta publicar y comprobar esta ruta; la baja nativa de campañas en Brevo es independiente y obligatoria.

## Brevo: integración de verificación READ-ONLY PREPARADA, no conectada

`scripts/brevo-marketing-suppression-readonly.mjs` consulta únicamente `GET /v3/contacts/:identifier` con API key **solo del servidor**, y requiere conocer el ID de la lista de marketing confirmada. La respuesta se considera bloqueada si `emailBlacklisted=true` o si la lista está en `listUnsubscribed`. Si faltan clave/lista/registro o falla Brevo, devuelve `unknown` y se impide enviar.

El estado "no bloqueado en Brevo" **no sustituye un consentimiento local verificable**, tampoco la baja histórica, ni la comprobación de renovación/beneficios. Antes de enviar, el sender debería comprobar ambos lados de manera actualizada.

Brevo ofrece `POST /v3/contacts/doubleOptinConfirmation`; falta configurar `includeListIds`, `templateId` y `redirectionUrl` de dominio propio, confirmar la plantilla en la cuenta y comprobar el evento DOI confirmado de manera autenticada y sin usurpación. Por eso el proyecto **no ejecuta** esa API actualmente.

Se recomienda utilizar la infraestructura de `Brevo Campaigns` para campañas comerciales y su enlace `{{ unsubscribe }}`, con una lista separada de los avisos docentes transaccionales. Antes de habilitar esto deben vincularse las bajas del proveedor al veto local mediante reconciliación autenticada, con pruebas de seguridad.

## Pendientes críticos

1. Ejecutar el CI de candidato en PR y probar una sesión autorizada en vista previa sin recopilar tokens ni datos personales de usuarios en logs.
2. Publicar backend solo mediante un release manual con rollback, preservando los cuatro cron productivos.
3. Incorporar el módulo visual de consentimiento en la cuenta, con la solicitud y el veto separados de las alertas docentes; publicar **después** del backend.
4. Configurar lista y plantilla DOI real de Brevo, verificar bloqueos, bajas e historial del proveedor antes de aceptar cualquier `subscribed`.
5. Hacer pruebas con dirección propia y enlace de baja real. Revisar legalmente la base de contacto promocional, sin deducir consentimiento de la aceptación de términos.
6. Recalcular elegibilidad y estado de pago en el momento del eventual envío; una campaña futura requiere controles de exclusión, idempotencia y revisión manual.

**Estado de la campaña de 43 contactos anteriores: 0 destinatarios autorizados; 0 mensajes enviados.**

Documentación API Brevo:
- https://developers.brevo.com/reference/get-contact-info
- https://developers.brevo.com/reference/create-doi-contact
- https://developers.brevo.com/docs/marketing-webhooks
- https://help.brevo.com/hc/es/articles/209553645-Insertar-un-enlace-de-cancelaci%C3%B3n-de-suscripci%C3%B3n-personalizado-en-tus-emails

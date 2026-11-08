# APDocentePBA — Android, iOS y notificaciones push (propuesta 2026-11-03)

**Estado verificable actualizado:** hay prototipo Expo, contrato de alertas y una APK Android de laboratorio compilada y comprobada en CI (no probada en un teléfono físico). No hay credenciales FCM/APNs, registro real de dispositivos, backend de envío ni push real enviado. Este PR no modifica producción.

## Avance adicional comprobado: prototipo Expo offline

Se creó la carpeta `mobile/` con un proyecto React Native + Expo SDK 58, pantallas Inicio / Alertas / Filtros / Cuenta, ofertas **ficticias**, búsqueda y filtros locales, guardado temporal y advertencias de modo demostración. La CI de Android exportó el **paquete JavaScript mediante Metro**, sin errores, pero **NO compiló APK/AAB** y no se realizaron pruebas en un celular.

La app todavía no se conecta al backend, no inicia sesión y no registra ni recibe notificaciones. Detalles y requisitos de prueba: `mobile/README.md`.

## Alcance del MVP

Que un docente autenticado reciba en su Android **ofertas nuevas verificadas y compatibles** con sus preferencias del servicio APDocentePBA, sin duplicados ni notificaciones de ofertas vencidas. Al tocar la notificación, entrar al detalle autorizado y desde allí abrir la oferta en ABC. Reutilizar el mismo backend para iOS más adelante.

## Arquitectura elegida

1. Fuente de verdad: Worker/APDocentePBA y su propio motor de compatibilidad. El teléfono NO consulta ABC directamente ni implementa un segundo algoritmo de cargos/distritos.
2. Cliente multiplataforma propuesto: React Native/Expo, con pantallas de login, alertas, filtros, detalle, notificaciones, configuración y salida. Las preferencias se leen del backend, no se duplican.
3. Registro de dispositivos: el backend toma la identidad exclusivamente del bearer de sesión verificado, vincula cada token push con su dueño y habilita revocación/rotación. Solicitar permiso explícito; Android 13+ requiere POST_NOTIFICATIONS.
4. Preparar eventos SOLO si se verificaron cuenta, plan, coincidencia y vigencia de la oferta, estado publicado y consentimiento explícito del dispositivo. Ante datos desconocidos, no enviar.
5. Outbox persistente con índice único por usuario, dispositivo y oferta para deduplicación transaccional ante concurrencia y reintentos; agregar cuotas, horarios silenciosos y manejo de tokens caducados.
6. Push por FCM (Android) y APNs (iOS), directo o a través de Expo Push. Credenciales y firmas siempre del lado servidor.
7. Privacidad: en pantalla bloqueada usar un título y mensaje genéricos, con identificador opaco solamente; NO incluir datos de postulantes, DNI/CUIL, observaciones, puntaje, email, número, escuela ni credenciales. El detalle se consulta reautenticando y verificando permisos.
8. No automatizar postulaciones de ABC ni solicitar credenciales personales de ABC. Abrir únicamente el enlace oficial correspondiente a la oferta verificada.
9. Otra vía para notificar antes de publicar APK: PWA con Web Push, Service Worker y suscripción voluntaria. iOS 16.4+ admite Web Push para apps web agregadas a la pantalla de inicio; no es equivalente a publicar una app en tiendas.

## Lo efectivamente implementado en esta rama

- scripts/mobile-push-candidate-contract.mjs: función determinista que genera candidatos de notificación sin enviar nada y sin red. Exige verificación de plan/identidad/oferta/dispositivo/permiso; calcula clave HMAC de idempotencia, limita cantidad, elimina datos privados del payload. **No reemplaza una outbox en SQL ni un backend de push real.**
- scripts/test-mobile-push-candidate-contract.mjs: 12 pruebas sintéticas de permisos, identidad, matching, vencimiento, privacidad, deduplicación, límites y estabilidad de eventos.
- .github/workflows/apd-mobile-push-contract-lab.yml: CI aislado sin deploy. No se tocan Worker, Supabase, index.html, login, usuarios ni redes.

## Criterios de aceptación del MVP real

- [ ] Cliente Android instala y arranca en dispositivo con firma y permisos apropiados.
- [ ] Login/logout reales y recuperación/revocación de sesión segura.
- [ ] Registro y desregistro de token por dispositivo bajo identidad autorizada.
- [ ] Outbox transaccional, índice único, reintentos, expiración, cuota de envíos y métricas anónimas.
- [ ] Credenciales FCM configuradas fuera del repositorio y recepción de primer push autorizado en celular físico.
- [ ] Comprobación de coincidencia REAL, plan y vigencia antes de enviar, y dedup persistente.
- [ ] Tap de push navega a detalle correcto únicamente si el usuario mantiene permisos.
- [ ] Pruebas reales de Android en segundo plano, app cerrada, sin red, notificaciones denegadas, cambio de dispositivo, sesión caducada y accesibilidad.
- [ ] APK/AAB firmado, revisado, con consentimiento para eventual publicación en Google Play.
- [ ] iOS: APNs, certificado/configuración, build en iPhone y publicación posterior si se autoriza.

**Importante:** no asignar un porcentaje de APK completada a la existencia de este contrato de laboratorio. Nunca enviar push ni registrar dispositivos de usuarios reales sin autorización.

## Documentación oficial

- Android/FCM: https://firebase.google.com/docs/cloud-messaging/android/get-started
- Expo Notifications: https://docs.expo.dev/push-notifications/overview/
- Apple Web Push: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers


## 07/11/2026 — Preflight final y pruebas de seguridad del despacho

Se agregó un control **previo al eventual envío**, después de reservar un evento en la outbox, mediante `scripts/mobile-push-dispatch-preflight-lab.mjs`. Sigue siendo un laboratorio offline y no es un emisor.

**Problema que corrige:** el contrato existente validaba consentimiento, plan y vencimiento al encolar una oferta. Eso no es suficiente: el plan puede vencer, el usuario revocar el dispositivo o la oferta cerrar **mientras el evento espera**.

**Cambios concretos:**
- Se vuelve a verificar que la clave HMAC del evento corresponde al usuario, dispositivo y oferta cargados desde el servidor. Rechaza los vínculos cruzados entre cuentas.
- Plan actual verificado en los últimos 5 minutos y fuente de oferta actual verificada en los últimos 15 minutos (límites de laboratorio; requieren validación operacional).
- Se comprueba identidad del dispositivo, consentimiento vigente, transport, revocación, disponibilidad actual, coincidencia real de preferencias y vencimiento futuro.
- Fechas con zona horaria inequívoca: no acepta fechas imposibles (por ejemplo, 31 de febrero), sólo fecha sin hora ni marcas temporales ambiguas.
- Dispositivo revocado u oferta cerrada: se cancela **ese evento** con su lease correcto. Caída de base, estado desconocido o secreto inaccesible: se reintenta con el backoff ya probado, **no se marca como enviado**.
- `scripts/mobile-push-outbox-contract.mjs` incorpora `cancelEvent(eventKey,{leaseId})` que impide que un lease viejo cancele el nuevo tras vencer y volver a reservarlo.
- El despacho `dryRunMobilePushDispatchLab` no integra FCM/Expo, no expone tokens push ni hace solicitudes de red. `provider_calls:0` es una constante del ensayo, **no un reporte de entregas**.
- Pruebas en `scripts/test-mobile-push-dispatch-preflight-lab.mjs`, incorporadas al workflow de CI existente. El dispositivo Android físico **no se probó** y la recepción remota sigue pendiente.

**Límites esenciales antes de producir:** el Worker deberá obtener todos esos datos desde repositorios de servidor confiables, no aceptar banderas verificadas enviadas por el teléfono. La outbox actual es exclusivamente en memoria y no es transaccional entre Workers. Para un envío real, hacen falta registro cifrado de token, control de revocación coordinado con el proveedor, autenticación, índice único y lease atómico persistido, cuotas/quiet hours, credenciales del proveedor, reportes de errores y pruebas con teléfono autorizado. Queda una ventana de concurrencia entre preflight y proveedor que requerirá cierre transaccional/validación final al despachar.

**Separación:** este trabajo NO modifica páginas ni radar, Worker, DB, correo, Telegram ni WhatsApp; no registra dispositivos reales ni envía push.

## 07/11/2026 — Cancelación SQL de preflight (laboratorio, sin desplegar)

- En la propuesta SQL privada `sql/apd_mobile_push_private_candidate_20261103.sql` se incorpora `apd_mobile_cancel_push(event_key, lease_id)`: cuando el control previo detecta una oferta cerrada o una revocación, el futuro dispatcher tendrá una operación transaccional que cancela **solo el lease vigente de ese evento**. Antes únicamente existía la cancelación en memoria, imposible de conectar fielmente a PostgreSQL.
- La operación es idempotente y restringida a `service_role`; no acepta eventos pendientes sin lease, leases vencidos, reservas posteriores ni cancelaciones duplicadas. Un evento cancelado no puede cambiarse a enviado mediante `apd_mobile_finish_push`.
- La batería PostgreSQL 17 descartable prueba cancelación válida, lease incorrecto, recuperación de un lease vencido y aislamiento de permisos de `anon`/`authenticated`. No hay acceso a datos reales, ni se aplica esta migración a Supabase.
- **Alcance y riesgo restante:** SQL autoriza/cancela la reserva, pero no reemplaza la verificación fresca de ABC/plan ni una implementación de Worker. La carrera entre preflight y llamada al proveedor debe tener una estrategia de despacho/revocación adicional. No habilitar FCM/Expo ni deploy a partir de estos tests.

## 07/11/2026 — Contrato de ejecución programada y puerto de almacenamiento (laboratorio)

El despacho de prueba ahora admite operaciones asincrónicas en su contrato `claim/cancel/retry` y reconoce `lease_id` UUID de PostgreSQL, además de los leases sintéticos anteriores. El `loadContext` recibe también la reserva vigente para que el futuro repositorio pueda cotejar `event_key`, `device_id` y `lease_id` juntos.

Se agregan `scripts/mobile-push-worker-job-contract-lab.mjs` y sus pruebas. El candidato exige autorización explícita de una invocación interna programada antes de consultar la cola; solo usa repositorios **inyectados por el servidor** (no lee datos del cliente) y mapea las operaciones `claimReserved`, `cancelReserved`, `retryReserved` y `loadVerifiedContext`. Una caída de las lecturas devuelve al reintento, sin marcar una notificación como enviada. La autorización no se basa en un simple flag enviado por el solicitante.

**Limitación importante:** es un contrato de orquestación ejecutado en Node, NO un endpoint HTTP ni un Worker desplegable. El evaluador actual todavía importa `node:crypto`; antes de ejecutarlo bajo Cloudflare debe comprobarse compatibilidad del runtime y conectar adaptadores SQL reales con un esquema privado. Las lecturas de plan/ABC se tienen que implementar y verificar desde servidor. No hay credenciales, contactos, cambios a `worker.js` ni envíos FCM/Expo.

## 07/11/2026 — Identidad ABC persistida y compatibilidad WebCrypto (LAB)

**Problema confirmado en diseño previo:** la outbox candidata solo guardaba `offer_fingerprint`, insuficiente por sí solo para recuperar en ABC la oferta original y volver a confirmar su vigencia antes de despachar. Se añadió `source_offer_key` (clave interna, validada, obligatoria, nunca parte del push al usuario) y se devuelve dentro del `apd_mobile_claim_push` de `service_role` junto con `user_id`, `device_id` y `lease_id`. El laboratorio PostgreSQL 17 prueba rechazo de filas sin clave o con clave malformada y lectura de la identidad desde un claim.

**Contrato portable nuevo:** `scripts/mobile-push-worker-webcrypto-lab.mjs` no importa módulos Node. Utiliza `crypto.subtle`/HMAC-SHA256 estándar para comparar el `event_key` persistido con la vinculación exacta de usuario, dispositivo y oferta, y comprueba identidad y estado desde contextos inyectados de servidor. Comparte las políticas de consentimiento, plan y oferta vigente con el contrato Node original. Las pruebas incluyen paridad de decisiones, fallos de fuente, revocaciones, expiración, criptografía ausente e invocación programada no autorizada.

**Separación de responsabilidades:** `createWorkerMobilePushDryRunLab` consume interfaces de repositorio inyectadas, no un HTTP endpoint, un `scheduled` handler productivo ni tokens de proveedores. Devuelve contadores de reservas y `provider_calls:0`, constante del laboratorio. No marca ninguna alerta enviada. Se exige que la autorización programada provenga de infraestructura interna, no de un header o una bandera enviada por terceros.

**Etapas todavía obligatorias:** confirmar compatibilidad dentro de `workerd`/Cloudflare real (las pruebas Node no la demuestran), implementar fuente oficial de ofertas y planes mediante repositorios autenticados, validar límites, permisos, cifrado y distribución de claves, cerrar carrera temporal revocación→proveedor, habilitar solo un ensayo aislado con autorización y obtener consentimiento para cualquier push real. No se aplicó SQL ni se modificó `worker.js` o despliegues.

# APDocentePBA — Android, iOS y notificaciones push (propuesta 2026-11-03)

**Estado verificable:** solo diseño y un contrato de eventos push con pruebas sin red. No hay aplicación Android/iOS compilada, APK/AAB, credenciales FCM/APNs, servicio de envío ni push real enviado. Este PR no modifica producción.

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

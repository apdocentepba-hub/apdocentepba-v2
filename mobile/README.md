# APDocentePBA Mobile — primer prototipo (Android / iOS)

**Estado: prototipo offline funcional a nivel de código y empaquetado JavaScript. NO es APK/AAB.**

Este directorio contiene un proyecto React Native + Expo SDK 58 que muestra las pantallas **Inicio**, **Alertas**, **Filtros** y **Cuenta**, con ofertas de demostración. El código no consulta ABC ni APDocentePBA, no envía push, solicita permiso de notificaciones solo cuando el usuario elige probar una alerta local; no registra tokens push, no recibe notificaciones remotas ni credenciales.

## Probarlo en un equipo de desarrollo

Se necesita Node.js 22.13+ y, para ver la app en un dispositivo, un entorno compatible con Expo SDK 58.

```bash
cd mobile
npm install
npm test
npx expo start
```

El QR generado por Expo permite abrir la sesión de desarrollo en un cliente compatible, en la misma red o mediante el mecanismo que ofrezca Expo. **Ese procedimiento no genera ni instala un APK independiente.** Tampoco se ha probado todavía en un teléfono físico.

Para validar el empaquetado JS de Android (lo que verifica GitHub Actions):

```bash
cd mobile
npm install
npm run export:android
```

Salida: `mobile/dist/android-lab`. Es un conjunto de bundles y recursos, **no un archivo instalable**.

## Qué sí funciona en esta etapa

- Navegación local entre cuatro pantallas con React Native.
- Buscador local y filtros de distrito y turno.
- Guardado temporal de ofertas de ejemplo (en memoria, se pierde al cerrar la app).
- Mensajes explícitos de modo demostración y ausencia de notificaciones reales.
- Pruebas Node que verifican búsquedas, filtros, estado de guardados y que no se exhiban supuestos pushes recibidos.

## Qué falta para un MVP Android

1. Autenticación segura con el backend APDocentePBA, almacenamiento de sesión con mecanismo nativo apropiado y cierre/revocación.
2. Conexión a los endpoints reales autorizados para leer preferencias y ofertas. Mantener los datos de postulantes protegidos y nunca almacenar credenciales de ABC.
3. Alta/revocación de dispositivos con permiso push explícito y tokens resguardados.
4. Outbox de eventos persistente en servidor y prueba de deduplicación real ante concurrencia.
5. Credenciales FCM/configuración Expo fuera del repositorio, envío de push de prueba a un teléfono autorizado y navegación al detalle con sesión verificada.
6. Compilación Android nativa debug, instalación y pruebas reales; luego build release firmado solo con autorización.

El código móvil de este PR es deliberadamente independiente del frontend web en producción y no utiliza la clave de Supabase en el teléfono.

Referencia de versión y compatibilidad: https://docs.expo.dev/versions/latest/

## 07/11/2026 — primera notificación Android local

Se incorpora `expo-notifications` y permiso Android `POST_NOTIFICATIONS` para mostrar un aviso **local de prueba**, únicamente al presionar **Probar notificación local** en Cuenta. Se crea canal Android de laboratorio, se solicita permiso explícito y se agenda un aviso inmediato, sin identidad, oferta real, token ni llamadas a proveedores. El texto indica claramente que **no es una alerta APD real ni un push remoto**. Requiere una compilación nativa nueva y prueba física: `expo export` y los tests Node por sí solos no demuestran que apareció en la bandeja de Android.

Para los push remotos siguen pendientes la integración segura con el Worker, registro/revocación, FCM/Expo, consentimientos, verificación de oferta vigente y entrega real en teléfono. No se envían notificaciones automáticas a usuarios.

## 08/11/2026 — Bandeja ficticia persistente y sincronización local

Se incorporaron `src/demo-inbox.js` y `src/demo-inbox.test.cjs`, más una bandeja en la pestaña **Alertas** que permite simular una llegada, marcarla como leída, simular cancelación y recuperar esos estados después de cerrar y volver a abrir la aplicación. Se usa `@react-native-async-storage/async-storage` versión **2.2.0** compatible con Expo SDK 58. No hay conexión con ABC, Supabase, FCM, Expo Push ni backend.

Solo se persiste `{version, cursor, items[]}` con cuatro identificadores fijos `DEMO-AVISO-*`, vinculados exclusivamente a los ejemplos `DEMO-APD-*`, sus revisiones y estados de lectura/cancelación. No hay nombres, direcciones, escuelas reales, contraseñas, teléfonos, DNI, CUIL, tokens push, sesión ni cuerpo libre de mensaje.

**Garantías del contrato de laboratorio:**

- Únicamente mensajes ficticios estrictamente validados y cursores consecutivos; si falta una revisión, se rechaza el lote. Duplicados o lotes antiguos no borran las marcas de lectura.
- Cancelar es terminal y deja una lápida: una revisión posterior o tardía no reactiva el aviso; cancelar antes de la llegada también evita resurrección.
- Las escrituras locales se serializan. Un error de almacenamiento no se exhibe como guardado. Un snapshot corrupto bloquea las modificaciones hasta reinicio explícito, sin borrarlo automáticamente.
- El estado se recupera al abrir la app. El botón **Reiniciar demostración y bandeja** elimina solo los ejemplos guardados en este dispositivo.
- El contador `remotePushReceived` permanece siempre en **0**. Ningún botón envía un push real ni registra un token.

**Privacidad:** AsyncStorage es almacenamiento local persistente **no cifrado**, por lo que se utiliza exclusivamente con identificadores y estados ficticios. Una bandeja real necesita autenticación, aislamiento por cuenta, caducidad, cifrado apropiado y sincronización autorizada del servidor; nada de eso se infiere de esta demostración.

**Verificación:** Node prueba recuperación al crear una segunda instancia con el mismo almacenamiento simulado, secuenciación, corrupción, acciones concurrentes, cancelación tardía y fail-closed. El empaquetado JS y las compilaciones APK no prueban persistencia en un teléfono físico; esa prueba se hará cuando se autorice la instalación.

## 08/11/2026 — Preparación del contrato servidor → bandeja (sin conexión activa)

Se implementó un **contrato de laboratorio separado del frontend** en `scripts/mobile-inbox-sync-endpoint-lab.mjs` y `scripts/mobile-inbox-event-log-lab.mjs`, con sesiones estrictamente verificadas en el servidor, paginación por cursor propio de la cuenta, confirmación de lectura idempotente y cancelaciones irreversibles. No existe ninguna importación de esa API en `App.js`, ni endpoint desplegado.

Una capa local `src/demo-inbox-sync-protocol.js` valida páginas inyectadas y las aplica mediante `createDemoInboxStore.applyServerPage()`. Se rechazan lotes con cursor faltante, campos extra, IDs ajenos, errores de lectura o cancelaciones malformadas. Toda página se valida primero y se persiste en una sola escritura. **No hay conexión de red, autenticación real, datos de usuario ni notificaciones remotas**.

Las pruebas del servidor usan dos cuentas y sesiones **ficticias**, verificando aislamiento, ACK repetido, revisiones anteriores, lectura de avisos cancelados, saltos de cursor, cargas malformadas y ninguna filtración de credenciales. También se ensaya el handler HTTP en Cloudflare workerd local. Esto es un contrato de implementación para una futura versión, **no** una sincronización real ya disponible.

Para habilitar sincronización real se requiere: credenciales y sesión con almacenamiento seguro nativo, repositorio persistente PostgreSQL por cuenta con permisos/RLS revisados, verificación de planes/datos de ofertas, políticas de lectura y revocación, staging autorizado y pruebas físicas. No se realizará sin aprobación.

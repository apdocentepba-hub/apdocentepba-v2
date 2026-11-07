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

# AlertasAPD: primer piloto remoto Android
Proyecto Expo: apdocentepba/alertasapd, UUID c032c89f-7c44-49c7-a30f-d8ea0b223053. Firebase: alertasapd-dd3df; paquete ar.com.alertasapd.pilot. No es el cliente comercial ni el laboratorio offline anterior.
- Copiar el google-services.json autorizado a esta carpeta localmente o utilizar una variable de tipo archivo GOOGLE_SERVICES_JSON en Expo (preview). Nunca guardar una clave privada de servicio en el repositorio ni en la APK.
- En Expo Credentials > Android > ar.com.alertasapd.pilot, asociar la clave FCM V1 del proyecto Firebase. Preferir cuenta con permiso mínimo para FCM.
- Para compilar localmente: npm install --no-audit --no-fund; npm test; npx expo prebuild --platform android; android/gradlew :app:assembleRelease (firma de prueba, verificar APK).
- Alternativa EAS, solo si el titular verifica cuota gratuita: npx eas-cli@latest build --platform android --profile pilot. No se ha ejecutado.
- Instalar APK de piloto, tocar Obtener token de prueba, pegar token exclusivamente en herramienta oficial Expo, enviar aviso genérico al teléfono propio, comprobar primer plano, segundo plano y pantalla bloqueada. No forzar detención. Ticket de proveedor no implica recepción física.
- No activar login comercial, cron ni envíos a usuarios. Mantener laboratorio previo intacto. El resultado de este piloto debe verificarse antes de integrar el panel comercial.

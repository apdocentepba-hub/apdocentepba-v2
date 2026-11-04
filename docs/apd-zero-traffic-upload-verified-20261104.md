# APDocentePBA — Acta de subida de Worker final al 0 % (4 de noviembre de 2026)

## REALIZADO Y COMPROBADO

- **Acción autorizada:** crear una versión en Cloudflare con `wrangler versions upload` y **sin cambiar el tráfico de producción**.
- **Worker:** `ancient-wildflower-cd37`.
- **Nueva versión subida:** `29ef1c70-3cc9-4ddc-ac05-31000546aad3`.
- **SHA256 fuente revisada:** `0d6f54103c7821960cdd28fbf395fa10ba3837dc60aa9618fb4c82d1380a73fe`.
- **SHA256 módulo alojado:** `16b4aa57976caefec91af04b768d18d20af46d3134a862d1e5c6e534c3dd8a26`.
- **Versión activa anterior:** `da0632dd-1b9e-4332-9c4a-75b5eade8d74`.
- **SHA256 código en producción:** `335a62e1ab6127cf50b38000845766c7d7d5e2c314e2e002e996e41ace146a9c`.
- **Tráfico:** anterior **100 %**; nueva **0 %**, comprobado antes/después por API de Cloudflare.
- **Configuración:** 29 bindings exactos, mismo namespace KV, 4 crons preservados.
- **Prueba real de seis rutas HTTP del preview:** 200 para `GET /api/version` y `GET /api/planes`, 401 para `GET /api/mis-alertas`, `GET /api/mi-plan` y `GET /api/historico-resumen` sin sesión; 200 para `OPTIONS /api/mis-alertas`.
- **Datos o terceros:** sin correos enviados, sin cuentas modificadas, sin planes alterados, sin contenido de sesiones personales leído.

## Evidencias

1. Subida única: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41902712511 (SUCCESS), incluyendo artifact `apd-final-zero-traffic-20261104-receipt`.
2. Pruebas HTTP reales y segundo control de tráfico: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41903125274 (SUCCESS).
3. CI offline de suite integrada: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41900705315 (SUCCESS).
4. API aislada de la versión nueva: https://apd-final-safe-1104-ancient-wildflower-cd37.apdocentepba.workers.dev/api/version

## PENDIENTE / BLOQUEOS DE PRODUCCIÓN

- Probar un usuario autenticado real y sus preferencias/planes/listado/carrusel sin compartir claves.
- Verificar una oferta concreta con hora de cierre en el portal de ABC para corroborar la convención horaria del campo `finoferta`.
- Ensayar el nuevo resúmen de las 06:01 y las notificaciones reales únicamente cuando se apruebe la prueba y los destinatarios.
- Validar integridad de PostgREST/Supabase real para upserts en lote.
- **No se autorizó ni ejecutó tráfico 1 %, mezcla de versiones, merge, despliegue al 100 % o cambio de crons.**
- Cualquier siguiente paso de activación de tráfico requiere aprobación específica y plan de reversión.

## Restricciones de continuidad

El código nuevo de staging **no es el Worker activo**. No confundirlo con la versión PID previa al 0 %, `90e76973-5509-4d1b-82e1-91b4c2811295`, que carece de algunas correcciones posteriores. La única versión nueva final es `29ef1c70-3cc9-4ddc-ac05-31000546aad3`.

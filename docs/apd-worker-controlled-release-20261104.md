# APDocentePBA — publicación controlada del Worker ABC

**Estado: candidato técnico. Sin permiso de despliegue productivo.** Fecha de auditoría: 04/11/2026.

## Versión activa y punto de recuperación comprobados

- Sitio: https://alertasapd.com.ar/
- Worker: ancient-wildflower-cd37.
- Cloudflare sirvió el **100 %** del tráfico de la versión da0632dd-1b9e-4332-9c4a-75b5eade8d74.
- Módulo principal: worker_hotfix.js.
- SHA-256 canónico activo: 335a62e1ab6127cf50b38000845766c7d7d5e2c314e2e002e996e41ace146a9c.
- 29 vinculaciones de recursos coinciden con el manifiesto; no se imprimieron secretos.
- SHA-256 del candidato aislado: 6ee13869ec0d6363806e1bfc8990d529f7386b956c7bd30530f5e0109c861b6e.
- Evidencia: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41824131874

Los identificadores anteriores son **una foto de ese momento**. Antes de cualquier upload/deploy, volver a verificar que Cloudflare sigue sirviendo exactamente el mismo código, versión y vinculaciones. La copia guardada no reemplaza a una consulta en vivo.

## Puerta A: todo esto debe aprobar sin tocar producción

1. Generar candidato desde Worker canónico sin modificar worker-live ni desactivar PRODUCTION_SOURCE_GUARD_V1.
2. Probar paridad de distrito, cargo, nivel, turno, duplicados y prioridad de ofertas. Ante HTTP 429 o error parcial, nunca declarar "cero ofertas".
3. Verificar código exacto y hashes con los scripts test-live-source-equivalence.mjs y attest-apd-worker-candidate.mjs.
4. Ejecutar check-apd-worker-live-version-readonly.mjs: confirmar un solo despliegue al 100 %, módulo/hashes iguales y bindings.
5. Ejecutar check-apd-worker-anonymous-http-readonly.mjs: las rutas protegidas rechazan usuarios sin sesión con 401; las rutas públicas y preflight siguen en 200.
6. Ejecutar pruebas integradas Worker → API → carrusel con usuarios sintéticos.
7. Conservar el artefacto de revisión del Worker. Nunca guardar claves secretas en él ni sus valores en el log.

## Puerta B: ensayo separado, sin tráfico de usuarios

**Requiere autorización específica para modificar Cloudflare, incluso con 0 % del tráfico.**

- Capturar versión, módulos, bindings, rutas y triggers activos para poder recuperar la configuración anterior. No recrear credenciales.
- La documentación de Cloudflare permite subir una nueva versión sin activarla usando el mecanismo de versiones; no usar el comando de despliegue directo que activa 100 %.
- Una versión nueva no debe entrar en un Deployment ni en un reparto de tráfico sin segunda aprobación específica.
- Usar cuenta de prueba propia, no sesiones ajenas. Comparar lista exacta de claves canónicas de oferta, orden, preferencias (distrito, cargo, nivel, turno), PID y plan activo/vencido.
- Medir latencia real y errores, documentando p50 y p95. Los 422 → 211 ms medidos en CI para seis GET ficticios de 70 ms **no son un benchmark real**.
- Detener el ensayo si hay diferencias no explicadas, fallos HTTP, faltan bindings, se pierden alertas o aumenta inesperadamente el tráfico a ABC.

## Puerta C: publicación gradual y reversión

**Exige autorización expresa, distinta del OK visual de V3.**

- Promover solo una versión que haya pasado B, manteniendo identificada la anterior. Medir errores, latencia y coincidencias antes de incrementar exposición.
- Cloudflare permite una reversión desde Workers & Pages → Worker → Deployments → menú de la versión anterior → Rollback, o mediante Wrangler rollback apuntando a un ID verificado.
- El rollback crea un nuevo despliegue que dirige el 100 % del tráfico a la versión elegida; **no modifica ni revierte Supabase, KV ni otros recursos externos**.
- Si una vinculación a recursos ya no existe, la restauración puede fallar; verificarla antes de depender del rollback.
- Después de revertir, repetir inmediatamente los controles de autenticación, módulos, bindings, alertas y disponibilidad.

Fuentes oficiales:
- https://developers.cloudflare.com/workers/versions-and-deployments/
- https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/
- https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/

## Criterios para declarar finalizada la optimización

1. Fuente y versión previas reproducibles y recuperables.
2. Ofertas idénticas antes/después (IDs, filtros y orden) para las preferencias de la cuenta de prueba, descontando cambios comprobados en ABC durante el intervalo.
3. Plan vencido: cero datos personalizados y cero consultas innecesarias a ABC.
4. No cambiar planes, preferencias de terceros, autenticación, pagos, crons o notificaciones.
5. Medición de latencia autenticada documentada en condiciones comparables.
6. Reversión probada o justificada con procedimiento verificado y acceso a la versión anterior.
7. Módulo y porcentaje activo nuevamente comprobados tras publicar.

El candidato sigue sin fusionar ni publicar. El PR #244 de protección frontend es independiente y tampoco está desplegado.

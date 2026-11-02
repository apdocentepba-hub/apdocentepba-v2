# APDocentePBA — prueba HTTP real de PostgREST + PostgreSQL 17

**02/11/2026 · Solo GitHub Actions.** Continúa el PR #220, que ejecutó SQL real y pruebas HTTP simuladas por separado. Esta prueba une las dos capas con un servidor **PostgREST v16.3 real**, utilizando exclusivamente una base PostgreSQL 17 **descartable** y un rol temporal `apd_pilot_http` dentro del runner de GitHub.

## Prueba
El workflow `.github/workflows/apd-postgrest-pg17-integration.yml`:
1. Crea el esquema `apd_scanner_pilot`, el diario de etapas y las funciones de prueba del PR #220, sin conectar Supabase.
2. Levanta PostgREST con dominio `localhost` y puerto 3300 en el runner, sin datos ni secretos reales.
3. Ejecuta `scripts/test-apd-postgrest-pg17-real.mjs`, que utiliza **el adaptador verdadero** `scripts/apd-atomic-stage-rest-adapter.mjs`: crea captura MATANZA, envía **650 ofertas sintéticas en cinco páginas**, reenvía una página idéntica, sella la captura y confirma el lote por RPC con **poda desactivada**.
4. Comprueba que repetir la confirmación es rechazado (evita inflar los contadores), que PostgreSQL conserva exactamente 650 ofertas únicas y cinco páginas, y que todos los contadores `times_seen` son 1.
5. Finaliza y elimina el contenedor de PostgREST. No escribe ni publica datos reales.

La autenticación anónima amplia utilizada para el contenedor **solo existe en el ensayo descartable**; **NO** debe copiarse a producción. El despliegue real deberá diseñar roles mínimos, RLS y un RPC privado que valide una identidad de servidor y autorización explícita.

## Límites
Aunque el HTTP sea real, estas pruebas todavía **no convierten el prototipo en una migración segura**: el esquema de producción tiene más campos, historial, preferencias y permisos; el flujo de ABC no ofrece instantáneas estables durante paginación; faltan reglas de expiración de staging, idempotencia a través de reinicios de Worker, bloqueo de ejecuciones solapadas, observabilidad y respaldo integral restaurable.

El Worker y la web productivos no se modifican. Tampoco se envían alertas ni comunicaciones a usuarios. Mantener `APD_DISTRICT_SOURCE_ALIASES_ENABLED` desactivada hasta completar QA y autorización.

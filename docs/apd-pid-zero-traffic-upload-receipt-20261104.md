# APDocentePBA — comprobante de versión de ensayo 0 % (04/11/2026)

## Realizado y comprobado

**Carga autorizada para ensayo, sin despliegue:**
- Cloudflare Worker: `ancient-wildflower-cd37`.
- Nueva versión almacenada: `90e76973-5509-4d1b-82e1-91b4c2811295`.
- Código fuente SHA-256: `d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f`.
- Módulo recibido de Cloudflare SHA-256: `cba6427814e9bd0d50c597c7db1c678fd6715862d0a921b80baea1d23b955881`.
- Versión activa original: `da0632dd-1b9e-4332-9c4a-75b5eade8d74`, **100 %** de tráfico; candidata **0 %**.
- Cloudflare verificó **29 bindings**, namespace KV esperado y **4 crons** sin cambios. Sin despliegue, sin avisos a usuarios ni cambios de datos.
- Comprobante GitHub Actions SUCCESS: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41839769023
- Workflow de subida de un solo uso (rama independiente): `staging/apd-worker-pid-zero-traffic-20261104`, archivo `.github/workflows/apd-pid-zero-traffic-once.yml`.

**Prueba pública real de la versión sin sesión:**
- Versión URL comprobada: https://90e76973-ancient-wildflower-cd37.apdocentepba.workers.dev
- `GET /api/version`: 200.
- `GET /api/planes`: 200.
- `GET /api/mi-plan` sin bearer: 401.
- `GET /api/mis-alertas` sin bearer: 401.
- `OPTIONS /api/mis-alertas`: 200.
- Sin credenciales, usuarios, envíos, escrituras ni asignación de tráfico.
- Comprobante GitHub Actions SUCCESS: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41840125735

## Límites no resueltos

Los resultados anteriores **no** demuestran que el panel autenticado sea más rápido, que el almacenamiento PID tolere dos consultas simultáneas reales ni que las alertas con preferencias reales rendericen correctamente. El benchmark anterior de PID (142 ms → 81 ms) utiliza solo respuestas artificiales de 20 ms.

### Condiciones para activación productiva

1. **Ensayo con cuenta propia de prueba en la URL de la versión**, sin exponer cookies ni bearer en logs o chat. Inspeccionar preferencias, planes, coincidencias, vigencia, PID, carrusel y tiempo completo `/api/mis-alertas`.
2. Verificar que las consultas concurrentes del almacenamiento PID son correctas con el proveedor, preservan el orden de preferencia y no generan bloqueos por cuota.
3. Antes de desplegar, nueva verificación read-only de la versión 100 %, 29 bindings, 4 cron y cambios ajenos.
4. **Solicitar autorización específica para asignar tráfico**. La autorización del usuario para subir una versión con 0 % no autoriza un canary 5 %, un 100 %, ni fusionar el PR.
5. Definir el retorno a la versión original `da0632dd-1b9e-4332-9c4a-75b5eade8d74` si el smoke de canary o las métricas fallan.
6. El PR #245 sigue como borrador y sin fusionar.

## Seguridad

La URL de versión usa recursos y configuración del Worker activo y **puede ser pública**; mantener autenticación en rutas protegidas. Una URL de versión no prueba visualmente el frontend, que tiene su propio origen. No publicar tokens ni usar cuentas de terceros para el ensayo.

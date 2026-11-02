# APDocentePBA — protección ante dos capturas simultáneas de un mismo distrito

**2/11/2026 · Ensayo aislado PostgreSQL 17 + PostgREST 16.3. No desplegado.**

## Riesgo confirmado en código de laboratorio del PR #224

El prototipo ya serializaba las confirmaciones mediante `pg_advisory_xact_lock`. Sin embargo, ese bloqueo no impedía que **una captura anterior, finalizada más tarde**, actualizara después datos recién confirmados. El resultado potencial es una regresión del estado y del contenido de una oferta, aunque todas las escrituras hayan sido atómicas.

## Protección incorporada al candidato

`tests/sql/apd_atomic_concurrency_fence_pg17.sql` incorpora en el esquema privado `apd_scanner_pilot` un registro único de la última captura confirmada por distrito. Redefine únicamente el RPC de laboratorio `apd_scanner_api.commit_capture(uuid)`:

1. Bloquea el registro de la captura y adquiere el bloqueo transaccional del distrito con la misma clave utilizada en el mecanismo anterior.
2. Consulta la última captura **confirmada** y rechaza una nueva si su inicio es anterior o igual a la finalización registrada. Esto también rechaza capturas superpuestas cuyo orden de llegada invierte la cronología.
3. Solo si pasa la validación, aplica el lote completo de **24 columnas** y actualiza el registro de la captura dentro de la misma transacción.
4. No permite borrar ofertas. Si el commit falla en cualquier punto, tanto las ofertas como el registro de la captura quedan sin cambios.

La decisión es deliberadamente conservadora: si dos barridos se solapan, **solo uno puede confirmarse**, incluso cuando ambos están completos. Un nuevo barrido posterior al último confirmado sí puede hacerlo.

## Prueba concurrente real

`.github/workflows/apd-pg17-concurrent-commit-fencing.yml` crea PostgreSQL 17 y PostgREST 16.3 descartables. Antes del momento de confirmar, una sesión PostgreSQL independiente retiene temporalmente el bloqueo de MATANZA. Se lanzan **dos confirmaciones HTTP simultáneas** de MATANZA, con capturas superpuestas y conjuntos de ofertas ficticias distintos. Al liberar el bloqueo debe cumplirse exactamente una confirmación exitosa y otra rechazada.

En paralelo, AVELLANEDA debe confirmarse sin esperar el bloqueo de MATANZA. Luego se confirma una captura posterior de MATANZA y se intenta aplicar una captura anterior: la segunda debe ser rechazada.

El control SQL final verifica ofertas admitidas y rechazadas, fechas de primera observación, historial de estados, identificadores únicos, cero eliminaciones y el último `run_id` por distrito. Los casos están ejecutados contra RPC auténticos, no simulados.

## Límites

- **No es un arreglo del escáner productivo.** Esta función y su tabla existen únicamente en el esquema de ensayo del workflow. El Worker real y las tablas de Supabase siguen sin cambios.
- Los bloqueos son cooperativos: otras rutas SQL que no respeten este protocolo pueden modificar registros. El diseño productivo debe impedir accesos paralelos fuera del RPC controlado.
- El registro utiliza la hora de inicio y finalización declaradas por el escáner de laboratorio. Una implementación final debe asegurar que esos valores procedan de un servicio confiable, no del navegador.
- La serialización no demuestra que la paginación por desplazamiento de ABC sea una instantánea estable: puede cambiar la identidad de las ofertas aun con `numFound` constante.
- El respaldo integral y recuperable de Supabase, la migración de permisos mínimos, la revisión de Capitán Sarmiento y las notificaciones sin contacto a usuarios siguen pendientes.

**Condición de cierre:** GitHub Actions debe aprobar los escenarios concurrentes reales; si falla, no fusionar ni publicar el candidato.

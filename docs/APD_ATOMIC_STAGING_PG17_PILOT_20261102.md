# APDocentePBA — integración aislada: capturar → preparar → validar → confirmar

**Fecha: 02/11/2026 · Estado: prototipo para ensayos; no desplegar en Supabase ni en Cloudflare.**

El PR #219 verificó una transacción PostgreSQL 17 para actualizar un distrito y revertir todos los cambios ante un error. Este trabajo agrega las etapas que faltaban **antes** de esa transacción.

## Componentes

- `tests/sql/apd_atomic_stage_pages_pg17.sql`: extiende únicamente el esquema descartable `apd_scanner_pilot` del ensayo anterior. `stage_page(run_id, page_index, source_total, rows)` guarda una página filtrada, valida distrito, estado, claves, cantidad, orden y estabilidad de `numFound`. Un reintento con los mismos datos es idempotente; con distintos datos se rechaza. Los duplicados entre páginas fallan por clave compuesta. `seal_capture(run_id)` compara cantidad de páginas completadas, recuento de filas únicas y fuente antes de habilitar la confirmación.
- `tests/sql/test_apd_atomic_stage_pages_pg17.sh`: en un PostgreSQL 17 real e independiente, prepara **650 ofertas en cinco páginas (150/150/150/150/50)**. Comprueba que el sello admite la captura completa, la confirmación no elimina registros por defecto, conserva `first_seen_at`, no toca Avellaneda, y que los errores de paginación y duplicados no dejan páginas parciales. Una excepción forzada después del `UPSERT` demuestra que PostgreSQL revierte la confirmación entera.
- `scripts/apd-atomic-stage-rest-adapter.mjs`: adaptador **exclusivamente de laboratorio** para el contrato PostgREST; su bandera local está apagada por defecto y **rechaza cualquier servidor de producción**. Solo proyecta `source_offer_key`, distrito y estado. Ordena la preparación, sello y confirmación `p_prune=false`. No reintenta automáticamente una confirmación cuyo resultado de red sea ambiguo (podría haberse aplicado antes del corte).
- `scripts/test-apd-atomic-stage-rest-adapter.mjs`: verifica con HTTP interceptado las ocho llamadas para cinco páginas, ausencia de campos privados, rechazo de hosts no aislados y de datos inválidos, y no repetición de `finalize` tras perder la respuesta.

## Seguridad y alcance

Este prototipo usa funciones `SECURITY INVOKER` y **ninguna** ruta pública del Worker las invoca. El esquema aislado no está implementado en la base real. No se consultaron ni modificaron ofertas, alertas, preferencias, suscripciones ni pagos productivos. Los datos de las pruebas son ficticios.

PostgreSQL garantiza la atomicidad de una confirmación, pero **no garantiza** que el índice de ABC mantenga el mismo conjunto de identificadores mientras cambian las páginas. Una fuente con `numFound` constante también puede desplazar filas entre offsets. El sello registra integridad interna, no certifica por sí solo una instantánea idéntica de ABC.

### Riesgos y pasos restantes

1. Unificar el esquema piloto con los **24 campos reales** de `apd_ofertas_global_current`, sin perder `raw`, `last_state_change_at`, `state_changes`, ni datos de preferencias.
2. Probar el contrato por HTTP **contra PostgREST real**, con roles mínimos y RLS; en este PR el adaptador se probó con HTTP simulado y SQL contra PostgreSQL real **por separado**.
3. Resolver cierre de capturas y protección de reintentos entre ejecuciones de Worker; definir caducidad de estados y limpieza de staging huérfano.
4. Verificar control de concurrencia real, impedir eliminación tras capturas incompletas, y agregar reconciliación de fuentes con paginación estable o claves.
5. Conseguir respaldo integral restaurable de producción y probar restauración de tablas/datos pertinentes; el dump descartable de CI **no sustituye** al backup.
6. Revisar el catálogo de `CAPITAN SARMIENTO` sin asociarlo con `CORONEL SARMIENTO`.
7. Autorizar por separado la migración productiva, desplegar Worker con bandera apagada, monitorear y habilitar después de QA.

**Criterio de aceptación de esta fase:** pruebas SQL reales y pruebas del adaptador terminadas correctamente en GitHub Actions; cero cambios productivos. No se considerará terminada la integración del Worker hasta completar los controles anteriores.

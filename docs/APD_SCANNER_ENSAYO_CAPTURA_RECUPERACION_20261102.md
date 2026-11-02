# APDocentePBA — ensayo de captura integral y recuperación simulada

**Tipo:** prueba local de estado; no es backup ni restauración PostgreSQL real.

El archivo `scripts/test-apd-scanner-alias-state-recovery.mjs` construye el Worker temporal de los seis alias (flag OFF por defecto en producción), extrae las implementaciones canónicas de `runProvinciaBackfillStep`, `fetchAPDDistrictBatch`, `buildGlobalSnapshotRow`, `loadCurrentRowsMap` y `buildGlobalCurrentRow`, y ejecuta esa lógica con ABC y Supabase **totalmente simulados**, sin llamadas a Internet, cuentas ni usuarios reales.

### Criterios de aceptación
- Escanea 650 ofertas simuladas de MATANZA (en cinco páginas de 150/50), y una de AVELLANEDA. El primer ciclo procesa 600 y **no poda** mientras quedan páginas. El segundo procesa 50 y recién entonces poda solo registros anteriores de MATANZA. El tercero completa el distrito siguiente.
- Verifica identificadores únicos, normalización del distrito canónico, conservación del `first_seen_at` y contador de apariciones del registro preexistente. Las preferencias de un usuario ficticio permanecen iguales.
- Confirma que flag apagado consulta el nombre anterior sin reinterpretarlo.
- Inyecta un error en el segundo upsert y un error de ABC durante lectura, valida estado `error`, ausencia de poda prematura y **restauración manual de un mapa en memoria**.
- Rechaza cualquier variación del Worker principal o el HTML del sitio.

### Hallazgo de diseño que debe conservarse visible
El Worker productivo ejecuta upserts por lotes y poda de registros en llamadas HTTP separadas. **No constituyen una transacción PostgreSQL**. Ante una falla, pueden persistir escrituras parciales incluso si el estado pasa a `error`. Revertir un mapa simulado **no protege producción**.

### Próximos controles antes de desplegar
1. Respaldo íntegro, verificable y recuperable del alcance afectado; prueba de restauración.
2. Entorno aislado con Postgres compatible y contrato real de PostgREST para upsert/poda.
3. Protección contra ejecuciones simultáneas y cambios del índice ABC durante la paginación.
4. Pruebas end-to-end de preferencias y alertas sin contacto a usuarios.
5. Despliegue del Worker separado con bandera inicialmente apagada, QA y luego habilitación explícita.

El catálogo `CAPITAN SARMIENTO` continúa pendiente de análisis de referencias; no se debe tratar como `CORONEL SARMIENTO`.

**Estado de este artefacto:** candidato de pruebas, sin despliegue ni cambios en Supabase/Worker/cobros/alertas.

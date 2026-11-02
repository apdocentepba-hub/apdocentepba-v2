# APD — Ensayo controlado de las seis equivalencias contra ABC

El candidato del PR #213 está incorporado a GitHub, pero **apagado** en el Worker real. Este nuevo control es un paso previo a decidir su despliegue.

`scripts/audit-apd-scanner-alias-solr-real.mjs` realiza **12 solicitudes GET públicas, rows=0**: para cada uno de los seis distritos, consulta primero el nombre anterior del catálogo y luego el nombre ABC propuesto. Conserva exclusivamente nombre, cantidad agregada y hora. No descarga ofertas, nombres de docentes, datos de postulantes, sesiones, contraseñas ni archivos privados. Si todas las consultas con nombres nuevos arrojan cero o hay un error HTTP, falla.

`scripts/test-apd-scanner-alias-real-contract.mjs` reconstruye las funciones reales `fetchAPDDistrictBatch` y `buildGlobalSnapshotRow` desde el bundle temporal del Worker con un backend Solr simulado. Asegura que el flag prendido permite recuperar las etiquetas ABC, apagado conserva la conducta anterior, las filas se guardan con el nombre canónico del catálogo y `source_offer_key` se mantiene estable.

No se modifican `catalogo_distritos`, `apd_ofertas_global_current`, Worker ni interfaz publicados. El catálogo requiere revisión separada para `CAPITAN SARMIENTO`, que figura oficialmente como municipio bonaerense y no puede asociarse automáticamente a `CORONEL SARMIENTO`.

### Límites
La API ABC `estado:Publicada` puede devolver ofertas vencidas por la fecha de cierre, por lo que `numFound` **no equivale a nuevas ofertas notificables**. Los conteos provienen de instantes diferentes: no atribuir la diferencia a ofertas perdidas. La suite simulada no reemplaza un barrido completo/restauración real en entorno aislado ni autoriza actualizaciones productivas.

**Rollback del candidato:** conservar Worker original y bandera `APD_DISTRICT_SOURCE_ALIASES_ENABLED` apagada. Antes de desplegar, comprobar integridad de datos y disponer de respaldo recuperable del alcance afectado.

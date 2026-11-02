# APDocentePBA — doble comprobación de identificadores de ABC antes de confirmar

**Fecha:** 2 de noviembre de 2026. **Alcance:** laboratorio PostgreSQL 17 + PostgREST 16.3. No desplegado ni habilitado en el escáner de docentes.

## Problema comprobado en el diseño del Worker

El escáner original consulta ABC usando `start` y `sort=ult_movimiento desc`. Esta paginación puede cambiar de identidad aunque `numFound` permanezca fijo. La protección anterior (#218) detecta cambios en totales y duplicados dentro de un lote; la nueva protección no presupone que mantener el número de publicaciones sea suficiente.

La documentación de Apache Solr explica que los offsets y los empates de clasificación pueden producir omisiones o repeticiones cuando se actualiza el índice. Un `cursorMark` requiere ordenar por un campo único de Solr: **no asumir que `iddetalle` o `idoferta` son necesariamente el `uniqueKey` configurado por ABC**. Referencia: https://solr.apache.org/guide/solr/latest/query-guide/pagination-of-results.html

## Ensayo nuevo: comparar el conjunto completo, no solo su tamaño

El piloto SQL `tests/sql/apd_identity_double_pass_pg17.sql`, únicamente bajo el esquema descartable `apd_scanner_pilot`, incorpora:

1. Una primera lista de claves públicas de **todos los documentos publicados encontrados** durante el barrido, incluyendo los que después no superan el filtro de vigencia; las ofertas filtradas y preparadas deben estar contenidas en esa lista.
2. Una segunda consulta independiente a la misma búsqueda de ABC antes del commit. Se normalizan exclusivamente las claves de oferta, ordenadas, como un **conjunto exacto**. Se rechazan entradas vacías, claves duplicadas, recuentos distintos y conjuntos distintos, incluso si ambos tienen el mismo `numFound`.
3. Sólo si ambas listas coinciden, el RPC registra una verificación fechada (máximo 120 segundos de antigüedad) y permite llamar a `commit_capture`.
4. La comprobación de identidad, el bloqueo transaccional por distrito (#225), el upsert de las **24 columnas** y la actualización de la última captura quedan coordinados: el commit no admite eliminación de ofertas.
5. `anon` y `authenticated` carecen de permisos de acceso a estos RPC; la comparación se realiza en el esquema privado y no imprime identificadores individuales en los logs.

### Test de regresión

`scripts/test-apd-identity-double-pass-http.mjs` usa HTTP **real** hacia PostgREST del runner, con dos primeras ofertas ficticias `TEST_AAA` y `TEST_BBB`.

El segundo barrido simulado devuelve `TEST_AAA` y `TEST_CCC`: **el total sigue siendo 2**, pero se rechazan la validación y el commit. Repetir una clave también se rechaza. Una segunda comprobación con las dos claves originales en orden diferente sí permite confirmar una sola vez, con cero borrados. El workflow comprueba directamente los registros en PostgreSQL.

**Limitaciones importantes:**
- Las pruebas usan dos listas simuladas sobre PostgREST/PostgreSQL reales; todavía **no conectan el Worker a dos lecturas reales de ABC**.
- No existe una instantánea congelada en el índice de ABC; **el origen puede cambiar después de la segunda lectura y antes del commit**.
- La identidad de ofertas no verifica cambios de descripción, estado o fecha de cierre cuando conservan el mismo identificador. Ese control necesita un fingerprint de contenido autorizado o una nueva lectura integral de cada oferta.
- No se prueba que el conjunto leído contenga todas las publicaciones de ABC si ambas pasadas padecen la misma omisión por offsets inestables. La paginación por cursor y clave única de Solr requerirá demostrar primero qué esquema soporta el índice de ABC.
- La función no está implementada en Supabase productivo. No hay respaldo íntegro restaurable, migración de seguridad ni activación del Worker.

**Criterio de seguridad:** ninguna afirmación de protección integral de ofertas reales hasta validar el contrato con el índice real, roles productivos y respaldo completo.

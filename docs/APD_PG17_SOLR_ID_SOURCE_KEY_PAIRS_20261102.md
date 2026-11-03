# APDocentePBA — Solr ID y source_offer_key NO son equivalentes

**Ensayo de laboratorio PG17 + PostgREST. No es una migración de producción.**

## Brecha descubierta en el piloto
La auditoría del PR #235 lee `id`, `iddetalle` e `idoferta` de ABC y utiliza `buildSourceOfferKeyFromOferta` del Worker real. La clave de la tabla es habitualmente `D_<iddetalle>`; no tiene por qué coincidir con el identificador Solr `id`.

En el piloto `tests/sql/apd_identity_double_pass_pg17.sql`, `register_source_identity(p_ids)` comprobaba que cada `source_offer_key` preparado existiera en el array `p_ids`. Su prueba usaba intencionalmente claves iguales en ambos lados, por lo que no detectaba esta incompatibilidad. Un lector que entregara **los IDs reales de ABC** podría quedar rechazado aun sin anomalías; uno que entregara exclusivamente claves del Worker perdería la prueba de que el mismo ID no fue reasignado a otra clave.

## Diseño evaluado en laboratorio
Se agrega `tests/sql/apd_identity_source_key_pairs_pg17.sql`, posterior al piloto anterior, con un nuevo manifiesto privado por captura de pares exactos `{id,source_offer_key}`.

- Canonicaliza los pares por `id`; exige IDs únicos, claves Worker únicas, formato `D_<números>`, cardinalidad idéntica a `source_total` de ABC y cobertura de todas las claves preparadas (el escáner podría filtrar ofertas que no deben notificarse).
- `register_source_pairs` registra la relación completa y el conjunto de claves canónicas para la confirmación transaccional existente. `revalidate_source_pairs` compara nuevamente **la relación exacta**, no solo la cantidad ni los IDs, y actualiza las dos verificaciones en una misma transacción.
- Los RPC viejos `register_source_identity` / `revalidate_source_identity` quedan sin permisos de ejecución para el rol API del escáner. Se mantienen privados para compatibilidad con el prototipo previo, no quedan accesibles desde PostgREST.
- `commit_capture` sigue exigiendo confirmación reciente del manifiesto de claves y finalización atómica del distrito. El piloto ya rechaza claves previamente asociadas a otro distrito y nunca habilita poda implícita.
- Todas las funciones son `SECURITY INVOKER`, las tablas están en un esquema privado no expuesto, los nuevos permisos de API no se conceden a `anon` ni `authenticated`.

## Prueba con datos ficticios
`scripts/test-apd-source-key-pairs-http.mjs` utiliza identificadores diferentes, por ejemplo `SOLR_ABC_1001` y `D_1001`, y verifica que: las identidades duplicadas fallen, una sustitución de clave con el mismo `id` falle, un `id` sustituido manteniendo clave falle, no se permita commit antes de la segunda lectura, una relación idéntica en distinto orden pueda confirmarse, el commit sea atómico sin poda y otro distrito no pueda apropiarse de `D_1001`.

GitHub Actions levanta PostgreSQL 17 y PostgREST de un solo uso, con secretos ficticios locales, sin conectar a ABC, Supabase ni Cloudflare. La evidencia se limita a resultados de ejecución y verificaciones SQL agregadas.

## Límites y pendientes
Este esquema es un **prototipo aislado**, no una migración lista para aplicar. Antes de producción deben revisarse el riesgo de carreras globales entre distritos, revocaciones y privilegios reales de Supabase, retención/privacidad del manifiesto de pares, validez temporal de ABC, permisos del Worker, referencias de usuarios, respaldo recuperable y reversión. La validación de `D_<iddetalle>` no reemplaza un diseño de compatibilidad para las rutas alternativas futuras.

**Prohibido usar este SQL en la base real hasta que exista respaldo restaurable, revisión de seguridad y aprobación explícita.**

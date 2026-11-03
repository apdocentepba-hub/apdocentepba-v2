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

## Concurrencia e interrupciones simuladas — comprobación del 02/11/2026

Se agregaron `tests/sql/apd_ci_cross_district_failure_trigger_pg17.sql` (disparador de error **solamente en el esquema de PostgreSQL 17 descartable**) y `scripts/test-apd-pg17-concurrent-districts-http.mjs` (peticiones PostgREST simultáneas).

**Ensayo A: interrupción tras el UPSERT mínimo.** Dos capturas de distritos distintos quedan selladas y sus pares de origen revalidados. En el mismo instante, Avellaneda intenta confirmar `D_7001` y un trigger provoca una excepción al insertar la representación completa, cuando la transacción ya había escrito su representación mínima. En paralelo, La Matanza confirma `D_7002` correctamente. Se comprueba mediante SQL que `D_7001` **no figura en ninguna de las dos tablas**, que la captura fallida sigue pendiente y no avanzó el control de distrito, y que `D_7002` sí quedó confirmada.

**Ensayo B: colisión verdaderamente concurrente.** La Matanza y Avellaneda intentan confirmar `D_8001` simultáneamente con identidades Solr distintas. Uno y solo uno completa `commit_capture`; el otro recibe rechazo. Las dos tablas deben contener exactamente una fila `D_8001` y el mismo distrito. Los controles SQL comparan además el total de registros, los estados de las capturas y que los datos originales `D_1001` no hayan sido transferidos.

**Evidencia CI:** commit `d8ae24be28d8c59b708ad5bd79efdb8f25363078`, run `41553607897`, resultado **success**; `Check worker router duplicates`, run `41553607686`, **success**. El primer intento de la prueba tuvo un error en un delimitador de bloque PL/pgSQL del verificador SQL. Se corrigió ese delimitador y se volvió a ejecutar la prueba completa antes de aprobarla. Las pruebas de protección transaccional ya habían superado sus pasos previos.

**No es prueba de operación productiva:** los IDs, distritos y ofertas de este ensayo son ficticios; el trigger de error está limitado al esquema temporal. La simultaneidad se ejercitó con dos solicitudes HTTP en paralelo, no como prueba exhaustiva de todas las condiciones de planificación o interbloqueos posibles. No hubo migración, cambio de Worker ni modificación a Supabase.

**Pendientes antes de producción:** probar interrupciones de red con resultado de commit ambiguo, conmutación segura entre Worker y API transaccional, idempotencia/reintento observando el estado, reglas obligatorias de rama y respaldo productivo restaurable. Ninguna salida de CI autoriza automáticamente el despliegue.

## Recuperación tras perder la respuesta HTTP — ensayo de laboratorio

**Problema:** una llamada `commit_capture` puede terminar correctamente en PostgreSQL y perder la respuesta antes de que el Worker la reciba. No corresponde volver a ejecutar la misma escritura automáticamente ni declarar fracaso de los datos sin consultar su estado.

- `tests/sql/apd_ci_capture_status_readonly_pg17.sql` agrega exclusivamente al laboratorio la función `apd_scanner_api.capture_status(uuid)`: consulta `STABLE`, `SECURITY INVOKER`, sin modificaciones a tablas ni exposición de los datos de ofertas. El RPC informa distrito, estado, páginas y verificación de pares. Se revoca explícitamente el permiso de `PUBLIC` y solo se concede ejecución al rol privado del escáner.
- `scripts/test-apd-capture-response-loss-http.mjs` prepara una captura ficticia de **Quilmes**, ejecuta una única confirmación real en el PG17 descartable, descarta intencionalmente la respuesta correcta para simular pérdida de acuse y utiliza **solo el RPC de lectura** para corroborar que la captura quedó `finalized`.
- La prueba exige **un único intento de `commit_capture`**, **cero reintentos** y una única fila `D_9001` en ambas tablas; comprueba además que un cliente sin sesión de rol autorizado no pueda consultar el estado.
- Este escenario simula la pérdida de respuesta después del COMMIT, **no** corta físicamente una conexión TCP ni prueba la recuperación completa ante caídas de red, interrupciones del proceso o reinicio del Worker.

**Evidencia:** commit `ea680b13031378884ef8cb02d685c1d8521c9af7`, ejecución `41553991532` **success** y comprobación del router `41553991282` **success**. El ensayo de concurrencia y fallo inyectado también volvió a pasar en la misma ejecución, seguido del control SQL de durabilidad.

**Pendiente para conectar un Worker real:** incorporar una política explícita de reconciliación, vencimientos de capturas y respuestas ambiguas, y verificar caída/reinicio real del cliente en un entorno aislado. Ningún cambio de este PR se aplicó a producción.

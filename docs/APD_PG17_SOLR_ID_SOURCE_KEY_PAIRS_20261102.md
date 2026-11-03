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

## Prueba nueva: terminación forzada del proceso y recuperación tras reinicio

**CI:** `41555111266` **success** con commit `d214a64e529a84cb1aefcb9643184f4d7f35f9cf` (más verificación independiente del router). En GitHub Actions se utiliza `scripts/test-apd-pg17-process-restart-http.mjs` con procesos de Node **diferentes** que comparten únicamente la base PostgreSQL 17 descartable.

**Escenario 1, SIGKILL después del commit:** una captura ficticia de Florencio Varela (`D_9101`) se prepara, sella y revalida. Otro proceso ejecuta una sola petición de `commit_capture`, recibe encabezados HTTP de éxito y es terminado mediante `SIGKILL` antes de leer el cuerpo y registrar un acuse de aplicación. El shell comprueba salida por señal (`137`) y arranca un nuevo proceso Node que llama exclusivamente a `capture_status`, obteniendo `finalized`. El SQL posterior verifica una única fila en ambas representaciones y un fence distrital. **No se reenvía el commit**.

**Escenario 2, SIGKILL antes del commit:** se prepara una captura ficticia de Berazategui (`D_9102`), pero se mata el proceso antes de solicitar su confirmación. Un proceso nuevo verifica `ready` mediante la consulta autorizada y no realiza ninguna escritura. El SQL verifica ausencia de la clave en ambas tablas y ausencia de fence del distrito. La captura sigue pendiente.

**Alcance y advertencias:** se probó la terminación forzada de un proceso cliente Node, no la caída de la base PostgreSQL, el reinicio de Cloudflare ni la pérdida de conexión **durante** una operación HTTP en curso. El primer escenario recibió encabezados de una respuesta correcta antes de morir, por lo que tampoco cubre una respuesta completamente indeterminada. No es un algoritmo de recuperación todavía incorporado al Worker publicado. El control demuestra que la infraestructura aislada distingue un lote confirmado de uno pendiente al reiniciar el proceso y evita repetirlo automáticamente.

**Progreso de preparación técnica del escáner (milestones de esta revisión):** 5/7 = **71%**. Hitos: (1) commit atómico distrital PG17, (2) payload completo/RPC/PostgREST aislados, (3) validación exacta de ID Solr + clave Worker, (4) concurrencia y rollback por falla inducida, (5) pérdida de acuse y reinicio forzado del cliente comprobados. **Faltan:** (6) integración segura del Worker y manejo real de etapas y reintentos, (7) pruebas preproductivas con respaldos restaurables, autorización de despliegue y reversión completa. El porcentaje no indica disponibilidad en producción ni se extrapola a la aplicación en general.

## Prueba de SIGKILL durante una solicitud HTTP en curso

**Ejecución CI verificada:** `41555905093`, commit `2b46537e6f5f0dc09dfade7e15ce81060cf8293c`, **success**.

El laboratorio instaló un trigger temporal en PostgreSQL 17 que ejecuta `pg_sleep(7)` **durante la inserción** de la clave ficticia `D_9201` para Hurlingham. El proceso cliente inició `commit_capture` contra PostgREST; el controlador observó la sesión activa con `wait_event='PgSleep'` en `pg_stat_activity` y mató al cliente con SIGKILL (exit 137). Un proceso nuevo, sin reenviar la escritura, consultó `capture_status`.

**Resultado concreto de esa ejecución:** el estado observado fue `finalized`: el servidor había confirmado la transacción **después de morir el cliente**. El control SQL aprobó la correspondencia entre el estado y las filas de las dos representaciones, sin inserciones parciales ni reasignaciones. El ensayo admite también el desenlace `ready` con cero filas, porque una desconexión en ese instante puede causar cancelación y rollback. Nunca admite estados intermedios ni recaptura automática.

Esto prueba un corte real del **proceso cliente** mientras la consulta del servidor está en ejecución, pero no prueba corte físico de red, caída del servidor PostgreSQL, reinicio de Cloudflare ni de la máquina. Por eso todavía es una prueba del mecanismo en laboratorio, no aprobación para desplegar.

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

## 03/11/2026 — puente global de pares hacia staging PG17 aislado

**Objetivo:** el PR #237 ya demostró, en una consulta pública sobre seis distritos, que un conjunto de IDs Solr y claves del Worker no colisionaba globalmente entre dos capturas. El PR #236 ya contaba con `register_source_pairs`, `revalidate_source_pairs` y `commit_capture` en PostgreSQL 17 descartable, pero no existía un preflight global reutilizable que permitiera **rechazar colisiones entre distritos antes de cualquier llamada HTTP al staging**.

**Nuevos archivos (solo PR #236):**
- `scripts/apd-global-source-pair-stage-gate.mjs`: `prepareGlobalSourcePairsForLab({first,second})` recibe **dos conjuntos completos** de pares `{id,source_offer_key}` de 2 a 12 distritos. Valida cardinalidad declarada de cada captura, IDs y claves únicas por distrito **y entre distritos**, formato estricto `D_<números>`, y la misma correspondencia ID→clave al repetir la captura. Rechaza un distrito agregado/eliminado, cambios de recuento o reasignaciones aun con un recuento igual. Conserva el manifiesto de pares en una clausura privada; `summary` solo expone recuentos globales, y `pairsForIsolatedStaging(district, stagedKeys)` entrega **únicamente al cliente de prueba** el par canónico, validando que cada clave preparada exista en el origen. Distritos con cero fuente se auditan, pero no habilitan staging ni poda.
- `scripts/test-apd-global-source-pair-stage-gate.mjs`: **12 pruebas sintéticas** de unicidad, dos pasadas, alteración con misma cardinalidad, subset de staging, rechazo de estructuras inesperadas (incluida la presencia de campos personales) y comprobación de que serializar el resultado de la auditoría no exponga IDs ni claves.
- `scripts/test-apd-global-source-pairs-pg17-http.mjs`: acopla realmente el preflight a **PostgREST en 127.0.0.1:3300**, con JWT exclusivamente ficticio y PostgreSQL 17 descartable. Rechaza previamente tres manifiestos falsificados (colisión de clave, colisión de ID y remapeo entre pasadas), exige **cero solicitudes HTTP** antes de aceptar los manifiestos, y luego procesa dos distritos ficticios `MORENO` y `TIGRE` con IDs Solr distintos de `D_9401`/`D_9402`. Ejecuta `create_capture → stage_capture_page → seal_capture → register_source_pairs → revalidate_source_pairs → commit_capture` para ambos, sin habilitar poda.
- La workflow `.github/workflows/apd-pg17-source-key-pairs.yml` incluye los tests y una verificación SQL posterior de que exactamente dos filas de esos runs quedaron en ambas tablas, con los distritos correctos, estado `finalized` y doble verificación del manifiesto.

**Evidencia CI comprobada:** commit `6c4608bb4f1a2cb4a18fef0ba5ff495794ae0160`, GitHub Actions `41711616911` **SUCCESS**. Pruebas de preflight, staging real y aserciones SQL aprobadas. El resultado agregado del nuevo test HTTP fue: **2 distritos ficticios, 2 manifiestos verificados, 3 rechazos antes de red, 2 commits confirmados, 2 upserts, 0 poda, sin conectar ABC ni Supabase reales**. También aprobó el control del router `41711617026`. El ensayo anterior de concurrencia y rollback siguió aprobando en la misma ejecución.

**Alcance y límites:** el gate de pares compara IDs y claves, **no incluye hashes del contenido de las ofertas**; el PR #237 lo audita por separado, pero ambas comprobaciones todavía **no comparten una implementación productiva**. No se ha ejecutado este puente con ofertas reales de ABC en la transacción PG17, porque el piloto exige manifiestos y datos sintéticos. La comprobación global se limita a los distritos que se pasen expresamente; otros distritos de PBA, ejecuciones concurrentes futuras y recambios durante la escritura dependen de controles adicionales del escáner/SQL. Esta prueba **no constituye permiso de deploy, migración de Supabase, cambio del Worker productivo ni medición del panel autenticado**.

**Preparación siguiente:** integrar la proyección pública de ABC, el hash estable del PR #237 y el preflight global del PR #236 en **un mismo simulador no productivo**, con cancelación segura ante drift y una auditoría de plan de reversión; después efectuar revisión de privilegios y restauración de respaldo antes de solicitar autorización para migrar.


## Puente de proyección, identidad y contenido (03/11/2026)

Se sumó `scripts/apd-global-projected-content-preflight-lab.mjs` para componer la auditoría de las **29 columnas públicas proyectadas** con el gate global de pares y el staging HTTP ficticio de este PR. Dos lecturas completas e independientes por distrito deben coincidir en **ID de Solr, clave del Worker y SHA-256 canónico del contenido proyectado** antes de habilitar `pairsForIsolatedStaging`.

- Se rechazan ofertas no publicadas, distritos contradictorios, campos fuera de la lista proyectada, cursores incompletos, identificadores repetidos, colisiones entre distritos, reasignación de claves y cambios de contenido con igual número de ofertas. Un distrito con cero ofertas verificadas puede auditarse, pero no genera staging ni poda.
- Los hashes se calculan en memoria sobre la proyección canónica (orden estable de campos y claves de objetos). El resumen no expone documentos, observaciones, IDs, claves ni hashes. Los errores intencionalmente no vuelcan valores de ABC.
- Se añadieron nueve pruebas `node:test` y se conectó la nueva compuerta a `scripts/test-apd-global-source-pairs-pg17-http.mjs`. El ensayo sigue escribiendo únicamente **ofertas inventadas** a PostgreSQL 17/PostgREST **descartables y locales**.
- Los 29 campos quedan duplicados deliberadamente como contrato temporal del laboratorio, en paridad declarada con la proyección del PR #237. Antes de una implementación real debe unificarse la fuente de definición y probarse su compatibilidad con la transformación y la versión exacta del Worker que se despliegue.

**No equivale a una lectura simultánea atómica de ABC ni vincula todavía el hash al valor de cada columna escrita por el cliente de staging.** Persisten los riesgos de cambios de ABC posteriores a la segunda lectura, integridad de la conversión hacia staging, tratamiento de `observaciones` (posibles datos personales), reversión y credenciales de Supabase. El módulo no hace conexiones a ABC por sí mismo, no modifica el Worker ni autoriza deploy.


## Integridad de entrega a staging (03/11/2026, segunda etapa)

La primera compuerta comprobaba el par de identidad y el hash del contenido proyectado, pero el ensayador HTTP armaba una fila ficticia por separado. Ahora el mismo objeto `prepareProjectedGlobalPairsForIsolatedPg17` expone `stagedRowsForIsolatedPg17(district, selectedKeys)`: devuelve solamente filas de los documentos canónicos de la **segunda lectura, idéntica a la primera**, cuyas claves fueron autorizadas por el manifiesto global. Los documentos quedan desconectados de los objetos originales para que mutaciones posteriores no alteren el staging.

El modelo de 18 campos de laboratorio es una proyección explícita de `source_offer_key, idoferta, iddetalle, estado, distrito, escuela, cargo, area, nivel_modalidad, turno, jornada, hsmodulos, cursodivision, supl_desde, supl_hasta, finoferta, ult_movimiento, raw`. Para minimizar exposición, se establece `raw:null` y **no** se copian `observaciones` ni `id` de Solr a la fila. Se rechazan valores no escalares en campos de staging y claves ajenas a la auditoría. El SQL de CI verifica por lectura de la base descartable los campos ficticios confirmados, el estado, distrito y la ausencia de `raw`.

**Límites técnicos importantes:** este constructor solo cubre el *piloto*. No implementa la normalización exacta del Worker productivo para turno y curso/división; el laboratorio presupone valores ya normalizados. Tampoco impide que un futuro cliente mal implementado evite este constructor y llame directamente al RPC. En producción hace falta una barrera adicional entre el manifiesto de identidad-contenido y el payload recibido por el servidor, control de privilegios, un plan de filtrado `observaciones/raw` que preserve la utilidad para el docente, y pruebas de paridad con el Worker real. No migrar ni usar el resultado como evidencia de despliegue listo.


## Paridad de transformación Worker → staging (03/11/2026, tercera etapa)

Se identificó y corrigió el desacople de normalización entre el prototipo de staging y el Worker publicado en `worker-live/worker_hotfix.js`. El prototipo ahora replica la lógica de `norm`, `mapTurnoAPD` y `normalizarCursoDivisionServidor` para distrito, turno y curso/división. Ejemplos verificables: `M → MANANA`, `T → TARDE`, `TT → TARDE`, y normalización de espacios/símbolos de grado del curso. El resto de los 17 campos del snapshot admitidos por el piloto sigue la transformación de `buildGlobalSnapshotRow`.

El test `scripts/test-apd-worker-stage-parity-lab.mjs` abre el archivo Worker que se encuentra **en el propio checkout**, extrae únicamente siete funciones puras conocidas (`norm`, `sanitizeSolrNumber`, `sanitizeKeyText`, `buildSourceOfferKeyFromOferta`, `mapTurnoAPD`, `normalizarCursoDivisionServidor`, `buildGlobalSnapshotRow`) y las compara dinámicamente con el staging generado por el laboratorio sobre **ocho ofertas sintéticas** en dos distritos. Si una refactorización del Worker cambia una de esas firmas o sus resultados, el contrato falla; no se instancia el Worker ni se accede a una red.

**Excepciones intencionales de privacidad/arquitectura:** `raw` no conserva el documento fuente, sino `null`; `captured_at` no se incluye en el payload y se toma del identificador de captura del servidor. Se restringen las claves al formato probado `D_<iddetalle numérico>`; se rechazan las rutas alternativas del Worker (`O_<idoferta>` o claves compuestas) hasta diseñar su compatibilidad. Esta paridad demuestra el contrato para las ocho muestras ficticias y las funciones seleccionadas; **no demuestra identidad de todo el pipeline en producción**, ni impide llamadas al RPC que eludan el constructor cliente. La validación servidor-side sigue pendiente. Ninguna publicación o migración autorizada.


## Barrera obligatoria del lado de PostgreSQL (03/11/2026, laboratorio)

Se agregó `tests/sql/apd_server_staged_content_guard_pg17.sql`, **solo para PostgreSQL 17/PostgREST descartables**. Se instala en CI DESPUÉS de ejecutar los escenarios anteriores, que validan el prototipo histórico, para evaluar el efecto de exigir un contrato más estricto de aquí en adelante.

La actualización crea `source_payload_manifests` en el esquema privado y dos RPC de acceso limitado: `register_staged_content` y `revalidate_staged_content`. Ambos aceptan una matriz de las filas sanitizadas, ordenada canónicamente por `source_offer_key`; comparan **los valores completos** de ese manifiesto con `full_staged_payloads` y con las claves del manifiesto de origen. Los 18 campos del contrato son obligatorios; `raw` debe ser `null` y se rechazan claves adicionales, identidades repetidas o valores no escalares inesperados.

El RPC `commit_capture` del laboratorio se reemplaza para **rechazar commits** cuando falte una segunda revalidación reciente de contenido (120 segundos), o cuando las filas de staging no sean exactamente las verificadas. Conserva su comprobación de identidad ABC/Worker, bloqueo por distrito, commit atómico y ausencia de poda. El rol de escáner tiene permisos mínimos para usar los nuevos RPC; los roles públicos no pueden invocarlos.

La nueva regresión `scripts/test-apd-server-staged-content-pg17-http.mjs` ejecuta llamadas HTTP reales contra el PostgREST local: solicita commit solo con pares verificados (debe rechazarse), intenta introducir cambios de cargo/escuela y datos libres (deben rechazarse), exige las dos verificaciones antes de confirmar y comprueba que un registro malicioso permanezca sin confirmar. Además, SQL verifica la persistencia del único registro sanitizado, el estado del intento rechazado y los permisos.

**Límites importantes:** este contrato protege la consistencia entre filas recibidas y manifiestos que el mismo cliente suministra. **No prueba de forma independiente la autenticidad de ABC**; un emisor que controle todas las solicitudes y falsifique ambas capturas podría suministrar manifiestos coincidentes. Además, el piloto asigna permisos SQL internos al rol de escáner porque el esquema privado no está expuesto en PostgREST: no se evaluó el riesgo de un acceso SQL directo con credenciales válidas. Falta aislar escritura con un modelo de credenciales más restringido, verificar retención de datos y paridad del Worker real, respaldar y probar restauración en entorno representativo de Supabase antes de cualquier despliegue.

## Aislamiento del rol de escáner del SQL directo (03/11/2026, cuarto ensayo)

El prototipo anterior concedía a `apd_api_scanner` permiso de `SELECT,INSERT,UPDATE` sobre tablas internas porque los RPC eran `SECURITY INVOKER`. Eso **dejaba una ruta de escritura directa si la misma identidad llegaba a una conexión PostgreSQL**. La exclusión de tablas del esquema expuesto en PostgREST era útil, pero no sustituía permisos SQL mínimos.

El ensayo añadido en `tests/sql/apd_executor_role_isolation_pg17.sql` crea `apd_ci_executor` como rol **NOLOGIN, sin superusuario ni BYPASSRLS**, con acceso restringido a tablas privadas y funciones internas de la réplica. Transfiere a ese rol la propiedad de los RPC de `apd_scanner_api` y los declara `SECURITY DEFINER` con `search_path` explícito, dejando `pg_temp` al final. Luego revoca al rol JWT del escáner todo permiso sobre tablas y funciones del esquema privado, incluido `USAGE`, y verifica que no pueda convertirse en el rol ejecutor. Los RPC públicos siguen prohibidos para `anon` y `authenticated`, así como las rutas obsoletas de identidad sin pares.

La regresión realiza **operaciones SQL reales como `apd_api_scanner`** y exige errores de permisos para lectura, actualización, eliminación y llamadas directas a auxiliares; además prueba sobre PostgREST local las operaciones completas de captura, doble revalidación y confirmación de una oferta ficticia después de revocar esos permisos. Finalmente, consulta las tablas reales para verificar durabilidad y ausencia de escrituras ajenas.

**Limitaciones:** la conversión a funciones `SECURITY DEFINER` se aplica únicamente a SQL de CI contra PostgreSQL 17 descartable, con propietarios y roles que NO son la arquitectura de privilegios de Supabase producción. Un bug en una función `SECURITY DEFINER` eleva el riesgo de abuso; antes de migrar deben auditarse individualmente las consultas internas, bloquear SQL dinámico no confiable, definir propietarios de mínimo privilegio y probar políticas RLS, operación/rotación de credenciales, aislamiento multiusuario, observabilidad y rollback. Que el rol JWT carezca de acceso a tablas no protege contra credenciales con permisos superiores, como el propietario real de las tablas. El experimento no prueba la autenticidad de las capturas ABC ni autoriza deployment.


## 03/11/2026 — ensayo de respaldo y restauración de PostgreSQL 17 descartable

Se incorporó `scripts/test-apd-pg17-backup-restore-ci.sh`, que **solo ejecuta en GitHub Actions** con valores fijos del servicio PostgreSQL 17 ficticio (`apd_ci`, localhost, credenciales de CI). La prueba no utiliza ni conecta a Supabase real.

1. Comprueba la versión del motor, verifica que la base destino `apd_ci_restore_scratch` todavía no exista y toma un `pg_dump -Fc` de los esquemas privados `apd_scanner_pilot` y `apd_scanner_api`.
2. Comprueba que el archivo tiene un índice válido y que una copia deliberadamente dañada **no** puede ser interpretada por `pg_restore --list`.
3. Crea una segunda base vacía, restaura en **una sola transacción** y coteja todas las tablas privadas mediante recuentos de filas y huellas MD5 de cada contenido JSONB canónico ordenado (`scripts/apd-pg17-restore-fingerprints.sql`). No muestra ofertas individuales, observaciones, IDs ni datos personales en el log.
4. Verifica en la base restaurada propietarios y restricciones de ejecución de los RPC, `SECURITY DEFINER`, `search_path`, prohibición de escritura SQL directa desde `apd_api_scanner` y existencia de una captura anterior finalizada.
5. Arranca un **segundo PostgREST** local contra la base restaurada, en el puerto 3301, y ejecuta `scripts/test-apd-restored-pg17-http.mjs`: lee el estado de la captura previa, bloquea reintentos y confirmaciones sin revalidación, y confirma una **nueva captura ficticia** con el esquema protegido.
6. Verifica que los recuentos y huellas de la base **original** sigan idénticos al inicio; borra el contenedor, la base destino descartable y los archivos temporales al terminar.

El respaldo de CI contiene exclusivamente fixtures, pero es un **respaldo con datos** y no debe publicarse como artefacto externo. El algoritmo MD5 aquí es solo una comparación de coherencia entre copias dentro de una ejecución, no una firma criptográfica de autenticidad de ABC. El volcado por esquema supone roles globales de la misma instancia PostgreSQL y **no incluye** respaldos de credenciales, roles globales, configuración de servicio PostgREST, almacenamiento Supabase, autenticación, funciones externas ni restauración de todo el proyecto. Se requiere un ensayo representativo y autorizado de Supabase, política de retención y recuperación ante desastre antes de cualquier cambio productivo.

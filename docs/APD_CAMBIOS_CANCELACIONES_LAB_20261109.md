# APDocentePBA · Detector de modificaciones y cancelaciones · laboratorio v2
**Fecha:** 9/11/2026. **Estado:** pruebas offline únicamente; no desplegado ni conectado a envíos.

## Verificación de la fuente real (solo lectura)
Consulta agregada en proyecto Supabase APDocentePBA (sin recuperar identidades de docentes, oferta ni postulantes):
- `public.apd_ofertas_global_current`: 1.865 filas; último `last_seen_at` 2026-11-09 07:35:35 UTC.
- `public.apd_ofertas_global_snapshots`: 25.650 filas; último `captured_at` 2026-09-18 01:17:10 UTC.
- `public.apd_global_scan_state`: `PROVINCIA_FULL`, `current_published`, `finished`, 2026-11-09 07:35:36 UTC.
- `notes.snapshot_writes=false`; motivo `snapshot_storage_free_tier`. **No reactivar el histórico masivo**.

Esta evidencia confirma que no existen dos capturas oficiales recientes, completas y comparables de las que se pueda generar un flujo fiable de eventos. Ni los 1.865 registros de `current` ni el histórico de 2026-09-18 prueban cancelaciones actuales.

## Qué calcula este laboratorio
- Dos colecciones completas, mismo ámbito, identidad estable, timestamps de captura UTC inequívocos, 48h de separación máxima y segunda captura no mayor a 12h.
- Cambios de estado **explícitos** (nunca inferidos de desapariciones), horario, cierre, suplencia, institución, cargo, área y modalidad.
- Avisos internos de cruce a 72/24 horas del cierre, únicamente con plazo verificado.
- El `finoferta` de ABC admite su formato ISO con sufijo `Z` representando reloj local argentino. **Los timestamps de captura no siguen esa regla**.
- No se interpreta como cambio una fecha simplemente reformateada, ni un cierre imposible, ilegible o vacío.
- IDs de evento deterministas, sin mezclar cuentas, sin enviar correos, WhatsApp ni Telegram.

## Diseño pendiente antes de cualquier producción
1. **Prototipo implementado únicamente en memoria:** `scripts/apd-offer-compact-capture.mjs` recibe páginas del mismo distrito, exige offsets consecutivos, total de origen idéntico, identidad sin duplicados, mismo ámbito y timestamp explícito; retorna solo 14 campos necesarios, ordenados y con SHA-256. No copia `raw`, PID, postulantes, correo ni información personal. Se prueba en `scripts/test-apd-offer-compact-capture.mjs`. **No está conectado al escáner ni puede verificar por sí solo que la fuente externa entregó una instantánea atómica**.
2. Mantener como máximo una captura anterior y una actual por distrito (o un outbox restringido con TTL), con commits transaccionales y validación de cobertura; medir bytes e índices antes de habilitar escrituras.
3. Validar dos barridos completos consecutivos con la misma semántica de origen, sin confundir `current_published` con estado explícito de anulación.
4. Aislar eventos en tabla privada con clave única, caducidad, idempotencia, permisos mínimos y control de acceso. Verificar RLS en cada ruta de lectura.
5. Solo después: filtrar por preferencias y plan vigente, consentimientos y límites de frecuencia; probar colas y rollback; pedir autorización explícita antes de desplegar Worker o enviar notificaciones.

## Límites
El laboratorio demuestra comportamiento determinista sobre datos **sintéticos**. No certifica dos capturas recientes, la existencia de cancelaciones reales ni entrega de mensajes. La PR #256, creada antes de los cambios recientes en `main`, quedó desactualizada; esta PR v2 está basada en el `main` actualizado.

## Segunda etapa — persistencia compacta transaccional (09/11/2026)
Implementación aislada y **exclusivamente para PostgreSQL 17 descartable**:
- `tests/sql/apd_change_compact_pg17.sql`: esquema privado `apd_change_lab`, tabla con RLS habilitado y función `SECURITY INVOKER`; función valida identidad y 14 campos por oferta, huella recalculada del lado SQL, límites de 1 MiB/captura y 1.500 ofertas por distrito, sello horario explícito, orden temporal e idempotencia; conserva **máximo dos capturas por distrito** y usa bloqueo transaccional por ámbito.
- `tests/sql/test_apd_change_compact_pg17.sh`: pruebas contra PostgreSQL 17 REAL en contenedor de GitHub Actions; verifica inserción, replay idempotente, rollback de error forzado después del INSERT, rechazo de datos incompletos/duplicados/cruzados/privados, retención de dos rondas, aislamiento de distritos, permisos y RLS. Incluye recorrido de `compactCaptureFromPages` de Node a PostgreSQL.
- `.github/workflows/apd-offer-change-lab.yml`: laboratorio `diff-lab` de Node + trabajo `pg17-compact-transactions` usando PostgreSQL 17 efímero. No contiene credenciales de producción, ni crea tablas de Supabase, ni publica archivos web.
- **Verificado en GitHub Actions:** 33/33 pruebas Node, trabajo PG17 PASS y control del Worker aprobado (ejecución 42605804873, commit `af39b29aa2b46b3e7d0562b76602eaf6871b75ba`).

### Medición agregada de capacidad (Supabase productivo, SELECT únicamente)
Al observar la tabla `current` (1.865 ofertas, 119 distritos con ofertas, máximo de 81 ofertas por distrito), las 14 claves serializadas en formato JSON/texto suman **788.289 bytes por ronda**; dos rondas equivalen a **~1,58 MB de contenido serializado**. Este cálculo **no incluye índices, metadatos, TOAST, bloat, retención, transacciones, ni variación futura de ofertas** y NO certifica consumo real en PostgreSQL/Supabase. Tamaño de la base observado al consultar: 137.243.795 bytes.
Todas las 1.865 ofertas de `current` presentan estado `PUBLICADA`: esta tabla filtrada **no permite confirmar cancelaciones explícitas**. Sin una fuente autorizada que muestre estados finales, **no emitir cancelaciones** ni inferirlas de ausencias.

### Límites pendientes
- La función prueba atomicidad de la operación en una base aislada, pero aún no se validaron **concurrencia entre procesos reales del scanner, conexión a PostgREST/Supabase, costo físico en la DB productiva, RLS con roles reales, snapshot atómico del backend ABC, ni recuperación sobre un respaldo de producción**.
- El parámetro de error inyectado existe **solo para el laboratorio**; un diseño final necesitaría eliminarlo antes de cualquier activación.
- El SHA-256 del Node se conserva como identificador orientativo; SQL recalcula su propia huella de contenido y no concede autoridad al digest del cliente.
- No hay outbox, cron, Worker conectado, interfaz ni avisos activados. Cualquier despliegue exige autorización expresa y respaldo restaurable.

## Tercera etapa — eventos privados sin envío (09/11/2026)
**Alcance:** laboratorio local de PostgreSQL 17 dentro de GitHub Actions. No se modificó ninguna tabla, permiso, función, Worker ni configuración del proyecto Supabase real.

### Implementación
- `scripts/apd-offer-audit-batch.mjs`: genera una proyección mínima desde el comparador de dos capturas compactas. Solo conserva tipo, clave, campo, valor anterior y nuevo; **no incluye destinatarios, texto de notificaciones ni recordatorios de 72/24 horas**. Ante captura incompleta o vencida no prepara eventos.
- `tests/sql/apd_change_audit_events_pg17.sql`: nueva tabla privada `apd_change_lab.audit_events`, con RLS, privilegios `PUBLIC` revocados, clave única por `scope,event_key`, estado fijo `audit_only`, TTL de siete días y tope de 1.000 eventos por distrito. La función `SECURITY INVOKER` exige dos capturas verificadas y correlaciona cada valor del candidato con **ambas** capturas; rechaza campos arbitrarios, suplantaciones, bajas inferidas por desaparición y estados finales sin comprobación explícita. No existe función de entrega.
- `tests/sql/test_apd_change_audit_events_pg17.sh`: integración Node → dos capturas PG17 → bandeja audit-only. Demuestra deduplicación, rechazo de valores falsificados, recuperación de fallo inyectado después del INSERT, estado no entregable, permisos cerrados y ausencia de eventos ante un solo barrido.
- `tests/sql/test_apd_change_audit_concurrency_pg17.sh`: dos clientes PostgreSQL reales insertan al mismo tiempo el mismo evento; se confirma **exactamente un INSERT y un reintento idempotente**, sin duplicación ni cambio de estado.
- CI: `diff-lab` + `pg17-compact-transactions` + protección del Worker, sin credenciales externas.

### Verificación independiente de fuente actual (consultas SQL SELECT solamente)
- `public.apd_ofertas_global_current`: **1.865 registros** y **1.865 claves diferentes**. Cero claves, distritos o `finoferta` faltantes. Máximo de 81 ofertas por distrito, clave más larga de 9 caracteres y cierre más largo de 20 caracteres.
- **Todas siguen figurando `PUBLICADA`**; no se atribuyen cancelaciones reales a esta tabla. Tampoco hay dos capturas recientes completas guardadas en la fuente histórica como para certificar diferencias reales.
- Estos conteos comprueban la forma de los datos actuales, **no** la atomicidad, paginación íntegra ni fidelidad del origen ABC.

### Evidencia y límites
- GitHub Actions 09/11/2026: **37/37 pruebas de Node**; PostgreSQL 17 real descartable PASS para inserción, TTL, RLS, rollback, duplicados, contraste con capturas y carrera de dos procesos. Marcadores de log `APD_AUDIT_PG17_PASSED` y `APD_AUDIT_CONCURRENT_PG17_PASSED`. Trabajo ejecutado sin acceso a cuentas ni mensajería.
- No hay conexión aún al escáner oficial ni acceso de roles de una instancia Supabase staging; tampoco entrega, opt-in, preferencias, correlación docente ni cron. La incorporación productiva requiere medir el costo real, respaldo restaurable, permisos/roles auditados y dos escaneos oficiales íntegros, además de autorización separada para cambios a infraestructura.
- El campo de estado **no puede pasar a `pending_send` o `sent`**: la propia tabla lo prohíbe. Los eventos permanecen como evidencia candidata, nunca como notificaciones.

## Cuarta etapa — adaptador del escáner Solr con cobertura (09/11/2026)
**Causa observada en el Worker actual:** `fetchAPDDistrictBatch` arma la consulta `descdistrito` y lee `response.docs` por páginas de 150, pero **no controla `response.numFound` ni `response.start`**. Además consulta `sort=ult_movimiento desc`, un orden potencialmente inestable si llegan actualizaciones durante el recorrido. Esta implementación no modifica la función original ni asume que el escaneo actual sea atómico.

- `scripts/apd-scanner-compact-adapter.mjs` exporta `createAPDScannerCompactAdapter({enabled=false, readPage, readScanState, pageSize=150, clock})`. Sin `enabled:true` rechaza la inicialización. **No importa el Worker ni tiene HTTP/fetch ni almacenamiento**: los dos callbacks únicamente se inyectan en el ensayo, no existen credenciales de ABC ni Supabase en el módulo.
- Lee la respuesta Solr bajo su contrato `response: {numFound, start, docs}`; exige un total entero consistente, índices `start` consecutivos, páginas de longitud exacta y sin claves repetidas. Rechaza oferta sin identidad estable, distrito diferente, estados finales en el catálogo `current_published`, páginas truncadas y cambios de cantidad en mitad de captura.
- Repite **dos pasadas completas** sobre las mismas páginas. Rechaza si cambian el total, el orden o cualquiera de los 14 campos observados, aunque el `numFound` permanezca constante. Controla el estado provincial antes y después (137/137 cuando corresponde, `status=finished`, modo, fechas y contadores idénticos).
- Para formar la captura utiliza la proyección de campos publicada por el Worker `buildGlobalSnapshotRow`; las pruebas contrastan la proyección y reproducen 650 ofertas repartidas como 150/150/150/150/50.
- Produce una captura `complete:true` a nivel de formato, pero el resultado externo se marca explícitamente `candidateOnly:true`, `authorizedForProduction:false`. **Nunca certifica fidelidad temporal del índice ABC, ni cancela, envía, persiste o actualiza producción.**
- No existe conexión automática al `fetchAPDDistrictBatch` actual. Un futuro enlace requerirá aceptar el contrato `numFound/start`, controlar doble lectura y validar barridos reales de origen, sin interferir con notificaciones ni registros existentes.

### Pruebas de rechazo
Bandera apagada, estado del escáner incompleto o modificado, tiempo de captura fuera de una ventana fresca, `numFound` ausente/cambiante, respuesta `start` errónea, página incompleta, ID duplicado, distrito equivocado, estado no publicado, ausencia de identificador, cambio de campos con recuento estable, error del callback antes de completar y distrito genuinamente vacío. Datos ficticios; no se consultó ABC con usuarios reales. La ejecución completa del laboratorio incluye las pruebas Node previas, los ensayos PostgreSQL 17 y la protección del Worker.

**Limitación metodológica:** incluso dos pasadas idénticas no prueban una instantánea atómica, dado que el índice puede cambiar y volver al mismo estado entre lecturas. Por eso el adaptador no se considera listo para notificaciones ni vinculado a producción.

## Quinta etapa — lectura REAL y filtrada de ABC, sin escrituras (09/11/2026)
**Origen oficial consultado en modo público y solo lectura:** `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select`. Las herramientas de consulta devolvieron JSON Solr; no se conservaron documentos completos ni se incorporaron CUIL, nombres, reemplazantes o datos personales al repositorio.

### Hallazgo reproducible que corrige el contrato
- `q=descdistrito:"AVELLANEDA"` (sin filtro de estado): **`numFound=9355`**. Es un universo de registros del distrito **no equivalente** al conjunto de publicaciones vigentes, por lo que no debe tratarse como listado para notificaciones.
- `q=descdistrito:"AVELLANEDA" AND estado:"Publicada"`: **`numFound=16`**, `start=0`. La variante `q=estado:"Publicada"` para toda la provincia devolvió `numFound=2034`, por lo que un filtro exclusivo de estado tampoco identifica un distrito.
- ABC aceptó `sort=ult_movimiento desc,iddetalle asc`, que incorpora desempate por clave para que el orden de las páginas sea determinista frente a fechas `ult_movimiento` idénticas.
- Se hicieron dos lecturas independientes de Avellaneda con **`rows=10`**, `start=0` y `start=10`, y exactamente el filtro de distrito+estado anterior: **cada lectura devolvió 10+6 ofertas, 16 claves sin repetición, 16 estados `Publicada` y 16 distritos `AVELLANEDA`**. La proyección mínima de 14 campos y el orden coincidieron entre las dos lecturas.
- Consulta adicional de solo lectura en `public.apd_ofertas_global_current`: **16** registros de Avellaneda, todos `PUBLICADA`. Es coincidencia de conteos; **no** se asevera equivalencia temporal oferta por oferta, ni que las 16 permanezcan vigentes después de la observación.

### Ajuste de código y pruebas
- El adaptador `scripts/apd-scanner-compact-adapter.mjs` exige que `responseHeader.status=0` y que `params.q`, `params.sort`, `params.rows`, `params.start` y `params.wt` reconfirmen el contrato de fuente, filtro y paginación. Entrega a `readPage` esos parámetros para que una implementación futura los respete; continúa sin realizar ninguna petición HTTP por sí mismo.
- El máximo del ámbito compactado baja a 1.500 ofertas por distrito, acorde con el límite ya establecido en las pruebas de persistencia. Rechaza tanto el `q` no filtrado como ordenamiento sin desempate, aunque la página contenga aparentemente ofertas publicadas.
- Regresiones sintéticas para 16 ofertas en páginas 10+6, consulta solo por distrito, consulta solo por estado, distrito cruzado, eco de parámetros incorrecto, total >1.500 y cambios de contenido dentro de dos pasadas.

**Limitación:** dos respuestas aparentemente idénticas podrían proceder de caché HTTP o un índice actualizado mientras se leen; no se certifica atomicidad del backend. La API pública devuelve campos personales que se descartan **antes** de materializar la captura, pero las respuestas originales existen en el transporte del servicio de lectura. No se habilita almacenamiento ni notificación.


## Sexta etapa — lector público seguro y ensayo opt-in (09/11/2026)

**Hallazgo oficial contrastado con dos pasadas reales de ABC (consulta pública, solo lectura):**
- La API Solr admite `fl` para elegir exclusivamente 18 campos de infraestructura/oferta: `iddetalle,id,idoferta,descdistrito,estado,finoferta,turno,jornada,hsmodulos,cursodivision,supl_desde,supl_hasta,escuela,nombreestablecimiento,descripcioncargo,cargo,descripcionarea,descnivelmodalidad`.
- No es necesario solicitar CUIL, nombres de reemplazantes, domicilios, autores ni observaciones. Los 18 campos autorizados se comprobaron directamente en el eco `responseHeader.params.fl`; ninguna respuesta de la prueba contenía campos adicionales.
- Dos consultas completas secuenciales con el filtro `descdistrito:"AVELLANEDA" AND estado:"Publicada"`, `rows=10`, `start=0/10`, `sort=ult_movimiento desc,iddetalle asc` y `fl` anterior: ambas dieron **`numFound=16`, páginas de 10+6, 16 identificadores únicos y mismos campos autorizados en igual orden**. No se almacenaron los documentos devueltos en el repositorio ni en la base.
- Estas verificaciones se hicieron mediante consultas web de solo lectura. **No prueban atomicidad ni garantizan que las pasadas vengan de instancias o cachés diferentes**.

**Código integrado exclusivamente en la rama de laboratorio:**
- `scripts/apd-scanner-compact-adapter.mjs`: ahora envía el listado `fields` y exige eco literal `responseHeader.params.fl`. Rechaza cualquier documento con campos ajenos a los 18 autorizados. Agrega `inspect({district})` que ejecuta dos pasadas, sin llamar al estado provincial del escáner y **sin devolver oferta por oferta, capturas certificadas, eventos o destinatarios**; `certifiedScannerCapture=false`.
- `scripts/apd-abc-public-reader.mjs`: construye un GET contra **endpoint HTTPS fijo de ABC**. El transporte está deshabilitado por defecto; exige consulta, distrito, `fl`, estado y orden exactos; usa `credentials:omit`, `redirect:error`, tiempo máximo de 20 segundos y lectura por stream limitada a 1 MiB por página. No contiene credenciales ni URLs personalizables, datos de usuarios, POST, base de datos o envío.
- `scripts/apd-abc-public-probe.mjs`: ensayo manual restringido **solo a AVELLANEDA**. Exige simultáneamente la variable de entorno `APD_ABC_READONLY_PROBE=1` y las dos opciones `--read-only --district=AVELLANEDA`. La salida es un JSON de métricas agregadas, sin filas, nombres ni identificadores de oferta. Si falta algún requisito, no hay solicitud de red y termina con `PROBE_DISABLED`. Comando opt-in para una sesión de pruebas autorizada:
  ```sh
  APD_ABC_READONLY_PROBE=1 node scripts/apd-abc-public-probe.mjs --read-only --district=AVELLANEDA
  ```
  **Este comando queda preparado, no programado, no invocado por CI y no se ejecuta desde el Worker productivo.**
- `scripts/test-apd-abc-public-reader.mjs`: pruebas con transporte HTTP simulado que comprueban listas de campos, rechazo de CUIL inesperado, respuesta de HTML, HTTP 429, tamaño excesivo, datos inestables y ejecución accidental del CLI con bandera apagada. Las pruebas automáticas **nunca hacen GET reales a ABC**.

**Evidencia del CI antes de actualizar esta documentación:** 68/68 tests Node aprobados; PostgreSQL 17 descartable para capturas/auditoría/concurrencia aprobado; control del Worker aprobado (ejecución de GitHub Actions `42616329224`).

**Pendientes y límites:** comparar periódicamente resultados de consultas oficiales sin sobrecargar ABC; validación formal de integridad/atomicidad del índice, escenarios con varios distritos, límites físicos y credenciales de staging, recuperación sobre copia y autorización para cualquier conexión real con el escáner. Ninguna escritura a Supabase ni emisión se autorizó o realizó.


## Séptima etapa — respaldo y restauración real en PostgreSQL 17 (09/11/2026)

**Objetivo:** comprobar que los registros privados del detector pueden recuperarse ante una alteración sin perder las políticas de seguridad. Este ensayo es exclusivo del servicio PostgreSQL 17 descartable de GitHub Actions, no de Supabase productivo.

- Nuevo script tests/sql/test_apd_change_backup_restore_pg17.sh, ejecutado **después** de las pruebas de transacciones, auditoría y concurrencia. Requiere PGHOST=localhost, PGDATABASE=apd_ci, PGUSER=apd_ci y el identificador real del servicio Docker postgres:17; aborta sin ese entorno.
- Realiza pg_dump --format=custom con el cliente PostgreSQL **17 del propio contenedor**, preservando el esquema privado apd_change_lab. No usa credenciales de producción ni servicio externo de almacenamiento.
- Restaura con pg_restore --exit-on-error en una **segunda base descartable** apd_restore_lab. Compara conteos y huellas del contenido completo de ambas tablas (captures, audit_events) contra la base original.
- Verifica que sigan activas las políticas RLS, sin permisos de acceso para los roles invitados, el estado obligatorio audit_only y el límite de dos capturas por distrito.
- Altera deliberadamente **solo la base restaurada de prueba**, detecta la divergencia, la descarta y vuelve a restaurar desde el respaldo original. Comprueba que recupera exactamente el estado inicial y que nunca cambió la base fuente del laboratorio.
- El archivo temporal de respaldo y la base secundaria se eliminan al finalizar. No se produce, restaura ni borra ningún respaldo real de Supabase.

**Evidencia verificada:** ejecución GitHub Actions [42622944134](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42622944134): 68/68 pruebas Node PASS; compactación PG17, auditoría y carrera de concurrencia PASS; APD_RESTORE_PG17_PASSED (7 capturas, 4 eventos auditables, respaldo de 20.179 bytes); control de protección del Worker PASS.

**Límite:** esta prueba valida restauración de un esquema de laboratorio con datos sintéticos y roles locales. No garantiza que un respaldo productivo completo de Supabase pueda restaurarse, ni demuestra consistencia de dos capturas ABC oficiales. Antes de una migración real se necesita un ensayo independiente en staging con permisos equivalentes, presupuesto de almacenamiento, rollback documentado y autorización expresa.


## Octava etapa — permisos mínimos y entrada controlada (09/11/2026)

**Hallazgo previo:** las pruebas de captura, auditoría, concurrencia y backup habían utilizado principalmente el administrador del contenedor. Eso demostraba integridad transaccional y revocaciones a roles invitados, pero **no** que una identidad de aplicación sin permisos administrativos pudiera almacenar datos sin acceder a tablas directamente.

### Cambios en laboratorio PG17 descartable
- `tests/sql/apd_change_least_privilege_pg17.sql`: roles NOLOGIN/NOSUPERUSER/NOBYPASSRLS separados (`apd_lab_function_owner`, `apd_lab_ingest`, `apd_lab_observer`). Solo el propietario interno tiene privilegios de tabla y políticas RLS para ejecutar las validaciones; el rol de ingesta no tiene `SELECT`, `INSERT`, `UPDATE` ni `DELETE` sobre las tablas, ni permiso `CREATE` sobre el esquema.
- Funciones de entrada `submit_compact(jsonb)` y `submit_audit(jsonb)` con propietario interno NOLOGIN, `SECURITY DEFINER`, `search_path` fijo con `pg_temp` al final y permiso `EXECUTE` concedido exclusivamente al rol de ingesta. Ambas funciones fuerzan `false` en el argumento de error inyectado de las funciones internas: el rol de aplicación no puede acceder a ese control de test.
- `tests/sql/test_apd_change_least_privilege_pg17.sh`: ensayo con `SET ROLE` sobre una instancia PostgreSQL 17 real descartable. Comprueba rechazos de lectura, borrado y ejecución de funciones internas; ingreso de dos capturas del distrito sintético BERISSO por la interfaz limitada; creación de un evento `audit_only` contrastado con ambas capturas; rechazo de valores de evento falsificados; ausencia de privilegios de un rol observador.
- La creación de funciones y la revocación `PUBLIC` ocurren dentro de una misma transacción para evitar una ventana de exposición. La función propietaria no es superusuario ni tiene BYPASSRLS. Diseño alineado con las recomendaciones de seguridad de funciones y RLS de PostgreSQL 17.

### Evidencia
- [GitHub Actions #42625469079](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42625469079): `APD_LEAST_PRIVILEGE_PG17_PASSED`, `APD_RESTORE_PG17_PASSED` (**9 capturas, 5 eventos, backup 23.821 bytes**), `APD_AUDIT_CONCURRENT_PG17_PASSED`, **68/68 pruebas Node** y control del Worker aprobado.
- Se verificaron simultáneamente rechazo de privilegios y escritura legítima: no alcanza con afirmar RLS activo si el rol no puede realizar su trabajo.

### Límites antes de staging real
- Los roles de ensayo son NOLOGIN y se usó `SET ROLE`: todavía falta simular conexiones independientes con credenciales y políticas equivalentes a los roles reales de una instancia Supabase separada.
- `SECURITY DEFINER` aumenta la superficie de riesgo: exige auditoría del propietario, todas las funciones invocadas, el `search_path`, la revocación de `PUBLIC`, permisos explícitos, parámetros y cambios de schema. Se mantiene fuera del proyecto real.
- No hay evidencia de dos escaneos provinciales completos y atómicos ni fuente de anulaciones explícitas. No activar Worker, triggers, jobs ni mensajes.


## Novena etapa — clientes TCP independientes y autenticación real en PostgreSQL 17 (09/11/2026)

**Avance objetivo:** la etapa 8 validó roles con `SET ROLE` sobre la sesión administrativa. Eso no comprobaba la autenticación real de una aplicación ni los permisos heredados por una conexión independiente.

- Nuevo ensayo **exclusivo de CI descartable**: `tests/sql/test_apd_change_tcp_roles_pg17.sh`. Se niega a correr si no detecta `PGHOST=localhost`, `PGPORT=5432`, base `apd_ci`, el usuario administrador de laboratorio y el contenedor Docker con imagen **exacta** `postgres:17`.
- Crea dos identidades PostgreSQL LOGIN con contraseñas aleatorias temporales generadas mediante `openssl rand`. Los secretos no se imprimen, no se agregan a Git ni se incorporan al proyecto Supabase real. La identidad de ingesta hereda solamente los permisos de `apd_lab_ingest`, con membresía `SET FALSE`: no puede elevarse a ese rol mediante `SET ROLE`.
- Comprueba **conexiones TCP realmente autenticadas** (el `session_user` coincide con el usuario que inició sesión). Un usuario observador independiente no puede llamar a las funciones privadas.
- Verifica rechazos efectivos de `SELECT` sobre capturas, `DELETE` sobre eventos, ejecución de la función interna con parámetro de fallo, uso de generadores sintéticos de test y escalamiento de roles. Revoca `EXECUTE` público de las funciones auxiliares ficticias del laboratorio, sin afectar la aplicación.
- Genera mediante el mismo código Node del laboratorio dos capturas y un evento **enteramente sintéticos** del distrito MAGDALENA; cada `submit_compact` / `submit_audit` se ejecuta desde una nueva conexión de ingesta autenticada, sin `SET ROLE`. Prueba inserción válida, reintento idempotente y rechazo de valores `before` falsificados.
- Comprueba mediante la conexión administrativa de prueba que la base conserva exactamente **dos capturas, un evento `audit_only` y cero registros falsificados** para ese distrito.
- Repite el ensayo real de respaldo y restauración después de las nuevas conexiones. No se crea ningún proyecto staging externo, no se modifican reglas ni roles de Supabase y no se ejecuta código contra usuarios.

**Evidencia:** ejecución CI [42626612821](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42626612821):
`APD_TCP_ROLE_PG17_PASSED independent_logins=2 compact_captures=2 audit_events=1 unauthorized_writes=0`;
`APD_RESTORE_PG17_PASSED captures=11 audit_events=6 backup_bytes=24572`;
**68/68 Node PASS**, concurrencia/retención/auditoría y restauración PostgreSQL PASS. El control independiente de protección del Worker también aprobó. Los errores de permisos en logs son *esperados y comprobados por las pruebas negativas*, no fallas del trabajo.

**Limitación restante:** se verificaron contraseñas de dos clientes en una instancia PostgreSQL 17 efímera, **no** una conexión a Supabase staging con roles y API efectivos de PostgREST, ni un origen ABC atómico. Mantener la PR en borrador y prohibidos los envíos hasta validar esos límites y obtener aprobación para infraestructura productiva.


## Décima etapa — PostgREST HTTP/JWT aislado y permisos de API (09/11/2026)

**Propósito:** validar la capa HTTP real entre la aplicación y la base, no solo conexiones TCP/PostgreSQL. No se creó un proyecto de Supabase ni se utilizó la cuenta o base del usuario. El servicio se ejecutó únicamente dentro del runner descartable de GitHub.

- Nuevo archivo tests/sql/test_apd_change_postgrest_http_pg17.sh: comprueba que se ejecuta contra PostgreSQL 17 efímero del CI; crea un autenticador PostgreSQL LOGIN, NOINHERIT, sin privilegios de superusuario ni BYPASSRLS, con capacidad de cambiar únicamente a los roles aislados de ingesta y observación. La contraseña del autenticador y la clave HMAC para JWT se generan aleatoriamente en cada ejecución, no se guardan en Git ni se imprimen.
- Se levanta la imagen oficial fijada postgrest/postgrest:v14.18, en red local del runner y escuchando únicamente en 127.0.0.1:3000. API privada de prueba; no se expone a Internet, Cloudflare ni usuarios.
- Nuevo archivo scripts/test-apd-postgrest-http.mjs: utiliza fetch real contra la API y JWT HS256 firmados localmente, con caducidad. Son **17 solicitudes HTTP**, sin datos de docentes ni destinatarios.
- Pruebas negativas: cliente anónimo, JWT falsificado, JWT vencido, rol observador o propietario no habilitado; acceso directo a capturas/eventos, inserción directa, función interna de inyección y funciones auxiliares de test. Las solicitudes no autorizadas reciben respuesta de error.
- Pruebas positivas: JWT de ingesta válido permite ejecutar exclusivamente las dos funciones controladas para almacenar 2 capturas sintéticas de SAN VICENTE y 1 evento audit_only, con segundo envío idempotente. Se rechazan el evento con campo anterior falsificado y una captura con clave de CUIL no autorizada.
- Después de la prueba HTTP se repite el respaldo con pg_dump y la restauración real en una base secundaria aislada para comprobar que los nuevos registros no vulneran la recuperación.

**Evidencia CI:** [GitHub Actions #42628138195](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42628138195) — los dos jobs de laboratorio aprobaron. Marcadores:
APD_POSTGREST_HTTP_NODE_PASSED requests=17 captures=2 audit_events=1 unapproved_access_denied=1
APD_POSTGREST_HTTP_PG17_PASSED isolated_http=1 real_jwt=1 no_production=1
APD_RESTORE_PG17_PASSED captures=13 audit_events=7 backup_bytes=24731
Además se ejecutaron exitosamente las 68 pruebas Node del detector, los ensayos previos de roles TCP y PostgreSQL y la protección independiente del Worker.

**Limitación de seguridad:** un contenedor PostgREST en CI representa la interfaz HTTP/JWT y el cambio de rol PostgreSQL, pero **no equivale a Supabase staging**: no se validaron todavía API Gateway, JWT/roles exactos de Supabase Auth, configuración efectiva de PostgREST de ese proveedor, conexiones SSL remotas, políticas reales de producción ni rollback de un proyecto externo. No usar estos secretos ni contenedores en producción. La PR continúa en borrador.

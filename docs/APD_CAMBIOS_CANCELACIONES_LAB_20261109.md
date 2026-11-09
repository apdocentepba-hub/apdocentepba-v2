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

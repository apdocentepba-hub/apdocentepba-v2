# APDocentePBA — cierre técnico candidato integrado (04/11/2026)

## Qué hace el candidato unificado

**Código final generado en CI**: `tmp/apd-morning-worker/worker_hotfix.js`, SHA-256 exacto `c748dc0f1b9ba070c806620947037acc528822f64d404d1d6efa85bd8fb58d85`.

Incorpora en el mismo Worker:

1. Búsqueda ABC por distritos con concurrencia acotada y filtro de estado **Publicada** directamente en Solr, sin omitir el filtro personal de cargo, materia, turno y nivel.
2. PID: consultas fallback limitadas a dos concurrentes; compatibilidad orientativa, no adjudicación.
3. **Cierre exacto por oferta**, preferencia de la hora original de `finoferta` sobre un rótulo renderizado, tratamiento específico del reloj local de ABC cuando el campo se entrega con sufijo `Z`, y exclusión si el estado no es Publicada, el cierre ya llegó o la fecha/hora no es verificable.
4. Protección repetida en **respuesta del panel, correo inicial, recarga de ofertas para barrido, digest almacenado y encolado individual**. La normalización repetida del payload conserva el estado y el cierre oficiales; se eliminó el parser UTC antiguo que podía finalizar antes de la hora real.
5. Sincronización de seguimiento en lotes PostgREST de hasta 100 elementos, desduplicación por ID canónico y lotes separados para filas existentes y nuevas (protege `first_seen_at`).
6. Tanda adicional de correo con cierre próximo desde las **06:01 hora argentina**, aprovechando el cron existente de continuación cada dos minutos; **no agrega un quinto cron ni hace escaneos independientes minuto a minuto**. No reemplaza los resúmenes de 14:00, 18:00 y 22:00 ni garantiza entrega instantánea. Evita duplicados de tanda por KV.

## Evidencia de aceptación alcanzada

- **CI unificado verde:** [run 41852791540](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41852791540). Construcción de un único Worker, chequeo sintáctico, dry-run Wrangler, cierre, colas, plan expirado, permisos y routeo autenticado con **cuentas ficticias**, franja matutina, deduplicación y prueba diferencial de guardado.
- **ABC real y público sin credenciales:** 2 consultas GET, 106 ofertas publicadas recuperadas en una muestra de Quilmes y Tigre, 106 visibles conforme a filtro del frontend y guardas del backend, duración **1.297 ms** en runner de CI con PID y sesión simulados. No extrapolar al tiempo real del navegador.
- **Prueba de lote sintética:** 105 filas individuales = 105 POST antes / 2 POST nuevos; datos en memoria. No se escribieron registros reales en Supabase.
- **Auditoría de esquema real de Supabase:** tabla `public.user_offer_state` existe y tiene índice `UNIQUE(user_id, offer_id)`, columnas `first_seen_at`, `last_seen_at`, `is_active`, `offer_payload` y RLS activo. Solo consultas SQL de metadatos, ninguna escritura o lectura de datos de docentes.
- **Lanzamiento no realizado:** el Worker productivo original sigue en la versión `da0632dd-1b9e-4332-9c4a-75b5eade8d74` con 100 % del tráfico en la última comprobación; la variante PID previa `90e76973-5509-4d1b-82e1-91b4c2811295` tiene 0 %; el código final integrado **aún no está subido**. Mantener URL/versiones y permisos separados.

## Mecanismo de entrega preparado, sin ejecución

Rama independiente `staging/apd-final-offline-reviewed-20261104` con:

- `scripts/upload-apd-final-zero-traffic-once.mjs`: pin criptográfico del candidato, comparador de 29 bindings/4 cron y KV; verifica antes/después producción 100 % original, usa exclusivamente `wrangler versions upload --keep-vars --strict` sin `deploy`, y confirma que la versión nueva queda al 0 %.
- `.github/workflows/apd-final-zero-traffic-once.yml`: reconstituye los seis pasos de generación, corre suite de regresión y consulta Cloudflare en solo lectura antes del upload. **No se activa solo**: exige rama exacta, archivo de autorización nuevo, título exacto de commit y credenciales del repositorio; el archivo de autorización **no fue creado**.

## Bloqueos antes de decir «terminado para usuarios»

1. **Permiso expreso** para subir la versión final a Cloudflare al **0 %**, sin afectar usuarios. Revisión real de URL de esa versión y sus recursos.
2. Validar con una sesión propia autorizada el login, plan, filtros, PID real, carrusel, reloj y latencia. Los test actuales usan cuenta ficticia. No pedir contraseñas ni tokens por chat y no usar TinyFish de pago.
3. Validar guardado PostgREST de lotes con **un conjunto de prueba aislado**, sin modificar tablas de usuarios actuales, antes de habilitar el nuevo mecanismo de sincronización.
4. Validar correo matutino con destinatario de prueba autorizado, no envíos masivos, y confirmar que el campo ABC `finoferta` coincide con el horario oficial del portal de postulación en un caso concreto. El control de fuente conserva la incertidumbre si no puede verificarse.
5. **Nueva autorización expresa, separada**, para activar un canary mínimo de tráfico (por ejemplo 1 %), con reversión inmediata al original y monitoreo de fallos. Cualquier incremento posterior requerirá evidencia favorable.

**No realizar merge, asignación de tráfico, envío de correo o escritura en datos reales de docentes automáticamente.** La meta es publicar con precisión, no marcar «terminado» a costa de falsear pruebas.

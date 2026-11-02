# APDocentePBA — Histórico liviano y hoja de ruta móvil

**Auditoría:** 2/11/2026; **estado:** migración de diseño y pruebas exclusivamente en rama. **NO EJECUTADO en Supabase productivo**.

## Diagnóstico real del histórico

Consulta SQL de solo lectura:
- `apd_global_scan_state`: `status=finished`, `mode=current_published`, 137/137, 2.609 ofertas procesadas, `completed_scan_date=2026-11-02`, finalizó 07:33:18 UTC (04:33 ART).
- `apd_ofertas_global_current`: 2.609 filas, 122 distritos con ofertas, **exactamente 2.609** observadas entre `started_at` y `finished_at`; cero filas antiguas o posteriores al barrido.
- `apd_ofertas_global_snapshots`: **25.650 filas de un solo distrito, «25 DE MAYO»**, en 17 días locales históricos entre el 31/3 y el 17/9. Última escritura 18/9 UTC.
- `notes.snapshot_writes=false` y `notes.auto_scan_disabled_reason=snapshot_storage_free_tier`. Se trata de una decisión previa para preservar el espacio: 67 MB de snapshots en una base de ~114 MB al momento del cambio, según notas de scanner. **No volver a activar ese mecanismo**.
- No existe un histórico completo verificable de publicación/cierre APD; no reconstruirlo retroactivamente desde `first_seen_at` sin aclarar la semántica.

## Nueva solución diseñada y sometida a prueba (NO activada)

Archivo `sql/apd_daily_province_summary_20261102.sql`:
- Crea tabla `apd_daily_province_summary` con **una sola fila por fecha de barrido** y conteos por distrito en JSONB. No copia oferta, escuela, turno, cargo, DNI, postulante, ni otra información personal.
- Una función `capture_apd_daily_province_summary(date)` ejecutable solo desde el `service_role` backend exige `PROVINCIA_FULL`, `finished`, `current_published`, 137/137 y la fecha local exacta.
- Cuenta únicamente filas del escaneo entre `started_at` y `finished_at` y coteja `offers_processed`; si hay incompletitud o discrepancia, **rechaza sin guardar**.
- PK por fecha, `ON CONFLICT` sin reescritura idéntica: reintentos seguros, sin duplicar fechas.
- RLS activado; tabla y RPC sin permisos para usuarios anónimos/autenticados. La información agregada destinada a usuarios se deberá exponer más adelante mediante un Worker de solo lectura y rate limit.
- Estimación de almacenamiento: **aprox. unos KB por fecha**, frente a miles de filas de oferta por día. El tamaño real requiere prueba de carga y política de retención.
- La migración **no crea cron**, no escribe ninguna fila y no expone datos. El Worker versionado quedó preparado para llamar la RPC **solamente al terminar** el escaneo, pero con `APD_DAILY_SUMMARY_ENABLED` desactivada por defecto: no se puede activar antes de aplicar el esquema y aprobar el despliegue. Si falla esa captura adicional, el escáner provincial continúa sin perder su estado `finished`.

## Prueba de integración automatizada
- `scripts/test-apd-daily-summary.sql` crea tables de escaneo y usuarios de rol simulados en PostgreSQL 16 efímero, ejecuta la migración y comprueba: 3 ofertas en dos distritos, totales, fecha, idempotencia, RLS/permisos, rechazo de barrido incompleto, rechazo de conteos erróneos y fecha antigua, exclusión de ofertas fuera del escaneo.
- `.github/workflows/apd-daily-summary.yml` ejecuta con CI PostgreSQL 16; no utiliza credenciales reales ni conecta a Supabase.
- **NO es éxito en producción** hasta ejecutar la migración en etapa autorizada, conectar Worker, comprobar un escaneo diario completo y medir almacenamiento.

## Siguientes pasos priorizados
1. **Alta:** homologar el formato `daily summary` con el Worker y los límites de Supabase; validar la prueba SQL y el coste.
2. **Alta:** integrar RPC mediante flag de ejecución solo backend después de escaneo finalizado; no habilitar sin aprobación. Monitorizar éxito/error por fecha y filas generadas; no romper el escáner aunque la captura agregada falle.
3. **Alta:** crear endpoint autenticado de histórico agregado con fecha de fuente, estado de frescura y datos escasos sin confundirlos con oferta nueva ABC. Modificar tarjeta Estadísticas sólo al tener dos o más cortes fiables.
4. **Alta:** QA autenticado y medición TTFB/LCP y tiempos de `/api/mi-plan`, `/api/account/preferences`, `/api/mis-alertas`. El refactor de carga progresiva no prueba reducción efectiva de latencia.
5. **Alta:** cotejar muestras de ofertas y fechas de cierre contra el APD oficial con sesión autorizada.
6. **Media:** notificaciones email/Telegram/WhatsApp según permisos reales y registros de entrega (sin enviar pruebas a terceros sin autorización).

## Idea de aplicación Android y iPhone — FASE FUTURA

El objetivo no es replicar el formulario APD sino hacer el **acceso rápido a una oferta compatible**. Registrar aquí como diseño, sin iniciar un proyecto paralelo ahora.

- Preferir arquitectura **PWA instalable + push web** como piloto económico, validar el soporte de permisos de push en Android e iOS antes de considerar APK Android y aplicación iOS. Si se requieren funciones nativas, evaluar un frontend compartido con empaquetado seguro; publicación en tiendas tiene costes/revisión.
- Una notificación debe generarse con el **mismo matcher** que la web: distrito, cargo, nivel, turno, planes, exclusiones y preferencias de canal. Idempotencia por `user_id + source_offer_key + canal` y registro de entregas; límite de envíos por oferta y ventana de vigencia.
- Enlace directo a aviso oficial APD **solo si existe URL/deep link de oferta verificado**. Nunca prometer que un usuario puede postularse mediante APDocentePBA. Si el enlace granular exige sesión, dirigir a ABC oficial para que se autentique allí.
- **Vincular cuenta ABC**: no recopilar ni almacenar contraseña, cookies de sesión ni códigos 2FA de ABC. Comprobar si ABC tiene OAuth/OIDC/API/delegación documentada y permitida; de no existir, usar enlace externo oficial y login en ABC, sin técnicas de scraping que impersonen a la persona.
- Requisitos para inicio de desarrollo móvil: feed fiable, preferencia y suscripción seguras, estado de entrega verificable, opt-in de push, baja voluntaria y evaluación de privacidad.
- No abrir notificaciones ni enviar correo a docentes en esta fase.

**Separación de proyectos:** solo APDocentePBA; no mezclar con VOLVÉ ni FLUYNOVA.

## Criterio de avance
Esta entrega termina **la definición de tabla y prueba automatizada aislada**, no la automatización de producción ni la disponibilidad de tendencias al usuario. Porcentaje del histórico no debe declararse como completado hasta demostrar varias fechas de captura real y una vista autenticada coherente.

## Integración de backend preparada y rollback
- `worker-live/worker_hotfix.js` incluye `maybeCaptureDailyProvinceSummary` y llama a la RPC **después** de `saveScanState` cuando `finished=true`.
- La opción `APD_DAILY_SUMMARY_ENABLED` no debe existir ni tener valor `true` en producción hasta la aprobación. No se desplegó este Worker.
- El Worker conserva `snapshot_writes:false`: nunca reinicia las capturas masivas.
- `scripts/test-apd-daily-worker-gate.mjs` verifica: bandera desactivada, escaneo incompleto, fechas inválidas, URL/service role, fallo HTTP y red no fatal, y orden correcto de persistencia.
- **Activación futura segura:** (1) comprobar espacio/roles y aplicar migración; (2) probar RPC únicamente sobre el barrido completo y fecha actual; (3) revisar conteos/bytes y backups; (4) desplegar Worker con bandera desactivada; (5) activar `APD_DAILY_SUMMARY_ENABLED=true` solo cuando todo está validado y observar primer cierre diario; (6) añadir lectura autenticada en frontend en un PR separado.
- **Reversión:** desactivar bandera sin revertir escáner; no borrar la tabla hasta conservar copia verificada. Un fallo de resumen jamás reintenta las páginas de origen.

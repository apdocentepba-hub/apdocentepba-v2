# APDocentePBA — Puerta de verificación para histórico provincial (2/11/2026)

## Estado confirmado, SIN cambios productivos

Se corrió un SELECT en el proyecto Supabase `vvgkinkvojqwfuqaxijh` (solo lectura) antes de esta entrega:
- 137/137 distritos con barrido terminado el **2/11/2026**.
- 2.609 registros en `apd_ofertas_global_current`; los 2.609 están dentro de la ventana del último escaneo y ninguno carece de distrito. Hay ofertas en 122 distritos.
- Base de ~123 MB, de los cuales el histórico masivo anterior ocupa ~67 MB.
- El rol `service_role` puede leer las ofertas y consultar/bloquear la fila de escaneo; la migración nueva todavía no existe.
- El campo `notes.snapshot_writes` continúa desactivado.

**Importante:** `ready_to_review_migration=true` representa únicamente coherencia del último corte y permisos de lectura. NO demuestra validez de toda oferta en ABC, no prueba un despliegue ni constituye autorización para modificar la base.

## Diagnóstico reutilizable

Archivo: `scripts/apd-daily-history-preflight.sql`.
- Es SQL de solo lectura, con datos agregados y sin información personal.
- Comprueba estado/fecha local del escaneo, conteos, distritos faltantes, permisos de `service_role`, existencia de tabla/RPC y RLS.
- Su ejecución en el CI corre contra PostgreSQL 16 y 17 aislados. Se valida la salida `ready_to_review_migration` tras las pruebas de la migración.
- Si el último barrido no está completo, no se debe activar ninguna captura. Si el escaneo cruza la medianoche argentina, el diseño actual lo rechaza por seguridad y debe tratarse antes del despliegue.
- Un historial con una sola fecha no permite tendencias. No se fabricarán valores de días faltantes.

## Barreras de despliegue: pendientes de autorización explícita

1. Revisar espacio disponible, seguridad y plan de recuperación. Mantener una copia verificable de la migración y esquema actual.
2. **Solo con autorización específica**, aplicar `sql/apd_daily_province_summary_20261102.sql` al proyecto productivo. Esta migración agrega tabla/RPC: no borra ni modifica ofertas actuales, usuarios, planes ni snapshots.
3. Ejecutar `scripts/apd-history-postflight.sql` **solo después de aplicar la migración**. Exigir `security_ok=true` y `empty_for_first_capture=true` (tabla vacía). Verifica RLS activo, función SECURITY INVOKER, EXECUTE solo `service_role`, acceso denegado a clientes, y prohibición de DELETE del backend sobre la tabla nueva. Si algo falla, NO activar capturas; revisar y corregir antes de continuar.
4. Ensayar la RPC mediante `service_role` exclusivamente en backend de prueba autorizado, para el último barrido completo; comprobar una fila única e idempotencia. Evitar repetir una captura si ya está guardada.
5. Revisar bytes consumidos y conservar `snapshot_writes=false`; no habilitar capturas masivas.
6. Preparar despliegue del Worker verificado compilando el piloto del PR #186, con `APD_DAILY_SUMMARY_ENABLED` ausente/desactivado y sin alterar rutas de producción.
7. Tras QA y una autorización separada de activación: habilitar captura diaria en el cierre del escáner, observar el primer cierre completo y luego una segunda fecha distinta.
8. Solo con dos o más fechas válidas, habilitar un endpoint agregado autenticado y las tendencias en el frontend.

## Reversión

- Si la captura falla: desactivar `APD_DAILY_SUMMARY_ENABLED` sin tocar el escáner actual.
- Mantener tabla y datos capturados hasta verificar respaldo; **no** usar `DROP TABLE` como reversión automática.
- Si falla la ruta del Worker: volver al bundle previo verificado; conservar la bandera desactivada.
- Los errores del histórico no deben transformar un barrido `finished` en `error`.

## Pendiente en alcance global

Validar muestras contra APD oficial con sesión autorizada, medición de velocidad real del panel, estadísticas posteriores al histórico y auditoría de entrega de alertas. La idea Android/iOS sigue como etapa futura; no se guardarán contraseñas ABC.

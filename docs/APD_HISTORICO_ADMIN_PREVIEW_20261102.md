# APDocentePBA — piloto protegido de lectura del histórico provincial

Versión de diseño: 2/11/2026. **Solo GitHub / pruebas, sin desplegar.**

## Qué se incorporó
- `worker-live/apd_history_admin_read.mjs`: endpoint `GET /api/admin/provincia/historico-diario?limit=30` para **administradores**.
- Valida primero la bandera exacta `APD_DAILY_HISTORY_READ_ENABLED=true`. Por defecto devuelve 404 y **no consulta ninguna sesión ni tabla**.
- Con bandera activa exige la función productiva `requireAdmin`, que valida sesión Bearer activa y rol administrativo; usuarios comunes reciben 403 y no autenticados 401.
- Sólo hace SELECT de campos agregados en `apd_daily_province_summary` usando la clave del backend (nunca se expone al cliente).
- `limit` entero validado 1 a 60; defecto 30; respuesta `Cache-Control: no-store`.
- Verifica integridad de fecha, cantidades por distrito, totales y tipo de datos. Ante falta de migración, errores del proveedor o filas inválidas, devuelve 503 genérico sin revelar SQL, claves ni datos privados.
- Sin fechas devuelve `dates:[]`, `total_dates:0`, `comparable:false`. Con una sola fecha tampoco muestra `comparable:true`. No inventa días no capturados.
- No contiene operaciones POST/UPDATE/DELETE/INSERT, ni mensajes a usuarios.

## Integración y pruebas
`scripts/build-apd-history-admin-read-preview.mjs` compone una vista previa del Worker compilado canónico con anclas únicas y fail-closed, sin modificar `worker-live/worker_hotfix.js`. Es deliberadamente independiente del generador piloto de capturas diarias: **no requiere ni activa** `APD_DAILY_SUMMARY_ENABLED`.

`scripts/test-apd-history-admin-read.mjs` prueba rutas desactivadas, 401, 403, tabla vacía, dos días válidos, validación de límites, corrupción de datos, fallo de Supabase, secretos ausentes, generación única y sintaxis ESM del bundle compilado, sin conexión a producción.

## Condiciones todavía pendientes
1. **Respaldo de producción completo y verificado para restauración**. El archivo de huellas en Google Drive no es un dump recuperable. La migración sigue bloqueada.
2. Aplicar SQL del histórico cuando exista respaldo, verificar postflight/RLS y tabla inicialmente vacía.
3. Captura real de dos días distintos mediante el Worker autorizado, opt-in de escritura desactivado durante el primer despliegue.
4. Una autorización adicional para desplegar y activar la ruta de lectura. Antes de habilitarla, probar con sesión real de administrador y de usuario común, con credenciales fuera de CI.
5. Evaluar qué estadísticas agregadas podrán mostrarse a usuarios autenticados sin exponer funciones administrativas. No reutilizar el acceso del administrador como acceso general.

## Límites explícitos
- El endpoint **no está disponible en la web real** y no ha sido probado contra una sesión real.
- Los tests de Node usan sesiones y resultados SQL simulados. No confirman la aceptación efectiva de la sesión productiva ni compatibilidad tras despliegue.
- Una bandera de lectura independiente permite revertir la función inmediatamente sin afectar el escáner.

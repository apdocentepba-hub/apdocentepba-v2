# Procedimiento de lanzamiento y contingencia — candidato comercial
No ejecutar en producción sin autorización explícita. No exportar secretos, no publicar ofertas comerciales ni realizar cobros reales durante QA.

## Evidencia inicial
Base 4a1487ab: 22 controles exitosos, uno omitido; suites 73/73 y 42/42 (casos parcialmente compartidos); Chromium 390 y 1280 píxeles; módulo completo seis escenarios sintéticos; PostgreSQL real descartable aprobó pausa y liquidación pendiente. No equivale a prueba en Cloudflare o Mercado Pago real.

## Secuencia de activación
1. Confirmar PR, versión activa y huellas exactas. Si cambian, reconstruir y repetir controles. Revisar diferencias de esquema, restricciones, permisos y cuotas; obtener respaldo verificable, versión anterior y procedimiento de restauración. No usar snapshot histórico como Worker actual.
2. Aplicar migraciones aditivas en orden: consolidación, pago, checkout, preferencias. Mantener los tres planes nuevos inactivos y el interruptor cerrado. Comprobar lectura de catálogo legado, que las nuevas tablas/RPC no sean públicas y que todas las suscripciones anteriores queden intactas.
3. Publicar únicamente la versión aprobada del Worker acumulativo, con admisión cerrada, tras comprobar todos los bindings y cron. No sustituir configuración ni regenerar secretos. Comprobar rutas autenticadas y anónimas.
4. Publicar frontend compatible, verificar versión efectiva y caché. Mantener acceso previo. Activar catálogo nuevo completo en una única transacción, todavía con admisión cerrada. Verificar cuentas de prueba controladas y derechos anteriores; no crear cargos ni enviar mensajes reales.
5. Sólo con autorización explícita, evidencia del proveedor de prueba y aceptación del operador, abrir admisión. Verificar precios, términos, límites y conciliación; registrar hash, versión, hora, operador, pruebas y señal de rollback.

## Pausa de emergencia (después de activación)
La pausa es una operación administrativa, no una acción del usuario ni una desactivación de suscripción. Usar exclusivamente este procedimiento, dentro de una transacción de operador privilegiado:
```sql
BEGIN;
SELECT pg_advisory_xact_lock(170394,20261125);
UPDATE public.apd_commercial_release_control SET enrollment_open=false WHERE singleton;
COMMIT;
```
Verificar que el catálogo mantiene FREE, TRIAL_14D y COMPLETO activos, que las nuevas pruebas/contrataciones se bloquean y que pagos pendientes todavía se concilian. Nunca desactivar planes o eliminar historial para revertir una publicación. No retornar a Worker previo al modelo si hay obligaciones nuevas: corregir hacia adelante o preparar una versión compatible de recuperación. Guardar evidencia de incidentes y evitar reintentos ciegos. Restaurar admisión sólo por nueva autorización y prueba de corrección.

## Condiciones de no publicación
- Sandbox de Mercado Pago no comprobado; no confundir simulación con aprobación financiera.
- Auditoría completa de permisos de radar/PID, caducidad, crons y registro real pendiente.
- No hay aún ensayo integrado de Cloudflare + PostgreSQL + proveedor de prueba ni autorización de activación.
- Una reserva sin preferencia identificable queda en revisión, nunca se libera por mero timeout.

## Estadísticas de usuarios
Cuentas QA históricas: 8 desactivadas, sin admin; 50 cuentas activas no administrativas confirmadas por consulta agregada de producción, sin modificación. Se excluyen exclusivamente cuentas desactivadas que coincidan con los cuatro marcadores de QA conocidos (nombre, apellido, dirección ficticia y ausencia de admin). Se conservan para auditoría; el listado administrativo puede incluirlas explícitamente con include_qa=1. Totales comerciales no incluyen administradores. No borrar registros sin revisar dependencias y autorización. Nuevas pruebas exclusivamente en aislamiento. Candidato de filtros pendiente de pruebas acumulativas.

## Verificación 1fbef78
78/78 preflight, dos endpoints de administración ensamblados, seis escenarios completos aprobados; 23 controles generales exitosos, uno omitido, uno falló por arranque de Chrome sin puerto DevTools. Corrección de infraestructura: consumir stderr, plazo de arranque de 25 segundos, perfil limpio y un único reintento de arranque; nunca reintentar aserciones fallidas. PID: marca privada WeakMap de identidad de objeto y reevaluación de vigencia, no confiar en pid_visible serializado. Pendiente validación de esta revisión. No se modificó producción.

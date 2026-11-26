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

## Cierre adicional de facturación heredada
Preflight 228da78: 79/79, 6 escenarios integrales PASS. Se incorporó bloqueo de nuevas renovaciones automáticas heredadas al activar catálogo comercial; no se cambia cancelación existente ni se anulan contratos vigentes. Se suspenden avisos de vencimiento obsoletos para evitar comunicaciones engañosas (no enviar un texto nuevo sin aprobación). El preflight registra SHA-256 del módulo acumulativo sin exportar código ni secretos. Validación de nueva revisión pendiente. La consulta de metadatos de secretos GitHub no está permitida por el conector; no se ha comprobado credencial sandbox de Mercado Pago. No usar credenciales de producción para simular pagos.

## Evidencia 13c0ea3 y próximos controles
81/81 preflight, seis escenarios integrales PASS, candidato 902908 bytes SHA-256 65006ce5607cd348bff9fd7a606381b7c4fda1af2f9e27f7b473faad99f162ac. Nueva revisión amplía prueba integral de administración (401/403, filtros QA y acceso de auditoría). Probe de Mercado Pago únicamente GET de pago de prueba conocido, exige live_mode=false, referencia QA exacta, importe ARS 2000 y aprobación sin devolución. No se ejecuta contra el proveedor en CI. Los tokens de prueba y producción pueden compartir APP_USR: verificar el entorno en Developers antes de configurar exclusivamente APD_MP_SANDBOX_ACCESS_TOKEN, nunca copiarlo al chat ni usar fallback. Requiere compra de prueba con cuenta compradora de test en entorno separado y referencia apd-sandbox-*. El probe no crea compras ni concede acceso. Fuente: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/create-application y https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases. La validación real permanece bloqueada hasta disponer de esa evidencia; la aprobación de lanzamiento sigue pendiente.

## Candidato estable 3acdb93 y auditoría de esquema real (25/11)
24 controles aplicables exitosos, 1 omitido; 83/83 preflight y siete escenarios integrales, SHA-256 Worker sin cambios 65006ce5607cd348bff9fd7a606381b7c4fda1af2f9e27f7b473faad99f162ac. Consultas SELECT de producción: columnas, tipos, restricciones, índices y permisos por defecto. No existen aún los cuatro nuevos objetos ni los tres planes nuevos. Se comprobó que las ACL por defecto de postgres y supabase_admin conceden ALL sobre tablas a service_role, anon y authenticated. Se corrigen los REVOKE sobre las cuatro nuevas tablas incluyendo service_role antes de conceder privilegios mínimos; el rol de servicio ya no puede modificar el interruptor. QA reproduce esos defaults. Se añade transacción de activación de catálogo con precios, visibilidad pública exacta y admisión cerrada; ensayada sólo en fixture al aprobar CI, jamás en producción. La nueva revisión cambia SQL de instalación, no el módulo Worker. Bloqueantes de proveedor de prueba, despliegue y autorización siguen abiertos.

## Verificación c88a2a2 y ensayo integrado adicional
24/24 controles aplicables, 83/83 preflight, 42/42 política, 7/7 escenarios sintéticos, Chromium 390/1280, PostgreSQL confirma ACL reales, activación y rechazo de replay. Nuevo ensayo: módulo completo en VM contra PostgREST localhost y PostgreSQL 17 descartable, mismas migraciones, identidades sintéticas, reloj real, vencimiento de trial en fixture, pausa y conciliación. Mercado Pago sigue simulado; ningún pago real, credencial de proveedor real ni acceso a la DB de producción desde el transportador. Estado de la nueva revisión pendiente de CI. No declara validación Cloudflare nativa ni del proveedor.

## Ensayo 309e748 — 26/11
23 controles aprobados, uno omitido, uno falló. 83/83 unitarios y 7/7 escenarios simulados; integración HTTP real llegó hasta reserva de checkout y falló por permiso INSERT ausente en fixture (SQLSTATE 42501, PostgreSQL). La fixture de pagos sólo concedía SELECT/UPDATE; el otro ensayo hereda INSERT mediante ACL por defecto. Se corrige únicamente permiso mínimo en fixture, añade precondición explícita y diagnóstico HTTP sanitizado. No modifica ACL ni registros de producción. Pendiente nueva ejecución.

## Work: inspección de Mercado Pago y evidencia sandbox — 26/11
Se verificó en Developers la existencia de cuentas compradora/vendedora y credenciales de prueba de APDocentePBA. La URL para prueba de Webhooks está vacía; el simulador ofrece la URL productiva. No se enviaron eventos ni se guardó configuración. El conciliador de producción exige live_mode=true de manera intencional: un pago sandbox no debe activar una suscripción real.

El probe ampliado es sólo GET: verifica /users/me como vendedor de test argentino (id exacto y test_user), collector_id, live_mode=false, ARS 2000, referencia exacta y fase explícita approved/refunded. Sólo acepta referencias apd-sandbox-* o la identidad sintética fija del laboratorio; no acepta referencias de otros usuarios. Las observaciones de aprobación y devolución son independientes, no prueban por sí mismas la transición del plan. No modifica el adapter de producción ni crea compras, reembolsos, despliegues o secretos.

Para observación real: configurar exclusivamente APD_MP_SANDBOX_ACCESS_TOKEN, APD_MP_SANDBOX_SELLER_ID, APD_MP_SANDBOX_PAYMENT_ID, APD_MP_SANDBOX_REFERENCE y APD_MP_SANDBOX_PHASE (approved o refunded) en un ejecutor privado; ejecutar node scripts/apd-commercial-sandbox-payment-probe.mjs. No copiar tokens al chat, código, logs ni artifacts. No configurar el token de test en el Worker productivo.

Sigue pendiente implementar y validar el endpoint público aislado de checkout/webhook y su conciliación de sandbox con PostgreSQL descartable, antes de generar el pago de test. No se ha creado ni pagado una preferencia del proveedor.

## Evidencia de cierre de preflight y preparación de publicación (26/11)
Commit 2dd1c657: 91/91 pruebas, siete escenarios con PostgreSQL y PostgREST reales y proveedor simulado; run 45812156933. Base activa 39270d55-e179-4c69-96a7-c1658d617a03, SHA-256 a8f35eaed5b003bf8f8a9c7ade63684e0f145d13814496be9050224c39ae08a8; candidato 902908 bytes SHA-256 65006ce5607cd348bff9fd7a606381b7c4fda1af2f9e27f7b473faad99f162ac. 29 bindings exactos y cuatro cron aprobados. Supabase real, SELECT agregado: 8 planes, 73 filas de suscripciones, 0 tablas y 0 funciones con prefijo apd_commercial_. No se modificaron cuentas ni datos. Se añade preparación local descartable del paquete exacto, configuración conservada, huella y versión de reversión; no es una carga Cloudflare ni un dry-run Wrangler. El siguiente gate exige respaldo de producción restaurable (ver docs/APD_RESPALDO_GITHUB_ACTIONS_CIFRADO_20261102.md), migraciones inactivas y verificación posterior antes de cualquier promoción. No hay evidencia disponible del respaldo real restaurado; no cambiar el procedimiento manual ni sus permisos. Admisión comercial permanece cerrada hasta evidencia de Mercado Pago y aceptación.

## Carga Cloudflare y transacción de instalación (26/11)
Run 45812758775: candidato 762b5116-9f47-4a7a-a464-f694fd96dce1 cargado al 0%, versión previa 39270d55-e179-4c69-96a7-c1658d617a03 intacta, 29 bindings, cuatro cron y huella aprobados. Run 45812757819: reintento de timeout Chrome aprobado. Generador scripts/build-apd-commercial-atomic-install.mjs reúne las cuatro migraciones, locks acotados, comparación exacta en tablas temporales de planes anteriores, suscripciones, checkout y preferencias, ACL/RPC y admisión cerrada. El SQL generado no se ejecuta por sí mismo; ensayo de fallo y replay exclusivamente en PostgreSQL descartable. Requiere evidencia de respaldo restaurable antes de ejecución productiva y no incluye activación. No registrar datos de las tablas temporales. 

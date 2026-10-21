# Vencimiento de Alertas APD — release protegido (21/10/2026)

## Objetivo
Cuando finaliza la prueba de siete días o vence una mensualidad, el Worker deniega el acceso a funciones pagas y deja de enviar alertas. El usuario puede seguir iniciando sesión para reactivar el servicio. En el panel aparece un aviso y un botón para abrir los planes disponibles.

## Auditoría previa (21/10/2026)
- 48 cuentas; 40 pruebas gratuitas vencidas; 4 pagos mensuales vencidos.
- En los últimos 30 días solo hubo envíos a dos beneficiarios Insigne autorizados por el propietario y a la cuenta de administración.
- Se identificaron 11 alertas enviadas a una cuenta con prueba vencida en abril (histórico, no actual).
- Las sesiones de login no constituyen autorización para utilizar un plan pago.
- Tres excepciones reconocidas por el propietario: Luis Bermejo y Ayelen Daniela Grzeskow (fechas 2100), Mirna Romina Cardoso (sin vencimiento). No revocar, facturar ni notificarles vencimientos automáticamente.

## Cambios de esta rama
- `expiry_access_notice_patch.js`: aviso de reactivación no intrusivo en el panel, refrescado cada 60 segundos, consultando el Worker protegido. No bloquea el login ni altera las preferencias.
- `worker-live/worker_hotfix.js`: `/api/mi-plan` informa `access_active` calculado en el servidor; correos transaccionales de vencimiento opcionales.
- Correos automáticos: activación mediante `APD_EXPIRY_NOTICES_ENABLED=true` solo después del despliegue validado. Máximo tres intentos por ejecución de cron; aviso solo durante los siete días posteriores al vencimiento; clave única por usuario y período para evitar duplicados; no hay campañas retrospectivas masivas.
- `migrations/20261021_expiry_subscription_access.sql`: protege la tabla de suscripciones con RLS y retira permisos del navegador; marca de modo explícito el permiso ilimitado existente de Mirna.

## Orden seguro de puesta en producción
1. Ejecutar y aprobar pruebas sintácticas y smoke de plan vigente, prueba vencida, plan pagado vencido, cobro reciente, sesión todavía viva y los tres permisos especiales.
2. Confirmar que `service_role` conserva `SELECT/INSERT/UPDATE` en `user_subscriptions`; verificar que ningún flujo de cliente necesite acceso directo a la tabla de facturación. El código frontend principal usa `/api/mi-plan`.
3. Aplicar la migración de forma controlada. Revisar que el permiso de Mirna es reconocido y que Luis/Ayelen mantienen el suyo.
4. Construir el candidato a partir del paquete live verificado; respetar `PRODUCTION_SOURCE_GUARD_V1`, no utilizar `npm run deploy:worker`.
5. Realizar smoke reales autenticados del Worker y comprobar que no se envían correos durante las pruebas (flag apagado).
6. Recién entonces activar `APD_EXPIRY_NOTICES_ENABLED=true` y verificar los registros `notification_delivery_logs` de los primeros cron.
7. Verificar mensaje en el panel, apertura de selector de planes, checkout y restauración de alertas tras pago real confirmado.

## Política de comunicaciones
Un solo correo por período efectivamente vencido, con enlace al sitio y explicación del estado. No repetir a diario, no mandar correos a cuentas admin ni a permisos especiales, no informar que hubo un cobro cuando no se verificó. Las preferencias permanecen guardadas. Se registra estado `sent_expiry_notice` o `failed_expiry_notice` en la tabla existente. En caso de error, no se reintenta automáticamente para impedir duplicados: se investiga mediante auditoría.

## Pendiente fuera de este cambio
`users` y `user_preferences` también requieren una migración de permisos/RLS de forma coordinada con la autenticación vigente; no bloquearlas sin migración y test aparte.

# APDocente — Seguridad de usuarios y preferencias (22 de octubre de 2026)

## Estado de producción confirmado

**La etapa 1 fue aplicada y verificada en Supabase el 22/10/2026.** No se desplegó un Worker nuevo ni se alteró la lista de usuarios, suscripciones, sesiones, preferencias ni reglas de envío.

| Tabla | Anon/auth: lectura | Anon/auth: escritura | Backend service_role |
| --- | --- | --- | --- |
| `public.users` | Solo columnas `id,nombre,apellido,email,celular,activo,ultimo_login` | Revocada | SELECT/UPDATE preservados |
| `public.user_preferences` | SELECT de tabla todavía habilitado para compatibilidad | Revocada | SELECT/UPDATE preservados |
| `public.user_subscriptions` | Revocado previamente; RLS activada | Revocada previamente | Sin cambios |

Confirmado mediante consultas de privilegios posteriores a la transacción.
Una lectura nula (`WHERE FALSE`) ejecutada como `anon` probó que las columnas explícitas requeridas por el panel siguen consultables. **No se ejecutó una prueba de login real con un usuario.**

## Riesgo que se mitigó

El esquema anterior concedía a `anon` y `authenticated` SELECT, INSERT, UPDATE y DELETE sobre `users` y `user_preferences`, ambas tablas sin RLS. Eso incluía acceso por SELECT a `users.password_hash` desde roles públicos. La etapa 1 revocó los permisos de escritura y limitó SELECT de `users` a las columnas que usa el panel legado, excluyendo `password_hash`.

## Riesgo pendiente — IMPORTANTE

- Ambos esquemas **siguen sin RLS**; `users` expone a clientes anónimos datos de contacto y `user_preferences` expone preferencias de todas las cuentas. **La etapa 1 no resuelve ese riesgo.**
- `app_v2.js` (cargado por `index.html`) lee `users?id=eq...&select=id,nombre,apellido,email,celular,activo,ultimo_login` y `user_preferences?user_id=eq...&select=*` con el token público Supabase. No se puede revocar SELECT completamente sin rediseñar primero esas lecturas.
- El acceso a `/api/account/profile` ya está autenticado por sesión en el Worker, pero **falta una ruta segura para leer preferencias** desde el Worker. No aceptar un `user_id` arbitrario del navegador; obtenerlo de la sesión validada.
- Aunque no se identificaron otras escrituras desde el frontend activo en los archivos inspeccionados, algunas versiones antiguas o clientes externos podrían depender de estos permisos. Monitorear errores 42501 y el panel.

## Siguiente etapa técnica para protección completa

1. Crear ruta **GET /api/account/preferences** en Worker con `getSessionUserByBearer` y `supabaseSelect(env, ...)`. Retornar solamente la fila del usuario autenticado; nunca datos de otras cuentas.
2. En `app_v2.js`, cambiar `obtenerDocentePorId` para usar `GET /api/account/profile` y `obtenerPreferenciasPorUserId` para usar la nueva ruta autenticada. Añadir pruebas que impidan regresión a REST público.
3. En un **Worker de staging**, probar: login con contraseña, login con Google, perfil/edición, preferencias/guardado, sesión expirada, panel y cuentas con excepciones Insigne.
4. Desplegar primero Worker seguro y luego frontend, comprobar tráfico real y caché. No tocar períodos de planes ni cron. Mantener una ventana de compatibilidad para pestañas antiguas.
5. Después de verificar en producción, aplicar **otra migración**: revocar los SELECT restantes de `anon`/`authenticated` y habilitar RLS sobre ambas tablas sin políticas abiertas. Comprobar que `service_role` conserva permisos. Validar con Supabase Security Advisor y pruebas de login/alertas.
6. Registrar y documentar rollback, sin volver a exponer hashes de contraseña. Si se necesitara recuperar acceso al panel, revertir frontend/Worker, no dar SELECT público irrestricto.

## Validaciones antes del cierre definitivo

- Los permisos de escritura públicos son falsos.
- `password_hash` no se puede leer como `anon` ni `authenticated`.
- `service_role` conserva acceso de backend.
- El frontend deja de solicitar directamente registros de usuarios/preferencias.
- Se rechazan identidades arbitrarias y sesiones vencidas.
- No se cortan notificaciones, alta de usuarios, actualizaciones de preferencias ni flujos de pago.

**Importante:** esta documentación no implica que la etapa 2 esté implementada, ni que el Worker esté desplegado. No activar RLS hasta cumplir esas comprobaciones.

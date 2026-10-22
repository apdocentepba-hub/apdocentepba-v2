# APDocente — RLS activado en producción (22/10/2026)

**Migración confirmada:** `apd_secure_users_preferences_after_authenticated_panel_20261022` (registro de Supabase, versión `20261022155856`).

## Cambios reales efectuados

- En `public.users` y `public.user_preferences`: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- Revocación de lecturas de tabla y columnas anteriormente expuestas a `anon` y `authenticated`. Se mantienen revocadas operaciones de modificación pública establecidas en la etapa 1.
- Sin políticas RLS públicas. Todas las consultas de perfil y preferencias del navegador deben pasar por el Worker, cuya sesión es verificada antes de acceder a datos internos.
- `service_role` conserva permisos `SELECT`/`UPDATE` y `BYPASSRLS`. El Worker continúa usando sus credenciales de servidor y rutas `/api/account/profile`, `/api/account/preferences`.
- No se modificaron filas de usuarios, preferencias ni suscripciones.

## Verificación completada después de aplicar

| Control | Resultado |
|---|---|
| RLS `users` | habilitado |
| RLS `user_preferences` | habilitado |
| SELECT de tabla para `anon`/`authenticated` | revocado |
| SELECT de email/hash de contraseña a `anon` | revocado |
| SELECT/UPDATE de `service_role` | preservado |
| Error `rls_disabled_in_public` para estas tablas | ya no aparece en Security Advisor |
| Aviso `rls_enabled_no_policy` | presente, esperado porque acceso solo desde Worker |
| Datos de usuarios, suscripciones y preferencias | sin cambios de cantidad |
| Código de frontend publicado | `app_v2.js?v=18` (solicitudes al Worker autenticado) |
| Worker publicado | versión `4bcad51e-8554-4a8a-88a1-b3ed457a8d61` |

**Limitación importante:** los controles de privilegios, el sitio público y la presencia del nuevo código fueron verificados, pero **la prueba autenticada real del panel después de este cambio RLS todavía debe repetirse** con el titular y, cuando sea posible, con cuenta de prueba no administradora.

## Control inmediato recomendado

1. Abrir una sesión con contraseña y, si aplica, otra por Google.
2. Entrar a Perfil/Inicio, Preferencias y Alertas; guardar un cambio no crítico en preferencias, recargar y comprobar persistencia.
3. Revisar panel de plan/suscripción y operaciones de notificación (no hacer compras ni envíos de prueba masivos).
4. Buscar en registros del Worker errores HTTP 500/502/403/42501 derivados de estas rutas.
5. Verificar que navegadores con recursos antiguos puedan recargar la última versión del frontend.

## Si aparece una regresión

No resolverla otorgando acceso público indiscriminado a `users` ni `password_hash`. Primero corregir o restaurar Worker/frontend y revisar una sesión afectada sin compartir credenciales; escalar un eventual rollback de RLS solo con autorización específica, tras determinar cuál ruta legítima no se migró. **No hay SQL de rollback automático**, intencionalmente, para evitar reintroducir el riesgo de exposición pública.

[Documentación oficial de Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

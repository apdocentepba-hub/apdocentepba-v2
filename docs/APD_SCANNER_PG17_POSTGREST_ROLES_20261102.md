# Seguridad de la integración transaccional — ensayos de roles en PG17 / PostgREST

**02/11/2026.** Esta prueba crea **roles exclusivamente locales** para validar el aislamiento de la captura del escáner por HTTP. No hay cambios de Supabase, Cloudflare, la web, usuarios ni alertas.

El [modelo de seguridad actual de Supabase](https://supabase.com/docs/guides/api/securing-your-api) distingue los permisos SQL (`GRANT`) de las políticas RLS. Las funciones PostgreSQL pueden ser ejecutables por `PUBLIC` de forma predeterminada y requieren revocaciones explícitas. El piloto aplica `REVOKE` sobre el esquema descartable y tres roles de prueba:

- `apd_pilot_anon` y `apd_pilot_authenticated`: sin acceso al esquema, a sus tablas ni a los RPC de captura.
- `apd_pilot_scanner`: único rol habilitado a consultar, crear/actualizar registros de staging y ejecutar las funciones específicas; **sin privilegio DELETE directo**, por lo que no puede hacer una poda de registros aunque tenga un token válido.
- Todos los roles son `NOLOGIN`, `NOSUPERUSER` y `NOBYPASSRLS`. PostgREST recibe JWT firmados con una clave de **laboratorio descartable**, nunca credenciales reales.

El workflow inicia PostgreSQL 17 y PostgREST 16.3 temporales y verifica peticiones HTTP reales: sin JWT, JWT de usuario autenticado y JWT de servicio simulado; exige que los dos primeros sean rechazados y que solo el último pueda completar una captura sintética. Comprueba que los intentos de `DELETE` sean rechazados.

**Advertencia crítica:** el prototipo todavía concede al rol de servicio `SELECT/INSERT/UPDATE` sobre las tablas de prueba, porque sus funciones son `SECURITY INVOKER`; por eso **no es un diseño de permisos mínimo apto para producción**. En una implementación real las tablas de staging deben residir en un esquema privado/no expuesto, con API limitada, RLS apropiada, permisos restringidos y autenticación de servidor. No copiar estos permisos al proyecto real.

No se prueba RLS de producción ni la recuperación integral de Supabase. La instalación del escáner corregido sigue bloqueada hasta tener respaldo restaurable y pruebas de concurrencia/errores con el esquema definitivo.

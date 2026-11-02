# APDocentePBA — separación de API de captura y tablas privadas (piloto)

**Fecha: 02/11/2026. Alcance: PostgreSQL 17 + PostgREST 16.3 descartables.** No hay SQL, RLS, permisos ni Workers aplicados a Supabase o Cloudflare productivos.

## Brecha identificada en PR #223

La prueba anterior protegía `anon` y `authenticated`, pero PostgREST exponía el esquema `apd_scanner_pilot`, que contenía tanto funciones como tablas. El rol de servicio debía tener permisos de lectura y escritura sobre las tablas por ser funciones `SECURITY INVOKER`. Eso dejaba abiertas rutas HTTP directas a las tablas para quien poseyera ese token de servicio (aunque con `DELETE` denegado). Para reducir ese riesgo, el piloto ahora **expone solamente funciones de un esquema API separado**.

## Nuevo diseño probado

- `apd_scanner_pilot`: privado. Contiene ofertas completas de 24 columnas, staging de capturas, registros de páginas, contadores históricos y funciones internas. **No figura en `PGRST_DB_SCHEMAS`**.
- `apd_scanner_api`: único esquema expuesto por PostgREST; **no tiene tablas**. Publica cuatro RPC: `create_capture`, `stage_capture_page`, `seal_capture`, `commit_capture`.
- Las funciones expuestas usan **`SECURITY INVOKER`**, nombres de tablas y funciones calificados, y `search_path` fijo. Se revoca `EXECUTE` a `PUBLIC` antes de exponerlas.
- Los roles `apd_api_anon` y `apd_api_authenticated` no reciben uso del esquema ni acceso a RPC o tablas. `apd_api_scanner` es el único rol autorizado a ejecutar los cuatro RPC; continúa sin privilegio de `DELETE` sobre tablas.
- El RPC de confirmación no expone parámetros de poda ni de inyección de errores: siempre finaliza sin eliminación.
- **Matiz importante:** por `SECURITY INVOKER`, el servicio de laboratorio mantiene permisos SQL SELECT/INSERT/UPDATE en el esquema privado. Esos permisos **no se convierten en rutas de acceso HTTP** porque el esquema privado queda fuera de la API. Este diseño no equivale a un rol SQL de privilegios mínimos y no se debe copiar sin revisión a producción.

## Comprobaciones reales

`.github/workflows/apd-private-rpc-security-invoker.yml` levanta Postgres 17 y PostgREST 16.3 con credenciales sintéticas. Comprueba por HTTP que:
1. `anon` y `authenticated` no pueden acceder a ninguno de los cuatro RPC ni a la tabla de capturas.
2. Incluso con JWT válido de escáner, las rutas `GET /runs`, `GET /current_offers_full` o `POST /rpc/finalize_full_district` son inaccesibles.
3. El escáner autorizado carga 650 ofertas ficticias completas, en cinco páginas, puede repetir idéntica la primera, sella y confirma una única transacción.
4. Una segunda confirmación es rechazada y tampoco se acepta un intento de `p_prune=true`.
5. SQL comprueba conservación de `first_seen_at`, `times_seen`, `state_changes`, `raw`, otros registros y distrito canónico; **cero eliminaciones**.
6. Se valida mediante catálogo de Postgres que el esquema API no contiene tablas, los RPC no usan `SECURITY DEFINER` y `PUBLIC` no dispone de acceso.

## Riesgos pendientes de producción

- Los tokens JWT sintéticos de GitHub no reemplazan un mecanismo real de autorización del Worker. El rol de servidor no debe poder ser asumido desde credenciales públicas.
- Faltan RLS, controles de cuota/caducidad de capturas, protección de concurrencia y un diseño de permisos mínimos implementable en Supabase. **No crear funciones SECURITY DEFINER expuestas al público como atajo.**
- Aún no se ha ejecutado una migración ni una prueba de restauración sobre una copia íntegra de Supabase. Las pruebas de CI no incluyen usuarios reales.
- La fuente ABC puede desplazar offsets sin modificar `numFound`. El sello de staging no demuestra consistencia de una instantánea de ABC.
- Sigue pendiente la corrección administrativa del catálogo para Capitán Sarmiento y el ensayo de notificaciones compatibles.

**Estado operativo:** el Worker publicado y la base productiva permanecen sin modificaciones; el piloto está preparado exclusivamente para pruebas.

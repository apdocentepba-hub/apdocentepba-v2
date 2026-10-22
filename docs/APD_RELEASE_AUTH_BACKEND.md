# APDocente — publicación segura del backend de preferencias

## Estado (22/10/2026)
- PR #132: backend aislado, sin cambios al frontend ni a tablas en producción.
- La vista previa Cloudflare de la rama ha aprobado el rechazo de tokens inválidos y la comprobación de versiones, vinculaciones y KV. No hay validación autenticada con una cuenta real todavía.
- Para la publicación final, usar EXCLUSIVAMENTE el workflow manual `Release authenticated preferences backend (manual)`; nunca `wrangler deploy` directo ni modificar `worker-live/` para acomodar un hash.

## Controles del flujo manual
1. Requiere ejecución por `workflow_dispatch` sobre `main`, nunca por push automático.
2. Requiere `confirm_release=RELEASE` y `real_session_qa=VERIFIED`. Son declaraciones del operador y deben reflejar pruebas realizadas, no seleccionarse sin verificación.
3. Usa GitHub Environment `production` para aplicar, cuando esté configurado, aprobaciones del entorno.
4. Antes de subir, compara versión activa de Cloudflare con el manifiesto capturado y verifica SHA-256 de `worker-live/worker_hotfix.js`.
5. Regenera en carpeta temporal el Worker candidato y ejecuta pruebas de sesión y permisos con Supabase simulado.
6. Conserva y verifica bindings y KV. **La versión productiva tiene cuatro cron schedules y el wrangler.toml almacenado solo enumera tres:** el flujo de release incorpora expresamente los cuatro del manifiesto para no perder el cron de continuación del correo.
7. Sube una versión sin asignar tráfico y comprueba en la vista previa las rutas `GET /api/account/preferences`, `/api/account/profile`, `/api/mi-plan`, `/api/mis-alertas`, `/api/version` y `/api/planes` sin credenciales.
8. Solo entonces promueve a producción; si fallan comprobaciones posteriores intenta automáticamente restaurar la versión anterior al 100%. Guarda y sube la nueva captura canónica del Worker a `main` si se completó.

## Procedimiento de sesión real (SIN compartir tokens)
1. Iniciar sesión con cuenta autorizada en https://alertasapd.com.ar.
2. Seguir la prueba de solo lectura documentada en el PR #131, ajustando la vista previa del backend a `apd-auth-backend-ancient-wildflower-cd37.apdocentepba.workers.dev`.
3. Confirmar HTTP 200 para cuenta y preferencias propias, HTTP 401 sin sesión e imposibilidad de consultar otro usuario. No compartir tokens ni información privada.
4. Verificar después de publicar Worker que el sitio actual todavía funciona: login con contraseña y Google, preferencias, alertas y notificaciones, resumen de plan, pagos, cuentas con derechos especiales.

## No hacer todavía
- No marcar `real_session_qa=VERIFIED` si no se efectuó prueba real.
- No fusionar ni publicar `app_v2.js` del PR #131 antes de publicar el backend.
- No habilitar RLS ni revocar las lecturas restantes de `users`/`user_preferences` antes de comprobar que ambos componentes nuevos funcionan. Ese cierre está preparado, bloqueado, en el PR #131.
- No leer ni usar tokens de sesión de usuarios registrados desde la base de datos como sustituto de una prueba autorizada.

Esta guía es parte del PR #132 y no implica que el workflow haya sido ejecutado en producción.
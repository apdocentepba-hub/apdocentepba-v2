# APDocente — publicación del backend antes que el frontend

## Contenido
Esta rama prepara **solo el Worker**. No cambia `index.html`, `app_v2.js`, tablas, datos ni permisos de Supabase.

- Generador de Worker candidato basado en la copia productiva verificada (sin modificar `worker-live/`).
- Nueva ruta `GET /api/account/preferences` que valida la sesión y toma el usuario de `getSessionUserByBearer`; ignora cualquier `user_id` aportado por el navegador.
- `GET /api/account/profile` conserva los campos necesarios para el futuro panel.
- Tests con Worker cargado en Node y respuestas simuladas de Supabase: sin sesión, vencida, inactiva, intento de otro ID, fallo del backend, sólo GET y ausencia legítima de preferencias.
- Vista previa en Cloudflare con **0 % tráfico**, comparación exacta de versión productiva y vinculaciones/secretos/KV, más smoke de rutas sin autenticación.

## Orden seguro
1. Ejecutar y verificar CI del PR.
2. Probar acceso real a la vista previa desde una sesión del titular, sin subir tokens a GitHub ni compartirlos en chats (ver guía del PR #131).
3. Publicar **solo Worker**, con control de versión activa, backups de vínculo, rollback automatizado y verificaciones de las rutas antiguas.
4. Verificar login real, perfil, preferencias y canales, además de cron y planes.
5. Solo entonces publicar los cambios del panel preparados en PR #131.
6. Después de verificar tráfico/caché, cerrar la lectura pública con la migración RLS protegida; NO antes.

**Este PR no desencadena publicación productiva automática.**
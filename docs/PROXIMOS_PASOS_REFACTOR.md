# Próximos pasos del refactor

## Lo que ya quedó encaminado
- El backend ya está dentro del repo en `worker.js`.
- El repo ya tiene un `wrangler.toml` base.
- El trabajo se está haciendo en una rama separada para no tocar producción.

## Orden sugerido
1. Confirmar variables y bindings en Cloudflare.
2. Confirmar tablas y estructura actual en Supabase.
3. Recién después empezar a modularizar `worker.js` sin cambiar endpoints.
4. Probar todo en staging antes de producción.

## Regla principal
No romper estas rutas ya usadas por frontend:
- `/api/login`
- `/api/register`
- `/api/google-auth`
- `/api/mi-plan`
- `/api/guardar-preferencias`
- `/api/mis-alertas`

## Qué conviene modularizar primero
- auth
- planes
- preferencias
- supabase helpers
- historico
- provincia
- admin
- notificaciones

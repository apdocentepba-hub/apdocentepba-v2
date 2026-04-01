# Deploy manual del Worker desde GitHub Actions

## Workflow agregado
- `.github/workflows/deploy-worker-manual.yml`

## Cómo funciona
- No se ejecuta solo.
- Solo corre cuando lo lanzás manualmente desde GitHub.
- Hace checkout del repo, instala dependencias y ejecuta `wrangler deploy`.

## Secret que necesitás en GitHub
### Requerido
- `CLOUDFLARE_API_TOKEN`

## Recomendación
Usar un token de Cloudflare con permisos mínimos necesarios para desplegar Workers.

## Qué no hace todavía
- No sincroniza automáticamente variables/secrets del dashboard.
- No crea bindings.
- No reemplaza el control manual de Cloudflare.

## Cuándo conviene usarlo
Cuando ya esté validado el backend en la rama correcta y quieras empezar a desplegar desde GitHub en vez de depender del editor del dashboard.

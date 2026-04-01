# Inventario de rutas del Worker

## Archivos agregados
- `scripts/report-worker-routes.mjs`
- `.github/workflows/report-worker-routes.yml`

## Qué hace
Lee `worker.js`, detecta las rutas declaradas en el router y arma un reporte con:
- total de checks de ruta
- total de rutas únicas
- rutas duplicadas
- variantes detectadas
- listado completo de rutas

## Normalización importante
El script normaliza `${API_URL_PREFIX}` como `/api` para poder detectar duplicados reales aunque una ruta esté escrita una vez en forma hardcodeada y otra vez usando la constante.

## Cómo usarlo
### Desde GitHub Actions
1. Abrir **Actions**
2. Ejecutar manualmente `Report worker routes`

## Para qué sirve
- entender mejor el router actual
- detectar duplicaciones
- preparar el reemplazo del bloque `fetch()` con menos riesgo
- dejar trazabilidad técnica dentro del repo

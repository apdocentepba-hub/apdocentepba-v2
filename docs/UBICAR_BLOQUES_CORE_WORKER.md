# Ubicar bloques core del Worker

## Archivos agregados
- `scripts/locate-worker-core-blocks.mjs`
- `.github/workflows/locate-worker-core-blocks.yml`

## Qué hace
Lee `worker.js` y reporta líneas aproximadas para bloques sensibles, por ejemplo:
- inicio de `export default`
- línea de `scheduled()`
- inicio de `handleLogin`
- ubicación de rutas duplicadas de provincia
- ubicación de handlers provinciales clave

## Para qué sirve
- dejar de buscar a ojo dentro de `worker.js`
- preparar el reemplazo del bloque `fetch()` con más control
- ubicar rápido el punto exacto donde hoy están los duplicados
- facilitar un parche futuro por líneas o por bloque

## Cómo usarlo
### Desde GitHub Actions
1. Abrir **Actions**
2. Ejecutar manualmente `Locate worker core blocks`

## Idea práctica
Usar este workflow junto con:
- `Check worker router duplicates`
- `Report worker routes`
- `Smoke test Worker manual`

Así el repo ya tiene una pequeña caja de herramientas para tocar el router con bastante menos riesgo.

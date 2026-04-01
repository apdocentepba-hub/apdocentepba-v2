# Chequeo de duplicados del router

## Qué agrega este repo
- `scripts/check-worker-router-duplicates.mjs`
- `.github/workflows/check-worker-router-duplicates.yml`

## Qué detecta
Busca si `worker.js` todavía contiene el bloque duplicado de rutas de provincia:
- `/api/provincia/backfill-kick`
- `/api/provincia/backfill-status`

## Cómo usarlo
### Desde GitHub Actions
1. Abrir la pestaña **Actions**
2. Ejecutar manualmente `Check worker router duplicates`

### En pull requests a `main`
El workflow queda disponible para usarse como control de revisión del repo.

## Resultado esperado
- Si encuentra duplicación, el chequeo falla.
- Si no encuentra duplicación, el chequeo pasa.

## Para qué sirve
Esto no reemplaza el refactor, pero evita perder de vista un problema concreto del router mientras seguimos ordenando el backend.

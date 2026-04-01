# Playbook: reemplazo del router y rollback

## Objetivo
Aplicar el reemplazo del bloque principal `export default { fetch, scheduled }` con el menor riesgo posible.

## Fuente actual
- `worker.js`

## Fuente propuesta
- `prototypes/worker.fetch.cleaned.js`

## Qué se reemplaza
Solo el bloque del router principal:
- `async fetch(request, env, ctx)`
- `async scheduled(_controller, env, ctx)`

## Qué NO se toca
- helpers
- handlers
- acceso a Supabase
- Mercado Pago
- WhatsApp
- histórico
- matching
- tablas
- variables de Cloudflare
- bindings

## Secuencia recomendada
### Paso 1
Crear un Worker de staging o una rama de prueba si todavía no existe.

### Paso 2
Reemplazar el bloque `export default` de `worker.js` por el contenido equivalente de:
- `prototypes/worker.fetch.cleaned.js`

### Paso 3
Deploy solo a staging.

### Paso 4
Correr smoke test:
- script: `scripts/smoke-worker.mjs`
- workflow manual: `Smoke test Worker manual`

### Paso 5
Revisar respuestas de:
- `/api/test-db`
- `/api/planes`
- `/api/whatsapp/health`
- `/api/provincia/backfill-status`

### Paso 6
Revisión manual funcional mínima:
- login normal
- Google auth
- guardar preferencias
- ver mis alertas
- health de WhatsApp

## Criterio de aceptación
El reemplazo se considera aceptable si:
- no hay 500 nuevos en rutas base
- no desaparece ninguna ruta pública existente
- `scheduled()` sigue intacto en comportamiento
- provincia/backfill responde igual que antes

## Señales de rollback inmediato
- 500 en `/api/test-db`
- 404 inesperado en rutas existentes
- error de sintaxis del Worker al desplegar
- `provincia/backfill-status` deja de responder
- `mis-alertas` falla sin que hayan cambiado handlers

## Cómo rollbackear
### Opción A
Volver al commit anterior en la rama de staging.

### Opción B
Volver a desplegar el Worker anterior desde Cloudflare versions/deployments.

### Opción C
Restaurar el bloque original `export default` dentro de `worker.js`.

## Regla práctica
No mergear nada a `main` hasta que el reemplazo del router pase smoke test y validación funcional mínima.

# Portal único del refactor seguro del router del Worker

## Objetivo
Tener en una sola página todos los accesos importantes para ejecutar, revisar y revertir el primer recorte real del bloque `export default` de `worker.js` sin tocar producción.

## Enlaces principales
### PR borrador
- PR #1:
  - https://github.com/apdocentepba-hub/apdocentepba-v2/pull/1

### Rama segura
- `refactor/worker-base-20260401`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/tree/refactor/worker-base-20260401

### Worker actual en la rama segura
- `worker.js`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/worker.js

### Prototipo limpio del router
- `prototypes/worker.fetch.cleaned.js`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/prototypes/worker.fetch.cleaned.js

## Scripts clave
### Generar candidato del export default
- `scripts/build-worker-export-default-candidate.mjs`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/scripts/build-worker-export-default-candidate.mjs

### Verificar que el reemplazo quedó aplicado
- `scripts/verify-worker-export-default-applied.mjs`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/scripts/verify-worker-export-default-applied.mjs

### Detectar rutas duplicadas
- `scripts/check-worker-router-duplicates.mjs`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/scripts/check-worker-router-duplicates.mjs

## Workflows manuales
### 1. Build candidate
- Archivo:
  - `.github/workflows/build-worker-export-default-candidate.yml`
- Link:
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/.github/workflows/build-worker-export-default-candidate.yml

### 2. Apply safe
- Archivo:
  - `.github/workflows/apply-worker-export-default-replacement-safe.yml`
- Link:
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/.github/workflows/apply-worker-export-default-replacement-safe.yml

### 3. Verify applied
- Archivo:
  - `.github/workflows/verify-worker-export-default-applied.yml`
- Link:
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/.github/workflows/verify-worker-export-default-applied.yml

### 4. Rollback
- Archivo:
  - `.github/workflows/rollback-worker-export-default-replacement.yml`
- Link:
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/.github/workflows/rollback-worker-export-default-replacement.yml

## Documentación clave
### Reemplazo del bloque principal
- `patches/worker-export-default-reemplazo.md`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/patches/worker-export-default-reemplazo.md

### Script de preparación
- `docs/WORKER_ROUTER_REPLACEMENT_SCRIPT.md`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/docs/WORKER_ROUTER_REPLACEMENT_SCRIPT.md

### Orden exacto de ejecución
- `docs/WORKER_ROUTER_EXECUTION_ORDER.md`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/docs/WORKER_ROUTER_EXECUTION_ORDER.md

### Rollback documentado
- `docs/WORKER_ROUTER_ROLLBACK.md`
  - https://github.com/apdocentepba-hub/apdocentepba-v2/blob/refactor/worker-base-20260401/docs/WORKER_ROUTER_ROLLBACK.md

## Secuencia recomendada
1. abrir el PR borrador
2. abrir este portal
3. correr `Build candidate`
4. revisar artifacts y reporte
5. correr `Apply safe`
6. correr `Verify applied`
7. si algo no convence, correr `Rollback`
8. recién después seguir con smoke test/staging

## Qué no hacer todavía
- no mergear a `main`
- no deployar a Cloudflare producción
- no tocar Supabase producción

## Resultado esperado al final de esta fase
- `worker.js` queda con el bloque `export default` alineado al prototipo limpio
- desaparecen los duplicados hardcodeados de provincia
- el cambio real queda acotado a la rama segura
- el sistema productivo no se toca todavía

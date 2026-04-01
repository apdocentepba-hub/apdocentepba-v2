# Orden exacto para ejecutar el refactor seguro del router del Worker

## Rama correcta
Todo esto se ejecuta solamente sobre:
- `refactor/worker-base-20260401`

## Objetivo
Aplicar el primer recorte real del bloque `export default` de `worker.js` sin tocar producción y con respaldo suficiente para auditar y revertir si algo sale mal.

## Workflows disponibles
### 1. Build candidate
Archivo:
- `.github/workflows/build-worker-export-default-candidate.yml`

Qué hace:
- genera el candidato del nuevo `export default`
- genera el reporte estricto previo
- sube artifacts

Artifacts esperados:
- `artifacts/worker.export-default.candidate.js`
- `artifacts/worker.export-default.report.json`

### 2. Apply safe
Archivo:
- `.github/workflows/apply-worker-export-default-replacement-safe.yml`

Qué hace:
- exige correr en la rama segura
- hace backup de `worker.js`
- aplica el reemplazo del `export default`
- valida que solo cambie `worker.js`
- verifica el resultado aplicado
- chequea duplicados
- hace commit/push sobre la misma rama segura
- sube artifacts

Artifacts esperados:
- `artifacts/worker.js.before-apply.backup.js`
- `artifacts/worker.export-default.candidate.js`
- `artifacts/worker.export-default.report.json`
- `artifacts/worker.export-default.applied-report.json`

### 3. Verify applied
Archivo:
- `.github/workflows/verify-worker-export-default-applied.yml`

Qué hace:
- vuelve a verificar que el `worker.js` ya commiteado coincida con el prototipo limpio
- controla que `scheduled()` conserve el mismo hash
- controla que ya no existan los duplicados hardcodeados
- sube reporte

Artifact esperado:
- `artifacts/worker.export-default.applied-report.json`

## Orden recomendado
1. correr `Build worker export default candidate`
2. revisar el resumen del workflow y el archivo `worker.export-default.report.json`
3. si da OK, correr `Apply worker export default replacement safe`
4. revisar el diff resumido y los artifacts del backup
5. correr `Verify worker export default applied`
6. si todo da OK, dejar el PR en draft y seguir recién con smoke test/staging

## Qué revisar antes de avanzar
- que el reporte previo tenga `ok=true`
- que el apply haya cambiado solo `worker.js`
- que el verify posterior tenga `ok=true`
- que el detector de duplicados no marque las dos rutas hardcodeadas de provincia

## Qué NO hacer todavía
- no mergear a `main`
- no deployar a Cloudflare producción
- no tocar Supabase producción
- no usar este flujo fuera de la rama segura

## Resultado esperado después del apply
- desaparecen las dos rutas hardcodeadas duplicadas de provincia
- queda el `export default` alineado con `prototypes/worker.fetch.cleaned.js`
- `scheduled()` mantiene el mismo comportamiento
- el cambio real queda acotado a `worker.js`

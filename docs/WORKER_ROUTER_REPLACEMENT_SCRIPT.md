# Script seguro para preparar el recorte del router

## Objetivo
Dejar el reemplazo del bloque `export default` cada vez más aplicable sin tocar todavía producción ni editar a mano el `worker.js` gigante.

## Archivo agregado
- `scripts/build-worker-export-default-candidate.mjs`

## Qué hace
1. Lee `worker.js`
2. Lee `prototypes/worker.fetch.cleaned.js`
3. Detecta el bloque actual `export default { ... }`
4. Construye un candidato reemplazando solo ese bloque
5. Verifica que:
   - el prefijo del archivo quede idéntico
   - el sufijo del archivo quede idéntico
   - `scheduled()` conserve el mismo hash
   - desaparezcan las dos rutas hardcodeadas duplicadas
   - queden una sola vez las rutas con `${API_URL_PREFIX}`

## Modos de uso
### 1) Solo chequeo por consola
```bash
node scripts/build-worker-export-default-candidate.mjs
```

### 2) Generar candidato sin tocar `worker.js`
```bash
node scripts/build-worker-export-default-candidate.mjs --write --strict
```

Esto crea:
- `artifacts/worker.export-default.candidate.js`
- `artifacts/worker.export-default.report.json`

### 3) Aplicar localmente sobre `worker.js`
```bash
node scripts/build-worker-export-default-candidate.mjs --apply --strict
```

## Recomendación operativa
Para el próximo paso seguro:
1. correr primero `--write --strict`
2. revisar el `report.json`
3. comparar `worker.js` vs `artifacts/worker.export-default.candidate.js`
4. recién después decidir si se reemplaza `worker.js` en la rama segura

## Qué NO hace
- no hace deploy
- no toca Cloudflare producción
- no toca Supabase producción
- no hace merge a `main`
- no modifica handlers internos fuera del `export default`

## Beneficio práctico
El próximo recorte real deja de depender de edición manual del router monstruo y pasa a ser un reemplazo reproducible, chequeable y con evidencia escrita.

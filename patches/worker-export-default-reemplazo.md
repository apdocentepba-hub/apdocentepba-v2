# Reemplazo exacto del bloque `export default`

## Objetivo
Reemplazar en `worker.js` solo el bloque principal:
- `export default { ... fetch ... scheduled ... }`

por una versión más limpia y sin duplicación obvia de rutas.

## Fuente actual
- `worker.js`

## Fuente nueva
- `prototypes/worker.fetch.cleaned.js`

## Qué se elimina del bloque actual
Estas dos rutas duplicadas al comienzo del router:

```js
if (path === "/api/provincia/backfill-kick" && request.method === "POST") {
  return await handleProvinciaBackfillKick(request, env, ctx);
}

if (path === "/api/provincia/backfill-status" && request.method === "GET") {
  return await handleProvinciaBackfillStatus(env);
}
```

## Qué se mantiene
Las rutas equivalentes definidas una sola vez más abajo con `API_URL_PREFIX`:

```js
if (path === `${API_URL_PREFIX}/provincia/backfill-status` && request.method === "GET") {
  return await handleProvinciaBackfillStatus(env);
}

if (path === `${API_URL_PREFIX}/provincia/backfill-kick` && request.method === "POST") {
  return await handleProvinciaBackfillKick(request, env, ctx);
}
```

## Reemplazo recomendado
Tomar el bloque completo de:
- `prototypes/worker.fetch.cleaned.js`

y usarlo como reemplazo del bloque `export default` actual del `worker.js`.

## Beneficio inmediato
- el router queda ordenado por dominios
- provincia deja de estar duplicada
- `scheduled()` queda igual en comportamiento
- no cambian handlers ni endpoints públicos

## Riesgo que baja
Reduce la posibilidad de editar una ruta provincial en un lugar y olvidarse del duplicado en el otro.

# Parche mínimo sugerido para el router de provincia

## Objetivo
Eliminar redundancia en `worker.js` sin cambiar endpoints públicos ni lógica de negocio.

## Duplicaciones detectadas
Dentro de `fetch()` aparecen estas rutas dos veces con el mismo path real:

- `POST /api/provincia/backfill-kick`
- `GET /api/provincia/backfill-status`

Motivo: arriba están hardcodeadas como `"/api/..."` y más abajo vuelven a aparecer usando `API_URL_PREFIX`, que hoy vale `"/api"`.

## Cambio mínimo recomendado
Eliminar el bloque inicial duplicado y dejar una sola definición por ruta, preferentemente la versión consistente con `API_URL_PREFIX`.

## Bloque a eliminar
```js
if (path === "/api/provincia/backfill-kick" && request.method === "POST") {
  return await handleProvinciaBackfillKick(request, env, ctx);
}

if (path === "/api/provincia/backfill-status" && request.method === "GET") {
  return await handleProvinciaBackfillStatus(env);
}
```

## Razón
- No cambia el path público.
- No cambia el handler final.
- Reduce redundancia.
- Baja riesgo de inconsistencias futuras al editar el router.

## Orden sugerido
1. Aplicar este parche mínimo.
2. Releer el router completo buscando más duplicaciones.
3. Recién después agrupar handlers por secciones internas.

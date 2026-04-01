# Guía de reemplazo del router `fetch()`

## Archivo base
- `worker.js`

## Archivo propuesto
- `prototypes/worker.fetch.cleaned.js`

## Objetivo
Reemplazar el bloque `export default { async fetch..., async scheduled... }` del `worker.js` por una versión más clara y sin duplicaciones obvias de rutas.

## Qué mejora el prototipo
- elimina la duplicación de rutas provinciales del router
- ordena las rutas por dominio funcional
- deja el `scheduled()` igual en comportamiento
- mantiene los mismos handlers
- no cambia paths públicos

## Qué NO cambia
- no cambia helpers
- no cambia handlers
- no cambia tablas
- no cambia variables
- no cambia bindings
- no cambia cron

## Cambio esperado al aplicar el reemplazo
### Antes
- router mezclado
- rutas de provincia duplicadas
- lectura más frágil

### Después
- router agrupado por secciones
- una sola definición por ruta
- lectura más clara para seguir refactorizando

## Precaución
Este reemplazo conviene hacerlo en una rama y probarlo antes de cualquier deploy porque el archivo `worker.js` actual es muy grande y un error de pegado podría romper el export default.

## Siguiente fase después de aplicar esto
1. extraer helpers puros
2. extraer acceso a Supabase
3. extraer auth
4. extraer planes/preferencias
5. recién después modularizar físicamente

# Rollback del reemplazo seguro del router del Worker

## Objetivo
Revertir el commit del apply seguro del bloque `export default` de `worker.js` sin tocar producción y manteniendo todo dentro de la rama segura.

## Workflow disponible
- `.github/workflows/rollback-worker-export-default-replacement.yml`

## Cuándo usarlo
- si el apply seguro se ejecutó pero no te convence el diff
- si el verify posterior marca algo raro
- si querés volver al estado previo del `worker.js` dentro de la rama segura

## Cómo funciona
El workflow:
1. exige correr en `refactor/worker-base-20260401`
2. toma un `commit_sha` opcional a revertir
3. si no se informa `commit_sha`, intenta revertir `HEAD` solo si el mensaje del commit coincide con:
   - `Apply safe export default router replacement`
4. ejecuta `git revert`
5. valida que el rollback haya tocado `worker.js`
6. publica resumen del diff de rollback
7. hace push del commit de reversión en la misma rama segura

## Uso recomendado
### Caso A: revertir el último apply seguro
Correr el workflow sin completar `commit_sha`.

### Caso B: revertir un apply seguro anterior específico
Correr el workflow informando manualmente el SHA exacto del commit a revertir.

## Qué NO hace
- no toca Cloudflare producción
- no hace deploy
- no mergea a `main`
- no modifica otras ramas

## Recomendación posterior al rollback
Después del rollback conviene:
1. revisar el diff resumido del workflow
2. revisar el commit de reversión en la rama segura
3. decidir si se corrige el prototipo o el flujo antes de volver a intentar el apply

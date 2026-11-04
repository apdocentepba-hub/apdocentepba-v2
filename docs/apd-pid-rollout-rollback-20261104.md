# APDocentePBA — preactivación del Worker PID, con reversión preparada (04/11/2026)

> Documento de operaciones. **No implica autorización para asignar tráfico.** La única acción Cloudflare realizada fue subir la versión nueva con 0 %.

## Fuente de verdad: verificación de Cloudflare

- [Run #41843353063](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41843353063), **SUCCESS** (script `scripts/check-apd-pid-candidate-readiness-readonly.mjs`).
- Worker: `ancient-wildflower-cd37`.
- Versión original (producción al 100 %): `da0632dd-1b9e-4332-9c4a-75b5eade8d74`.
- Versión nueva de ensayo (0 %): `90e76973-5509-4d1b-82e1-91b4c2811295`.
- Hash SHA-256 del módulo compilado nuevo obtenido de Cloudflare: `cba6427814e9bd0d50c597c7db1c678fd6715862d0a921b80baea1d23b955881`.
- Hash SHA-256 de fuente nueva: `d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f`.
- 29 bindings, un módulo, KV original y cuatro cron preservados.
- La última auditoría comprobó que ninguna parte del tráfico de usuarios va a la versión nueva.

## Puertas de calidad ANTES de cualquier activación

1. Sesión autenticada de cuenta propia: verificar inicio/cierre de sesión, plan, preferencias, alertas y render del carrusel con el endpoint de la versión de ensayo. No almacenar tokens en CI, issues, logs ni chats.
2. Verificar el servicio PID real y su tolerancia a dos consultas simultáneas; comprobar coincidencias con datos autorizados.
3. Verificar nuevamente la versión activa, el hash del candidato, bindings, KV y cron con el script de solo lectura. Toda divergencia bloquea el cambio.
4. Recabar **autorización explícita para asignar tráfico a producción**, indicando el porcentaje, el rollback y el resultado de los ensayos anteriores.

## Canary propuesto (NO ejecutar automáticamente)

Cloudflare admite despliegues graduales de dos versiones con estrategia `percentage`. Tras las puertas anteriores y una nueva confirmación expresa, comenzar con **1 %** de tráfico para la versión nueva, manteniendo el **99 %** en la original. El payload de referencia para el endpoint oficial `POST /accounts/{account_id}/workers/scripts/ancient-wildflower-cd37/deployments` es:

```json
{
  "strategy": "percentage",
  "versions": [
    { "version_id": "da0632dd-1b9e-4332-9c4a-75b5eade8d74", "percentage": 99 },
    { "version_id": "90e76973-5509-4d1b-82e1-91b4c2811295", "percentage": 1 }
  ],
  "annotations": { "workers/message": "APD PID canary 1% after authorized preflight" }
}
```

El operador debe verificar en GET el estado inmediatamente después del cambio y comprobar que ambas versiones son las esperadas. Si falla una prueba autenticada, sube la tasa de errores, la latencia empeora sensiblemente o cambia la estructura de bindings, **revertir** la asignación a la versión original:

```json
{
  "strategy": "percentage",
  "versions": [
    { "version_id": "da0632dd-1b9e-4332-9c4a-75b5eade8d74", "percentage": 100 }
  ],
  "annotations": { "workers/message": "APD rollback to verified production version" }
}
```

La reversión de versión no deshace escrituras a KV, bases de datos ni servicios externos; por eso los ensayos de esta etapa no realizan escrituras. No continuar 1 % → 100 % sin otra validación expresa. **El presente documento no ejecuta ningún POST.**

## Ensayos de no regresión

- [#41841130518](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41841130518): paridad de fuente pública ABC, 216/216 campos e identificadores en seis distritos.
- [#41841992463](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41841992463): Worker completo con ABC real, cuenta ficticia y filtros del panel; controles de planes vencidos; PID simulado.
- [#41840125735](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41840125735): URL real de la versión al 0 %, rutas públicas 200, rutas protegidas sin sesión 401.
- [#41843353063](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41843353063): confirmación independiente de identidad, código, vínculos, tráfico y versión de vuelta.

Documentación técnica oficial: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/ y https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/.

## Estado

**Aprobado** para ensayos de sesión propia. **No aprobado** para canary productivo ni promoción global. PR #245 permanece en borrador.

# APDocentePBA — release candidate verificable 2026-11-04

## Última evidencia: éxito

- Commit aprobado por CI: `14da8ecaa002717cbbcf3bde8bb1f42672bd1ad6`
- CI que compila + verifica rutas, planes, filtros, PID, horario de cierre y mañana: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41900705315 — **SUCCESS**.
- Nueva prueba de estados contradictorios en alertas guardadas: **PASS**.
- Oferta abierta: `Publicada` en todos los estados disponibles, fecha/hora ABC parseable y cierre futuro. Estado incompatible, fecha inexistente, hora ausente o vencimiento: **NO** se anuncia abierta.
- Código normalizado no puede esconder un estado `Cerrada` ni sobrescribir la fecha `finoferta` del registro original de ABC.
- Hora `finoferta` ABC `2026-11-05T07:30:00Z` se interpreta en el guard experimental como **07:30 de Argentina**, no como 04:30. Confirmar caso puntual en interfaz de ABC antes de liberar; no tratar el mismo formato de otra API automáticamente como reloj local.

## Candidato único recomendado para staging

| Objeto | Valor comprobado |
|---|---|
| Worker | `ancient-wildflower-cd37` |
| SHA256 investigación final + resumen mañana | `0d6f54103c7821960cdd28fbf395fa10ba3837dc60aa9618fb4c82d1380a73fe` |
| SHA256 investigación final sin mañana | `7b155658d53bbb75bbc49ddc257e85d512b51f2817a74186d5c2ce3cec62029e` |
| SHA256 control vencimientos | `1d7368ccfe21027d0413201f0c39307f3ca2532a216aa6c62b1ef12d8928472d` |
| SHA256 versión PID 0% ya subida | `d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f` |
| Versión Cloudflare activa original | `da0632dd-1b9e-4332-9c4a-75b5eade8d74` |
| Versión PID subida, todavía 0% | `90e76973-5509-4d1b-82e1-91b4c2811295` |
| Tráfico original/versión PID | 100% / 0% |
| Cantidad de bindings/crons confirmados | 29 / 4 |

Artifacts del run 41900705315:

- `apd-final-combined-worker-candidate-offline`, artifact 13357723767.
- `apd-morning-urgent-digest-candidate-offline`, artifact 13357439369.

**No son URLs públicas de frontend**: son fuentes de Worker aisladas generadas en CI. No afirmar que están desplegadas. El Worker original en producción sigue al 100%.

## Pruebas aprobadas, sin credenciales

- 135 ofertas de ABC en Quilmes y Tigre, con cuenta sintética; 135 resultados mostrados por las funciones reales de filtrado del panel, 2 consultas ABC, duración en CI 1167 ms. El PID era un stub, por lo que **no es benchmark de usuario real**.
- API de alertas con token sintético, cuenta activa e inactiva, plan vencido, suplantación de usuario por parámetro y panel/carrusel.
- Pruebas de resúmenes de correo con datos sintéticos: ofertas vencidas, cierre exacto, cierre sin hora y estados cerrados no deben encolarse.
- 105 ofertas en un caso sintético: upserts Supabase 105→2. No confirmado contra tablas reales.
- Resumen adicional 06:01 Argentina usando cron existente de 2 minutos, sin quinto cron ni envío real; limitar a cierre dentro de 5 horas y evitar avisos repetidos.
- Pruebas públicas sin sesión: seis contratos HTTP, 401 correcto en rutas privadas; sin escritura.
- Verificación Cloudflare GET-only: versión original 100%, PID 0%, 29 bindings y 4 crons, rollback original listo como identificador. *No se probó revertir tráfico real.*

## Bloqueos de lanzamiento responsable

1. **No hubo prueba con cuenta real del titular**: TinyFish pide pago; no usarlo. La Browser conectada requiere contexto de extensión y no está disponible desde esta sesión. Validar cuenta, plan, preferencias, listado, carrusel y cierre antes de cambiar tráfico.
2. **El candidato único final + mañana solo existe offline**. La versión PID previamente subida con 0% es un paquete **anterior** y **no contiene** todas las correcciones.
3. Falta validar la convención horaria de ABC frente al detalle visible de **una oferta concreta** y verificar entrega real autorizada de correo después del filtrado final.
4. El workflow `.github/workflows/apd-radar-live-preview.yml` de main sigue fallando por un `grep` de varias líneas. Fix aislado PR #246 aprobado pero sin merge; no confundirse con CI del Worker.
5. Cualquier upload, 1% canary, cambio de crons, rollback efectivo, merge a main o correo a usuarios requiere aprobación expresa por separado.

## Orden de liberación segura

A. Inspección real del panel con cuenta autenticada (preferencias/plan/carrusel), sin cambios; B. reproducir y comparar hora de cierre con ABC visible; C. subir **exactamente el SHA final** como una versión 0% mediante procedimiento revisado y sin despliegue de tráfico; D. smoke autenticado usando el preview de **esa misma versión**; E. con aprobación específica, habilitar 1% y vigilar errores, respuestas, latencia, datos y emails; F. habilitar tráfico gradual y restaurar versión anterior ante señales de fallo. No ejecutar C–F con autorización genérica «go».

## Realizado ahora

Corrección fail-closed para estados contradictorios y 2 pruebas nuevas; pipeline verde; tres artifacts CI generados; auditoría y manifiesto actualizados. No cambios de producción.

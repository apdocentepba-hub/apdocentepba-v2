# APDocentePBA — validación final de ABC público y lógica de panel (04/11/2026)

## Estado confirmado en producción y ensayo

La versión candidata **ya subida** a Cloudflare con **0 %** de tráfico es `90e76973-5509-4d1b-82e1-91b4c2811295` (SHA-256 fuente `d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f`). La versión original `da0632dd-1b9e-4332-9c4a-75b5eade8d74` sigue al **100 %**, según la auditoría Cloudflare read-only.

### Prueba A — seis distritos públicos, misma fuente ABC

[GitHub Actions 41841130518](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41841130518): **SUCCESS**. Se ejecutó el lector extraído de la versión candidata real con `fq=estado:"Publicada"` y se compararon los resultados contra el equivalente `q AND estado:"Publicada"` de Solr, sin sesiones ni datos personales:

| Distrito | Registros «Publicada» | IDs/campos coincidentes |
|---|---:|---:|
| Quilmes | 11 | 11 |
| Tigre | 93 | 93 |
| Avellaneda | 0 | 0 |
| Berazategui | 50 | 50 |
| La Matanza | 47 | 47 |
| Lomas de Zamora | 15 | 15 |
| **Total** | **216** | **216/216** |

Estos conteos son un instante de la fuente y **no** implican 216 ofertas todavía abiertas ni puestos perdidos. El estado «Publicada» no garantiza vigencia temporal.

### Prueba B — Worker completo + ABC real + cuenta ficticia + filtro frontend

[GitHub Actions 41841730717](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41841730717): **SUCCESS**.
[GitHub Actions 41841992463](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41841992463): **SUCCESS**, segunda ejecución con pruebas de acceso por plan vencido.

- Se ejecutó `worker.fetch` desde el **Worker generado y verificado por hash**, utilizando datos reales públicos de ABC para **Quilmes y Tigre**, y una sesión, una cuenta, suscripción PLUS, preferencias y almacenamiento PID **completamente ficticios** en memoria.
- Se consultó ABC real mediante dos GET y se recuperaron **105 ofertas** con estado `Publicada` en esa muestra.
- La salida pasó por las funciones exactas de `app_v2.js`: `parseFechaAPD`, `estadoOfertaInactiva`, `ofertaVencidaPorFecha` y `filtrarAlertasVigentes`. **105 de las 105** permanecieron visibles en ese instante; los casos ficticios de una oferta cerrada y otra vencida fueron correctamente excluidos.
- Tiempos de los dos ensayos: **1450 ms** y **896 ms**, medidos en el proceso del runner con ABC público real y PID simulado. No son tiempos de respuesta del navegador ni permiten extrapolar el rendimiento de producción.
- Se preservó la identidad de la sesión ficticia frente a un `user_id` manipulado en la URL.
- Test del plan PLUS vencido aprobado para las tres variantes: no lee preferencias, no entrega ofertas y no recrea un período de prueba cuando ya hay suscripción anterior.
- No se enviaron mensajes, no se leyó información de usuarios ni se cambió infraestructura o tráfico.

## Qué falta antes de habilitar tráfico

1. **Una sesión auténtica de prueba del propio titular** para medir `/api/mis-alertas`, login, consulta PID real, carrusel y tiempo de carga visual. La sesión no debe imprimirse en CI ni compartirse por chat.
2. Validar tolerancia real del servicio de almacenamiento PID a **dos consultas simultáneas** y contrastar datos PID exactos.
3. Revisar si el flujo de pago y planes mantiene sus privilegios ante estados `PENDING`/`PAUSED` de acuerdo con la política comercial. Las pruebas no establecen esas decisiones de negocio.
4. Solicitar **autorización distinta y expresa** para canary de tráfico y, si el canary cumple criterios, para la activación definitiva. Ningún test de esta rama cambia tráfico.
5. Preparar rollback sobre la versión productiva previamente verificada y medir tasa de errores y latencia, con criterio de reversión ante regresión.

### Archivos técnicos

- `scripts/probe-apd-pid-candidate-live-district-parity-readonly.mjs`.
- `scripts/probe-apd-pid-worker-live-abc-with-fake-account.mjs`.
- `scripts/test-apd-generated-worker-auth-router.mjs`, actualizado con plan vencido.
- Pipeline `.github/workflows/apd-bounded-abc-worker-candidate.yml`.

**Estado de aceptación:** pruebas del código y parte de la fuente externa aprobadas; **no** validación integral de producción. No fusionar el PR ni asignar tráfico automáticamente.

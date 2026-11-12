# APDocentePBA — control de cierre ABC: evidencia y límites (04/11/2026)

## Regla de negocio

No confundir **estado `Publicada`** con **plazo de postulación abierto**. Una oferta solo debe presentarse como vigente o apta para correo cuando concurren: estado oficial `Publicada`; fecha **y hora de cierre** verificables en el registro específico de ABC; cierre posterior al instante de la consulta; preferencias y plan correctos. Si falta hora, hay valor inválido o el estado es distinto, **no se anuncia como oferta abierta**. El plazo de suplencia (`supl_hasta`) nunca reemplaza el plazo de postulación (`finoferta`).

## Evidencia externa real

En la lectura pública ABC sin credenciales (dos GET; [CI 41848658719](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41848658719)), 12 ofertas publicadas de Quilmes y 94 de Tigre, todas con `finoferta` ISO de forma `2026-11-05T07:30:00Z`. El campo muestra el reloj 07:30 con sufijo Z. En los comunicados de SAD de PBA se anuncian cierres a las **07:30/10:30 hora argentina**:

- https://sad117.com.ar/2026/02/18/18897/ (Tres de Febrero, 2026)
- https://sadalmirantebrown.com.ar/wp-content/uploads/2026/02/APD-2026-DOCENTES-INICIO-.docx.pdf (Almirante Brown, 2026)
- https://sadpilarconsultas.wixsite.com/sad083/comunicados-docentes (Pilar)

El propio frontend existente muestra la fecha literal de ABC sin descontar 3 horas (`parseAbcLiteralDate` / `fmtFechaABC`). **Convención fuente específica en investigación**: tratar `07:30Z` recibido de `finoferta` ABC como **07:30 hora de Buenos Aires**, no como 04:30. El estándar ISO genérico sigue interpretando Z como UTC en fuentes que no son ABC. Hace falta cotejar aún un caso en el portal de postulación humano para confirmar esta equivalencia definitivamente, especialmente para cierres excepcionales.

## Implementación experimental, no desplegada

- Parser puro `scripts/lib/apd-offer-close-guard.mjs`.
- Builder aislado `scripts/build-apd-close-safe-research-candidate.mjs`, que parte de la versión PID subida al 0 % sin modificarla.
- Tests `scripts/test-apd-offer-close-guard.mjs`, `scripts/test-apd-close-email-queue.mjs` y ruta completa de Worker `scripts/test-apd-generated-worker-full-alert-flow.mjs` variante `close`.
- La puerta de cierre se aplica en la creación de alertas, `ofertaVigente` para lectura de correo, digest inicial, selección de ofertas almacenadas en barrido de correo, render de digest y encolado directo.
- Se comprueban cierres exactos, diferentes formatos, igualdad con la hora límite, días sin hora, estados `Cerrada` y `Designada`, ofertas en almacenamiento ya vencidas y ausencia de escrituras al encolado en esos casos.

**Resultado:** [GitHub Actions #41848658719](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41848658719) **SUCCESS**. Candidato experimental hash SHA-256 `f7c8b7ead6a5b10bc6e715677898f4aae8428373833ff9f2d8b9c69a19b63289`; no está subido ni recibe tráfico.

## Brecha en los horarios de notificación

Los crons reales confirmados del Worker son:

- `0 01 * * *` = 22:00 hora Argentina del día anterior.
- `0 17 * * *` = 14:00 hora Argentina.
- `0 21 * * *` = 18:00 hora Argentina.
- `1-59/2 * * * *` = continuación cada dos minutos de una tanda activa; **no es un monitoreo autónomo cada dos minutos que genere alertas nuevas**.

Por lo tanto, el sistema de correos actual es por **tandas**, no por cada publicación. Una oferta publicada después de las 22:00 que cierra a las 07:30 puede no avisarse a tiempo. Ninguna corrección de filtrado de vencimientos resuelve por sí sola esa limitación. Antes de afirmar “alertas oportunas” debe definirse una frecuencia de escaneo y una ventana previa al cierre con cuotas, deduplicación y costos comprobados.

## Comunicación responsable

- Mostrar siempre la fecha/hora de cierre que informa ABC, y la hora de última consulta.
- Indicar que la postulación y vigencia definitivas se verifican en el portal ABC; no garantizar adjudicaciones, posibilidades de tomar cargos ni declarar “oportunidades perdidas”.
- Si ABC está caído, devuelve datos desactualizados o la hora no se puede interpretar, **no inventar cero alertas ni afirmar que una oferta sigue abierta**.
- No asumir que todos los distritos cierran a las 07:30: se debe respetar el `finoferta` de cada registro (incluidas fechas excepcionales, feriados y ampliaciones).
- Un email válido al enviarlo puede volverse obsoleto antes de que el docente lo abra; las comunicaciones deben incorporar la marca temporal de verificación y un enlace a ABC.

## Pendientes para lanzamiento

1. Validar fuente ABC vs hora presentada en el portal de postulación para un caso concreto, incluyendo la convención del sufijo Z.
2. End-to-end con cuenta de prueba y salida real de correo autorizada, y monitoreo de colas, horarios de entrega y falsos positivos.
3. Definir frecuencia para alertas antes de cierre, cuantificando servicio, costos y límites sin contactar usuarios.
4. Activación gradual solo con autorización específica posterior; versión original permanece 100 % en producción, versión PID 0 %, versión deadline aislada de investigación.

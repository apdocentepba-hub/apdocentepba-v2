# APDocentePBA — contraste del horario de cierre de ABC con SAD (04/11/2026)

## Resultado verificable (sin credenciales ni datos de usuarios)

Se consultó en GitHub Actions, con 2 GET HTTP de solo lectura, la API pública oficial de ofertas ABC APD y se analizaron **130 documentos**: 30 de Quilmes y 100 de Tigre (de 105 disponibles para Tigre, primera página). No se recopilaron identificadores de ofertas, docentes ni instituciones.

Ejecución: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41920096624 — **SUCCESS**, 0 pruebas fallidas.

| Métrica | Quilmes | Tigre |
|---|---:|---:|
| Ofertas consultadas | 30 | 100 |
| Campo `finoferta` con fecha/hora completa y sufijo `Z` | 30 | 100 |
| Hora de reloj contenida en `finoferta`: 07:30 | 30 | 100 |
| Horarios diferentes de 07:30 o 10:30 | 0 | 0 |
| Diferencias al recuperar el reloj argentino mediante el guard ABC | 0 | 0 |
| Ofertas `Publicada` rechazadas por cierre vencido al consultar | 0 | 0 |

Fechas de cierre observadas: **05/11, 06/11, 09/11 y 11/11/2026**, según distrito. Se validó la interpretación de **07:30, hora de Buenos Aires** y no 04:30: en ABC, la cadena `2026-11-05T07:30:00Z` se trata experimentalmente como reloj local de esta fuente. `parseApdDeadlineInstant` sigue interpretando `Z` normalmente como UTC para datos *no* provenientes de este campo. El desfase del campo ABC es de 3 horas respecto de la semántica ISO genérica.

**Importante:** esta verificación demuestra coherencia entre los campos de la API, la conversión de nuestro código y el cronograma comunicado por SAD; no es un contraste de una oferta individual con la pantalla de postulación de ABC autenticada. Esa paridad de interfaz sigue como puerta de salida a producción.

## Fuentes oficiales/distritales consultadas

- [SAD Tres de Febrero, Cadena 19/2026](https://sad117.com.ar/2026/02/18/18897/) — APD con cierres a **07:30 o 10:30**; la hora depende de cada oferta y cronograma.
- [SAD Almirante Brown, comunicación del 11/08/2026](https://sadalmirantebrown.com.ar/com-419-26-orden-de-merito-apd-11-08-2026/) — excepcionalmente se reprograman cierres por fallas técnicas de ABC. No se deben fijar plazos por día/hora predeterminados sin revisar el dato vigente.
- [SAD Presidente Perón, comunicación del 12/08/2026](https://sadperon.blogspot.com/2026/08/apd-cierre-1282026-reprogramacion-de.html) — confirma horarios reprogramados, según comunicación distrital.
- [SAD Pilar, comunicados docentes](https://sadpilarconsultas.wixsite.com/sad083/comunicados-docentes) — cierre 07:30 como regla de su distrito; no extrapolarlo a toda PBA.

## Pruebas nuevas en PR #245

1. Se amplió `scripts/probe-apd-public-abc-close-format-readonly.mjs` con agregados de horarios y comprobación de conversión de los instantes verificados a reloj bonaerense, sin solicitar nuevas páginas.
2. Se amplió `scripts/test-apd-offer-close-guard.mjs` con cierres **07:30 y 10:30**, exactitud en el milisegundo de vencimiento y simulación de la nueva fecha si ABC reprograma el cierre.
3. La batería completa de CI pasó con el mismo hash del Worker offline seguro para canales, `dee977aea3c1370b744f4a75a910c7429a2ed7b661dfa84d4b74d231db4422db`. No se modificó ese paquete, ya preparado en el artefacto `apd-stored-channel-deadline-safe-offline`.

## Lo que esto NO demuestra

- No acredita que cada oferta siga publicada en la interfaz en el momento de enviar un correo o abrir WhatsApp: ABC puede anular/reprogramar ofertas entre consultas. Exigir revalidación o mostrar hora de última consulta en la fase final.
- No prueba escrituras reales de lotes Supabase, cuentas reales autenticadas ni entrega de correo.
- No se generó una nueva versión Cloudflare, no se activó tráfico ni se hicieron cambios de cron.
- El workflow del radar en `main` continúa con un error de sintaxis separado; PR #246 ya tiene un arreglo de CI probado en https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41842793898, **aún sin fusionar**.

## Criterios siguientes de lanzamiento

Confirmación de una oferta concreta en el portal ABC visual, prueba autenticada de una cuenta consentida, validación de envío a destino de prueba, nuevo upload 0 % solo por vía autorizada, inspección de los 29 bindings y 4 crons de **esa** versión, y aprobación específica antes de asignarle tráfico.

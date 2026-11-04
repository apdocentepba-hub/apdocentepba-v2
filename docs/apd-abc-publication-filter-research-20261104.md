# APDocentePBA — investigación del filtro ABC «Publicada»

Fecha: 04/11/2026. Estado: **LABORATORIO, NO SUBIDO A CLOUDFLARE**.

## Causa identificada

El lector que alimenta el carrusel de APD `traerOfertasAPDDeUnDistrito` consulta distritos sin restringir el estado en Solr, lee hasta **8 páginas de 200 registros** y solo luego descarta ofertas no publicadas. El lector de correos `fetchPublishedOffersForEmailDistrict` y el barrido provincial ya incluyen en la consulta de ABC el estado **Publicada**. Es un punto de optimización específico del panel, sin justificar cambios en correos ni cron.

Los valores siguientes son **mediciones del origen público**, no de cuentas autenticadas.

| Distrito | Todos los estados en ABC | Publicadas en ABC | Páginas del lector actual, límite 8 | Páginas filtradas por estado |
| --- | ---: | ---: | ---: | ---: |
| Tigre | 9.458 | 93 | 8 | 1 |
| Berazategui | 8.987 | 50 | 8 | 1 |
| Villarino | 4.938 | 57 | 8 | 1 |

Se comprobó mediante consultas HTTP de solo lectura que un filtro Solr **fq=estado:"Publicada"** devuelve exclusivamente registros publicados en esos distritos, además de Avellaneda y Quilmes. Para Villarino, parte de los 57 registros con estado Publicada tenían fecha de cierre vencida, por lo que **el filtro por fecha posterior sigue siendo obligatorio**.

## Riesgo de omisión por paginación

La lectura actual puede omitir publicaciones si sus movimientos aparecen más allá de las primeras 1.600 filas de todos los estados de un distrito. No se ha probado que esto esté ocurriendo hoy para una cuenta real.

Prueba de laboratorio con las funciones extraídas del Worker: ocho páginas iniciales con estados cerrados, una publicación en una posición posterior; el lector actual no llega a esa publicación, mientras que la consulta filtrada la recupera con un GET. También se comprobó el manejo de errores HTTP 429, sin simular resultados vacíos.

## Desfase del inventario provincial

En la consulta de auditoría, la tabla global mantenía **3.045 filas con estado Publicada**, pero solo **500** tenían un cierre posterior al momento de la comprobación; el resto tenía un plazo vencido.

Para Tigre, comparación por ID a la misma fuente pública: **93 ofertas con plazo vigente en ABC, 85 en la caché global, 84 coincidencias, 9 en ABC pero no en caché, y 1 en caché que no figuraba en el conjunto actual**. Esa comparación es puntual y puede variar por publicación o retiro de ofertas entre barridos.

**No afirmar que esas nueve ofertas faltan en el panel**: se inspeccionó el Worker y el panel y el motor de correos consultan ABC directamente. El inventario provincial sirve a otros procesos de resumen e historial; debe documentarse su frescura por separado.

## Candidato adicional construido, distinto al ya subido

El candidato en Cloudflare con **0 % de tráfico**, versión **97ff1908-768a-474e-a83d-6f0d35da40f0**, conserva SHA-256 de fuente **6ee13869ec0d6363806e1bfc8990d529f7386b956c7bd30530f5e0109c861b6e** y **NO** incluye este nuevo filtro.

Un **segundo candidato experimental, solo local al CI**, conserva los cambios de concurrencia/PID del primero y agrega **un único filtro Solr fq=estado:"Publicada"** a `traerOfertasAPDDeUnDistrito`. Su SHA-256 de fuente es **19c8ab235ca8a07fee305797ad895d9e588535f754ded12470c58f1a83f3e870**. El proceso `scripts/build-apd-published-filter-research-candidate.mjs` lo genera sin modificar la fuente canónica ni la versión 0 % existente.

Evidencia: [GitHub Actions #41832394209](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41832394209) completó **4/4 pruebas de investigación** y `wrangler@4.157.0 --dry-run` del segundo candidato. La suite completa también aprobó.

## Criterios antes de considerar otro upload

1. Comparar respuesta completa del lector original y la versión filtrada en distritos con ofertas publicadas, a igualdad de ventana temporal, con estado y fecha de cierre.
2. Asegurar que la normalización de distritos y los identificadores se mantengan idénticos.
3. Conservar la distinción entre ofertas publicadas y oportunidades con plazo todavía abierto.
4. Validar los campos de PID, cargo, nivel, turno, deduplicación y orden del carrusel.
5. Mantener control 429, publicación en versión **0 %** únicamente bajo nueva autorización y control de 29 bindings y cuatro crons.
6. No alterar usuarios, planes, pagos ni notificaciones al ensayar.

**No hacer merge ni deploy de esta variante por los resultados anteriores solamente.** Falta una prueba autenticada de usuario de ensayo, latencia end-to-end y autorización separada para otra carga Cloudflare.

# Auditoría distrital ABC × APDocentePBA — 02/11/2026

**Alcance:** exclusivamente datos agregados públicos. No se leen filas de ofertas de ABC, usuarios, preferencias, credenciales ni pagos. No modifica Worker ni Supabase y no publica los resultados como supuestas vacantes vigentes.

## Referencia del escaneo de APDocentePBA
Archivo `audits/apd_scan_district_reference_20261102.json`, extraído por consulta SQL **de solo lectura** de:
- `public.apd_global_scan_state`, scope `PROVINCIA_FULL`, mode `current_published`, status `finished`;
- `public.catalogo_distritos` (137 nombres y equivalentes ABC);
- `public.apd_ofertas_global_current` (conteo por distrito de la ventana exacta del escaneo).

Cifras comprobadas: **137 distritos catalogados, 122 con al menos una oferta, 15 con cero; suma exacta 2.609 ofertas**. Todos los 122 distritos encontrados en las ofertas pertenecen al catálogo; no hay claves distritales sin correspondencia. La referencia es un registro congelado del barrido que terminó el 02/11/2026 a las **07:33 UTC** (04:33 ART). Los 15 ceros no son prueba de fallo, solamente ausencia de ofertas en esa captura.

## Conteo distrital actual de ABC, sin scraping de documentos
Una sola petición a la API pública del índice ABC, con `q=estado:"Publicada"`, `rows=0`, `facet=true`, `facet.field=descdistrito`, `facet.limit=-1`, `facet.mincount=1`.

Prueba real del 02/11/2026 ~14:21 ART: **2.827 ofertas con estado Publicada en 130 distritos del índice; suma de categorías 2.827; cero documentos descargados**. Esta es una observación puntual, no una consulta en tiempo real permanente. La forma de agrupar fue comprobada contra la respuesta, pero cada ejecución puede producir números distintos.

Solr soporta facetas de términos, aunque el índice concreto puede cambiar su respuesta. El código valida que los pares `[distrito, conteo]` sean íntegros y que sumen exactamente el `numFound` informado por ABC; si no, **falla con error, no inventa ceros**. No emite peticiones por distrito, evitando 137 solicitudes y sobrecarga.

## Comparación que nunca atribuye ofertas perdidas
`scripts/apd-abc-district-assessment.mjs` normaliza estrictamente mayúsculas, acentos y espacios, sin inventar equivalencias de nombres diferentes. Rechaza duplicados; si aparecen etiquetas de ABC sin correspondencia explícita con `apd_nombre`, las separa como `NOMBRES_ABC_NO_CONCILIADOS`, sin distribuirlas arbitrariamente.

El informe incluye por distrito **conteo ABC observado**, **conteo APD capturado en la referencia**, **diferencia meramente informativa**, fechas y la clasificación:
- `CAPTURA_APD_ANTERIOR` (referencia con más de 15 minutos);
- `ABC_CAMBIO_DURANTE_LECTURA` (cuenta ABC no concuerda con los dos conteos del control general);
- `NOMBRES_ABC_NO_CONCILIADOS` (ABC presenta distrito no mapeado);
- `CRITERIOS_DISTINTOS_AUN_SI_CERCANOS` (los tiempos son próximos, pero APD filtra vigencia y deduplica).

**No se declara igualdad de criterios ni ofertas perdidas**, incluso si los totales coinciden.

## Ejecución, pruebas y conservación
`.github/workflows/apd-abc-coverage-diagnostic.yml` continúa con la programación anterior de lunes a viernes a las **13:10 ART** (GitHub puede demorarla). Tras consultar ABC/Worker/ABC, hace **una única petición agregada adicional de facetas distritales**. Produce:
- `tmp/apd-abc-coverage-audit/report.json`: control provincial de tiempos;
- `tmp/apd-abc-coverage-audit/district-report.json`: 137 distritos y comparativa con la referencia fechada.

Ambos son artefactos privados del workflow retenidos durante **21 días**; no se escriben en producción. No hay correos ni avisos automáticos a usuarios. `node --test scripts/test-apd-abc-districts.mjs` verifica integridad de la referencia, normalización, denominaciones no conciliadas, sumas, errores, desfasajes temporales y consulta de lectura sin credenciales.

**Límite principal:** la referencia APD estática quedará cada vez más desfasada. El diagnóstico automático sí obtiene los conteos nuevos de ABC, pero no los conteos distritales actualizados de Supabase, porque el Worker público todavía no expone agregados completos verificados ni se dispone de un acceso transaccional de respaldo. No confundir esta auditoría con la confirmación de cobertura diaria. Para evaluar cobertura real sobre el mismo barrido será necesario comparar identificadores y filtros equivalentes en tiempos suficientemente próximos, con controles de privacidad y un origen confiable.

**Pendientes separados:** paginación del Worker en producción, histórico provincial SQL y respaldo recuperable de PostgreSQL.

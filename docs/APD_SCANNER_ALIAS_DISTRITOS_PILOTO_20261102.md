# Escáner APDocentePBA: equivalencias distritales, piloto NO desplegado

## Hallazgo comprobado (02/11/2026)
El barrido concluido a las 04:33 ART registró 2.609 ofertas distribuidas en 122 distritos del catálogo de 137. Una lectura posterior del índice ABC reportó 2.827 con estado `Publicada`, en 130 distritos. La lectura de facetas y el catálogo exhiben seis denominaciones divergentes: LA MATANZA / MATANZA, GENERAL LAS HERAS / LAS HERAS, 9 DE JULIO / NUEVE DE JULIO, GENERAL LA MADRID / GENERAL LAMADRID, HIPOLITO IRIGOYEN / HIPOLITO YRIGOYEN y BENITO JUAREZ / JUAREZ.

En el Worker activo el scanner consulta cada distrito del catálogo con `descdistrito:"NOMBRE"` y después compara `norm(doc.descdistrito) === norm(nombreDelCatalogo)`. Ese filtro puede descartar publicaciones de distritos cuyo nombre real es distinto del catálogo, **aunque la consulta Solr devuelva documentos**. La evidencia justifica revisar el mapeo, no declarar una cantidad concreta de ofertas perdidas: los dos cortes son de momentos distintos y el escáner aplica también `ofertaVigente()`.

`CAPITAN SARMIENTO` existe como municipio de PBA pero no figura con ese nombre en el catálogo cargado: el catálogo contiene `CORONEL SARMIENTO` y `GENERAL SARMIENTO` (este último es un partido histórico). No se presume una correspondencia de CORONEL con CAPITAN ni se modifican preferencias o registros actuales.

## Solución candidata, sin habilitación
- `worker-live/apd_scanner_source_district_alias_candidate.mjs`: seis nombres explícitos y documentados, sin equivalencias de Sarmiento.
- `scripts/build-apd-scanner-source-alias-preview.mjs`: solo genera `tmp/apd-scanner-alias-preview/worker-preview.mjs` inyectando una ruta protegida por `APD_DISTRICT_SOURCE_ALIASES_ENABLED=true`. Con la bandera ausente/desactivada mantiene la consulta y el almacenamiento original.
- Cuando se habilitara tras QA, la consulta a ABC y el filtro de origen utilizarían el nombre oficial ABC; la oferta capturada se guardaría con el **distrito canónico del catálogo**, preservando preferencias y el criterio de poda por distrito.
- `scripts/test-apd-scanner-source-alias-preview.mjs`: sintaxis del Worker temporal, seis alias, rechazo de alias inventados para Sarmiento, ausencia de cambios en el Worker principal y protección de flag.

### Validaciones adicionales obligatorias antes de producción
1. Ejecución de integración con API ABC en lectura (sin guardar ofertas) para los seis distritos y comprobación de estados, vigencia y `numFound`.
2. Ensayo de un barrido completo en base temporal: coherencia de `source_offer_key`, deduplicación, relaciones con preferencias, y poda por distrito.
3. Revisar el catálogo `catalogo_distritos` frente a la nómina oficial de municipios, especialmente Capitán Sarmiento y General Sarmiento; documentar estrategia de migración/rollback y conservación de referencias de suscripciones.
4. Preparar un respaldo **recuperable** antes de cambios masivos sobre las ofertas o catálogos en Supabase.
5. Autorización separada para desplegar el Worker y activar la bandera. Desactivar la bandera y restaurar el Worker previo si una prueba falla.

**No se modifica ni despliega producción** en este PR. Tampoco se alteran cobros, sesiones ni preferencias. Fuente oficial de municipios: https://www.gba.gob.ar/municipios .

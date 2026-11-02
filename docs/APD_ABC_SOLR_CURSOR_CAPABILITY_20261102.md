# Auditoría de cursor en el índice real de ABC — 2/11/2026

**Solo lectura, sin cambios en los sistemas docentes.** El escáner publicado usa paginación Solr basada en `start` y `sort=ult_movimiento desc`; una modificación del índice puede desplazar las páginas sin cambiar `numFound`. La doble comprobación exacta de IDs del PR #226 disminuye ese riesgo, pero no reemplaza una paginación diseñada para recorrer una fuente cambiante.

El auditor `scripts/audit-apd-abc-solr-cursor.mjs` efectúa como máximo seis solicitudes anónimas al endpoint público ABC, con `rows=2`, `fl=id,iddetalle,idoferta`, sin descripciones, nombres de personas, escuelas, preferencias ni datos de usuarios. Prueba tres candidatos de ordenación separados (`id`, `iddetalle`, `idoferta`) con `cursorMark=*`; solamente si la primera respuesta devuelve `nextCursorMark` y al menos tres resultados, consulta la segunda página. Registra **solo códigos HTTP, conteos y booleanos de compatibilidad**, no identifica ni persiste ofertas.

La documentación oficial de Apache Solr exige que el `sort` de `cursorMark` incluya la `uniqueKey` definida en el esquema. Que una columna parezca única no demuestra que sea la `uniqueKey`. Una prueba con dos páginas sin solapamiento confirma comportamiento básico, **no demuestra estabilidad ante modificaciones concurrentes**; incluso los cursores pueden verse afectados cuando cambia el valor de clasificación de un documento.

Documentación: https://solr.apache.org/guide/solr/latest/query-guide/pagination-of-results.html

## Decisión según resultados

- Si hay un candidato de cursor con dos páginas válidas, continuar con una prueba de barrido completo y detección de cambios en un entorno aislado, sin cambiar el escáner publicado.
- Si todos rechazan `cursorMark`, registrar que el endpoint **no ofreció soporte comprobable** a través de estos parámetros; no inferir que ABC no tiene otra API o método de paginación. Mantener el ensayo de doble paso y evaluar paginación estable.
- Si ABC no responde, el resultado es **indeterminado**, no una prueba de incompatibilidad.

**No hay despliegue, migración ni escritura de datos.** El respaldo/restauración de Supabase, el catálogo de Capitán Sarmiento, la integración real del Worker y la compatibilidad de alertas siguen pendientes.

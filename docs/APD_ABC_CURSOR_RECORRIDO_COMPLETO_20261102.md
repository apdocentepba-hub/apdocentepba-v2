# APDocentePBA: recorrido completo del índice ABC mediante cursor

**02/11/2026 — investigación de solo lectura, NO desplegada.**

El PR #227 verificó en ABC que `cursorMark=*` junto con `sort=id asc` devuelve `nextCursorMark` y al menos dos páginas sin coincidencias. Otros criterios de orden (`iddetalle`, `idoferta`) no mostraron el mismo comportamiento verificable. La documentación de Apache Solr establece la necesidad de incluir su clave `uniqueKey` en el orden de un cursor: https://solr.apache.org/guide/solr/latest/query-guide/pagination-of-results.html

## Qué incorpora el ensayo

`scripts/apd-abc-cursor-full-readonly.mjs` recorre la consulta de **publicaciones** de LA MATANZA con `sort=id asc`, `cursorMark`, `rows=60`, `fl=id`. No solicita datos de alumnos, escuelas, personal, cargo ni fechas. Exige `numFound` constante a través de todas las páginas y que cada documento tenga `id`, sin duplicados. No acepta `partialResults`, páginas incompletas, bucles ni sobrepasar el límite de 12 páginas. Si el cursor termina, exige que el número de identificadores únicos coincida exactamente con `numFound`.

`scripts/audit-apd-abc-cursor-full-twopass.mjs` ejecuta **dos recorridos completos independientes** uno después del otro y compara ambos conjuntos de IDs, sin depender del orden. Solo guarda cantidades, páginas, horas y una clasificación de igualdad; los identificadores se descartan en memoria y nunca se imprimen ni se almacenan en artefactos.

La suite offline inyecta casos con **161 ofertas sintéticas** en cuatro páginas por pasada, un cambio de identidad con el mismo total, duplicados entre páginas, cambios de `numFound`, respuesta parcial y límite de páginas. Los controles deben abortar si no pueden comprobar cobertura.

## Límites

- Dos conjuntos idénticos observados consecutivamente **no garantizan instantánea ni ausencia de modificaciones futuras**. Una oferta puede cambiar después de la segunda consulta.
- La prueba utiliza `id`, el campo que el índice real aceptó para el cursor, pero eso no autoriza sustituir automáticamente `source_offer_key` del Worker por `id`. Antes de tocar producción hay que demostrar el mapeo a `iddetalle` / `idoferta`, preservación histórica y campos de oferta completos.
- No se prueban 137 distritos ni se publica una actualización de ofertas. La mayoría del flujo productivo sigue usando offsets y necesita ser migrado al candidato con respaldo restaurable.
- No hay cambios a Worker, Supabase, alertas, preferencias, cobros ni usuarios.

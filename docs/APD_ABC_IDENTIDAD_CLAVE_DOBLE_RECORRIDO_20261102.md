# APDocentePBA — doble recorrido público de ABC: identidad y clave Worker

**02/11/2026. Prototipo de auditoría exclusivamente en lectura. No despliega el escáner.**

## Problema específico
El PR #228 demostró que dos recorridos `cursorMark` podían devolver el mismo conjunto de IDs de ABC. El PR #229 verificó las claves del Worker en una observación. Sin embargo, **los mismos IDs podrían devolver otro `iddetalle`** en la segunda lectura, cambiando la `source_offer_key` aunque el total, y aun el conjunto de IDs, sean iguales. Eso exige otro control antes de integrar la captura atómica.

## Contrato de este ensayo
- Reutiliza `readPublishedIdsByCursor` y la función `buildSourceOfferKeyFromOferta` **extraída del Worker real** por el cargador existente; no mantiene dos versiones de la regla.
- Consulta exclusivamente el índice público de publicaciones de **La Matanza**, con HTTP GET sin autenticación ni cookies, `sort=id asc`, `cursorMark`, `rows=60` y `fl=id,iddetalle,idoferta`.
- Hace **dos recorridos completos consecutivos**; cada uno exige conteo constante entre páginas, ausencia de IDs duplicados, no `partialResults`, cursor que termina y cobertura completa. Límite de doce páginas por recorrido.
- Compara en memoria `Solr id -> source_offer_key` en ambos recorridos; rechaza un ID agregado/eliminado, un ID estable con clave distinta, claves vacías o colisiones entre IDs.
- Como el corte productivo consultado en el PR #234 utiliza exclusivamente `D_<iddetalle>`, **cualquier fallback** a ID Solr, `idoferta` o clave compuesta bloquea `safe_for_further_review` y se informa solo en conteos.
- No devuelve ni imprime IDs ni claves individuales. El artefacto de Actions contiene únicamente cantidades, estado de estabilidad y hora de observación.
- `safe_for_further_review=true` significa **únicamente que las dos lecturas coincidieron en esos criterios**. No es garantía de instantánea en Solr, vigencia, plazo de inscripción ni equivalencia con la base productiva. `production_activation_authorized` siempre es falso.

## Ensayos sintéticos
`scripts/test-apd-abc-worker-key-twopass.mjs` cubre: 161 documentos en cuatro páginas por pasada, mismo conjunto de IDs pero `iddetalle` alterado, reemplazo de ID manteniendo `numFound`, colisión `source_offer_key`, fallback, clave vacía, respuesta parcial y error de cursor.

## Restricciones
Sin SQL de escritura, sin tokens de Supabase o Cloudflare, sin modificar Worker, sin envíos a docentes y sin publicar ofertas. No sirve para validar el historial de los 137 distritos ni reemplaza la copia de recuperación productiva.

**Pendiente siguiente:** integrar estas comprobaciones con la preparación de páginas y el sello transaccional del piloto PostgreSQL 17, manteniendo aislada la ejecución. Migraciones y publicación siguen requiriendo autorización específica y respaldo restaurable.

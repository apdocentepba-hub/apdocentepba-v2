# APDocentePBA — prueba aislada con las 24 columnas reales del catálogo de ofertas

## Hallazgo de arquitectura · 2/11/2026
Una consulta de solo lectura a `information_schema.columns` de Supabase confirmó que `public.apd_ofertas_global_current` tiene **24 columnas**: 17 campos descriptivos de texto, 4 fechas `timestamptz`, 2 contadores `bigint` y 1 campo `raw jsonb`. La implementación real `buildGlobalCurrentRow` del Worker emite las mismas 24 claves.

El ensayo anterior (#219–#221) representaba solo seis atributos y por lo tanto no podía asegurar que una futura migración preservase `raw`, escuela, cargo, modalidad, suplencias, historial o cambios de estado.

## Nuevo alcance y pruebas
Se incorpora exclusivamente en `tests/sql/` una tabla aislada `apd_scanner_pilot.current_offers_full` que reproduce **los nombres, tipos y nullability relevante de las 24 columnas** sin tocar el esquema `public` de producción. La captura por páginas almacena el JSON con los campos descriptivos; el commit de un distrito utiliza el mecanismo de cierre transaccional del piloto #219 y actualiza los metadatos completos dentro de esa misma transacción.

El contrato se verifica en dos capas:
- **Node, sin base:** `scripts/test-apd-full-24-column-contract.mjs` compara exactamente las 24 columnas contra una instantánea de metadatos reales y las 24 claves generadas por el Worker actual.
- **PostgreSQL 17 real descartable:** `tests/sql/test_apd_atomic_full_24col_pg17.sh` confirma cambios de estado `Anulada → Publicada`, persistencia de `first_seen_at`, incremento de `times_seen` y `state_changes`, actualización de `last_state_change_at`, conservación de JSONB anidado y de todos los campos de la oferta, inexistencia de eliminación por defecto, repetición de página y reversión completa si una excepción ocurre después de insertar.

**No se utilizan ofertas reales ni datos de usuarios.** Los ejemplos de la prueba son ficticios.

## Límites y decisiones necesarias
- **No es una migración de Supabase**: las funciones y la tabla se crean solamente dentro de PostgreSQL descartable de GitHub Actions.
- La captura real por distrito sigue sin utilizar esta integración. Una transacción por distrito no evita los desplazamientos de páginas en ABC si se mantiene el mismo `numFound`; todavía hace falta reconciliación por identificadores y pruebas con datos cambiantes.
- No se probó una restauración integral de los datos reales de Supabase. El respaldo previo sigue incompleto.
- Falta diseñar roles restringidos, permisos y RLS seguros para un futuro RPC, pruebas de concurrencia entre Workers, verificación de alertas y transición sin interrupciones.

**Condición para desplegar:** obtener respaldo completo y restaurable, probar migración/rollback y evaluar el cambio de fuente con banderas desactivadas inicialmente. El Worker en producción no se modifica.

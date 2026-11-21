# APDocentePBA — Preflight de integridad del escáner (solo lectura)

**02/11/2026.** Este control no reemplaza el respaldo, no modifica Supabase ni autoriza cambios de escáner.

## Propósito
Verificar la estructura mínima que debe conservar `public.apd_ofertas_global_current` antes de evaluar nuevas capturas: identidad de origen no vacía y única, distrito informado, ID ABC, integridad cronológica de primeras/últimas observaciones y contadores no negativos.

La consulta está en `scripts/apd-scanner-integrity-readonly.sql` y devuelve exclusivamente **cantidades agregadas y un booleano** `structural_checks_ok`. No imprime identificadores, escuelas, docentes, datos personales, contenidos `raw` ni claves privadas.

## Corte productivo observado con SQL SELECT (02/11/2026)
- 2.609 ofertas actuales; 2.609 claves `source_offer_key` distintas.
- 0 claves vacías; 0 distritos vacíos; 122 distritos representados en las ofertas actuales.
- 0 `idoferta` vacíos y 0 `iddetalle` vacíos.
- 0 fechas invertidas `first_seen_at > last_seen_at`; 0 `last_state_change_at > last_seen_at`.
- 0 `times_seen` inválidos y 0 `state_changes` inválidos.
- Observación puntual: un resultado correcto no demuestra que ABC no cambió, que la historia está íntegra, que los permisos son seguros ni que se puede migrar.

## Garantías de la prueba
- CI crea **exclusivamente** una tabla con las mismas 24 columnas en un PostgreSQL 17 descartable con dos filas ficticias.
- Repite la consulta con `default_transaction_read_only=on` y exige que un `INSERT` intencional falle dentro de esa conexión.
- Una clave duplicada y una fecha invertida deben producir `structural_checks_ok=false`.
- La tabla del ensayo no tiene restricciones que bloqueen el duplicado antes de detectarlo: esto prueba realmente la consulta.
- No usa `APD_SUPABASE_DB_URL`, API keys ni conectores productivos en Actions. No hace escrituras en Supabase.

## Uso bajo un operador autorizado
La consulta de producción debe ejecutarse únicamente como lectura, preferentemente mediante un conector de consulta SQL con permisos restrictivos. Si se usa `psql` con credenciales locales seguras, establecer `PGOPTIONS='-c default_transaction_read_only=on'`. Nunca publicar la cadena de conexión.

El resultado `structural_checks_ok=true` solo acredita coherencia **estructural de ese corte**. Cualquier captura con staging, poda, nueva RPC, alteración de tablas o publicación de Worker continúa bloqueada hasta contar con QA y recuperación verificada.


## Auditoría de paridad entre `source_offer_key` y Worker real

El Worker productivo extrae la clave principal mediante `sanitizeSolrNumber(oferta.iddetalle || oferta.id)` y el prefijo `D_`. Cuando el `iddetalle` está informado y contiene dígitos, **prevalece** sobre `id` y `idoferta`. Esta precedencia es esencial para conservar el historial al cambiar el método de paginación ABC.

La consulta nueva `scripts/apd-scanner-source-key-parity-readonly.sql` comprueba exclusivamente ese camino principal, más la presencia y relación numérica del `id` Solr almacenado en `raw`. Si en una futura captura falta `iddetalle` numérico o se requiere la ruta de respaldo `O_` / clave compuesta, el resultado `primary_identity_parity_ok` será **false**, obligando a revisar esa excepción antes de migrar. No infiere equivalencias entre formas distintas.

**Comprobación real contra Supabase (SELECT, 02/11/2026):** entre 2.609 ofertas actuales, 2.609 poseen dígitos en `iddetalle`, 2.609 cumplen la regla `D_` + dígitos de `iddetalle`, 2.609 tienen `raw.id`, 0 presentan divergencia numérica entre `raw.id` e `iddetalle`, 0 claves divergentes y 0 fallback sin cobertura. Son resultados agregados, sin datos identificatorios individuales.

**Pruebas con PostgreSQL 17 descartable:** dos filas válidas, alteración deliberada de `source_offer_key`, alteración del identificador en `raw` y ausencia de un detalle numérico. Cada caso alterado debe invalidar el preflight. También se ejecuta el SQL mediante una sesión que prohíbe escrituras.

**Límite:** una coincidencia en filas almacenadas **no** prueba que el índice ABC actual contenga exactamente esas mismas ofertas, que todos los distritos estén sincronizados ni que la fuente mantenga identificadores estables mañana. La captura nueva sigue sin autorizarse hasta comparar dos barridos completos y ensayar transacciones, roles y recuperación.

## Siguiente validación
Cruzar las identidades del índice ABC (`id`, `iddetalle`, `idoferta`) con las reglas exactas de `source_offer_key` y someter los casos de colisión a la transacción aislada del piloto PG17. No inferir pérdida de ofertas ni ausencia de alertas solo a partir de esta consulta.

# APDocentePBA — Sincronización de ofertas en lotes (04/11/2026)

## Hallazgo confirmado en el código actual

Cada visualización correcta de las alertas ejecuta `sincronizarOfertasPanel(items)` en `app_v2.js`, que realiza un `POST /api/sync-offers`. El Worker vigente implementa `syncUserOfferState` mediante **un POST de Supabase por cada oferta**, de forma secuencial.

Esta ruta se dispara en segundo plano después de renderizar las alertas, por lo cual **no puede atribuirse por sí sola el tiempo inicial de carga del carrusel**, aunque sí genera escrituras y carga de red adicional.

## Optimización implementada sin cambiar producción

- Builder: `scripts/build-apd-bulk-sync-research-candidate.mjs`.
- Pruebas diferenciales: `scripts/test-apd-bulk-sync-research.mjs`.
- Variante aislada generada en CI: `tmp/apd-bulk-sync-research/worker_hotfix.js`.
- Hash SHA-256 del candidato: `8b6174766e8dab90b29a6a4452037f5e322b8d7aca34dbfc611ac46b00eff258`.
- Base exacta: versión PID ya subida al **0 %**, SHA-256 `d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f`.
- La comparación con la base confirma que **solo cambia la función `syncUserOfferState`**; el Worker en producción y la versión ya almacenada en Cloudflare permanecen intactos.

La versión de investigación agrupa por identificador canónico con semántica *último registro prevalece*, conserva la desactivación de las ofertas ausentes y hace lotes de **máximo 100 filas**. Separa filas nuevas y existentes para **preservar `first_seen_at`** y evitar campos ausentes convertidos en valores nulos por PostgREST.

## Resultados verificables

CI SUCCESS: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41846030924

| Escenario simulado | Método anterior | Método nuevo |
|---|---:|---:|
| 105 ofertas nuevas | 105 POST | 2 POST (100 + 5) |
| 251 ofertas nuevas | 251 POST | 3 POST (100 + 100 + 51) |
| Ofertas duplicadas | Reescritura secuencial | Deduplicadas conservando la última |
| Ofertas ausentes | Marcadas inactivas | Mismo resultado |
| Filas nuevas/existentes | Cada registro individual | Lotes separados; no pisa `first_seen_at` |

La prueba no consultó Supabase real ni usuarios. **Reducción de 105 a 2 llamadas en un escenario sintético**: no equivale a afirmar una mejora de latencia medida en producción.

## Pendiente

- Verificar con Supabase PostgREST real en un entorno de pruebas seguro las actualizaciones en lote, restricciones de columnas y RLS.
- Probar integridad del seguimiento al reiniciar, desactivar y editar preferencias, y confirmar que ningún error parcial marca ofertas incorrectas.
- Aprobar aparte la integración de esta variante con el Worker previsto para producción. No desplegar ni asignar tráfico a esta versión automáticamente.

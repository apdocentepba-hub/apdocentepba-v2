# APDocentePBA — continuidad sin migración y calidad del feed

Fecha: 1 de noviembre de 2026 (Argentina). Fuente: código del repositorio
`apdocentepba-hub/apdocentepba-v2`, consultas SQL de solo lectura a
Supabase `vvgkinkvojqwfuqaxijh`, y estado de CI de PR #178.

## Compromiso de infraestructura
- Web productiva `alertasapd.com.ar`: GitHub Pages de este proyecto.
- API y motor de alertas: Cloudflare Workers.
- Base de datos de docentes, suscripciones, preferencias y capturas: Supabase.
- Repositorio, CI y revisión: GitHub, rama `growth/landing-apd-20261101`.
- Render `apdocentepba-growth-preview.onrender.com`: **únicamente
  compilación estática de demos**, sin backend, sesión real ni datos personales.

**No se despliega a producción, no se ejecutan migraciones SQL, no se cambia
DNS, GitHub Pages, Workers, keys, permisos ni se mueven datos entre proveedores.**
`main` y la web productiva no se han alterado en este trabajo.

## Diagnóstico de calidad de datos (consultas de solo lectura)

### Barrido provincial actual
- `apd_global_scan_state`: `scope=PROVINCIA_FULL`,
  `status=finished`, `mode=current_published`.
- `districts_completed=137` de `total_districts=137`.
- `offers_processed=2617`; finalizó `2026-11-01 07:35:19 UTC`
  (04:35:19 Argentina).
- `apd_ofertas_global_current`: 2.617 filas y 2.617
  `source_offer_key` diferentes; 0 sin identificador `idoferta`,
  0 sin `cargo`, 0 sin `distrito`, 0 con fechas invertidas de observación.
- 123 distritos con al menos una oferta; los otros 14 no implican fallo
  del escaneo porque pueden no tener ofertas del corte.
- Las 2.617 filas tienen estado `PUBLICADA` observado en el corte.
  **No se deduce de ello que todas continúen abiertas o que el sistema ABC
  garantice ese estado hasta el próximo barrido.**
- Estos controles prueban consistencia de campos básicos, **no equivalencia
  fila por fila con el APD oficial autenticado**.

### Histórico desactualizado (fuente separada)
- `apd_ofertas_global_snapshots`: 25.650 filas,
  última captura `2026-09-18 01:17:10 UTC`, cero capturas en 30 días.
- `apd_ofertas_historial`: 10.998 filas, última captura
  `2026-06-14 17:55:00 UTC`, cero capturas en 30 días.
- `apd_current`: 0 filas.
- `apd_postulantes_historial`: 0 filas.
- `apd_events`: 0 filas.

El código del Worker versionado **lee expresamente**
`apd_ofertas_global_snapshots` y `apd_ofertas_historial` dentro de
`handleHistoricoResumen`. Como ambas fuentes tienen cero capturas en 30 días,
es correcto que el widget histórico no muestre tendencias para ese intervalo.
No debe simular nuevas, designaciones ni cambios históricos a partir de un
corte aislado del catálogo actual.

La ruta provincial `handleProvinciaResumen` lee, por separado,
`apd_ofertas_global_current`. La auditoría de la semántica de estado/fecha
es pendiente; no equiparar `first_seen_at` de un barrido de reinicio
a «nuevas ofertas publicadas en ABC» sin comprobarlo.

## Cambios de frontend en PR #178
- Carga progresiva de perfil/plan/preferencias, sin bloquearlos detrás
  de `mis-alertas` ni esperar autorización Admin.
- Error de consulta `mis-alertas` distinto de una búsqueda sin resultados.
- Historial vacío: mensaje explícito de **falta de capturas recientes**;
  el listado actual se actualiza por separado y no se afirma «0 ofertas».
- Pestaña Administración solo visible tras autenticación afirmativa.
- Carrusel conservado, sin rediseñar su implementación.

## Siguiente frente de fiabilidad
1. Validación del feed real ABC con sesión autorizada y sin copiar credenciales.
2. Confirmar estado de las 2.617 ofertas contra fechas de cierre y estados.
3. Diseñar captura histórica incremental y reversible; evitar backfill masivo
   manual o cron duplicado, y no modificar la base sin validación.
4. Añadir monitoreo de antigüedad de la última captura, último escaneo, tasa
   de errores y duración total, siempre usando datos agregados y sin PII.
5. Medir carga autenticada fría/caliente y latencias reales por ruta de API.
6. Reconciliar límites de planes entre catálogo Supabase y Worker sin perder
   prestaciones existentes y completar QA antes de merge.

## Verificabilidad
- PR: https://github.com/apdocentepba-hub/apdocentepba-v2/pull/178
- CI y pruebas en GitHub Actions bajo rama de desarrollo; revisar último
  commit y checks antes de considerar la etapa terminada.

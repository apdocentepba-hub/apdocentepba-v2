# APDocentePBA — API de resumen provincial paginada (vista previa)

**Hallazgo verificado el 2/11/2026 mediante GitHub Actions contra el Worker público real:**

- `GET /api/provincia/backfill-status`: barrido `finished`, 137/137 distritos, 2609 ofertas procesadas, fecha de finalización 2026-11-02 07:33:18Z.
- `GET /api/provincia/resumen`: `total_ofertas=1000`, `ventana_dias=30`, `empty=false`.
- Diferencia **1609**. La API no representa el total del barrido. Una causa probable es el máximo de filas devueltas por consulta PostgREST; la evidencia prueba el desajuste, no por sí sola su causa.

## Corrección preparada, NO desplegada
`worker-live/apd_provincia_summary_pagination_hook.mjs` implementa un resumen basado en páginas de **500 filas** ordenadas por fecha e identificador único y filtra el último período observado. El algoritmo:

1. Requiere `APD_PROVINCIA_PAGINATION_ENABLED=true` para usar el nuevo handler. Por defecto no cambia ninguna ruta.
2. Lee estado del escáner antes y después, exige `finished` y cobertura total.
3. Pagina con `limit=500&offset=...`, máximo 20.000 registros, rechazando duplicados y resultados incompletos.
4. Compara el número final de filas con `offers_processed` del barrido y verifica la ventana de observación.
5. Solo entonces llama al constructor de resumen existente y devuelve `verified_complete_scan=true`.
6. Si la consulta falla, cambia el estado o los datos no concuerdan, devuelve **503**, nunca un total falso o cero silencioso.

Generador: `scripts/build-apd-provincia-paginated-preview.mjs`, que incorpora la corrección al **Worker compilado en un archivo temporal**, sin alterar `worker-live/worker_hotfix.js` ni desplegar Cloudflare. Pruebas offline de 2609 filas, paginación, duplicados, cambios de estado y sintaxis compilada.

## Límites
- No consulta ABC ni verifica vigencia de vacantes; `verified_complete_scan` solo verifica consistencia con el escaneo.
- No se modificaron migraciones, datos, usuarios, planes, facturación ni secretos.
- Una paginación real con datos en movimiento puede producir discrepancias; se rechazan en vez de ocultarlas.
- La validación de integración contra los datos reales requiere **despliegue autorizado de un piloto** con bandera apagada primero; la web publicada todavía utiliza el endpoint anterior.
- El candidato de frontend PR #198 también permanece inactivo; activar los dos componentes requiere QA conjunto.

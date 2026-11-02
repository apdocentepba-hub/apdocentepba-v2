# Control automático de cobertura ABC ↔ APDocentePBA

Fecha: 02/11/2026. Consulta **solo agregados públicos**, nunca usuarios, ofertas individuales ni datos de postulación. El control se incorpora al repositorio por separado de los proyectos VOLVÉ y FLUYNOVA.

## Por qué no pueden compararse dos totales sin contexto
En una comprobación del 02/11/2026, el origen ABC devolvió **2.435** al consultar el estado `Publicada` (12:58 hora argentina), mientras el último barrido completo de APDocentePBA recogió **2.609** ofertas, terminado aproximadamente a las 04:33 hora argentina.

**No hay prueba de ofertas perdidas ni error de cobertura:** son dos instantes distintos, el barrido APD consultó por distrito durante varias horas y además filtra localmente vigencia y deduplica identificadores; ABC `estado:"Publicada"` cuenta resultados del índice, no las ofertas ya filtradas por `ofertaVigente()`. Igualar números no prueba cobertura completa.

## Nuevo diagnóstico
`scripts/audit-apd-abc-coverage-daily.mjs` usa **tres GET anónimos** en este orden:

1. ABC con `q=estado:"Publicada"`, `rows=0`, `wt=json` — solamente `numFound`.
2. `GET /api/provincia/backfill-status` del Worker público indicado por `app_v2.js`.
3. Repite la misma consulta ABC, para detectar si el total cambió durante la comprobación.

Guarda en `tmp/apd-abc-coverage-audit/report.json` solamente cantidades, ámbito, fechas UTC, intervalo de lectura, distancia temporal, diferencia informativa y clasificación. No se vuelcan documentos del índice, suscriptores, datos personales ni claves.

La evaluación (`scripts/apd-abc-coverage-assessment.mjs`) distingue:
- `ABC_CAMBIO_DURANTE_LECTURA`: el índice cambió durante las tres consultas; no calcula diferencia.
- `BARRIDO_NO_VALIDADO`: escaneo incompleto, ámbito incorrecto, fechas inconsistentes o resultado inválido; no calcula diferencia.
- `CAPTURA_ANTERIOR_NO_COMPARABLE`: pasaron más de 15 minutos entre la finalización del barrido y el inicio de la consulta ABC. La diferencia puede informarse solo como referencia, no como error.
- `BARRIDO_POSTERIOR_A_ABC`: reloj o relación temporal imposible para una comparación próxima.
- `CERCANOS_EN_TIEMPO_CRITERIOS_DISTINTOS`: valores registrados próximos, pero **sin equivalencia comprobada**: filtros y duración de escaneo diferentes.

En **ningún estado** el informe declara `same_time_and_same_criteria_confirmed=true`; no permite inferir postulaciones ni cargos perdidos.

## Automatización

`.github/workflows/apd-abc-coverage-diagnostic.yml` corre los días hábiles a las **13:10 ART** (16:10 UTC; cron de GitHub puede demorarse), y permite ejecutarlo manualmente. Los informes agregados se guardan como artefactos privados del workflow durante **21 días**. El control no escribe en Supabase ni el Worker, no publica contenido, no envía correo ni notifica usuarios, y no requiere secretos.

GitHub Actions puede fallar si el sitio ABC está temporalmente caído; ese fallo **no** prueba falta de ofertas. Los informes corresponden a observaciones discretas, no a vigilancia continua. No es un sistema de reescaneo.

## Pruebas y activación
`node --test scripts/test-apd-abc-coverage-audit.mjs` comprueba diferencias de 174, horarios desfasados, cambios durante la lectura, escaneos incompletos, respuestas inválidas y ausencia de credenciales. El workflow conserva el JSON solo después de validar y consultar las dos fuentes.

**Pendientes independientes:** paginación del resumen del Worker aún no desplegada; histórico diario aún sin migrar por falta de respaldo PostgreSQL integral y restaurable.

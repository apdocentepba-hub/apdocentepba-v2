# APDocentePBA — Radar provincial con datos verificables (candidato)

Estado: **listo para QA en branch; sin publicar ni modificar la web activa** (2/11/2026).

## Problema corregido

El script actualmente cargado en `index.html` es `radar_provincia_patch_semaforo.js?v=2`, con un `SNAPSHOT` fijo fechado `2026-04-06`; utiliza descripciones como «hoy» o «vigentes» pese a que son números congelados. Su botón «Refrescar radar» vuelve a pintar los mismos datos, sin consultar el servidor.

El candidato `candidates/radar_provincia_live_20261102.js` reemplaza exclusivamente esa visualización y **consulta en cada refresco** `GET /api/provincia/backfill-status`, una ruta agregada del Worker existente. Usa el `API_URL` definido en `app_v2.js` para evitar puntos de conexión inventados.

- Estado `finished`, distritos completos y fecha válida: muestra **distritos procesados** y **ofertas detectadas durante el último barrido**.
- Barrido finalizado hace más de 36 horas: advierte que es una **captura antigua**; no la presenta como información actual.
- Barrido en curso/incompleto/error: muestra progreso o incidencia **sin cifras de ofertas definitivas**.
- Error de red o datos inesperados: muestra **estado no verificable**, sin conservar números anteriores ni fabricar ceros.
- Botón «Consultar ahora» hace una nueva petición real de solo lectura; evita la sustitución de resultados nuevos por respuestas viejas mediante request ID y AbortController.
- No se muestran identificadores de docentes, preferencias, listas privadas, datos de sesiones ni claves.
- Los textos de respuestas se derivan exclusivamente de campos estrictamente verificados y se insertan con `textContent` (no se inyecta HTML de servidor).
- Aclara que «ofertas detectadas» no significa «vacantes abiertas»; postulaciones siempre se verifican en ABC.

## Límites
Este candidato **no agrega histórico por día**, no confirma qué ofertas siguen abiertas y no calcula rankings reales por cargo/distrito: estos requieren un origen fiable y no truncado. El endpoint de resumen agregado utiliza límites de lectura cuya exhaustividad todavía requiere validación. No se utilizaron sus rankings ni estadísticas de «designadas»/«desiertas» para el radar.

### QA
`node --test scripts/test-apd-radar-live-candidate.mjs` evalúa el script en un DOM falso, con fetch interceptado. Incluye pruebas de estado completo, fecha caducada, parcial/error, respuestas corruptas, falta de API, condiciones de carrera y botón de actualización. Sin acceso real a Supabase ni datos personales.

### Despliegue pendiente
Una vez autorizado, sustituir **solo** en `index.html` la referencia de `radar_provincia_patch_semaforo.js?v=2` por `candidates/radar_provincia_live_20261102.js?v=1` (o copiarlo a un nombre estable), hacer smoke de sesión y móvil, y observar errores del navegador. Rollback: restaurar la referencia anterior, aunque mantiene cifras obsoletas.

**No se incluye cambio en `index.html`, Worker, Supabase o secretos en este PR.**

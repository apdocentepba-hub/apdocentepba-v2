# APDocentePBA — Rendimiento de alertas del panel (02/11/2026)

## Motivo
El usuario observa demora excesiva al esperar alertas desde el panel. No se ha obtenido todavía una medición auténtica de su sesión (con token de prueba) y no sería correcto atribuir una latencia en segundos a un componente sin traza. **No cambiar producción para probar a ciegas.**

## Auditoría del código de `main` (solo lectura)

1. `app_v2.js` → `cargarDashboard` inicia `obtenerMisAlertas` en paralelo, pero espera el `Promise.all` de perfil, preferencias y plan antes de renderizar el panel y enlazar la respuesta de alertas. Esta dependencia puede hacer que una respuesta rápida de alertas se visualice tarde. Mantener como requisito **no mostrar alertas hasta verificar autorización/plan**, ni mostrar como cero un error de red.
2. `worker-live/worker_hotfix.js` → `construirAlertasParaUsuario` obtiene usuario y preferencias, luego catálogos, **todos los distritos**, y solamente después obtiene el PID guardado. Esa consulta PID de solo lectura es independiente del barrido ABC y puede ejecutarse en paralelo, preservando su fallo permisivo a `null`.
3. `traerOfertasAPDPorDistritos` consulta cada distrito con `await traerOfertasAPDDeUnDistrito` **dentro de un `for` secuencial**. Cada distrito a su vez obtiene páginas sucesivas de ABC. El tiempo del servidor puede acumularse con varios distritos.
4. `index.html` carga muchos scripts síncronos. No se desactivan ni se cambia su orden sin aislar dependencias, porque podrían interferir con login, protección de plan, preferencias y notificaciones.

## Experimento propuesto en rama de PR

`scripts/build-apd-alert-panel-performance-candidate.mjs` toma el Worker canónico como entrada y genera **solo** `tmp/apd-alerts-performance/worker_hotfix.js`. Nunca reescribe `worker-live/worker_hotfix.js`.

Cambia dos decisiones de planificación, no el filtrado ni las rutas:

- **Dos distritos concurrentes como máximo:** prepara solicitudes GET sin modificar el código del fetch por distrito, limita a dos solicitudes distritales simultáneas y **procesa los resultados en el orden original**. Conserva `debug_distritos`, ordenado de ofertas, eliminación de duplicados por clave y errores de fuente que deben seguir bloqueando el resultado.
- **Solapamiento de PID:** inicia `obtenerUltimaPidGuardada(userId)` antes de esperar catálogo y ABC; consume el resultado en la misma posición lógica anterior. Ante error sigue tomando `null`. No agrega caché compartida de alertas ni cambia identidad de sesión.

## Pruebas automáticas
`scripts/test-apd-alert-panel-performance-candidate.mjs` compara el Worker canónico y el candidato con documentos ficticios. Debe exigir: mismos resultados, mismo orden y `debug_distritos`; máximo dos solicitudes distritales activas; falla explícita de ABC, sin fingir cero alertas; superposición de PID y resultados idénticos con PID correcto o fallido.

Se valida sintaxis del Worker generado y se comprueba que no cambian archivos del Worker productivo, HTML, frontend ni Supabase.

## Qué todavía falta

- Instrumentación por tramos **sin PII**: latencia de endpoint `/api/mis-alertas`, cantidad de distritos, páginas ABC, catálogos, PID y tiempo desde autenticación hasta primera alerta dibujada. No exponer tokens, datos personales ni consultas por usuario en métricas públicas.
- Medición con sesión de prueba propia y perfiles de uno, dos y varios distritos. Registrar p50/p95 antes/después, conteo de alertas e igualdad de claves.
- Ensayo de carga moderada para comprobar que dos peticiones paralelas no causan `429`, respuestas incompletas ni tiempos peores del ABC de origen; rollback inmediato si aumenta error o pérdida de ofertas.
- Auditar si el Worker desplegado coincide realmente con el archivo canónico y revisar posibles sobreescrituras de otros scripts del panel antes de modificar el frontend.
- Decidir si se requiere un endpoint agregado autenticado de perfil, preferencias y plan para reducir viajes de red, **sin romper autenticación, autorización, cuotas, ni estado de suscripción**.
- Obtener respaldo/restauración verificados y autorización específica para cualquier despliegue productivo. La propuesta no habilita el escáner transaccional nuevo ni escribe ofertas.

**Estado de este PR:** optimización candidata aislada. No equivale a una mejora de velocidad comprobada en la página real; cualquier afirmación de segundos o porcentaje de aceleración requiere medición adicional.

## Evidencia de candidato aislado y auditoría de assets

**Commit evaluado:** `edb6119300efb76d88ceead61fd6441238146578`. GitHub Actions `41556659815`: **success**, con **6/6 pruebas funcionales** correctas y comprobación de que no se modificaron los archivos productivos. El primer ensayo falló por un nombre incorrecto de variable **en el fixture de prueba**, corregido antes de repetir toda la suite.

En `index.html`, la auditoría estática `scripts/audit-apd-panel-static-assets.mjs` identificó **26 tags `script src`**, de los cuales **25 son locales**, todos sin `async` o `defer`, con **342.742 bytes** de JavaScript local sin comprimir. Ningún archivo local esperado faltó en el repositorio. El inventario **no es una medición de red**, de coste de parsing, de ejecución en el navegador ni de carga del panel autenticado; varios scripts se encuentran al final del cuerpo HTML, circunstancia que debe considerarse antes de modificar su orden.

Próxima etapa: instrumentar tiempos del panel y endpoint con datos sintéticos/usuario autorizado, observar p50/p95, identificar dependencias del arranque y comparar los tiempos con y sin concurrencia limitada. No introducir caché de alertas de usuario sin aislamiento por identidad y plan. **No desplegar todavía.**

**Progreso de optimización del panel:** 2/5 hitos de preparación (40%): (1) hotspots identificados, (2) candidato no productivo con paridad comprobada; faltan (3) medición antes/después con trazas seguras, (4) QA de permisos, filtros, suscripciones, límites y carga ABC, (5) implementación controlada y verificación de mejora real.

## Evidencias nuevas: tiempos, cobertura y fuente publicada con proyección mínima

**Experimento sintético controlado:** ejecución de GitHub Actions `41557900091`, commit `74dc5e489f954511323da6c4c9ffaf9fae506126`, **success**. Cinco repeticiones por versión, latencia falsa de **45 ms/distrito**, sin red:
- 1 distrito: mediana **45,4 → 45,4 ms** (sin diferencia).
- 2 distritos: **90,3 → 45,2 ms**.
- 4 distritos: **180,6 → 90,4 ms**.
- 6 distritos: **270,9 → 135,5 ms**.
- Lecturas independientes catálogo (35 ms) + ABC (55 ms) + PID (75 ms): **165,5 → 90,6 ms** en la simulación.
El resultado de ofertas, orden y deduplicación fue **idéntico** en cada comparación. Los valores anteriores no son una promesa de aceleración del sitio real; p95 de esas cinco repeticiones quedó registrado en el log CI.

**Observación limitada de red pública:** `41558124495`, cuatro solicitudes GET al primer bloque `rows=200` de ABC, sin autorización. Una lectura secuencial conjunta de La Matanza y Avellaneda tardó **2.009,7 ms**, y una lectura paralela conjunta **1.495,1 ms** en el runner de GitHub. Es solo una muestra por método con dispersión considerable; no representa el tiempo del panel autenticado ni puede usarse como p50/p95. El tamaño total de la primera página histórica de ambos distritos fue **669.623 bytes**.

**Riesgo de cobertura importante detectado:** el Worker canónico hace consultas sin `estado:"Publicada"`, por páginas de 200 y límite de ocho páginas por distrito (máximo 1.600 filas). ABC informó **32.588** registros totales para La Matanza y **9.219** para Avellaneda bajo las consultas genéricas sin filtrar. El código actual no compara `numFound` con las páginas recuperadas. **No se puede inferir que se pierdan ofertas efectivamente**, pero tampoco se debe certificar cobertura completa con esas consultas. Por ello la aceleración mediante concurrencia limitada sigue siendo solo un candidato.

**Factibilidad de consulta por estado y privacidad:** `41558340831` confirmó mediante GET público que para `estado:"Publicada"` el índice devolvía **183** registros de La Matanza y **65** de Avellaneda; el modo `cursorMark` retorna campos de oferta suficientes para evaluar un lector proyectado. El documento completo de Solr incluía nombres de campos asociados con CUIL/reemplazos; no se registró ningún valor personal.

**Prototipo alternativo de bajo volumen y mínima exposición** (`scripts/apd-abc-published-projected-cursor-readonly.mjs`): exige `estado:"Publicada"`, `cursorMark`, `id asc`, proyecta exclusivamente **29** campos permitidos (sin `cuilautor`, `reemp_cuil` ni `reemp_apeynom`), exige el detalle numérico y calcula claves mediante **la función real del Worker**. Rechaza información parcial, IDs o claves duplicados, distrito incorrecto, cambios de `numFound`, páginas excesivas y cualquier campo fuera de la lista. No devuelve registros ni claves individuales.

**Ejecución con ABC real**, CI `41558798474` **success**:
- La Matanza: 183 ofertas «Publicadas» únicas, 183 claves únicas; **3 páginas**, **188.589 bytes**, **1.322,6 ms**.
- Avellaneda: 65 ofertas «Publicadas» únicas, 65 claves únicas; **2 páginas**, **67.615 bytes**, **358,2 ms**.
- Total de esos dos distritos: **248 ofertas**, **5 páginas y 256.204 bytes**, con consulta pública de solo lectura. El CI probó también **10/10 casos negativos/positivos ficticios**, incluidos datos personales inesperados, errores HTTP, páginas truncadas y colisiones. Esta ejecución es un solo recorrido completo por distrito y no reemplaza las pruebas de doble recorrido de los PR #235/#236.

**Advertencia de arquitectura:** el prototipo todavía NO está conectado al Worker, por lo que no se puede afirmar igualdad de resultados de filtrado con perfiles autorizados ni tiempos reales de panel. `observaciones` permanece en la proyección porque el Worker utiliza el campo, pero su contenido también requiere auditoría de privacidad antes de exhibirlo. Las diferencias de contadores de `debug_distritos` al pasar de todos los estados a solo «Publicada» deberán resolverse. No activar el prototipo, ni reemplazar el Worker, ni fusionar por el simple resultado verde de CI.

**Próximo criterio de aceptación:** pruebas de paridad de alertas y PID usando documentos del lector proyectado, revisión de privacidad del `raw` actual, medición del panel autenticado y rollback verificable. Se mantienen intactas `main`, la web, usuarios, pagos, alertas y Supabase.

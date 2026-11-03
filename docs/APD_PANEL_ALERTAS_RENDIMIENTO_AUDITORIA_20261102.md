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

## Contrato de filtros y PID — ensayo sobre funciones reales del Worker

**CI `41559647293`: success**, pruebas del commit `d62e74466b02e00f0d5688bd6f919fbf363a365c`, con **16/16 casos** sobre el código canónico de `worker-live/worker_hotfix.js`. El ensayo `scripts/test-apd-projected-alert-pid-parity.mjs` ejecuta sin red las funciones reales `coincideOfertaConPreferenciasAPD`, `evaluatePidCompatibility` y `buildAlertItem`, junto con sus auxiliares originales. Compara el documento completo ficticio con su proyección a los 29 campos permitidos y comprueba igualdad de campos calculados, coincidencias y evaluación PID en doce escenarios: distrito, cargo, turno, nivel, puntaje por residencia, PID ausente, incompatibilidad de área o rama y estado no publicado.

Tres controles negativos demuestran que las pruebas detectan diferencias al retirar campos relevantes de cargo/área, nivel y turno. El campo `raw` se excluye **del requisito de igualdad** porque el documento proyectado debe suprimir deliberadamente los campos personales de origen. Con el Worker actual, `buildAlertItem` devuelve `raw: oferta`, por lo que la consulta genérica sin proyección puede reenviar a clientes campos como `cuilautor` y `reemp_cuil` que vengan de ABC; esto debe bloquearse en cualquier integración futura. **La prueba es con documentos inventados**, no con sesiones autorizadas ni con cada variante del índice ABC.

El primer intento falló por un error en el extractor de funciones **del test** (expresión regular mal escapada); se corrigió y se repitió la suite completa con éxito. Esto no demuestra un fallo ni una corrección del Worker productivo.

## Auditoría agregada del texto libre `observaciones` — bloqueo de privacidad

**CI `41559891372`: success**, con cuatro pruebas adicionales y una consulta pública acotada a `fl=observaciones`, estado «Publicada», sin solicitar IDs de ofertas, CUIL ni datos de sesión. Los valores de texto se analizaron **solo en memoria**; no se imprimieron ni guardaron, y únicamente se registraron cantidades agregadas.

- **La Matanza:** 183 ofertas examinadas, **16 observaciones no vacías**; **0** posibles identificadores personales, correos o referencias telefónicas detectados por los patrones del ensayo.
- **Avellaneda:** 65 ofertas examinadas, **16 observaciones no vacías**; **1 posible dirección de correo electrónico**, **0** coincidencias del patrón de identificador personal y **0** referencias telefónicas.
- El contador de indicios **no es una auditoría semántica completa ni certifica ausencia de PII**. Un texto puede identificar a una persona sin coincidir con las expresiones regulares. Tampoco se conoce si el posible correo detectado identifica un contacto institucional o a una persona.

**DECISIÓN DE SEGURIDAD:** la nueva consulta proyectada **no está autorizada para exponer `observaciones` ni `raw` textuales sin una política explícita de minimización/sanitización y pruebas de equivalencia funcional**. No eliminar silenciosamente observaciones que puedan ser útiles para el usuario ni afirmar privacidad total por el resultado de un regex. No enlazar el prototipo directamente con la respuesta del Worker. El estado sigue **DRAFT / sin fusión / sin despliegue**.

## Progreso y aceptación pendiente

La preparación de optimización se mantiene por ahora en **40% (2 de 5 hitos plenamente cerrados)**: diagnóstico y candidato de concurrencia probado. La tercera etapa avanzó con 16 verificaciones funcionales y 4 de privacidad, pero queda **bloqueada** por la posible presencia de texto personal en observaciones, la necesidad de validar campos y filtros reales en más distritos y un contrato seguro para `raw`. No declarar la plataforma acelerada. Las dos etapas posteriores siguen siendo medición autenticada pre/post, QA de carga y despliegue autorizado con reversión/backups.

**Última validación del PR:** `41559891372` concluyó con todos los pasos del CI en success, incluyendo 6/6 pruebas originales, 10/10 de integridad del cursor, 16/16 de paridad funcional y 4/4 de privacidad. La revisión de privacidad puede detectar nuevas restricciones de promoción aun cuando CI sea verde.

## Propuesta de minimización de respuesta — pruebas reales de compatibilidad (02/11/2026)

Se preparó un **segundo candidato descartable** desde el Worker de rendimiento, en `tmp/apd-alerts-performance/worker_privacy_candidate.js`. El generador está en `scripts/build-apd-alert-privacy-candidate.mjs` y su política separada en `scripts/apd-alert-payload-minimization.mjs`. No existe ninguna modificación en los archivos productivos ni un despliegue.

**Diseño del candidato:**
- `buildAlertItem` conserva todas las propiedades calculadas de la alerta (distrito, cargo, escuela, fechas, enlaces, compatibilidad, puntos y motivos PID).
- `raw` ya no contiene el documento completo de ABC. Solo devuelve hasta **28 campos tipados** de la lista pública autorizada (sin texto libre); rechaza valores anidados/objetos para no transportar datos imprevistos. Su `observaciones` se sustituye por un indicador constante.
- `observaciones` **nunca devuelve el texto original** de ABC al navegador en esta variante; si el origen contiene texto no vacío, muestra `Hay observaciones en ABC. Consultá el aviso original.`. El texto de origen **no se borra de ABC** ni se modifica en la fuente. No se verificó aún un enlace directo a la pantalla original de detalle y, por tanto, este aviso es un compromiso funcional que requiere revisión de UX previa al despliegue.
- No se usa un simple filtro de emails/CUIL como supuesta garantía de anonimización: un nombre o domicilio en lenguaje natural también podría identificar a una persona.

**Compatibilidad comprobada:** la suite `scripts/test-apd-alert-privacy-candidate.mjs` ejecuta la función `buildAlertItem` del Worker original, del candidato de rendimiento y del candidato minimizado con datos ficticios. Exige igualdad estricta de **todas las propiedades calculadas salvo las dos sustituciones deliberadas** (`raw` y `observaciones`), preserva link y PID, y comprueba que ni correos, CUIL, nombres ficticios, estructuras anidadas ni HTML inyectado aparecen en la nueva respuesta. Comprueba además observaciones vacías y que los **25 scripts locales realmente cargados** en el HTML no accedan directamente a `alerta.raw`.

**Integración frontend auditada:** `app_v2.js` sí muestra `a.observaciones` mediante `alertaRow("Observaciones", ...)`, que aplica `esc(v)` antes de insertar texto en HTML. La acción del panel visible lleva a **"Abrir postulantes en ABC"**; no se ha comprobado que esa URL permita consultar exactamente el texto de observaciones. No afirmar que el acceso funcional al contenido original esté resuelto hasta verificar un enlace adecuado y el diseño del panel.

**Evidencia CI:** commit `9c46fa3491527efb29142a7e948d84b209ee21b7`, GitHub Actions `41561279194` **success**, con **6/6 pruebas adicionales** de minimización y compatibilidad. También pasaron en la misma ejecución los controles preexistentes de rendimiento, identidad de ABC, paridad de filtros/PID, privacidad de texto libre, inventario de scripts y ausencia de cambios de producción.

**Estado de aprobación:** el prototipo soluciona el riesgo de transportar automáticamente *el texto libre original* y el `raw` completo, en su propia respuesta ficticia; **no** es una auditoría de privacidad de todos los campos posibles, usuarios ni integraciones API externas. Para conservar utilidad docente hay que diseñar la visualización de observaciones y validar una vía de acceso al aviso oficial (u otra regla de minimización aprobada). El PR sigue como borrador, sin merge, sin deployment. La preparación productiva del rendimiento se mantiene en **2/5 hitos completamente cerrados (40%)**, con una nueva subetapa de mitigación ensayada pero aún no aprobada en UX ni en datos reales.

## Medidor del panel hasta primera alerta realmente dibujada — candidato local

**Implementado en rama solamente:**
- `scripts/apd-panel-timing-meter.mjs`: recolector en memoria para tiempos desde el inicio de carga del panel hasta (a) respuesta de `/api/mis-alertas`, (b) perfil/plan verificados y (c) segunda oportunidad de `requestAnimationFrame` posterior a la representación de alertas. Guarda como máximo 30 muestras con `api_ms`, `profile_ms`, `rendered_ms` y estados técnicos cerrados, sin ID, correo, token, URL ni contenido de las ofertas. Calcula p50/p95 **exclusivamente de las muestras existentes en ese navegador** y no envía datos por red.
- `scripts/build-apd-panel-timing-candidate.mjs`: crea **solo** `tmp/apd-alerts-performance/app_v2_telemetry_candidate.js`, sin alterar `app_v2.js` publicado ni iniciar recolección real en usuarios. Inserta marcas en la función **original** `cargarDashboard`, respetando el gate `planActual.access_active`, las invalidaciones de sesión `dashboardRequestVersion` y el mensaje de error de API.
- `scripts/test-apd-panel-timing-meter.mjs`: 7 ensayos con reloj sintético de métricas, límite de muestras, ausencia de datos personales y separación de fallo de API, plan vencido y ausencia real de coincidencias.
- `scripts/test-apd-panel-timing-dashboard-contract.mjs`: 5 escenarios sobre la **función real `cargarDashboard` extraída del frontend candidato**, con respuestas, sesión, DOM y plan **ficticios**: render normal después de autorización, plan inactivo, fallo API, cambio de sesión mientras espera perfil y error de perfil. Se rechaza renderizar datos del usuario anterior o registrar su muestra al cambiar la sesión.

**Evidencia CI:** commit `7159e707fb792ae168aeb912795eb4ced29c7779`, GitHub Actions `41562553166` **success**, router `41562553280` **success**. Un primer ensayo del contrato falló porque el **harness de la prueba** omitía `alertasState` y control separado para resolver dos perfiles; se reparó el harness, se repitió la suite completa y pasó. La falla anterior no corresponde a la página publicada.

**Medición que todavía no existe:** estos tests verifican que la instrumentación funciona con eventos/tiempos ficticios. No fueron ejecutados en una sesión real del panel ni midieron el tiempo de la red, el navegador o la API de un docente. La instrumentación es una herramienta local experimental, no una habilitación para rastrear usuarios; para prueba autorizada deberá ejecutarse manualmente en un ambiente aislado con sesión de prueba y un consentimiento adecuado, sin publicar métricas personales.

**Criterio para completar el hito de medición real:** comparar p50/p95 de `api_ms`, `profile_ms` y `rendered_ms` bajo las mismas preferencias, sesión de prueba autorizada, red y navegador; repetir con 1, 2 y varios distritos; verificar igualdad de claves/resultados, tasas de error, `429` y latencia de la fuente. La propia solución optimizada no debe adelantarse a la verificación de plan ni a los controles de privacidad de `raw` y observaciones.

**Progreso honesto:** continúa **40% (2/5 hitos de preparación productiva)**. El instrumento de medición quedó implementado y probado offline, pero el hito 3 no se completa hasta tener p50/p95 reales reproducibles.

## Worker integrado de laboratorio: consulta completa «Publicada» + privacidad + concurrencia

**Se agregó una tercera variante, todavía NO desplegable:** `scripts/build-apd-published-minimized-candidate.mjs` genera `tmp/apd-alerts-performance/worker_published_minimized_candidate.js` a partir del candidato de concurrencia y privacidad existente. Solo reemplaza en **esa copia descartable** la función `traerOfertasAPDDeUnDistrito` por `apdFetchPublishedOnlyDistrict`, cuyo código se mantiene separado en `scripts/apd-fetch-published-district-lab.mjs`.

- Consulta **solo `estado:"Publicada"`** usando `cursorMark` / `id asc`, 100 ofertas por página y hasta 12 páginas. Obtiene únicamente 29 campos de origen, sin CUIL/reemplazos. Mantiene dos distritos en paralelo como máximo, la regla real `source_offer_key` del Worker y el filtrado/PID ya comprobados en fixtures.
- La carga **rechaza** `HTTP 429`, `partialResults`, resultados incompletos, modificación de `numFound` durante una lectura, estado/distrito incorrectos, identidades o claves duplicadas, campos inesperados y páginas mayores al límite. No reemplaza un fallo de ABC por el mensaje falso «no hay ofertas».
- Los textos originales de `observaciones` pueden permanecer **transitoriamente en memoria del Worker** mientras éste procesa una respuesta pública de ABC; el constructor de alertas de la variante minimizada sustituye la observación libre por el aviso constante y no la devuelve al cliente. La inspección de `raw` sigue siendo una **condición de privacidad antes del despliegue**.
- El contador interno `totalBruto` en el candidato pasa a contar **publicadas** en vez de todas las ofertas históricas; su semántica es distinta de la del Worker anterior y debe ser explicitada en reportes `debug_distritos`.

**Pruebas de integridad y privacidad:** `scripts/test-apd-published-worker-candidate.mjs` aprobó **8/8 casos** sobre datos ficticios, verificando dos distritos con conjuntos completos, respuestas inválidas y la composición del Worker. El ensayo de salida de un solo endpoint con datos ficticios y las pruebas de `buildAlertItem`/PID y privacidad continuaron aprobando.

**Primera ejecución del candidato construido contra ABC público real:** GitHub Actions `41563243137`, commit `aa6011493faba3cbe94ba35677fc8423d47e5057`, **success**. Lectura GET sin credenciales, dos distritos simultáneos, información agregada exclusivamente:
- La Matanza: **183/183** publicadas recuperadas, **1.410,4 ms**.
- Avellaneda: **65/65**, **1.172,4 ms**.
- Tiempo conjunto: **1.411,2 ms**, sin campos fuera de la proyección autorizada en las ofertas recuperadas.
- Son cifras desde **un runner de GitHub en una observación puntual**, no desde una sesión autenticada, ni un p50/p95, ni comparación bajo condiciones de red idénticas con el Worker desplegado.

**Pruebas funcionales acumuladas en esa ejecución:** ocho suites con **62/62 casos aprobados** (6 velocidad/paridad, 10 cursor proyectado, 16 filtros/PID, 4 screening de observaciones, 6 minimización de alertas, 8 lector integrado, 7 medidor local, 5 ciclo real `cargarDashboard` con mocks). La sintaxis del Worker candidato y del JS frontend instrumentado aprobó. El CI verifica que los archivos publicados permanecen intactos.

**Bloqueos para llevar la mejora a usuarios:** cobertura y concurrencia en distritos grandes (posibles más de 1.100 ofertas publicadas por distrito con límite actual), compatibilidad de alias distritales con ABC en todo PBA, prueba de carga/429, política funcional de acceso a observaciones originales sin exponer texto libre, permisos/plan y traza real desde navegador hasta primera alerta, respaldo restaurable y reversión. **Ni verde de CI ni esta muestra autoriza fusionar o desplegar.**

**Preparación del panel:** permanece en **2/5 hitos (40%)**. Este avance agrega un prototipo integrado con fuente pública y evidencias de integridad, pero el hito de medición del panel autenticado y la aceptación de privacidad/UX siguen sin estar resueltos.

## Ampliación del 03/11/2026 — seis distritos, eliminación de GET redundantes y fallo explícito ante distrito inválido

**Cambio funcional exclusivo del prototipo:** `scripts/apd-fetch-published-district-lab.mjs` ya no interpreta un distrito vacío o un conjunto de alias inválido como ausencia legítima de ofertas. En su lugar **lanza error** para impedir que el usuario vea un mensaje falso de «cero alertas» ante preferencias mal formadas. También deja de solicitar la página final vacía cuando el número de `id` únicos recuperados coincide exactamente con el `numFound` informado por ABC. Si hay una página parcial, `numFound` inconsistente, clave duplicada, límite de páginas sin cubrir el total o error HTTP, continúa **fallando de forma explícita**.

**Pruebas sobre funciones auténticas del Worker:** `scripts/test-apd-published-alias-and-limits.mjs` agrega 8 pruebas con datos ficticios de alias distritales `L DE ZAMORA`, `G SAN MARTIN`, `LA COSTA` y `GRAL PUEYRREDON`, distrito inválido y cero verdadero, 1.199 registros completos dentro del límite y 1.201 registros que deben rechazarse en vez de publicarse incompletos. Los controles de `scripts/test-apd-published-worker-candidate.mjs` ajustaron los números esperados a **2 páginas para 183 ofertas** y **1 página para 65 ofertas** con el nuevo final temprano, sin perder identidad o cobertura. En conjunto, los tests protegen el caso de corte de datos que motivó la optimización.

**Cuatro distritos reales adicionales con el candidato integrado:** el script `scripts/probe-apd-published-four-districts-readonly.mjs` hizo solo GET públicos, ejecutó el alias canónico del Worker, no imprimió documentos individuales y limitó la concurrencia distrital a dos.
- Quilmes: **98/98** ofertas «Publicadas», **1.080,9 ms**.
- Berazategui: **109/109**, **1.061,1 ms**.
- Lomas de Zamora: **92/92**, **202,3 ms**.
- General San Martín: **63/63**, **194,7 ms**.
- **362 ofertas completas**, **5 solicitudes GET**, pared conjunta **1.293,4 ms**, 4/4 distritos sin rechazo en la ejecución observada.

**Reejecución en paralelo de los dos distritos previos:** La Matanza **183/183** (946,4 ms), Avellaneda **65/65** (708,7 ms); pared conjunta **946,9 ms** desde el runner. Las dos observaciones del mismo workflow cubrieron **seis distritos y 610 ofertas** en total, sin afirmar que constituyan una fotografía atómica común ni probar al usuario final. El contexto de ABC podría variar en segundos; los tiempos de GitHub no representan p50/p95 del panel.

**Evidencia CI:** commit `de9bcbf1d9c52cfbb682102e4b5baddb378827a2`, workflow `41621161921` **success**; router duplicado `41621161927` **success**. En esta ejecución aprobaron **70/70 pruebas de 9 suites**, más los controles de sintaxis del Worker generado, lecturas públicas agregadas y diff productivo en cero. La primera ejecución `41620879273` falló porque las expectativas del test de paginación estaban desactualizadas y el fixture de exceso del límite era demasiado pequeño. Se corrigieron los tests y se repitió la suite entera, aprobada. Es importante conservar este historial en auditoría.

**Riesgos pendientes:** la finalización al alcanzar `numFound` comprueba unicidad y cardinalidad por lectura, pero no reemplaza una segunda lectura para detectar cambios de contenido bajo recuento constante; los PR #235/#236 examinan esa dimensión por separado. La optimización todavía no corre en Worker productivo, y sigue pendiente validar todos los distritos, un p95 del panel autenticado, la política de privacidad/observaciones, el respaldo recuperable y el plan de reversión. No fusionar ni desplegar por este CI. El avance del panel se mantiene en **40% (2/5 hitos productivos cerrados)**.

## Contraste de estados ante caída de publicaciones entre ejecuciones (03/11/2026)

Se observó una disminución entre dos observaciones separadas de ofertas con estado `Publicada` para cuatro distritos: Quilmes **98 → 2**, Berazategui **109 → 0**, Lomas de Zamora **92 → 3** y General San Martín **63 → 0**. La doble lectura completa del PR #237 fue internamente consistente en cada uno de esos distritos (cero diferencias entre las dos pasadas inmediatas), pero **eso no identifica la causa del cambio entre horarios**.

Para evitar especulaciones, `scripts/probe-apd-public-state-distribution-readonly.mjs` consultó el índice Solr de ABC con `rows=0` y facets por `estado`: cuatro GET públicos, cero documentos y sin descargar IDs, CUIL ni observaciones. **GitHub Actions `41623712846` success**, commit `da6fef8fa93446c78712b8714bc0dc38ab06b0fe`. Respuestas agregadas:
- Quilmes: **13.514** registros en todos los estados; **2 Publicada**, **95 Cerrada**, 10.639 Designada, 1.259 Desierta, 1.034 Anulada, 50 Finalizada y 435 en otros estados.
- Berazategui: **8.937** totales; **0 Publicada**, **109 Cerrada**, 6.681 Designada, 1.237 Desierta, 623 Anulada, 8 Finalizada y 279 en otros estados.
- Lomas de Zamora: **13.699** totales; **3 Publicada**, **90 Cerrada**, 10.742 Designada, 1.397 Desierta, 899 Anulada, 45 Finalizada y 523 en otros estados.
- General San Martín: **10.149** totales; **0 Publicada**, **59 Cerrada**, 6.221 Designada, 2.528 Desierta, 619 Anulada, 366 Finalizada y 356 en otros estados.

**Interpretación limitada:** el aumento o acumulación de estados cerrados es compatible con el cierre normal de ofertas. Hay similitudes numéricas entre las publicaciones observadas anteriormente y las ofertas que ahora aparecen como `Cerrada`, pero la comparación fue **solo agregada, sin relacionar IDs**: no demuestra qué oferta cambió ni cuándo. Tampoco demuestra una pérdida de alertas causada por APDocentePBA. No se debe informar «ofertas perdidas» ni recomponer automáticamente el histórico basándose en estos recuentos.

**Decisión técnica:** conservar la doble lectura como control de integridad, mantener la distinción entre cero real y error de fuente, y separar la auditoría histórica por ID/estado (en proceso y sin datos personales) de la optimización de la consulta. Nada de esto se implementó en el Worker productivo y el PR #237 permanece en borrador.

## 03/11/2026, 17:02 AR — prueba independiente de «cero ofertas Publicada»

**Cambio de código en prototipo solamente:** `scripts/apd-fetch-published-district-lab.mjs` distingue entre cero legítimo y cero que no puede verificarse. Al completar un cursor `estado:"Publicada"` con `numFound=0`, exige **una segunda consulta pública independiente** al mismo Solr, pero **sin el filtro de estado**, con `rows=0`, `facet.field=estado`, todos los valores de estado y ninguna solicitud de `fl` ni de documentos. Las dos consultas comparten el presupuesto total de tiempo distrital existente, la política `GET` sin credenciales, el límite de bytes y la prohibición de logs de ofertas.

Si las facetas no existen, la respuesta contiene documentos a pesar de `rows=0`, los subtotales no coinciden con `numFound`, hay un `429`, un `partialResults`, se agota el plazo o las facetas informan **alguna `Publicada`** en contradicción con el cursor inicial, **el lector lanza un error explícito** y no entrega lista vacía. Esto evita una inferencia engañosa, pero una faceta de cero por sí sola tampoco demuestra que el distrito/alias exista; esa dimensión depende del catálogo y las pruebas de alias.

**Pruebas agregadas:** `scripts/test-apd-published-worker-candidate.mjs` incorpora 3 escenarios: (1) cero confirmado con 82 registros de otros estados, dos GET y sin documentos en el GET de prueba; (2) cero contradictorio (2 publicadas) que debe rechazarse; (3) facetas ausentes/parciales o `429` que deben rechazarse. `scripts/test-apd-published-alias-and-limits.mjs` exige ahora dos GET incluso en el caso de cero legítimo. Todos los fixtures contienen datos ficticios.

**Resultado verificado:** commit `f02f79b9d84700337c41bd96f6c2611025e8ab27`, GitHub Actions `41708669399` **success** (129/129 tests de 13 suites, contados desde los logs de cada suite), laboratorio autenticado ficticio `41708669415` **success**, control de router `41708669454` **success**. La compilación/sintaxis del Worker descartable y las pruebas de paridad con PID, permisos, privacidad, errores y DOM también aprobaron. No se alteraron los archivos de producción.

**Observación en fuente pública (03/11 a las 20:02 UTC):** las cuatro muestras de este turno fueron mayores a cero: Quilmes **54**, Berazategui **44**, Lomas de Zamora **75**, General San Martín **32**, total **205**. Las cuatro aprobaron la doble lectura íntegra de IDs, claves y proyección; **esta muestra no ejercitó la rama de cero en vivo**, únicamente en fixtures. La rama de cero se validó frente a la fuente pública en una ejecución anterior solo de manera manual/indirecta (facet agregado frente a cursor), no con este lector nuevo. Por lo tanto, no declararla exhaustivamente probada con todos los estados de ABC real.

**Despliegue:** sigue prohibido fusionar o desplegar el prototipo por este resultado verde. Pendientes: medición autenticada p50/p95 real, la política de observaciones de ABC, cobertura de más alias/distritos, resiliencia con 429 y revisión de respaldo/reversión. Preparación productiva del panel **40% (2/5 hitos cerrados)**; este control mejora integridad del candidato pero no concluye la etapa de medición real.

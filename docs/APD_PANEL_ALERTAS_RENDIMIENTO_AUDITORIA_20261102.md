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

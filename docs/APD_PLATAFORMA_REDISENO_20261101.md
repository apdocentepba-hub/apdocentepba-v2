# APDocentePBA — Auditoría de plataforma y rediseño v1
Fecha de auditoría: 2026-11-01 / cierre técnico en UTC 2026-11-02.
Rama: `growth/landing-apd-20261101`; PR #178 en borrador.

## Objetivo acordado
Unificar navegación y diseño, reducir espera de «Cargando panel», simplificar
las funciones y mostrar estadísticas verificables. **No modificar el carrusel
de alertas ni habilitar administración para otras cuentas.** No desplegar en
`main` antes de pruebas autenticadas y revisión del titular.

## Diagnóstico técnico anterior
- `index.html` cargaba un conjunto acumulado de hojas CSS y parches JS.
  El panel tenía carga bloqueante para **perfil + preferencias + plan + alertas**,
  y esperaba además la comprobación de permisos admin.
- `setPanelLoading` ocultaba todas las tarjetas mientras existiera una
  petición pendiente. Esto se percibía como bloqueo completo.
- En errores del listado de alertas se devolvía `[]`, mezclando fallo de
  conexión con «0 ofertas» y arriesgando publicar esa falsa información.
- `safe_dashboard_ui_patch.js` repetía su pase cada 500 ms hasta 24 veces
  incluso cuando el editor de preferencias ya estaba presente.
- `panel_tabs_patch.js` cargaba otro `auth_session_patch.js` de forma
  dinámica pese a que `index.html` lo importaba, y mostraba elementos
  de navegación sin valor de acción.
- La pestaña Admin tenía lógica de visibilidad a partir de tarjetas e
  introducciones, sin esperar explícitamente a `/api/admin/me`.
  El backend sigue siendo la frontera de seguridad.
- Algunas estadísticas del panel indicaban «vistas» y «sin ver» con valores
  fabricados; no hay medición de lectura que justifique esas cifras.
- `buscar-herramientas.html` permitía coincidencias de una sola palabra
  incluso en búsquedas de múltiples términos, ampliando resultados irrelevantes.

## Implementación v1 en la rama de PR (no producción)
1. `app_v2.js`: carga principal deja de aguardar alertas y permisos admin.
   Cuando resuelven perfil + preferencias + plan, renderiza tarjetas sin
   resetear el carrusel existente. Las alertas se procesan después, con
   `dashboardLoadSequence` que ignora resultados obsoletos. El sync de ofertas
   queda *después de una respuesta correcta* de alertas, no tras un error.
2. Error real de consulta de alertas: texto accesible de problema de conexión;
   no se presenta como cero ofertas. Sin reenvío de lista vacía tras falla.
   Se conservan permisos y validaciones del servidor.
3. `setPanelLoading`: indica «actualizando» sin ocultar el panel ya visible.
   La cuenta y la identidad se limpian al cambiar de sesión o cerrar sesión.
4. `adminCheckAccess`: descarta respuestas de tokens antiguos, indica al
   frontend `APD_adminAccessConfirmed` y habilita la pestaña sólo tras
   respuesta del Worker. **No se cambian roles ni los endpoints admin**.
5. `panel_tabs_patch.js`: navegación reetiquetada **Resumen, Alertas,
   Listados, Recursos, Mi plan, Estadísticas, Preferencias, Administración**.
   Se oculta navegación privada fuera del panel. Quita acción «Ver sección»
   que no tenía efecto, elimina un loader de auth redundante y sustituye
   cifras ficticias decorativas en la maqueta del hero.
6. `platform_refresh_v1.css`: tokens visuales compartidos, tab bar
   desplazable en móvil, botones compactos, formularios accesibles,
   jerarquía coherente. **Excluye selectores del carrusel** `.alerta-*`
   y `#panel-alertas`; se mantiene su JS y la navegación existente.
7. `tools_refresh_v1.css`: diseño compartido para `herramientas.html`,
   `buscar-herramientas.html`, `proximamente.html`,
   `herramientas-docentes.html`, `pid.html`.
   La página Próximamente sigue accesible por enlaces secundarios pero
   sale de la barra principal.
8. `buscar-herramientas.html`: coincidencia AND entre términos, prioridad
   al título/categoría, mejora de etiqueta de accesibilidad y de conteo.
9. En Listados, nuevo bloque de accesos oficiales: SerVaDo, APD y guía PID,
   diferenciando claramente fuentes oficiales de orientación propia.
10. `scripts/previews/platform-visual.html`: maqueta pública estática de siete
    secciones, sin admin, sesiones, emails ni ofertas reales. Disponible
    mediante compilación aislada Render; **no es una réplica autenticada**.

## ABC: verificación externa
- Portal público de servicios ABC, sección Agentes, expone acceso a APD.
  https://srv4.abc.gob.ar/?i=AGENTES
- En el acceso directo
  https://misservicios.abc.gob.ar/actos.publicos.digitales/
  el navegador externo deriva a `menu.abc.gob.ar/nesp/app/plogin`.
  **No se han inspeccionado pantallas internas autenticadas ni formatos API
  de ofertas de la versión actual de ABC**.
- SerVaDo público: https://servado.abc.gob.ar/ agrupa PID, PAD, LOF y CyD;
  ciertos contenidos requieren inicio de sesión ABC.
- No automatizar postulación, leer datos privados ni asumir APIs oficiales
  estables sin verificaciones y autorización.

## Catálogo de herramientas
- `assets/js/herramientas-catalogo.js`: **34 recursos**, **34 rutas locales
  existentes**, según prueba CI. Esto no certifica que cada función sirva
  correctamente en producción: hay estados experimental/preparado/orientativo.
- `scripts/test-platform-tools.mjs` valida buscador y genera
  `tmp/growth-audit/tools-routes.json`.
- Pendiente clasificar funcionalidad real y rendimiento de cada herramienta
  según criterios de aceptación, priorizando licencias, PID, actas y trámites.

## Administración
- Lectura agregada de `users` en Supabase (2026-11-01): 50 cuentas, **1
  administrador activo**. No se leyeron emails ni identidades.
- El frontend no sustituye controles de autorización del Worker.

## Estadísticas
- La tarjeta inicial muestra **ofertas vigentes encontradas** solo si la
  consulta de alertas concluyó correctamente. Durante la espera muestra guion.
- No se inventan métricas de vistas, postulaciones, oportunidades perdidas ni
  probabilidades. Los reportes históricos del Worker requieren otra auditoría
  de cobertura, fechas y fuentes antes de destacarlos como producto.

## Validación
- CI run: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41367668764
- **79/79 pruebas** (70 producto + 9 preview), sin fallos, y Chrome
  headless con navegación de demo, mobile 390 px, desktop 1280 px,
  Insigne LAB y carrusel fuera de modificación.
- **10/10 checks GitHub exitosos** sobre el commit
  `aabdd02f0c0a155891718f374fc8811b8c640b9b`.
- Estas pruebas usan mocks y HTML estático: no se ha medido todavía FCP/LCP,
  latencia del Worker, tiempos reales de la cuenta o throughput del APD oficial.

## Bloqueadores y próximos pasos
1. **QA autenticado aislado** de la nueva carga y el control de Admin, sin
   usar contraseñas reales en la vista previa ni divulgar tokens.
2. Pruebas de performance con condiciones repetibles: carga fría/caliente,
   4G, PC, móvil, TTFB endpoints de perfil/preferencias/plan/alertas,
   FCP/LCP/INP. Establecer línea de base y mejora medida.
3. Comprobar diferencias entre catálogo de cuotas Supabase y Worker
   efectivamente desplegado. No prometer cupos inconsistentes.
4. Revisar el feed autenticado APD y la forma actual de listados, códigos
   de cargo, distrito, cierre y estado (sin usar credenciales ABC ajenas).
5. Validar integridad de métricas históricas, resultado del buscador y las
   herramientas experimentales antes de promocionarlas como operativas.
6. Plan de reversión, revisión de rutas y estilos en distintos navegadores.
7. **NO MERGE / NO DEPLOY EN PRODUCCIÓN sin revisión visual y QA final.**

## Resguardo
Todo queda en el PR #178, rama `growth/landing-apd-20261101`. El Worker
Cloudflare y Supabase productivos no se modificaron, el carrusel permanece
sin cambios de código/estilo específico, y el panel Admin conserva acceso
autorizado por backend.

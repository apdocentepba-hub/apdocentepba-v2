# APDocentePBA — Propuesta visual integral v2 para aprobación

**Fecha de cierre de diseño:** 1–2 de noviembre de 2026.  
**Estado:** propuesta visual interactiva *terminada para revisión del titular*, **NO implementada en producción**.  
**Rama y PR:** `growth/landing-apd-20261101` · PR #178 (borrador).  
**Preview:** https://apdocentepba-growth-preview.onrender.com/platform-completa.html  
**Infraestructura original intacta:** GitHub Pages (sitio), Cloudflare Workers (API), Supabase (datos). Render solo hospeda una **maqueta estática**.

## Decisiones de diseño cerradas

1. **Sistema de navegación.** Barra lateral en escritorio, barra horizontal desplazable en móvil, encabezado compacto con búsqueda global y cuenta ficticia. Ocho destinos sin secciones vacías ni botones de adorno.
2. **Resumen.** Hero con propuesta de valor, estado de configuración, indicadores de fuente fechada, seis accesos rápidos y transparencia de datos.
3. **Alertas.** Se conserva el carrusel productivo actual y su API. La maqueta muestra un contenedor conceptual con ofertas de ejemplo, controles de demostración y cuatro estados: resultados, cargando, sin coincidencias, error de conexión. **No se reutiliza un carrusel nuevo en producción**.
4. **Listados/APD.** Accesos claros a SerVaDo, APD oficial y guía PID propia, más secuencia orientativa de postulación. Ni credenciales ABC ni sincronización de legajo.
5. **Estadísticas.** Ofertas registradas, cobertura y último snapshot con fecha y fuente de la lectura de 1/11/2026. Indicadores personales sin números inventados; no se proyectan designaciones, vistas, probabilidad de adjudicación, ofertas perdidas ni tendencias sin serie histórica válida.
6. **Preferencias.** Formulario de distrito, cargo, turno, niveles y estado de alertas; canal email independiente. Botones de simulación y restauración; resumen actualizado en Preferencias y en Inicio. La demo no guarda nada.
7. **Mi plan.** Estado pendiente de autenticación en vez de inventar suscripción; orientación de límites basada en los cupos expuestos públicamente por el Worker al 1/11/2026, precios explícitamente de referencia. Propuesta Insigne LAB separada. **No cambia condiciones ni cobros existentes**.
8. **Herramientas.** Catálogo estático de 34 recursos del repositorio, filtrable por categoría y estado, con tarjetas, estado de madurez y enlaces que abren por separado el sitio existente.
9. **Buscar.** Buscador local multi-término (AND), categorías de búsqueda rápida, contador de resultados, estado sin coincidencias, enlaces concretos.
10. **Accesibilidad y apariencia.** Estados de foco visible, textos de error, contenido accesible sin depender de color, modo claro/oscuro conmutables, tamaños 390 y 1280 px verificados, navegación por teclado con botones reales, reducción de movimiento.
11. **Administración.** **No aparece en la demo pública.** Se mantiene exclusiva en producción mediante autorización backend y revisión de sesión; no se crean accesos administrativos adicionales.
12. **Próximamente.** No ocupa navegación principal. Funciones inmaduras se identifican por estado dentro del catálogo.

## Qué es una demostración

- Datos de ofertas en el carrusel del mockup son ficticios.
- Cuenta en encabezado es “Docente (ejemplo)”; no hay login, tokens ni sessionStorage/localStorage.
- En la sección Estadísticas hay una **foto agregada verificable al 1/11/2026**, no consulta en vivo ni datos personales:
  - 2.617 registros en `apd_ofertas_global_current`;
  - 137/137 distritos barridos; 123 con al menos una oferta;
  - último snapshot histórico al 18/9/2026.
- La demo usa archivos `platform-completa.html`, `platform-completa.css`, `platform-completa.js` y una **copia estática** del catálogo público `herramientas-catalogo.js`.
- Botones de abrir recursos y portales oficiales salen a sus sitios existentes. El sitio de prueba no guarda datos, no efectúa transacciones ni llama al Worker.
- Los cambios en formularios, configuración y modo oscuro son **volátiles** (se pierden al recargar).
- La versión anterior sigue en `platform-visual.html` para comparar, pero **la v2 completa es la candidata a aprobación**.

## Criterios de aceptación del DISEÑO

| Criterio | Verificación |
|---|---|
| Ocho secciones coherentes, sin botones falsos | HTML + Chrome |
| Render correcto 390 px y 1280 px | Chrome, sin scroll horizontal |
| Alertas: cuatro estados y navegación de muestras | Chrome |
| Resumen y preferencias demo consistentes tras cambio | Chrome |
| Buscador catálogo con 34 fichas y filtros | Chrome |
| Planes: no pedir pagos ni inventar suscripción | Test estático |
| Admin ausente en preview; control real no modificado | Inspección + CI |
| No llamadas a API, contraseñas ni almacenamiento local | Test estático |
| Estadísticas muestran procedencia y fecha | Test estático y Chrome |
| Carrusel real sin modificaciones de código/producto | PR; no se despliega código de demo |
| Modo oscuro y accesibilidad de controles | Chrome + CSS |

**Evidencia:** ejecución GitHub Actions `41372173187` del último código probado antes de documentar, **88/88 tests** (71 de producto + 10 de preview previa + 7 de propuesta integral) y `BROWSER_SMOKE_OK`; controles de repositorio supervisados aparte. Las capturas de escritorio y móvil de esta versión están adjuntas al artefacto de la ejecución. La página Render debe verificarse `live` tras el último deploy.

## Lo pendiente NO es de diseño sino de implementación y despliegue real

1. Autorización visual expresa del propietario.
2. Validación autenticada de recarga, expiración de sesión y seguridad admin.
3. Benchmark repetible de TTFB, FCP, LCP, navegación y velocidad del endpoint real de alertas.
4. Verificación autorizada de listados del ABC actual y criterios de antigüedad / vigencia.
5. Reconciliación sin pérdidas de los cupos de planes y del esquema Insigne.
6. Migración gradual y reversible de los componentes de diseño al frontend original; **no copiar datos de la maqueta ni instalar la demo como aplicación productiva**.
7. QA final con 2–3 navegadores y móvil real antes de publicar, y rollback preparado.

## Restricción irrevocable de esta fase

No se modificó `main`, `alertasapd.com.ar`, Cloudflare, Supabase, credenciales, DNS, roles, precios, suscripciones ni se envió ningún email. Mantener el PR como **borrador** hasta aprobación explícita.

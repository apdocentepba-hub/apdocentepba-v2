# Auditoría APDocentePBA + portal ABC/SerVaDo (1 nov 2026)

**Rama de correcciones de bajo riesgo:** `feature/abc-hub-20261101`.
**Infraestructura productiva:** GitHub Pages + Cloudflare Workers + Supabase. **Sin migración**.
**Alcance:** web pública, catálogo y código fuente de frontend; portales oficiales públicos de ABC. No se ingresó con cuentas de ABC o de docentes ni se realizaron escrituras en Supabase.

## Hallazgos ABC comprobados en páginas públicas
1. SerVaDo renovado incluye PID, PAD, CyD, LOF, Cargos y Áreas y Decreto 900, con interfaz móvil/PWA:
   - https://servado.abc.gob.ar/
   - https://servado.abc.gob.ar/descargar-servado
2. Tiene **notificaciones push por servicio** y calendario de períodos de inscripción, reclamo y MAD:
   - https://servado.abc.gob.ar/notificaciones
   - https://servado.abc.gob.ar/calendario-inscripciones
3. Su guía oficial explica resultados por DNI o establecimiento, agrupación por año/distrito, vista tabla/tarjeta y uso del catálogo:
   - https://servado.abc.gob.ar/ayuda
4. Los servicios ABC públicos permiten ingresar a APD, Mis Haberes y Mis Licencias:
   - https://srv4.abc.gob.ar/?i=AGENTES
   - https://misservicios.abc.gob.ar/actos.publicos.digitales/
5. El APD redirige a autenticación; **no se inspeccionó su interior** ni se identificó una API pública documentada. No afirmar compatibilidad ni porcentaje de cobertura del feed oficial sin cotejo autorizado.

El listado de fechas visto en SerVaDo fue revisado en esta fecha de auditoría; ABC puede cambiar períodos y condiciones. No copiarlo a la base como si fuera una API oficial estable y en tiempo real.

## Matriz de utilidad actual de APDocentePBA

| Área | Verificado | Falta para afirmar función completa | Prioridad |
|---|---|---|---|
| Página pública y navegación | Frontend y rutas están en el repo; la web pública responde. V2.1 fusionada en `main` | Comprobar flujos de sesión real y acceso móvil de usuarios | Alta |
| Alertas/carrusel | El componente existe y la publicación V2.1 no lo sustituyó | Cotejo de ofertas, cierre y vigencia con ABC autenticado | Crítica |
| Recarga de panel | `cargarDashboard()` en `main` espera 4 respuestas juntas y `setPanelLoading` oculta contenido | Carga progresiva medida, no solo refactor; controlar condiciones de carrera y sesión | Crítica |
| Error en alertas | `obtenerMisAlertas().catch` retorna `[]` incluso si hay error | Diferenciar falla del servidor de cero coincidencias; evitar sync vacío | Crítica |
| Planes | Worker es fuente de vigencia real | `buildPlanFallback()` retorna Plus con precio $0 ante fallos; verificar implicancias y evitar representación comercial falsa | Alta |
| Estadísticas | Fuente actual `apd_ofertas_global_current` y registros de barrido existen | UI actual muestra "Vistas" / "Sin ver" basadas en números de relleno (0 y total). Removerlos hasta contar lecturas reales | Alta |
| Histórico | Última captura conocida 18/09/2026 | Recuperar capturas y asegurar timestamps/fuentes sin inflar estadísticas | Alta |
| Herramientas | El repositorio declara 34 rutas existentes antes de esta rama; Centro ABC agrega la 35 | Probar cada servicio por entrada, salida, móviles y datos; "Activo" en catálogo no es certificación | Media |
| Buscador | El buscador previo daba coincidencias parciales con palabras múltiples | Rama actual corrige AND y prioriza título/categoría, sin inyección de HTML | Media |
| Próximamente | Actas, mensajes y fuentes ya tienen páginas propias | Rama actual separa productos existentes de ideas realmente pendientes | Baja |
| Mapa con padrón oficial | En catálogo aparece como "Preparado" | No afirmar padrón oficial integrado hasta fuente y refresh verificados | Media |
| Administración | Acceso oculto en UI según autorización y validación backend | Prueba autenticada, control de sesiones y denegación para usuario común | Crítica |

### Datos verificados por consulta SQL agregada SOLO LECTURA
- `apd_ofertas_global_current`: **2.617 registros**.
- Distritos con al menos una oferta: **123**.
- Última observación: **2026-11-01 07:35:18 UTC**.
- Último `apd_ofertas_global_snapshots.captured_at`: **2026-09-18 01:17:10 UTC**.
Estos datos no certifican equivalencia con el APD oficial, ni que cada oferta siga abierta.

## Trabajo concreto de esta rama
- Nuevo `centro-abc-servado.html`: accesos verificables a SerVaDo, notificaciones, calendario, PID, PAD, LOF, CyD/CyA, APD, servicios de agentes y mapa.
- Portada, Fuentes y Herramientas priorizan el acceso ABC actualizado.
- Catálogo declara el Centro ABC como recurso adicional y queda **35 rutas**.
- `assets/js/herramientas-buscador-v2.js`: un solo motor para dos páginas, búsqueda AND, ranking por título/categoría, escritura `textContent` y enlaces relativos controlados.
- `proximamente.html`: funciones ya existentes enlazadas, pendientes reales diferenciados de lo que está disponible.
- **Ningún backend, dato personal, cobro, suscripción ni carrusel alterado.**

## Propuestas de siguiente fase, sin desplegar automáticamente
1. **Rendimiento del panel (P0)**: perfilar 4 endpoints y liberar UI sin esperar alertas, con controles por usuario. Preparar un PR independiente con QA de sesión.
2. **Fiabilidad (P0)**: errores tipados de consulta; mostrar última actualización con zona horaria; nunca hacer `sync-offers` de una lista vacía originada en un error.
3. **Integridad (P0)**: cotejar muestra estratificada de distritos y cargos con ABC autenticado, revisar fechas de publicación/cierre y cómo cambió el sitio.
4. **Estadísticas (P1)**: eliminar mediciones ficticias de lectura y etiquetar “captura histórica desactualizada” hasta recuperar pipelines.
5. **Calendario ABC (P1)**: agenda contextual y enlaces oficiales; más adelante avisos automáticos **solo con fuente autorizada**, fechas auditables y opt-in.
6. **Herramientas (P2)**: pruebas una por una, etiquetas Activo/Experimental/Orientativo/Preparado/Próximamente basadas en criterios y resultados reales.
7. **Instalable (P2)**: evaluar PWA de APDocentePBA como ventaja de conveniencia, sin prometer notificaciones push hasta contar con endpoint y permisos adecuados.

## Riesgos y límites
- No duplicar las push institucionales de SerVaDo ni usar sus datos privados sin permiso.
- No solicitar clave ABC, DNI o datos médicos en el Centro ABC.
- No afirmar fecha de cierre próxima basándose en un calendario desactualizado.
- No fusionar el PR principal de rediseño experimental #178.
- Antes de publicar los cambios de esta rama, ejecutar CI y revisar los enlaces reales y los flujos de navegación pública.

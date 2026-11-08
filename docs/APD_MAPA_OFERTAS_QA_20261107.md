# AlertasAPD — mapa desde una oferta: QA y límites de publicación

Fecha local: 7 de noviembre de 2026 (Argentina).
Estado: **CANDIDATO DE PR #255; sin despliegue**.

## Objetivo
Desde una alerta APD, abrir `mapa-escuelas-pba.html?clave=<CLAVE>&distrito=<DISTRITO>` y ver la escuela, domicilio y CUE con su marcador geográfico si y solo si ABC ofrece una coincidencia única y coordenadas dentro de Provincia de Buenos Aires.

## Fuentes oficiales verificadas
- WFS: `https://mapaescolar.abc.gob.ar/me/wfs`.
- CQL exacto con clave provincial normalizada `0005MS0004`, `0005MT0006`, etc.
- Capabilities pública, fecha de investigación 07/11: 39 capas.
- Casos reales verificados por solicitudes GET en GitHub Actions #42431682657:
  - `MS` secundaria estatal, `MT` técnica estatal, `MA` agraria (capa técnico profesional), `PP` primaria estatal, `JI` inicial estatal, `IS` superior estatal y `EE` especial estatal (una capa elegida, sin juntar duplicados temáticos).
  - `AP`: sin coincidencia verificada en la capa de primaria de adultos probada; no asignar geolocalización a esa clave por inferencia.
  - La clave `0005EE0503` apareció en tres capas temáticas oficiales. Por ello no juntar resultados como si fueran sedes distintas; usar solo una capa comprobada y exigir coincidencia única por clave.
- WFS recupera datos públicos CUE, nombre, calle/número, distrito, localidad y coordenadas. CORS favorable desde el dominio APD en pruebas de cabeceras HTTP (no constituye una prueba de disponibilidad permanente).

## Cambios preparados
- Enlace a mapa interno desde el carrusel real de alertas, más Mapa Escolar oficial.
- Si `escuela` es una clave de 10 caracteres se usa igualdad exacta; **no** se pasa la clave a Google Maps como si fuera un nombre o domicilio.
- WFS anónimo, `GET`, sin cookies, timeout 9 segundos, `count=5`, respuesta limitada a 300KB. No consultar datos de cuentas ABC.
- Sin coincidencia única, sin coordenadas o con caída WFS: no dibujar punto. Fallback con enlace oficial (no descargar un XLSX de toda Argentina para localizar una escuela).
- Se limpia el marcador anterior antes de cada nueva consulta para no mostrar ubicaciones antiguas.
- Vista compacta al entrar desde oferta: nombre, domicilio y CUE primero; mapa visible en móvil sin desplazamiento horizontal. Página general conserva filtros.
- Rechazar indicadores `coordinates_verified` o `geo_source` presentes en ofertas crudas: solo la consulta WFS oficial puede producir coordenadas exactas.
- Se conserva la sanitización HTML de contenido del geoservicio.
- Estadísticas históricas con antigüedad de captura mayor a 48 h no se presentan como actividad vigente.

## Evidencia y pruebas
- Workflow final de PR #255 [GitHub Actions #42432242542](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42432242542): PASS.
- 22/22 pruebas Node y prueba sintáctica de `app_v2.js` PASS.
- Chromium headless real 390×850 y 1280×850, con WFS **simulado y etiquetado**: PASS. Cubrió enlace por código, filtrado, fuente WFS, pin único, escaped HTML, dirección y CUE en banner, visibilidad del mapa, no horizontal overflow, y segunda consulta con fallo de red que elimina el pin y muestra fallback oficial sin abrir descargas masivas.
- Capturas de pantalla disponibles como artefactos en GitHub Actions `apd-school-map-browser-qa` (retención 7 días). Son screenshots de **diseño con Leaflet simulado**, no evidencia de carga real de teselas.
- Consultas GET reales por claves MS y MT en workflows previos: HTTP 200, una coincidencia, CUE/nombre/domicilio/coordenadas y cabecera CORS permisiva.
- En CI se conservan controles de privacidad, seguridad de panel, paywall, plan y router.

## Pendiente antes de producción
1. Prueba real en navegadores Android con Leaflet, teselas y WFS oficial (el fixture de Chromium no reemplaza esta integración).
2. Validar un muestreo representativo de otras claves por distrito, anexos y cambios de capa; medir precisión de la relación con CUE.
3. Revisar restricciones y licencia del WFS; determinar caché servida desde Worker antes de escalar solicitudes por usuario.
4. Ensayar contra una sesión propia con una oferta vigente sin enviar datos de otros usuarios; verificar además que el enlace a ABC continúe funcionando.
5. Plan de rollback: restaurar `app_v2.js` y `mapa-escuelas-pba.html` de `main` anterior, sin tocar Worker/DB ni credenciales.

Sin autorización de publicación, todo permanece en rama/PR y la web pública conserva el comportamiento anterior.

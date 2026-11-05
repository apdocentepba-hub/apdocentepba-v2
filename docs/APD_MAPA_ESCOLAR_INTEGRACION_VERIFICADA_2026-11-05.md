# APDocentePBA — integración con Mapa Escolar ABC (investigación verificada)
Fecha: 2026-11-05. Estado: **prueba técnica pública completada; producción intacta**.

## Fuentes oficiales y comprobación

- APD (ofertas públicas): `https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select`.
- Mapa Escolar WFS: `https://mapaescolar.abc.gob.ar/me/wfs?service=WFS&version=2.0.0&request=GetCapabilities`.
- WFS de establecimientos secundarios estatales: `me:nivel_secundario_gestion_estatal`.
- Datos Abiertos PBA: `https://catalogo.datos.gba.gov.ar/dataset/establecimientos-educativos` (licencia CC BY 4.0; recurso CSV del 28/10/2026 según metadatos del catálogo). El portal no respondió en la prueba CI, pero el WFS **sí**.
- WMS visual: `https://mapaescolar.abc.gob.ar/me/wms`.

**Resultado de la prueba con seis ofertas públicas**: 6 ofertas, 5 códigos únicos de escuela, 5 consultas WFS con **coincidencia exacta 1:1** entre `ABC.escuela` y `WFS.properties.clave`; 6/6 ofertas pudieron geolocalizarse con coordenadas oficiales verificadas. En la escuela `0005MS0007` hay dos ofertas y corresponde un solo marcador con contador 2.

**Prueba ejecutada**: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42131051575

## Estado real del repositorio

Mapas existentes en `main`:
- `mapa-escuelas-pba.html`: Leaflet y MarkerCluster; intenta padrón nacional XLSX y CKAN, con respaldo OSM (incluye un ZIP de 2019).
- `mapa-escuelas-osm.html`: Leaflet/Overpass y búsqueda, no está vinculado con las ofertas autenticadas.
- `centro-abc-servado.html`: enlace al Mapa Escolar ABC.

**No crear un tercer subsistema cartográfico**: reutilizar Leaflet/MarkerCluster, pero servir únicamente escuelas con ofertas vigentes del usuario y coordenadas oficiales vinculadas.

## MVP propuesto (orden)

1. Añadir un catálogo **público** `escuelas_geo` (ejemplo: `clave` PK, `cue`, `nombre`, `distrito`, `localidad`, `domicilio`, `lat`, `lon`, `source_updated_at`, `last_sync_at`, `match_status`). Verificar antes si ya existe tabla equivalente; no crear duplicadas.
2. Proceso de lectura y caché WFS en backend, con límites de consulta, timeout, reintentos, atribución y fallback. No solicitar datos privados ni claves de ABC.
3. Exponer en API autenticada junto a `/api/mis-alertas` (o endpoint compatible) únicamente `escuela.clave`, información escolar pública geográfica y ofertas **del propio usuario**. No exponer preferencias ni usuarios ajenos.
4. Dentro del panel, vista opcional «Mapa de mis ofertas»: agrupar por `escuela.clave`, marcador con contador de ofertas, cargo, turno, cierre, acceso a postulación oficial; lista sincronizada y escuela sin coordenadas mostrada solo en lista, nunca inventar ubicación.
5. Filtro por radio desde ubicación indicada voluntariamente (no guardarla por defecto); los kilómetros son distancia en línea recta. Para duración de viaje, delegar en servicio de navegación.
6. Tests de aceptación: 6/6 claves WFS; 5 marcadores; listado original conserva 6 ofertas; no incluir vencidas; clave ausente/ambigua sin pin; 401 sin sesión; timeout WFS con caché; WFS limita registros y falla sin bloquear alertas/email; respetar licencia CC BY 4.0.
7. Prueba visual desktop/móvil y carga antes de desplegar; feature flag inicialmente desactivada; preservar copia/rollback; publicar solamente con autorización.

## No hacer

- No consultar SUNA/PDD/Mis Estudiantes ni usar sesión directiva.
- No confundir «ofertas carreras» del mapa educativo (oferta formativa) con puestos APD.
- No inferir que una oferta desaparecida fue adjudicada.
- No depender de 5 consultas externas por carga de panel; cachear por clave.
- No sustituir la fuente APD por el Mapa Escolar: son complementarias.

## Limitaciones pendientes

- El experimento comprueba el cruce de **seis ofertas de nivel secundario estatal**, no la totalidad de modalidades y extensiones de la Provincia.
- Validar capas WFS para técnico, primario, adultos, centros y anexos; coordinar selección por `nivelmodalidad` y `escuela`.
- Comprobar CORS para acceso desde el navegador, o preferir API backend con caché.
- Comprobar licencia y política de consumo del WFS en uso continuo. El catálogo publicado indica CC BY 4.0.

# AlertasAPD · Movilidad multimodal para comparador Insigne
Fecha: 12 de noviembre de 2026. Alcance: frontend público; sin claves ni gastos.

## Fuentes y significado de los resultados
- **Origen**: dirección georreferenciada y revisada por la persona usuaria en Datos personales (Georef Argentina). Solo usa las coordenadas de referencia guardadas en su cuenta; no se solicita GPS.
- **Destino**: cada establecimiento seleccionado identificado por clave provincial exacta y validado vía Mapa Escolar ABC WFS. Varias ofertas de la misma escuela generan una única tarjeta de recorrido.
- **Auto y bicicleta, dentro del comparador**: botón de consulta manual a Valhalla con datos cartográficos OSM. Muestra longitud de ruta en kilómetros y duración estimada en minutos; no refleja tránsito real, cortes, estacionamiento ni reglas de llegada a la escuela. Cero estimaciones fabricadas si el proveedor falla.
- **Transporte público, auto, bicicleta y a pie**: enlaces directos a Google Maps Directions con ambos puntos; Maps muestra alternativas y tiempos actuales según su cobertura. **No se extraen kilómetros de tránsito desde Maps a la interfaz de APD**; una URL de Maps no es una API de datos estructurados. La opción transporte puede incluir colectivo, tren, subte y caminata, según la zona y el horario.
- **Líneas que recorren la zona**: capas públicas ArcGIS Transporte_BuenosAires FeatureServer CABA/Provincial/Nacional/Municipal (mayo de 2026), consulta espacial a 400 m. Se consulta con un clic, no automáticamente. El número de línea se toma solo del atributo LINEA. **Un recorrido cercano no demuestra parada a esa distancia, frecuencia, ramal ni servicio vigente.** Se incluye un acceso separado a buscar paradas y combinaciones en Maps.
- **Distancias en línea recta**: Haversine anterior, claramente separado de los km por calles.
- **Privacidad**: las coordenadas solo salen hacia Google al abrir un enlace, hacia Valhalla al solicitar ruta y hacia ArcGIS al consultar líneas. No se transmiten tokens o datos personales del usuario, ni se almacenan los recorridos.
- **Sin SLA de terceros**: los servidores públicos gratuitos pueden negar la consulta, demorar o tener límites. En ese caso la interfaz muestra la indisponibilidad y conserva el enlace a Maps.

## Fuentes de integración
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Valhalla: https://valhalla.github.io/valhalla/
- Demo Valhalla (servidor comunitario, requiere uso responsable): https://valhalla1.openstreetmap.de
- Datos geográficos OSM © OpenStreetMap contributors, licencia ODbL: https://www.openstreetmap.org/copyright
- ArcGIS capas AMBA: https://services1.arcgis.com/gKFHG0iKXPnKkg1l/ArcGIS/rest/services/Transporte_BuenosAires/FeatureServer

## Verificación
- CI: prueba sintética de enlaces para 4 modos, km/min en respuesta Valhalla, validación ABC/Georef, ausencia de GPS, interpretación de líneas y capas, CORS real y QA Chromium 390px/1280px.
- La ejecución real de Chrome usa exclusivamente un servidor local y coordenadas sintéticas.
- La cobertura de transporte colectivo depende de la completitud de la cartografía. El cálculo exacto de trayecto de transporte dentro de APD, con transbordos, requiere un planificador GTFS (no instalado ni pagado).
- No se modificaron Cloudflare Worker, Supabase, sesiones, usuarios, suscripciones ni alertas.

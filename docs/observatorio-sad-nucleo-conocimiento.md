# Núcleo de conocimiento ABC + SAD

## Objetivo

Responder preguntas docentes combinando antecedentes históricos y publicaciones actuales. Cada respuesta debe distinguir qué regía antes, qué rige ahora, para quién, en qué territorio y cuál es la evidencia oficial que lo sostiene.

El sistema no debe contestar desde un resumen sin origen. Cada afirmación recuperable necesita una fuente, fecha y ubicación dentro del documento o página.

## Unidad de conocimiento

Se conserva el documento fuente completo y se extraen hechos enlazados a pasajes verificables.

Campos mínimos del documento:

- identificador estable, título, tipo documental, organismo emisor y distrito
- URL original o ID de Drive, hash del archivo y fecha de captura
- fecha de emisión, publicación, vigencia y vencimiento cuando existan
- estado: vigente, histórico, reemplazado, rectificado, vencido o incierto
- formato, páginas, idioma y estado de extracción/OCR

Campos mínimos por hecho o instrucción:

- tema, población afectada y alcance territorial
- trámite, pasos, canal de presentación y documentación requerida
- plazos y condiciones de inicio/cierre, clasificados por etapa
- excepciones, restricciones y estados del trámite
- norma citada y relación con documentos anteriores o posteriores
- cita breve, página/sección, fuente y confianza de extracción

Cada fecha debe tener un tipo explícito: inscripción, carga de antecedentes, exhibición, reclamo, notificación, segunda instancia u otro. Una fecha que determina quién puede reclamar no se debe convertir automáticamente en el vencimiento para presentar el reclamo. Si los documentos no coinciden, se preservan ambas fechas y sus fuentes hasta verificar la versión o rectificación aplicable.

Si el documento no permite confirmar un campo, se registra como desconocido; no se completa por inferencia silenciosa.

## Cobertura de fuentes

1. Directorio oficial ABC: descubrimiento dinámico de las 137 oficinas SAD.
2. Páginas ABC de cada SAD: comunicados, convocatorias, formularios y adjuntos.
3. Canales externos enlazados por cada SAD: se agregan solo después de validar que sean oficiales y estén activos.
4. Ecosistema ABC central: normativa, servicios, calendarios, instructivos, publicaciones y páginas institucionales.
5. Archivo histórico aportado por el usuario: incorporación por lotes, conservando IDs y nombres originales; una carga en Drive no equivale a lectura o indexación.

## Ingesta y actualización

- Capturar cada página con fecha, URL canónica y estado HTTP.
- Descargar solo documentos nuevos o modificados; deduplicar por URL canónica y hash.
- Extraer texto de PDF, DOC/DOCX y HTML; enviar a OCR únicamente las páginas escaneadas.
- Mantener originales, texto extraído, segmentos con página y versiones rectificadas.
- Procesar primero catálogo y metadatos; después el texto completo; luego clasificar y relacionar.
- Comparar fuentes en barridos escalonados. El MVP propone frecuencia horaria para las páginas ABC; los canales externos dependen de la plataforma.
- No borrar una publicación al desaparecer de una página: marcarla como retirada y conservar la última captura.
- Si una SAD republica una comunicación provincial, conservar la publicación local y su fecha como evidencia de difusión, pero vincular el cuerpo duplicado a la pieza provincial para no contarla como una política diferente.

## Comparación y respuesta

Para una pregunta, el recuperador debe buscar en el archivo completo y en publicaciones actuales, priorizar fuentes oficiales y devolver:

1. respuesta directa con estado temporal (vigente/histórico/no confirmado)
2. a quién afecta y en qué distrito
3. pasos, requisitos y fechas aplicables
4. diferencias entre la regla provincial y las prácticas o avisos locales
5. cambios, rectificaciones y publicaciones relacionadas
6. fuentes directas con fecha y página/sección

Cuando dos fuentes se contradigan, se muestran ambas y se explica cuál es posterior o de mayor autoridad. No se fusionan instrucciones locales distintas en una única regla provincial.

## Primer lote histórico: criterios

El archivo compartido ya contiene documentos legibles desde Drive, pero la búsqueda/lista devuelve páginas de resultados. El trabajo debe paginar el inventario y registrar por separado:

- encontrados en Drive
- descargados y legibles
- texto extraído correctamente
- OCR pendiente
- indexados y disponibles para preguntas

El nombre numérico de un archivo no sirve como título ni como fuente. El título, emisor, fecha, distrito y referencia normativa deben salir del contenido, con revisión de calidad para los casos dudosos.

## Límites actuales del piloto

El conector SAD propuesto en la PR #296 descubre las oficinas y compara cambios en enlaces/huellas de páginas ABC. Aún no archiva ni lee adjuntos, no indexa documentos, no incorpora todo el portal central y no dispone de alertas a docentes. Esa separación permite mostrar progreso real sin presentar un catálogo o un contador de archivos como una base de conocimiento terminada.

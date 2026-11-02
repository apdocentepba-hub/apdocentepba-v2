# APDocentePBA — auditoría real del filtro de vencimiento (seis distritos)

La fase anterior (PR #214) confirmó que las seis consultas antiguas devolvían cero y las nuevas 246 filas con estado `Publicada` el 2/11. PR #215 verificó una muestra mínima por distrito y estado.

Este paso consulta ABC con proyección limitada a `descdistrito,estado,finoferta,fecha_cierre` para cada uno de los seis distritos; todas las respuestas deben quedar por debajo del límite de 300 registros o la prueba **falla por posible truncamiento**. No solicita nombres de docentes, IDs personales, escuelas, cargos ni información de usuarios. Los documentos se procesan exclusivamente en la memoria efímera del runner; se guardan **solo agregados numéricos** por distrito y hora.

La función `ofertaVigente` y las dependencias `parseFechaFlexible2` y `norm2` se extraen **exactamente del Worker actual**, sin reescribir su criterio en otro lenguaje. Se informa número de ofertas con estado Publicada, aceptadas y rechazadas por el filtro de vigencia, y registros con fecha faltante o ilegible. Un resultado del filtro no demuestra que esa oferta se haya capturado realmente, sea compatible con preferencias ni que una postulación permanezca disponible; tampoco deduplica identificadores.

Workflow solo bajo PR o activación manual, sin cron, ni escrituras, ni despliegues; reporte agregado retenido 14 días. No se cambia el catálogo ni se habilita `APD_DISTRICT_SOURCE_ALIASES_ENABLED`.

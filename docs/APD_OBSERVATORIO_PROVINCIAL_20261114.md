# APDocentePBA — Observatorio Provincial SAD / ABC
**Estado:** piloto técnico reversible, no desplegado · **Fecha:** 14 de noviembre de 2026

## Visión
Pasar del lector de Actos Públicos Digitales a un **motor público de información docente provincial** que observe noticias, comunicaciones, cronogramas y actos administrativos de ABC/DGCyE y de cada Secretaría de Asuntos Docentes (SAD). No es un sustituto de ABC ni de SerVaDo, y ningún resultado propio se presenta como resolución o acto administrativo oficial.

## Evidencia de la investigación inicial
- **ABC central:** https://abc.gob.ar/ — noticias y servicios públicos actuales.
- **SAD Almirante Brown:** https://abc.gob.ar/sad/almirante-brown/inicio — comunicados de noviembre de 2026 visibles en la portada.
- **SAD General San Martín:** https://abc.gob.ar/sad/general-san-martin/inicio — resultados de acrecentamiento, concursos y domicilio electrónico en su portada 2026.
- **SAD Avellaneda:** https://abc.gob.ar/sad/avellaneda/inicio — portada con comunicaciones de 2026, pero no demuestra cobertura total de otros canales.
- **SAD Quilmes:** https://abc.gob.ar/sad/quilmes/inicio — noticias ABC visibles fechadas en 2024 y un enlace a comunicados en Google Sites. **Una portada vieja no significa SAD inactiva.**
- **SerVaDo público:** https://servado.abc.gob.ar/calendario-inscripciones — calendario de trámites; no se ingresó a cuentas ni listados privados.
- **Directorio:** https://abc.gob.ar/sad/ — útil como pista de descubrimiento, **no** como prueba de fuente activa ni garantía de cobertura de 135 distritos.

Estas URLs se observaron públicamente el 14/11/2026 mediante navegación web. No se validó aún su estructura HTML cruda desde el ejecutor de GitHub ni sus políticas robots, por lo cual **no se afirma que el extractor en vivo funcione contra esas páginas**.

## Implementado en esta PR
- Registro explícito de **6 páginas públicas verificadas por URL**: 4 SAD piloto, portal ABC y calendario público SerVaDo. No se inventan las restantes SAD.
- Motor puro `apd-provincial-intelligence-core.mjs`: normalización de titulares y fechas presentes en la página, identificadores por URL, hash de cambios, etiquetas temáticas, comparación conservadora entre dos lecturas y temas compartidos entre distritos. Enlaces y documentos quedan citables.
- Descubrimiento no invasivo de enlaces a canales alternativos (por ejemplo, Google Sites) **solo como candidatos**: nunca se conectan automáticamente a dominios externos sin verificación.
- Escáner `apd-provincial-monitor.mjs`: **sin red por defecto**, límite de 6 páginas, máximo 550 KB HTML, 32 KB robots, timeout 12 s, lectura GET pública sin cookies ni tokens, sin redirecciones y espera de 1,3 s entre solicitudes. Ante robots no comprobable, 403/404, fallo o HTML desconocido, deja el estado explícito en lugar de inventar «sin novedades».
- Informes JSON sin HTML íntegro, datos de docentes, PID, alumnos ni credenciales. No se envían correos, WhatsApp ni Telegram; no se actualiza Supabase, Cloudflare o GitHub Pages.
- CI con tests deterministas y ejecución offline; **ninguna programación de búsqueda periódica activa todavía**.

## Modos
```bash
node scripts/apd-provincial-monitor.mjs --offline --out tmp/apd-provincial-pilot.json

# SOLO tras verificar robots/origen y autorizar un ensayo puntual desde un entorno con red:
APD_ENABLE_PUBLIC_MONITOR=1 node scripts/apd-provincial-monitor.mjs \
  --live --allow-network --out tmp/apd-provincial-pilot-live.json \
  --previous tmp/apd-provincial-pilot-previous.json
```

En el segundo comando `--previous` es opcional. La comparación de versiones solo es confiable con *dos capturas exitosas*; una pérdida de conexión jamás demuestra anulación.

## Qué puede concluir el motor
| Hallazgo | Etiqueta segura | Qué NO significa |
| --- | --- | --- |
| Nuevo enlace público no visto | Nueva referencia observada | Nuevo trámite obligatorio |
| Misma URL, título/fecha corregida | Cambio de titular observado | Prórroga confirmada |
| Enlace deja de aparecer en portada | Ya no visible en portada | Comunicado anulado |
| PAD citado en dos distritos | Tema PAD compartido | Misma normativa idéntica |
| Enlace de SAD a Google Sites | Fuente candidata por verificar | Fuente oficial ya homologada |
| Página sin enlaces legibles | Parser sin cobertura | Distrito sin actividad |

**No interpretar sentencias administrativas ni prometer vigencia** sin comparar los documentos originales, sus fechas, firmas, rectificaciones y alcance por distrito.

## Arquitectura prevista para la ampliación gradual
1. **Descubrimiento:** registro de todos los distritos y SAD especiales desde directorio y fuentes institucionales. Distinguir URL descubierta, validada, activa y temporalmente inaccesible. No completar los 135 distritos por URLs supuestas.
2. **Conectores versionados por formato:** Drupal ABC; Google Sites oficialmente enlazados; sitios SAD autónomos; PDFs de comunicados; boletines normativos; calendario público SerVaDo; canales sociales oficiales mediante APIs/permisos permitidos. Priorización por actividad y evidencia de origen.
3. **Almacenamiento y auditoría:** historial de observaciones por fuente, fecha/hora de consulta, ETag/hash, link, documento de respaldo, estado HTTP y origen. Una fuente fallida nunca borra el último aviso conocido. Separar esta base de los usuarios y de las alertas APD.
4. **Motor semántico:** detectar comunicados idénticos por identificador oficial y archivo; *temas similares* por reglas y luego búsqueda semántica con revisión humana. Distinguir comunicación central vs disposición local vs rumor.
5. **Motor de demanda:** agrupar preguntas y trámites recurrentes **solo en forma agregada y consentida**; sugerir herramientas como calendario de inscripciones, checklist PAD/PID, seguimiento MAD, formularios guía, controles de documentación y mapas. No generar ni publicar automáticamente herramientas, reclamos o comunicaciones oficiales.
6. **Distribución:** alimentar un panel separado «Observatorio» con fuentes, cobertura verificable y confianza. Notificaciones solo opt-in, con deduplicación, validez temporal, prueba de entrega y opciones de desactivar.
7. **Monitoreo periódico:** recién al contar con robots verificado, pruebas live, límites de cuota y almacenamiento permanente; cadencia baja por fuente con backoff (12–24 h para sitios estables, otras frecuencias justificadas por actividad), sin scraping de sitios privados.

## Barreras previas a producción
- Confirmar permisos de consulta para cada origen (robots/términos) y estructura HTML real; añadir pruebas con muestras públicas fieles.
- Garantizar que no haya gasto en minutos de GitHub Actions, proxies o proveedores externos sin autorización.
- Definir persistencia duradera de capturas, backup, deduplicación y recuperación tras fallos; un artifact CI no sustituye base de historial.
- Política de privacidad, retención, seguridad de enlaces y protección frente a contenido malicioso en fuentes externas.
- Definir políticas de publicación y revisión humana de herramientas sugeridas.
- Verificar cobertura real de cada SAD y SAD II, distinguiendo **distritos objetivo** de **fuentes efectivamente monitorizadas**.
- No fusionar este observatorio con PR #294 visual ni modificar `main`, Worker, alertas existentes o datos personales.

## Criterios de aceptación del piloto
- Registro exclusivamente público, sin URLs de login.
- Extractor conservador con fuente/fecha/URL, cambio y no visibilidad diferenciados.
- Temas compartidos entre distritos sin afirmar que son el mismo documento.
- Simulación de fallos de red, robots bloqueado y enlaces externos.
- Tests Node y CI verde, sin solicitudes externas durante PR y sin despliegue.

**Siguiente entrega técnica:** validar conectores contra HTML/robots reales, agregar fuentes alternativas confirmadas (ej. Quilmes) y el primer almacenamiento histórico antes de cualquier cron permanente.

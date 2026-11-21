# Observatorio SAD: catálogo y monitor bajo pedido

El catálogo oficial de ABC se consulta en una llamada pública:

`https://servicios3.abc.gob.ar/dti/api/sads.regional/select`

La respuesta que se observó informó 137 oficinas, incluidas las SAD I y II de La Plata y La Matanza. El directorio confirma nombres y rutas; por sí solo no demuestra que cada página tenga avisos recientes ni descubre canales externos no vinculados desde ABC.

## Catálogo de oficinas

Desde la raíz del repositorio:

```sh
node scripts/observatorio-sad/discover-sources.mjs
```

La salida queda en `tmp/observatorio-sad/source-directory.json`. La consulta es GET pública, no usa credenciales ni envía formularios. El script verifica filas completas, nombres y rutas únicas.

## Primer barrido de páginas

```sh
node scripts/observatorio-sad/scan-notices.mjs
```

El barrido consulta las páginas ABC de las oficinas anunciadas por el catálogo y tres páginas centrales públicas: portada ABC (srv4), calendario de inscripciones SerVaDo y notificaciones SerVaDo. Las consulta de forma secuencial y con una pausa de 500 ms entre páginas. Guarda el estado en `tmp/observatorio-sad/state.json` y el informe en `tmp/observatorio-sad/report.json`.

El monitor se usa solo cuando el usuario lo solicita. No hay cron ni tarea de fondo. El código está en un repositorio público, así que los archivos del corpus, los reportes de uso y cualquier dato privado deben permanecer fuera del repositorio y de los artefactos de GitHub Actions.

## Alcance y límites

- Los enlaces a documentos y plataformas externas se registran por heurística; el script no descarga ni sigue esos destinos.
- Un cambio de huella de la página se informa para revisión. No se presenta como un comunicado confirmado.
- Un cambio en enlaces puede ser un alta, una baja o una rectificación; requiere revisar la página fuente.
- No se archiva el texto de PDFs/Word ni se hace OCR.
- Las tres páginas centrales son un primer conector, no el portal ABC completo. Normativa, servicios y publicaciones restantes aún requieren inventario específico.
- La cobertura de Facebook, Google Sites, planillas u otros canales es parcial hasta verificar cada enlace oficial.
- El estado usa caché de Actions; si la caché se pierde o vence, el próximo barrido vuelve a crear una línea de base.
- No existe ejecución automática ni webhook universal para las publicaciones de sitios o redes administradas por cada distrito; la consulta se hace bajo pedido.

Esta etapa arma el inventario y una señal de cambio revisable cuando se solicita. La capa siguiente debe extraer contenido y adjuntos desde una ubicación privada, conservar versiones y clasificar comunicados comunes, locales y rectificatorios. El monitor todavía no constituye ingesta histórica ni una base consultable.

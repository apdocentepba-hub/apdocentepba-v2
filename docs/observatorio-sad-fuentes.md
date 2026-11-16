# Observatorio SAD: catálogo y primer monitor

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

El barrido consulta las páginas ABC de las oficinas anunciadas por el catálogo, de forma secuencial y con una pausa de 500 ms entre páginas. Guarda el estado en `tmp/observatorio-sad/state.json` y el informe en `tmp/observatorio-sad/report.json`.

El workflow `.github/workflows/observatorio-sad-monitor.yml` propone una ejecución horaria. El estado se conserva mediante caché de GitHub Actions y cada informe se retiene 30 días como artefacto. Esto empieza a comparar cambios después del primer barrido exitoso; no genera avisos a usuarios ni modifica el sitio productivo.

## Alcance y límites

- Los enlaces a documentos y plataformas externas se registran por heurística; el script no descarga ni sigue esos destinos.
- Un cambio de huella de la página se informa para revisión. No se presenta como un comunicado confirmado.
- Un cambio en enlaces puede ser un alta, una baja o una rectificación; requiere revisar la página fuente.
- No se archiva el texto de PDFs/Word ni se hace OCR.
- La cobertura de Facebook, Google Sites, planillas u otros canales es parcial hasta verificar cada enlace oficial.
- El estado usa caché de Actions; si la caché se pierde o vence, el próximo barrido vuelve a crear una línea de base.
- La cadencia es horaria y escalonada, no tiempo real. No hay webhook universal para publicaciones en sitios o redes administradas por cada distrito.

Esta etapa arma el inventario y una señal de cambio revisable. La capa siguiente debe extraer contenido y adjuntos con conectores específicos, conservar versiones en almacenamiento persistente y clasificar comunicados comunes, locales y rectificatorios.

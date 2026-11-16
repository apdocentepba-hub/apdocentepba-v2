# Observatorio SAD: primer conector de fuentes

El catálogo oficial de ABC se puede consultar en una sola llamada pública:

`https://servicios3.abc.gob.ar/dti/api/sads.regional/select`

El endpoint devuelve el nombre del distrito y la ruta de su página SAD. La consulta oficial informa 137 oficinas, incluidas las SAD I y II de La Plata y La Matanza. No se debe usar el directorio como prueba de que cada página tenga avisos recientes: cada ruta y sus canales externos necesitan verificación propia.

## Generar el catálogo

Desde la raíz del repositorio:

```sh
node scripts/observatorio-sad/discover-sources.mjs
```

La salida queda en `tmp/observatorio-sad/source-directory.json`. Se puede indicar otra ruta como primer argumento. La consulta es GET pública, no usa credenciales, no envía formularios y falla si ABC devuelve filas incompletas o rutas no válidas.

## Qué cubre esta etapa

- Descubre las 137 entradas desde el catálogo oficial, sin mantenerlas a mano.
- Guarda nombre, ruta ABC, URL absoluta, hora de captura y procedencia.
- Comprueba que el total de filas coincida con el total declarado y que no haya nombres o rutas duplicados.

## Qué falta para monitoreo de comunicados

Este primer conector aún no descarga las 137 páginas ni sus adjuntos. La etapa siguiente debe consultar cada página con límites de frecuencia, registrar por oficina el último chequeo y extraer vínculos/documentos publicados. Después hay que incorporar canales externos (por ejemplo, Google Sites, planillas o redes oficiales) solo cuando se verifiquen para cada SAD. Para detectar cambios entre chequeos se necesita persistencia de capturas e historial; los canales que no ofrezcan feed público verificable deben quedar marcados como cobertura manual o parcial.

La cadencia razonable del MVP es horaria y escalonada. “Tiempo real” no es técnicamente garantizable cuando una SAD publica en un sitio externo o una plataforma sin notificaciones públicas.

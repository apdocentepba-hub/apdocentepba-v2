# Radar provincial — corrección de integración con el HTML existente (2/11/2026)

## Incidencia detectada antes de publicar
El archivo de producción `index.html` ya contiene `#panel-radar-provincia` y el botón `#btn-refresh-provincia`. El candidato inicial del PR #198 creaba otra tarjeta `#panel-radar-combinado-card`, que podía duplicar la información y dejar un bloque previo mostrando “Cargando...”.

## Corrección
El candidato ahora reutiliza el **bloque y botón existentes**, crea solamente el contenido verificable dentro de `#panel-radar-provincia` mediante markup fijo y utiliza `textContent` para resultados dinámicos. No agrega tarjetas ni botones si los identificadores nativos existen. En entornos de prueba sin el bloque original mantiene su tarjeta de compatibilidad.

Las nuevas pruebas comprueban el HTML real, ausencia del panel duplicado, botón funcional sin listeners repetidos, recuento verificado y actualización repetida.

## Estado
Candidato en repositorio, pruebas automatizadas requeridas antes de fusionar. **No publicado**. `index.html`, `radar_provincia_patch_semaforo.js` y el Worker desplegado continúan sin modificación. La activación y eventual reversión siguen documentadas en `docs/APD_RADAR_RELEASE_ROLLBACK_20261102.md`.

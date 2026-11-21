# APDocentePBA — deuda técnica del frontend y limpieza segura

**Auditoría:** 14/11/2026. **Estado:** candidata en PR #294, sin publicación.
**Referencia de producción previa:** `aa1c7350dc2f3891fcb679b3fca02137dd45f2be`.
**Alcance:** carrusel de alertas y carga de recursos de la aplicación. No es auditoría del Worker ni de datos personales.

## Inventario obtenido del repositorio y de index.html

- Árbol de `main`: 629 archivos de tipo blob; 13 archivos `.css` (algunos son de herramientas o módulos no montados en el panel). Esos números no equivalen a recursos realmente cargados.
- `index.html`: 8 CSS locales enlazados, 1 hoja de fuentes externa; 26 scripts locales y un script Google cargados por etiquetas `script src`; 3 módulos cargados con `import()`.
- Al menos tres scripts cargados insertan hojas `<style>` mediante JavaScript: `frontend_easy_fixes_patch.js`, `mobile_visual_patch.js` y `visual_last_patch.js`. Por tanto, medir solo CSS externos **no reproduce** el resultado visual del navegador.
- En las 8 CSS locales enlazadas se observaron 754 declaraciones `!important` (muchas pertenecen a landing/móvil y no al carrusel). Esta métrica diagnostica complejidad; **no** demuestra por sí sola un defecto.
- `apd_comparador_panel.css` contiene numerosas redefiniciones de `#panel-alertas .alerta-*`; entre ellas hasta seis apariciones del selector `#panel-alertas .alerta-tags`. Hay que considerar cascada, especificidad y media queries antes de borrar reglas.

## Fallo reproducido, causa y corrección candidata

Al incorporar el CSS inyectado por parches en el Chromium sintético, la prueba de colores por tipo de revista **falló**: suplencia y provisionalidad tenían el mismo color de borde.

Causa rastreada hasta `frontend_easy_fixes_patch.js`:
1. Regla genérica `.stat-box,.alerta-floating,...` aplicaba bordes a la ficha moderna.
2. Regla `#panel-alertas [class*='alerta-']` pisaba de forma indiscriminada colores y radios de componentes, sin respetar las nuevas variantes de revista.

**Solución de menor riesgo en PR #294:** cambiar solo esas dos cadenas de selector para excluir `.alerta-main-card` del estilo heredado y suprimir el comodín que afectaba indiscriminadamente a subcomponentes. No cambia eventos, sesiones, contenido, temporizadores ni rutas. `scripts/check-apd-legacy-style-scope.mjs` verifica que **únicamente** se hayan realizado esas dos sustituciones; cualquier otro cambio en ese parche falla en CI.

Se eliminaron adicionalmente seis reglas antiguas de `apd_comparador_panel.css` que ya estaban totalmente sobreescritas por reglas `!important` activas. No se borraron estilos globales sin evidencia.

## Estrategia de control antes de integrar

1. Comparar `app_v2.js` con `origin/main`, permitiendo diferencias únicamente dentro de `renderPidMatchBlock` y `renderAlertaActual`. Exigir resumen PID accesible, texto escapado, clave ABC principal y ausencia de funciones de red o ejecución.
2. Para el inyector antiguo, comparar **todo el archivo** con el resultado de aplicar solo las dos sustituciones literales aprobadas.
3. Correr Node y Chromium con las 8 hojas cargadas y las 3 hojas inyectadas, escritorio, móvil y tema oscuro. Comprobar ausencia de desbordamiento y colores diferentes según revista.
4. Probar georreferenciación, comparador, autenticación y protección de Worker por workflows ya existentes.
5. Mantener PR #294 en borrador hasta revisar las nuevas referencias visuales del usuario y resolver toda la CI. **No cambiar `index.html` ni desplegar de forma prematura.**

## Deuda restante por orden de riesgo

**P0 — Conflictos demostrados:** corregir selectores globales que pisan el carrusel, con test de regresión de cascada real; mantener intactos plan/PID/ABC.

**P1 — Dueños de estilo:** aislar en un módulo mantenible los estilos actuales del carrusel; retirar únicamente reglas redundantes tras comparación visual antes/después. Revisar en especial `frontend_easy_fixes_patch.js`, `visual_last_patch.js`, `mobile_visual_patch.js` y CSS móvil.

**P2 — Runtime:** inventariar los 26 scripts locales con su responsabilidad, efectos secundarios y eventos; detectar si hay listeners, temporizadores o inyecciones repetidas. No asumir que un script `patch` está muerto por el nombre.

**P3 — Rendimiento:** medir costo real de JS/CSS, carga diferida, caché, duplicación de consultas y tiempos de render en dispositivos representativos. Los tamaños del repositorio no prueban por sí solos consumo de usuario.

**Criterio de eliminación:** no borrar código por apariencia o antigüedad. Exigir evidencia de no uso, prueba de paridad visual/funcional, procedimiento de rollback y ausencia de afectación a otras cuentas.

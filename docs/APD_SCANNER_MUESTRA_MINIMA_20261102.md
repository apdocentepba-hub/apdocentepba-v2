# Validación de etiquetas ABC con muestra mínima — 2/11/2026

**Objetivo:** pasar de una coincidencia de conteos `rows=0` a un ensayo de la forma de los documentos que realmente recibiría el escáner, sin conservar datos de una oferta o persona.

El script de auditoría utiliza seis GET públicos `rows=1`, con proyección exacta `fl=descdistrito,estado,finoferta`. Para cada uno de los seis distritos se comprueba la coincidencia estricta del nombre oficial ABC, el estado `Publicada` y si el campo de vencimiento tiene tipo esperado. Solo conserva booleanos, cantidad agregada, nombres de distrito y el tipo del campo: **no persiste ni imprime datos del documento obtenido**. Añade un GET `rows=0` para contar publicaciones de **CAPITAN SARMIENTO**, cuya denominación no existe correctamente en `catalogo_distritos`.

La fuente oficial de municipios es https://www.gba.gob.ar/municipios, donde figura Capitán Sarmiento; en la tabla actual están `CORONEL SARMIENTO` y `GENERAL SARMIENTO`. No se ejecuta ninguna migración ni se cambia el catálogo. Corregirlo sin una revisión de referencias a preferencias y un respaldo recuperable podría asociar ofertas a distritos equivocados.

Esta validación **no demuestra** vigencia del conjunto completo, disponibilidad de los cargos, ausencia de duplicados o entrega de alertas. El piloto del Worker del PR #213 continúa inactivo en producción.

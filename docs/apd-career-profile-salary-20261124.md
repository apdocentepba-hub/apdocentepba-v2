# Mi carrera docente — candidato 2026-11-24

## Fuentes verificadas
- FEB https://calculadora.feb.org.ar/ y https://calculadora.feb.org.ar/guia-rapida — liquidación de varios cargos, período, escalafón, módulos, antigüedad y desfavorabilidad; diferencias posibles respecto de COULI.
- SUTEBA https://haberes.suteba.org.ar/app/ — advertencias de liquidación por cargo, topes de conceptos y asignaciones familiares. No sumar linealmente cálculos de cargos independientes.
- DGCyE https://catalogo.datos.gba.gob.ar/dataset/establecimientos-educativos — padrón oficial CC BY 4.0 con clave, CUE/anexo, desfavorabilidad, sector, período. Las fechas mostradas en el índice y en la ficha de descarga no coinciden en todas las respuestas; NO fijar como fecha de vigencia una fecha de rastreo o una ficha cacheada. Validar archivo real, metadatos, hash, codificación, duplicados y período antes de usarlo.
- Las clasificaciones rural/urbano y desfavorabilidad no son equivalentes. No inferir el suplemento pagado por coordenadas, nombre o código sin una regla vigente documentada.
- No se confirmó una API pública de liquidación ni permiso para replicar código/algoritmos de FEB/SUTEBA. No extraer ni enviar datos privados del docente a esos sitios sin autorización.

## Contrato
Perfil versionado por cuenta con antigüedad general y cargos identificados por clave provincial. Cantidad remunerativa (cargo, módulo, hora cátedra) separada de duración reloj. Horarios exactos con día e inicio/fin; asociación a módulos ya marcados solamente explícita. Mantener marcas antiguas como no asignadas; no borrarlas por migración. Evitar sobreposición o doble conteo en el simulador; una colisión declarada debe mostrarse, no ocultarse. Validación, RLS, CAS, sesión bearer real y QA con dos cuentas antes de persistir. No aplicar SQL en producción desde este candidato.

## Impacto salarial
Resultado neto marginal = liquidación total después − liquidación total antes, mismo período, fuente y supuestos. No asumir que 1 módulo = 1 hora reloj ni que un cargo extra conserva bonificaciones anteriores. Mostrar base, antigüedad, desfavorabilidad, adicionales, deducciones y conceptos no verificables. Mientras falten tablas vigentes y pruebas contrastadas, interfaz manual explícitamente etiquetada. La comparación manual no constituye recibo oficial. No persistir importes sin diseño de permisos.

## Próximos criterios de aceptación
- editor por cargo, escuela verificada y colores; edición/desasignación explícita y recuperación en otra sesión; conservar grilla previa.
- padrón con procedencia y fecha real, conflicto de filas no resuelto = desconocido; excluir dato no vigente.
- cálculo reproducible, comparar con FEB y SUTEBA para distintos escalafones/antigüedades/bonificaciones/topes y fecha de nómina; sin valores inventados.
- recomendaciones visibles y favoritas por clave verificada, preferencias por cuenta.
- Android: PR #239 separado. Bandeja durable, push privado genérico, priorización de escuela favorita no amplía filtros sin consentimiento, no alertas vencidas; mantener canales actuales durante transición y validar dispositivo real antes de desactivarlos.

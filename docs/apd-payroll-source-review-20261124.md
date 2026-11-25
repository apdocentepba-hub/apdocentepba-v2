# Revisión de fuentes de haberes — noviembre 2026

## Fuentes y alcance
- Ministerio de Economía PBA: https://www.gba.gob.ar/node/50792 publica la escala Ley 10579 de noviembre 2026. Se descargaron y leyeron las dos páginas desde el vínculo oficial el 24/11/2026. SHA-256 del PDF: `dd190cbf770923694337679609c344923777c050c2d535026e1761659f95b6a2`. El workflow de recuperación verifica estos bytes antes de extraer texto, con reintentos acotados.
- Acuerdo provincial: https://www.gba.gob.ar/node/55114, 19/10/2026, 3% octubre y 3% noviembre sobre septiembre. No aplicar 6% indiscriminadamente a cada código o a un neto anterior.
- SUTEBA https://haberes.suteba.org.ar/app/ indica liquidación octubre 2026, no noviembre. Advierte topes de adicionales según cargo, módulos y horas cátedra y liquidación de asignaciones por docente. Verificar reglas exactas vigentes antes de implementar. Muestra adicional de antigüedad 21% en ejemplo, por lo que la escala legal del art. 33 no equivale por sí sola a la liquidación efectiva.
- FEB https://calculadora.feb.org.ar/ permite datos de nivel, escalafón, horas, antigüedad, desfavorabilidad y jubilación. No se confirmó API pública ni autorización de uso automatizado.
- Decreto municipal General Pueyrredon 2055/26: https://sibom.slyt.gba.gob.ar/bulletins/16036/contents/2464818. EXCLUIDO como fuente de importes provinciales, incluso si sus números coinciden con otros datos.

## Referencias verificadas en la escala provincial

| Página | Concepto | Valor publicado | Vigencia indicada |
| --- | --- | ---: | --- |
| 1 | Básico de preceptor | $370.675,00 | 01/11/2026 |
| 1 | Suma fija 455 | $150.393,00 | 01/11/2026 |
| 1 | Código 438 | $295.476,00 | 01/11/2026 |
| 1 | Códigos 653 y 663 | 114,15% | 01/08/2026 |
| 2 | Código 667 | 43,50% | 01/08/2026 |
| 2 | Compensación FONID / Conectividad | $32.551,00 | 01/11/2026 |

La escala rotula el básico de preceptor con índice 1.1 y también indica que se use como multiplicando para los restantes cargos. Antes de aplicar esa regla se requiere contrastar el índice y el básico de cada cargo con un caso liquidado del mismo período. El PDF aporta valores publicados por concepto. La base de cada porcentaje, las condiciones de aplicación y los topes combinados requieren evidencia adicional. El motor parcial no carga estos importes automáticamente.

## Padrón DGCyE
Recurso 3951210e-7e0e-4fed-bbf1-0183e704c9ae; fuente SHA256 36a3809e7173611030cdcd4bbd2d606eedcc7d366479ba3c4075c1523beeef7e; índice SHA256 49111bf8b0c37b4e983a2b05eefb6492c6804e78e29cfb8c497cc9aeaddf76c5. Run 45486897454: 18.697 filas útiles, 1.152 claves ambiguas excluidas. Códigos 0–5, ámbito separado, período Inicial 2026 o Nueva. Pendiente confirmar equivalencia oficial entre código del padrón y clase legal vigente, especialmente anexos. No convertir automáticamente ruralidad en suplemento.

## Condición de liberación
Vincular cargo a nomenclador inequívoco, período y fuentes; tratar adicional, base y topes como reglas explícitas. Contrastar liquidaciones con FEB/SUTEBA del mismo período y casos por múltiples cargos, módulos, antigüedad, desfavorabilidad, IPS/IOMA y descuentos. No mostrar neto completo cuando falte algún componente. Mantener cálculo marginal antes/después sin sumar netos de cargos independientes.

# APDocentePBA — avance verificable desde la reparación del comparador
Fecha de corte: 09/11/2026 · Responsable del estado: GitHub + CI verificables, no memoria conversacional.

## Publicado en alertasapd.com.ar (rama main)
| PR | Objetivo | Estado comprobado |
|---|---|---|
| [#260](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/260) | Comparación visible y legible en escritorio y móvil | Merge a main |
| [#261](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/261) | Tratar ofertas vencidas y explicar exclusiones | Merge a main |
| [#262](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/262) | Abrir comparación en ventana modal; evita ocultamiento bajo carrusel | Merge a main |
| [#263](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/263) | Corregir cierre ABC que adelantaba 3 horas (07:30 AR vs 04:30) | Merge a main |
| [#264](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/264) | Comparador orientado a decisión con 19 criterios, PID descriptivo y postulantes consultados | Merge a main; GitHub Pages OK |
| [#266](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/266) | Evitar superposición de Secretaría Escolar y Novedades; dejarlas en Repositorio | Merge a main; GitHub Pages OK y usuario corroboró la corrección visual |

PR #264 fue publicada por [GitHub Pages](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42549306359).
PR #266 fue publicada por [GitHub Pages](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42601020503).
Límite: la ejecución automatizada de Chromium del comparador no reemplaza validar una comparación completa con los datos reales de la sesión docente.

## Solo laboratorio — no publicado ni activo
La [PR #267](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/267) permanece **abierta y en borrador**. Es una línea de desarrollo única, sucesora de la #256 (cerrada sin integrar). Nada de lo siguiente se desplegó al Worker productivo ni se activó para usuarios:

- Detector determinista: cambios reales de campos de oferta y estados finales explícitos; nunca confunde ausencia o cambio de formato de fechas con cancelación.
- Capturas compactas: 14 campos permitidos, claves únicas y páginas completas, máximo dos capturas por distrito; no incluye CUIL, nombres de docentes, reemplazantes o correos.
- PostgreSQL 17 descartable: transacciones, deduplicación, RLS, restricciones, rollback, control de concurrencia y límite de almacenamiento. Bandeja privada audit_only, sin posibilidad de enviar avisos.
- Adaptador del origen ABC: verifica eco de q/estado/distrito/fl/orden, start, numFound, totalidad de páginas, identidades y dos lecturas consecutivas. Modo candidato, sin integración al Worker.
- Lector público voluntario: GET al endpoint oficial, solo 18 campos, HTTPS, respuestas acotadas por tiempo y bytes, sin credenciales y bandera OFF por defecto.
- Prueba de recuperación añadida el 09/11: respaldo real con pg_dump 17 del laboratorio; restauración a base descartable; alteración deliberada de esa copia; recuperación desde el mismo archivo; comparación de datos y permisos.

### Evidencia de pruebas
- CI más reciente de recuperación: [GitHub Actions #42622944134](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42622944134), 68/68 pruebas Node aprobadas, PostgreSQL 17 PASS (captura, auditoría, concurrencia y restauración) y sin modificación productiva.
- Log de restauración: APD_RESTORE_PG17_PASSED; fuente del laboratorio: 7 capturas, 4 eventos y backup de 20.179 bytes. **No es una copia ni restauración de Supabase real.**
- Inspección solo lectura de Supabase: 1.865 ofertas actuales; histórico congelado desde 18/09/2026 porque snapshot_writes=false. No se reactivó.
- Consulta pública real a ABC: Avellaneda sin estado filtrado muestra 9.355 registros; con filtro estado Publicada muestra 16. Dos lecturas completas de 16 ofertas (10+6) coincidieron bajo fl restringido a 18 campos y desempate iddetalle. No se almacenaron registros originales en el repo.
- Las ofertas productivas leídas figuraban PUBLICADA: no hay evidencia suficiente para acreditar anulaciones reales, ni dos rondas recientes de scanner oficial con semántica atómica.

## Pendientes y orden de trabajo
1. Probar capturas oficiales completas de más de un distrito con control de frescura, persistencia solo en staging y límite efectivo de consultas.
2. Ejecutar staging con roles equivalentes a Supabase y backup-restauración sobre una copia aislada, no sobre la base productiva.
3. Obtener evidencia explícita de cambios de estado oficial; no inferir cancelaciones por desaparición. Conciliar eventos con ofertas y vencimientos.
4. Diseñar y verificar autorización y límites de los futuros avisos. Cualquier envío, migración o Worker productivo requiere autorización expresa.
5. Verificar comparador con ofertas reales de sesión. Agregar domicilio de referencia y cálculo de cercanía bajo control de privacidad; **no implementado**.
6. Reducir el ancho del diseño de escritorio, pedido pero postergado expresamente hasta estabilizar la función principal.

### Regla de continuidad
En el próximo «seguí», leer esta bitácora y el HEAD actual de PR #267, avanzar con una prueba o cambio material verificable, registrar CI y mantener separados **publicado / solo laboratorio / pendiente**. No repetir promesas ni integrar al Worker sin autorización.

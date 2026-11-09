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
- Nueva validación de roles mínimos (09/11): propietario NOLOGIN sin BYPASSRLS y rol de ingesta sin acceso directo a tablas, con solo dos funciones permitidas. **Comprobado con dos clientes TCP autenticados independientemente y contraseñas temporales**, además de SET ROLE: escritura válida, lectura/borrado denegados, rechazo de falsificación y restauración aprobados.
- Nueva validación HTTP (09/11): PostgREST v14.18 local con JWT HS256 efímeros. **18 solicitudes HTTP reales**, incluida inspección OpenAPI: la API expone solo las dos funciones `submit_*` más la ruta raíz estándar. Tablas y funciones internas quedaron en `apd_change_lab`, esquema **no expuesto**; `apd_change_api` solo publica las entradas verificadas. Rechazo de acceso directo, roles/tokens inválidos, datos falsificados y duplicados confirmado; sin llamadas a Supabase productivo.
- **Nueva verificación puntual de estados ABC (09/11):** consulta real agrupada de Avellaneda: 515 `Anulada`, 1.866 `Desierta`, 6.448 `Designada`, 510 `Renunciada`, 16 `Publicada`, todos registros históricos del distrito. Búsqueda individual por `iddetalle` devolvió estados `Publicada` y `Anulada` para ejemplos concretos. El verificador exige coincidencia en dos GET, rechaza identidades ambiguas, distingue los estados y limita consultas por instancia.
- **Nueva correlación temporal en laboratorio (09/11):** `apd-abc-transition-correlator.mjs` vincula una captura compacta previa con una doble comprobación posterior para el mismo `D_<iddetalle>`. Valida huella, unicidad, estado anterior, alcance y ventana temporal de 48 horas; produce **solo un candidato de revisión**, sin identificadores de oferta en el resultado, sin persistencia y sin notificaciones. Probado con datos sintéticos, **no acredita una transición real observada en ABC**.

### Evidencia de pruebas
- CI de correlación de estado posterior: [GitHub Actions #42634378137](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42634378137), **92/92 pruebas Node**, PostgREST HTTP/JWT (18 solicitudes, OpenAPI), PostgreSQL 17 y recuperación PASS; sin cambios productivos.
- Log de restauración tras separar API y tablas internas: APD_RESTORE_PG17_PASSED; fuente de laboratorio: **13 capturas, 7 eventos y respaldo de 25.125 bytes**. **No es una copia ni restauración de Supabase real.**
- Inspección solo lectura de Supabase: 1.865 ofertas actuales; histórico congelado desde 18/09/2026 porque snapshot_writes=false. No se reactivó.
- Consulta pública real a ABC: Avellaneda sin estado filtrado muestra 9.355 registros; con filtro estado Publicada muestra 16. Dos lecturas completas de 16 ofertas (10+6) coincidieron bajo fl restringido a 18 campos y desempate iddetalle. No se almacenaron registros originales en el repo.
- La tabla productiva `current_published` solo contiene ofertas publicadas; la API histórica ABC sí expone registros `Anulada`, pero **no existe evidencia de una transición temporal concreta entre dos capturas oficiales** ni dos rondas atómicas del escáner. El verificador dirigido no está conectado al Worker.

## Pendientes y orden de trabajo
1. Probar capturas oficiales completas de más de un distrito con control de frescura, persistencia solo en staging y límite efectivo de consultas.
2. **Identificar y autorizar un staging Supabase realmente independiente.** El conector muestra dos proyectos, pero ninguno está confirmado como staging del detector. No reutilizar otro proyecto ni crear recursos sin aprobación. Luego probar Gateway/Auth, políticas efectivas y backup-restauración en ese entorno.
3. **Correlación temporal desarrollada y probada solo con datos sintéticos.** Falta demostrar un par real de observaciones oficiales de una misma oferta, con sello temporal verificable y procedencia atestada. No inferir bajas por desaparición ni enviar avisos desde el candidato.
4. Diseñar y verificar autorización y límites de los futuros avisos. Cualquier envío, migración o Worker productivo requiere autorización expresa.
5. Verificar comparador con ofertas reales de sesión. Agregar domicilio de referencia y cálculo de cercanía bajo control de privacidad; **no implementado**.
6. Reducir el ancho del diseño de escritorio, pedido pero postergado expresamente hasta estabilizar la función principal.

### Regla de continuidad
En el próximo «seguí», leer esta bitácora y el HEAD actual de PR #267, avanzar con una prueba o cambio material verificable, registrar CI y mantener separados **publicado / solo laboratorio / pendiente**. No repetir promesas ni integrar al Worker sin autorización.

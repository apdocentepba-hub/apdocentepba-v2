# APDocentePBA — Estado técnico y seguridad (2 de noviembre de 2026)

**Ámbito:** APDocentePBA exclusivamente. No confundir con VOLVÉ ni FLUYNOVA. Documento de estado: NO ejecuta nada, NO da autorización para despliegue, no contiene credenciales ni datos personales.

## Condición general: producción congelada

- Worker, frontend, tablas de producción, preferencias, alertas, pagos y usuarios **sin cambios realizados por el PR #233**.
- `main` continúa separada del PR #233 mientras exista riesgo de disparadores de publicación. GitHub Pages puede desplegar ante un push a `main`; NO fusionar solo porque CI quedó verde.
- No se posee aún evidencia de un backup real de producción restaurado satisfactoriamente. Los PR #230/#231 validaron un procedimiento en bases descartables, **no** la restauración de la base actual.
- No hay rulesets GitHub en el inventario de consulta anterior. El conector usado no permite configurar los rulesets; su ausencia impide afirmar protección obligatoria de `main`.

## Progreso por criterio de aceptación (estimación de hitos, NO porcentaje de sistema productivo actualizado)

| Componente | Etapas verificables completas | Preparación | Producción | Evidencia / principal pendiente |
| --- | ---: | ---: | --- | --- |
| Seguridad de automatizaciones GitHub | 4/5 | **80%** | PR #233 no fusionado | inventario; 10 workflows restringidos en rama; pruebas offline; CI verde. Falta aplicar políticas de rama y fusión segura |
| Privacidad de estado Telegram / WhatsApp | 3/4 | **75%** | código canónico existente, no modificado | ambos handlers exigen sesión; regresiones con sesión simulada; release heredado deshabilitado. Falta smoke autenticado con cuenta real autorizada |
| Cursor de ofertas ABC | 3/5 | **60%** | nuevo cursor no desplegado | #227 capacidad `id`; #228 doble recorrido La Matanza (161 IDs); #229 clave de historial. Faltan otros distritos y adaptación segura al Worker |
| Scanner PG17 transaccional | 4/6 | **67%** | no desplegado | #219–#226: transacciones, campos completos, roles PostgREST, concurrencia y verificación de identidad. Faltan integración real con Worker y migración controlada |
| Respaldo cifrado y recuperación | 3/6 | **50%** | sin artifact real verificado | #230/#231: un volcado consistente, inventario de todas las tablas, cifrado/restauración de laboratorio. Faltan primer artifact real, restauración de datos reales aislada y retención externa |
| Histórico/resumen diario | 2/6 | **33%** | desactivado | SQL y preflight de solo lectura documentados; faltan migración autorizada, capturas de días distintos, API y UI |
| Aplicación móvil Android/iOS | 0/3 | **0%** | no iniciada | backlog futuro después del escáner y de las alertas estables |

**Criterio de lectura:** estos porcentajes son fracciones de hitos definidos por componente, no medición de calidad, cobertura funcional, disponibilidad ni tiempo restante. Son independientes; NO promediarlos como un avance global. La función productiva actual puede continuar funcionando sin tener desplegada ninguna mejora nueva.

## Última intervención verificable — PR #233 (DRAFT)

1. Se revisaron 101 workflows mediante auditoría estática. Los indicios de riesgo son candidatos para inspección humana: un token o un endpoint `/deployments` usado con GET puede ser de solo lectura.
2. Se preparó una restricción manual para diez workflows con posibles escrituras o creación de versiones. El valor por defecto de confirmación es `NO` y las pruebas rechazan triggers automáticos de los flujos modificados.
3. El test heredado de mensajería fallaba porque el Worker ya NO contiene el patrón inseguro al que intentaba aplicar el parche. Se agregó regresión sobre los handlers canónicos reales con sesiones ficticias y se deshabilitó el job antiguo de promoción con `&& false`.
4. CI independiente `APD manual-release safety gate (offline only)` aprobó en el commit `949716964d0e8945a016f0883bad689d2099f000` (run `41529941816`). La ejecución simultánea del workflow heredado fue cancelada por concurrencia, por lo que NO se declara aprobada esa ejecución independiente.
5. **El PR sigue sin fusionar**. Su CI no garantiza la seguridad de todos los workflows del repositorio, ni reemplaza un ruleset. No ejecutar promoción de Worker, migraciones ni respaldo real desde estas pruebas.

## Acciones que se pueden hacer sin tocar producción

- Extender tests con fixtures sintéticos para el adaptador de cursor y staging PG17, sin llamadas de escritura a ABC/Supabase.
- Revisar los demás workflows de GitHub y clasificar si solamente leen o realmente escriben; mantener disparadores automáticos solo si son inocuos y necesarios.
- Preparar reglas de rama `main` de revisión, CI requerido y protección ante pushes directos; activar requiere permisos de configuración externos.
- Mantener estado de backups y plan de recuperación documentados, pero SIN cambiar contraseñas, SIN ejecutar migraciones y SIN sugerir que existe copia restaurable.

## Bloqueantes antes de cualquier despliegue futuro

1. Política verificable de deploy/manualidad y ausencia de jobs inseguros en `push`.
2. Revisión del diffs del Worker (rutas, 24 columnas, permisos, alertas, suscripciones, pagos) y compatibilidad con el runtime.
3. Backup real recuperable verificado en instancia aislada, o plan de reversión equivalente expresamente aceptado.
4. Pruebas de sesión con autorización y datos no personales; habilitación progresiva con indicadores y posibilidad de rollback.
5. Autorización explícita, independiente del permiso para desarrollar o ejecutar CI.

**Próxima decisión técnica:** mejorar controles de los flujos de CI que quedan fuera de #233; no fusionar todavía.

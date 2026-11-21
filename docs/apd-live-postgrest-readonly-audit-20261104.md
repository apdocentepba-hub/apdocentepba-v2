# APDocentePBA — comprobación del contrato PostgREST en la BD real (04/11/2026)

**Ejecución:** inspección de metadatos y consultas agregadas de solo lectura en el proyecto Supabase de APDocentePBA. Ninguna escritura, migración, función, usuario, preferencia, plan o correo modificado.

## Verificaciones efectivas

| Requisito del Worker candidato | Resultado |
|---|---|
| `public.user_offer_state` existe y contiene `user_id`, `offer_id`, `offer_payload`, `is_active`, `first_seen_at`, `last_seen_at`, `updated_at` | Confirmado |
| `user_offer_state_user_offer_unique` sobre `(user_id, offer_id)` para `on_conflict=user_id,offer_id` | Confirmado |
| Tipos y defaults: `offer_payload jsonb`, `first_seen_at timestamptz DEFAULT now()`, `is_active boolean DEFAULT true` | Confirmado |
| Índice `(user_id,is_active)` para lectura de activos | Confirmado |
| `public.user_preferences`, `public.user_subscriptions`, `public.subscription_plans`, `public.pending_notifications`, `public.notification_delivery_logs` presentes | Confirmado |
| `pending_notifications`: UNIQUE `(alert_key,user_id)` y UNIQUE `(alert_key,channel)` | Confirmado; revisar comportamiento entre canales si se amplía ese módulo |
| `notification_delivery_logs`: UNIQUE parcial sobre `dedupe_key` no nulo | Confirmado |
| RLS en tablas sensibles nombradas y ausencia de políticas permisivas directas | Confirmado (todas activadas; cero políticas en las tablas revisadas) |
| Supabase PostgREST upsert de arrays en lotes de 100 **con datos reales** | **No probado:** requeriría escrituras |
| Autenticación real de cuenta, historial, plan, carrusel y correo al destinatario | **No probado** |

La inspección de suscripciones demuestra que **no basta el texto `status='active'`**: hay registros con períodos o pruebas finalizados cuyo estado almacenado sigue siendo `active`. `elegirSuscripcionVigente` y `isPlanActivo` del Worker sí comparan las fechas límite; no cambiar planes ni forzar reactivaciones basándose solo en el estado SQL. Los conteos por usuario y datos personales se mantienen fuera del repositorio público.

## Implicación técnica

La restricción única exigida por `POST /rest/v1/user_offer_state?on_conflict=user_id,offer_id` existe realmente, y la estructura acepta los campos del candidato. El formato de lotes y la semántica de upsert son consistentes con la documentación de PostgREST, pero **esto no acredita que el lote se haya escrito**; el test previo de 105 → 2 solicitudes solo fue sintético.

- Documentación PostgREST: https://docs.postgrest.org/en/stable/references/api/tables_views.html
- Documentación Supabase: https://supabase.com/docs/reference/javascript/upsert

## Release gate abierto

El último artefacto del Worker que incluye las correcciones del correo y validación de cierres tiene SHA-256 `c4bc191256bb465244bf0fcd69838add30a13d5f48ba2fc8bccf337e3225bba8` y está guardado en GitHub Actions `41913319145`. **No está desplegado**. El intento posterior de preparar una nueva subida quedó bloqueado por el control de seguridad de la herramienta y no debe considerarse ejecutado.

Sigue pendiente:
1. Obtener una vía de despliegue 0 % expresamente permitida y comprobar que no haya tráfico de usuarios en ella.
2. Validar login, plan, preferencias y alertas de una cuenta real en el preview de esa versión exacta.
3. Ensayar PostgREST en entorno descartable / con autorización de escritura y confirmar duplicados, `first_seen_at`, desactivación y rollback.
4. Habilitar tráfico únicamente con autorización independiente y observabilidad de errores.

**No se hicieron escrituras ni cambios en producción durante esta inspección.**

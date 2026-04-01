# Auditoría rápida de infraestructura - 2026-04-01

## Cloudflare confirmado

### Worker productivo
- Nombre confirmado: `ancient-wildflower-cd37`
- URL visible: `https://ancient-wildflower-cd37.apdocentepba.workers.dev`

### Variables y secrets visibles en dashboard
Confirmadas como presentes:
- `BREVO_API_KEY`
- `GOOGLE_CLIENT_ID`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_CURRENCY_ID`
- `MERCADOPAGO_FAILURE_URL`
- `MERCADOPAGO_PENDING_URL`
- `MERCADOPAGO_STATEMENT_DESCRIPTOR`
- `MERCADOPAGO_SUCCESS_URL`
- `MERCADOPAGO_WEBHOOK_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_ALERTA`
- `WHATSAPP_TEMPLATE_LANG`
- `WORKER_URL`

### Trigger events confirmados
Cron presentes:
- `0 01 * * *`
- `0 21 * * *`
- `0 17 * * *`

### Observability
- Workers Logs: enabled
- Workers Traces: disabled

### Pendiente de confirmar todavía
- Binding `EMAIL_SWEEP_STATE` en pestaña Bindings

## Supabase confirmado

### Tablas núcleo visibles
- `users`
- `user_preferences`
- `user_subscriptions`
- `subscription_plans`
- `sessions`
- `pending_notifications`
- `notification_delivery_logs`
- `user_offer_state`

### Tablas Mercado Pago visibles
- `mercadopago_checkout_sessions`
- `mercadopago_webhook_events`

### Tablas histórico / provincia visibles
- `apd_global_scan_state`
- `apd_ofertas_global_snapshots`
- `apd_ofertas_historial`
- `apd_postulantes_historial`
- `apd_current`
- `apd_events`
- `apd_postulation_metrics`

### Catálogos visibles
- `catalogo_cargos_areas`
- `catalogo_distritos`

### Otras tablas visibles
- `alert_notifications`
- `alert_history`
- `errores_sistema`
- `system_logs`
- `worker_runs`

## Conclusión
La base y el Worker productivo existen y la infraestructura mínima necesaria está montada. Ya se puede seguir con el refactor del backend dentro de GitHub sin asumir que faltan tablas o variables críticas.

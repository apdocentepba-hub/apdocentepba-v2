# Inventario runtime del Worker

## Variables / secrets confirmados en Cloudflare
### Núcleo
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `BREVO_API_KEY`
- `WORKER_URL`

### Mercado Pago
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_CURRENCY_ID`
- `MERCADOPAGO_FAILURE_URL`
- `MERCADOPAGO_PENDING_URL`
- `MERCADOPAGO_STATEMENT_DESCRIPTOR`
- `MERCADOPAGO_SUCCESS_URL`
- `MERCADOPAGO_WEBHOOK_URL`

### WhatsApp
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_ALERTA`
- `WHATSAPP_TEMPLATE_LANG`

## Binding confirmado
- `EMAIL_SWEEP_STATE` → KV namespace

## Trigger events confirmados
- `0 01 * * *`
- `0 17 * * *`
- `0 21 * * *`

## Nota operativa
Este inventario sirve para tres cosas:
1. no depender del dashboard para recordar configuración
2. preparar deploy reproducible desde GitHub en el futuro
3. saber qué parte sigue viviendo fuera del repo aunque el código ya esté versionado

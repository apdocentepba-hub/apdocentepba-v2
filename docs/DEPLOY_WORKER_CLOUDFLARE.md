# Deploy del Worker desde GitHub a Cloudflare

## Qué quedó hecho en GitHub
- `worker.js` quedó versionado en el repo.
- `wrangler.toml` quedó agregado como base de configuración.
- Todo este trabajo está en la rama `refactor/worker-base-20260401`.

## Qué no cambia todavía
Nada cambia en producción hasta que vos hagas deploy en Cloudflare.

## Qué tenés que hacer vos en Cloudflare

### 1. Confirmar el nombre del Worker
En Cloudflare Workers verificá que el nombre del Worker productivo sea:
- `ancient-wildflower-cd37`

Si el nombre real fuera otro, corregí `name` en `wrangler.toml` antes de desplegar.

### 2. Cargar variables y secrets
En Cloudflare tenés que revisar y cargar estos valores usados por `worker.js`:

#### Secrets / vars principales
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `BREVO_API_KEY`

#### Mercado Pago
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_URL`
- `MERCADOPAGO_CHECKOUT_FALLBACK_URL`
- `MERCADOPAGO_CURRENCY_ID`
- `MERCADOPAGO_STATEMENT_DESCRIPTOR`
- `MERCADOPAGO_SUCCESS_URL`
- `MERCADOPAGO_PENDING_URL`
- `MERCADOPAGO_FAILURE_URL`
- `MERCADOPAGO_SUBSCRIPTION_PERIOD_DAYS`

#### WhatsApp
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_TEMPLATE_ALERTA`
- `WHATSAPP_TEMPLATE_LANG`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_ALERT_SWEEP_MAX_USERS`
- `WHATSAPP_ALERTS_PER_USER_MAX`
- `WHATSAPP_ALERT_LOG_LOOKBACK`
- `WHATSAPP_TEMPLATE_BODY_PARAMS_JSON`

### 3. Revisar bindings
Este Worker usa por lo menos un binding tipo KV:
- `EMAIL_SWEEP_STATE`

Si hoy eso existe solo en el dashboard, dejalo igual en Cloudflare. Después se puede reflejar en `wrangler.toml`.

### 4. Revisar cron triggers
El Worker tiene bloque `scheduled`, así que en Cloudflare revisá si ya existen cron triggers. Si ya están bien, no los toques todavía.

## Deploy seguro
### Opción más segura
1. Probá primero en un Worker de staging.
2. Si responde bien, recién reemplazás el productivo.

### Opción rápida
1. Abrís la rama.
2. Verificás `wrangler.toml`.
3. Hacés deploy manual del mismo `worker.js`.

## Qué NO hacer
- No borrar el Worker actual del dashboard antes de probar.
- No tocar `main` directamente.
- No cambiar secrets sin anotar cuáles eran los anteriores.

# Worker staging seguro

## Objetivo
Levantar una copia del Worker para pruebas sin tocar producción.

## Nombre sugerido
- `ancient-wildflower-cd37-staging`

## Archivo base sugerido
- `prototypes/wrangler.staging.toml.example`

## Regla principal
El staging NO debe compartir runtime sensible con producción.

## Qué conviene aislar
### 1. Nombre del Worker
Debe ser distinto al productivo.

### 2. KV
No usar el mismo `EMAIL_SWEEP_STATE` de producción.
Crear otro namespace para staging.

### 3. Cron triggers
No cargarlos al principio.
Staging no debe ejecutar barridos automáticos.

### 4. Secrets
Idealmente usar secrets propios de staging.
Si temporalmente se reutiliza alguno, hacerlo sabiendo el riesgo.

### 5. Canales sensibles
Hasta no validar el Worker, staging no debería:
- enviar emails reales
- enviar WhatsApp reales
- generar efectos de pagos/webhooks reales

## Variables que más riesgo tienen si se comparten
- `BREVO_API_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `MERCADOPAGO_ACCESS_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`

## Estrategia mínima segura
### Opción buena
- mismo código
- otro Worker
- otro KV
- sin cron
- secrets controlados

### Opción rápida pero con cuidado
- mismo código
- otro Worker
- sin cron
- no probar envíos reales

## Qué probar primero
1. `/api/test-db`
2. `/api/planes`
3. `/api/whatsapp/health`
4. `/api/provincia/backfill-status`
5. smoke test manual

## Cuándo pasar al reemplazo del router
Solo cuando staging responda bien y no aparezcan errores 500 nuevos.

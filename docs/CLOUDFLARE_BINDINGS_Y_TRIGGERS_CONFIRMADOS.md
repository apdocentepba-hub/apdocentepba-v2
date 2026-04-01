# Cloudflare confirmado desde dashboard

## Worker
- Nombre: `ancient-wildflower-cd37`
- URL: `https://ancient-wildflower-cd37.apdocentepba.workers.dev`

## Binding confirmado
### KV Namespace
- Binding usado por el Worker: `EMAIL_SWEEP_STATE`
- Tipo: `KV namespace`

## Trigger events confirmados
- `0 01 * * *`
- `0 21 * * *`
- `0 17 * * *`

## Observación importante
El backend ya tiene confirmados:
- secrets principales
- variables de Supabase
- variables de Mercado Pago
- variables de WhatsApp
- binding KV para cursor de barrido de emails
- cron triggers activos

Con esto ya no queda una dependencia crítica oculta del dashboard para entender cómo está montado el Worker actual.

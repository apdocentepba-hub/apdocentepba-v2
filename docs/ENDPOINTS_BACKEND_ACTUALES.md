# Endpoints actuales del backend

## Rutas base / utilidades
- `GET /test-mail`
- `GET /test-email-sweep`
- `GET /test-digest`
- `GET /api/test-db`

## Auth
- `POST /api/login`
- `POST /api/register`
- `POST /api/google-auth`

## Planes y preferencias
- `GET /api/planes`
- `GET /api/mi-plan`
- `POST /api/guardar-preferencias`

## Alertas
- `GET /api/mis-alertas`
- `GET /api/postulantes-resumen`
- `POST /api/sync-offers`

## Histórico usuario
- `POST /api/capturar-historico-apd`
- `GET /api/historico-resumen`

## Provincia
- `GET /api/provincia/backfill-status`
- `POST /api/provincia/backfill-step`
- `POST /api/provincia/backfill-reset`
- `POST /api/provincia/backfill-kick`
- `GET /api/provincia/resumen`
- `GET /api/provincia/insights`

## Mercado Pago
- `POST /api/mercadopago/create-checkout-link`
- `POST /api/mercadopago/webhook`

## WhatsApp
- `GET /api/whatsapp/health`
- `POST /api/whatsapp/test-send`

## Catálogos
- `GET /api/importar-catalogo-cargos`

## Admin
- `GET /api/admin/me`
- `GET /api/admin/resumen`
- `GET /api/admin/usuarios`
- `GET /api/admin/sesiones`
- `GET /api/admin/alertas`

## Tarea programada
### `scheduled()`
Ejecuta internamente:
- backfill provincial
- sweep de WhatsApp
- sweep de email
- digest de emails pendientes

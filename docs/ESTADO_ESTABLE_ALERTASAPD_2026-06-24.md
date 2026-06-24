# Estado estable de alertasapd.com.ar — 2026-06-24

> Documento de referencia para evitar romper producción al hacer cambios.

## Estado productivo asumido

La producción actual se considera centrada en Cloudflare Worker:

- Dominio público: `alertasapd.com.ar`
- Worker productivo: `ancient-wildflower-cd37`
- Archivo operativo indicado por Martín como versión estable actual: `Update worker_cloudflare 0626.js`
- Archivo histórico/convencional mencionado en conversaciones: `worker_cloudflare.js`

## Arquitectura viva

```text
Usuario
  ↓
alertasapd.com.ar
  ↓
Cloudflare Worker ancient-wildflower-cd37
  ├─ Web / panel / rutas API
  ├─ Registro, login, preferencias, planes
  ├─ Alertas APD y compatibilidad PID
  ├─ Telegram webhook
  ├─ WhatsApp webhook Meta
  ├─ MercadoPago checkout/webhook
  └─ Envío de mails por Brevo
       ↓
Supabase
  ├─ users
  ├─ user_preferences
  ├─ user_subscriptions
  ├─ subscription_plans
  ├─ user_offer_state
  ├─ user_listados
  ├─ notification_delivery_logs
  ├─ mercadopago_checkout_sessions
  ├─ apd_ofertas_historial / snapshots
  └─ tablas auxiliares PID/listados/catálogos
```

## Componentes principales

| Componente | Rol |
|---|---|
| Cloudflare Worker | Backend principal, web/panel, APIs, alertas, canales, pagos y mail. |
| Supabase | Base de datos real: usuarios, preferencias, planes, suscripciones, listados, alertas, logs y pagos. |
| Cloudflare KV `EMAIL_SWEEP_STATE` | Estado liviano de canales: Telegram, WhatsApp, cursores y deduplicación. |
| GitHub | Código, respaldo, historial y documentación. No es la producción viva por sí mismo. |
| Brevo | Envío real de emails transaccionales/digest. |
| Meta WhatsApp Cloud API | Recepción y respuesta de mensajes WhatsApp. |
| Telegram Bot API | Vinculación y consultas por Telegram. |
| MercadoPago | Checkout, pagos y webhooks de suscripción. |
| ABC/APD | Fuente externa pública de actos, postulantes, cargos/listados. |

## Rutas críticas del Worker

No modificar sin prueba previa:

- `/api/profile`
- `/api/listados`
- `/api/eligibility`
- `/api/mis-alertas`
- `/api/guardar-preferencias`
- `/api/planes`
- `/api/mi-plan`
- `/api/sync-offers`
- `/api/whatsapp/status`
- `/api/whatsapp/webhook`
- `/api/mercadopago/create-checkout-link`
- `/api/mercadopago/webhook`

## Estado de canales

### Telegram

- Usa webhook en el Worker.
- El estado se guarda en KV.
- Binding activo esperado: `EMAIL_SWEEP_STATE`.
- Claves relevantes:
  - `telegram:user:USER_ID`
  - `telegram:chat:CHAT_ID`

### WhatsApp

- Usa Meta WhatsApp Cloud API.
- El estado se guarda en KV.
- Claves relevantes:
  - `whatsapp:user:USER_ID`
- Punto débil actual conocido: WhatsApp manual puede leer `user_offer_state` guardado y devolver alertas viejas si esa tabla quedó desactualizada.

## Reglas de protección

Antes de tocar producción:

1. No editar directo el Worker productivo desde Cloudflare salvo emergencia.
2. No tocar DNS.
3. No tocar GitHub Pages.
4. No borrar ni alterar tablas de Supabase sin backup y SQL reversible.
5. No cambiar secrets productivos sin registrar el motivo.
6. No compartir el mismo KV productivo en staging salvo decisión explícita.
7. No habilitar cron en staging al principio.
8. No probar envíos reales de WhatsApp, email o pagos desde staging sin autorización explícita.

## Archivos que requieren verificación

En el repositorio, `wrangler.toml` puede no reflejar el archivo exacto actualmente pegado/desplegado en Cloudflare. Antes de cualquier deploy hay que verificar:

- Qué archivo exacto está desplegado en Cloudflare.
- Qué archivo apunta `wrangler.toml`.
- Qué archivo contiene la versión estable `Update worker_cloudflare 0626.js`.
- Si corresponde copiar o renombrar esa versión estable a un nombre sin espacios.

## Frase operativa

`Update worker_cloudflare 0626.js` queda tratado como versión estable indicada por el usuario. No se modifica directamente. Toda mejora debe hacerse en rama/copia y probarse en staging antes de pensar en producción.

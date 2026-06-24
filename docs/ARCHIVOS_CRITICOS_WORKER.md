# Archivos críticos del Worker

Documento para ordenar qué archivo representa qué cosa antes de modificar o desplegar.

## Situación detectada

El sistema productivo usa el Worker de Cloudflare `ancient-wildflower-cd37`.

El archivo estable actual indicado por Martín es:

```text
Update worker_cloudflare 0626.js
```

Sin embargo, en el repositorio existe `wrangler.toml` con:

```toml
name = "ancient-wildflower-cd37"
main = "worker_email_queue_hotfix.js"
compatibility_date = "2026-04-01"
workers_dev = true
keep_vars = true
```

Eso significa que antes de cualquier deploy hay que confirmar si `wrangler.toml` representa la producción real actual o quedó viejo respecto del archivo que fue pegado/subido manualmente a Cloudflare.

## Archivos encontrados o mencionados

| Archivo | Estado / interpretación |
|---|---|
| `Update worker_cloudflare 0626.js` | Versión estable actual indicada por Martín. No modificar directo. |
| `worker_cloudflare.js` | Nombre histórico/convencional del Worker grande. Verificar si existe y si coincide con producción. |
| `worker_email_queue_hotfix.js` | Archivo apuntado por `wrangler.toml`. Requiere verificación antes de deploy. |
| `worker_whatsapp_link_hotfix.js` | Hotfix que importa `worker_email_queue_hotfix.js`. Puede ser una capa adicional, no necesariamente producción actual. |
| `worker_telegram_hotfix.js` | Hotfix relacionado con Telegram. No tocar sin revisar dependencias. |
| `worker_subscription_state_hotfix.js` | Hotfix relacionado con estado de suscripciones. No tocar sin revisar pagos/planes. |
| `worker_recurring_plan_change_hotfix.js` | Hotfix relacionado con cambio de planes recurrentes. Riesgo alto por pagos. |
| `worker_plan_price_policy_hotfix.js` | Hotfix de política/precios de planes. Riesgo alto por MercadoPago/planes. |
| `profile_listados_api.js` | Módulo vinculado a perfil/listados/PID. Riesgo alto por compatibilidad y datos docentes. |

## Acción segura recomendada

Antes de modificar código:

1. Exportar o copiar desde Cloudflare el Worker actualmente desplegado.
2. Compararlo contra `Update worker_cloudflare 0626.js`.
3. Si coinciden, crear copia sin espacios:

```text
backups/worker_cloudflare_ESTABLE_2026-06-24.js
```

4. Crear archivo de trabajo:

```text
worker_cloudflare_DEV.js
```

5. Crear o ajustar staging, no producción.

## No hacer todavía

- No cambiar `main` en `wrangler.toml`.
- No renombrar archivos productivos.
- No borrar hotfixes viejos.
- No hacer deploy.
- No limpiar archivos sin saber si alguno se usa como capa o respaldo.

## Objetivo de orden futuro

Llegar a una estructura clara:

```text
/
├── worker_cloudflare.js                  # archivo principal estable de trabajo
├── wrangler.toml                         # producción, sólo cuando esté verificado
├── docs/
│   ├── ESTADO_ESTABLE_ALERTASAPD_2026-06-24.md
│   ├── PROTOCOLO_MODIFICACIONES_SEGURAS.md
│   ├── STAGING_WORKER_SEGURO.md
│   └── ARCHIVOS_CRITICOS_WORKER.md
└── backups/
    └── worker_cloudflare_ESTABLE_2026-06-24.js
```

Pero esa limpieza debe hacerse después de confirmar qué archivo está efectivamente corriendo en Cloudflare.

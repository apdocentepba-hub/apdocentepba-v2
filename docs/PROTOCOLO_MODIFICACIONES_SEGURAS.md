# Protocolo de modificaciones seguras

Este protocolo sirve para modificar `alertasapd.com.ar` sin romper producción.

## Principio general

Producción no se toca directo. Primero se trabaja en rama, copia o Worker de staging.

## Niveles de riesgo

### Riesgo bajo

Se puede hacer en una rama sin afectar producción:

- Crear documentación.
- Crear checklist.
- Crear archivos de análisis.
- Preparar parches sin desplegar.
- Comparar código.

### Riesgo medio

Requiere revisión antes de mergear o desplegar:

- Cambiar HTML/CSS del panel.
- Ajustar textos visibles.
- Agregar validaciones no destructivas.
- Crear endpoints nuevos sin tocar rutas existentes.
- Refactorizar funciones auxiliares sin cambiar comportamiento.

### Riesgo alto

Consultar por chat antes de avanzar:

- Cambiar `wrangler.toml`.
- Cambiar `main` del Worker.
- Cambiar rutas críticas existentes.
- Tocar login, registro, perfil o preferencias.
- Tocar cálculo de alertas o compatibilidad PID.
- Tocar Telegram, WhatsApp, Brevo o MercadoPago.
- Cambiar secrets, bindings o KV.
- Ejecutar deploy a Cloudflare.
- Modificar Supabase con `UPDATE`, `DELETE`, `ALTER`, `DROP` o migraciones.
- Activar cron triggers.

## Flujo obligatorio para cambios

```text
1. Crear rama nueva desde main.
2. Hacer cambio mínimo.
3. Documentar qué se tocó.
4. Probar local/staging si corresponde.
5. Ejecutar checklist de smoke test.
6. Recién después evaluar merge/deploy.
```

## Convención de ramas

```text
organizacion-segura-AAAA-MM-DD
fix-nombre-corto
feature-nombre-corto
hotfix-nombre-corto
```

Ejemplos:

```text
organizacion-segura-2026-06-24
fix-whatsapp-alertas-live
feature-panel-preferencias-turno
hotfix-telegram-kv-state
```

## Convención de archivos de Worker

Evitar nombres con espacios.

Preferidos:

```text
worker_cloudflare_ESTABLE_2026-06-24.js
worker_cloudflare_DEV_2026-06-24.js
worker_cloudflare_STAGING.js
```

Evitar:

```text
Update worker_cloudflare 0626.js
worker nuevo final ahora si.js
copia ultimo ultimo.js
```

## Checklist antes de deploy

Probar como mínimo:

- Home/panel carga.
- Login funciona.
- Registro funciona.
- `/api/profile` responde.
- `/api/listados` responde.
- `/api/eligibility` responde.
- `/api/mis-alertas` responde.
- `/api/guardar-preferencias` guarda y devuelve estado correcto.
- `/api/planes` responde.
- `/api/mi-plan` responde.
- Telegram no perdió vinculación.
- WhatsApp no devuelve alertas viejas.
- MercadoPago no genera pagos erróneos.
- Brevo no dispara envíos no deseados.

## Rollback mínimo

Antes de deploy debe existir:

- archivo estable anterior identificado;
- commit anterior identificado;
- nota de qué se cambió;
- forma de volver al Worker anterior;
- confirmación de que no se alteraron datos productivos.

## Regla especial pedida por Martín

Antes de modificar algo importante o con riesgo real, consultar por chat y explicar:

1. qué se va a tocar;
2. por qué se toca;
3. qué puede romper;
4. cómo se vuelve atrás.

No alcanza con que el conector pida permiso técnico. La consulta debe quedar escrita en el chat.

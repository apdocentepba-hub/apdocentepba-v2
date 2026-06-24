# Billing: renovación automática y plan anual — 2026-06-24

## Alcance de esta rama

Rama: `feature-billing-autorenew-safe`

Esta rama prepara el frente de pagos sin tocar producción:

- No modifica Cloudflare Worker productivo.
- No modifica `wrangler.toml`.
- No ejecuta deploy.
- No modifica Supabase.
- No modifica MercadoPago.
- No crea usuario de prueba.

## Renovación automática mensual

### Estado funcional esperado

La renovación automática debe estar **desactivada por defecto**.

El usuario sólo queda con renovación automática si:

1. tiene un plan pago activo;
2. toca voluntariamente el botón `Activar débito automático mensual`;
3. se abre MercadoPago;
4. completa la configuración de la suscripción/preapproval en MercadoPago;
5. el backend guarda el `mercadopago_preapproval_id` en `user_subscriptions`.

Si el usuario no toca el botón, el sistema debe seguir en modalidad manual.

### Frontend preparado

Archivo existente:

```text
plan_autorenew_patch.js
```

Ese archivo agrega UI en `Mi plan` y llama a:

```text
POST /api/subscription/enable-auto-renew
POST /api/subscription/cancel
```

En esta rama se modificó:

```text
channel_persistence_hotfix.js
```

para cargar dinámicamente:

```text
plan_autorenew_patch.js?v=1
```

sin editar `index.html`.

## Endpoints esperados

El archivo `worker_autorenew_optin_hotfix.js` ya contiene lógica esperada para:

```text
GET  /api/mi-plan
POST /api/subscription/enable-auto-renew
POST /api/subscription/cancel
```

Pero antes de desplegar hay que confirmar si ese hotfix está efectivamente integrado en el Worker productivo o sólo existe como archivo suelto en GitHub.

## Seguridad

Antes de publicar:

1. confirmar qué archivo exacto corre hoy en Cloudflare;
2. confirmar si `/api/subscription/enable-auto-renew` responde;
3. confirmar que `/api/mi-plan` devuelve `actions.can_enable_auto_renew`;
4. confirmar que el botón sólo aparece en planes pagos activos;
5. confirmar que usuarios en prueba gratis no ven activación real;
6. confirmar que MercadoPago abre una preapproval y no un checkout simple;
7. confirmar que cancelar renovación no cancela el acceso ya pagado, sólo el próximo cobro.

## Plan anual

Una persona pidió poder pagar todo el año de una vez.

### Recomendación comercial inicial

Como los planes mensuales actuales referidos son:

```text
PLUS:     $1.000 / mes
PREMIUM:  $2.000 / mes
INSIGNE:  $3.000 / mes
```

conviene ofrecer anual con 2 meses bonificados:

```text
PLUS_ANUAL:     $10.000 / año
PREMIUM_ANUAL:  $20.000 / año
INSIGNE_ANUAL:  $30.000 / año
```

Eso equivale a pagar 10 meses y usar 12.

### Alternativa conservadora

Si se quiere menos descuento:

```text
PLUS_ANUAL:     $11.000 / año
PREMIUM_ANUAL:  $22.000 / año
INSIGNE_ANUAL:  $33.000 / año
```

Equivale a 1 mes bonificado.

### Recomendación práctica

Para vender más fácil, usar 2 meses bonificados:

```text
Plan anual = pagás 10 meses y usás 12.
```

## Implementación técnica del plan anual

No conviene mezclar el plan anual con renovación automática mensual.

El plan anual debería ser un **pago único**, no una preapproval mensual.

### Opción de datos

Agregar filas nuevas en `subscription_plans`:

```text
PLUS_ANUAL
PREMIUM_ANUAL
INSIGNE_ANUAL
```

con:

```text
billing_interval = yearly
billing_months = 12
price_ars = 10000 / 20000 / 30000
public_visible = true
```

Si la tabla no tiene esas columnas, se puede empezar usando código de plan y `price_ars`, y que el Worker detecte `_ANUAL` para calcular vencimiento a 365 días.

### Cambio de Worker necesario

Cuando MercadoPago confirme pago anual:

```text
current_period_ends_at = fecha_pago + 365 días
billing_mode = one_time_yearly
status = active
plan_code = PLUS_ANUAL / PREMIUM_ANUAL / INSIGNE_ANUAL
```

### UI esperada

En `Opciones de plan` mostrar:

```text
Mensual
Anual — 2 meses bonificados
```

El anual debería decir:

```text
Pago único anual. No se renueva automáticamente salvo que más adelante se active una opción anual recurrente.
```

## Decisión pendiente antes de tocar producción

Antes de implementar el plan anual real hay que decidir:

1. precios finales;
2. si se muestran 3 planes anuales o sólo uno;
3. si el anual será pago único o renovación anual automática;
4. si se crean códigos nuevos (`PLUS_ANUAL`) o se usa el mismo plan con `billing_interval`;
5. si se actualiza Supabase manualmente o mediante migración SQL versionada.

## Copy sugerido para responder al usuario

```text
Sí, estamos habilitando planes anuales. La idea es que puedas pagar todo el año de una vez con descuento, sin depender del pago mensual. El plan anual tendría 12 meses de acceso y la opción recomendada es pagar 10 meses y usar 12.
```

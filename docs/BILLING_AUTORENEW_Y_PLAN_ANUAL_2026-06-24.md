# Billing: renovación automática y plan anual — 2026-06-24

## Alcance de esta rama

Rama: `feature-billing-autorenew-safe`

Esta rama prepara el frente de pagos sin tocar producción:

- No modifica Cloudflare Worker productivo.
- No modifica `wrangler.toml`.
- No ejecuta deploy.
- No aplica cambios en Supabase.
- No modifica configuración real de MercadoPago.
- No crea usuario de prueba.

## Renovación automática mensual

La renovación automática mensual queda **desactivada por defecto**.

El usuario sólo queda con renovación automática si:

1. tiene un plan pago activo;
2. toca voluntariamente el botón `Activar débito automático mensual`;
3. se abre MercadoPago;
4. completa la configuración de la suscripción/preapproval en MercadoPago;
5. el backend guarda el `mercadopago_preapproval_id` en `user_subscriptions`.

Si el usuario no toca el botón, el sistema sigue en modalidad manual.

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

## Plan anual aprobado comercialmente

Precios aceptados:

```text
PLUS_ANUAL:     $10.000 / año
PREMIUM_ANUAL:  $20.000 / año
INSIGNE_ANUAL:  $30.000 / año
```

Política comercial:

```text
Plan anual = pagás 10 meses y usás 12.
```

El plan anual es **pago único anual**, no débito mensual automático.

## Política mensual activo → anual

Si una persona tiene un plan mensual activo y pasa a un plan anual:

1. Se calcula cuánto tiempo no usado queda del mes actual.
2. Ese tiempo se convierte en crédito proporcional.
3. Ese crédito se descuenta del valor anual.
4. La persona paga sólo la diferencia.
5. No se devuelve dinero en efectivo.
6. El plan anual arranca cuando MercadoPago acredita el pago.
7. El vencimiento anual queda a 365 días desde la acreditación.

Ejemplo conceptual:

```text
Plan anual elegido: $20.000
Crédito proporcional mensual no usado: $600
Monto a pagar ahora: $19.400
```

El crédito es comercial y técnico: sólo se usa como descuento para pasar al anual.

## Política de no reembolso

Leyenda obligatoria:

```text
No se realizan reembolsos en dinero una vez acreditado el pago. Si pasás de un plan mensual activo a un plan anual, el tiempo no usado del ciclo mensual vigente se aplica como crédito proporcional sobre el valor del plan anual.
```

Esta leyenda debe mostrarse en:

- tarjeta del plan anual;
- mensaje previo a abrir MercadoPago;
- respuesta del checkout anual;
- términos/política de pagos si existe una página legal separada.

## Si tenía débito automático mensual

Si el usuario tiene mensual con renovación automática activa y compra anual:

1. Se permite comprar anual.
2. El checkout anual se genera como pago único.
3. Al acreditarse el pago anual, el Worker debe intentar cancelar el preapproval mensual de MercadoPago.
4. En Supabase, la suscripción debe quedar con:

```text
mercadopago_preapproval_id = null
billing_mode = one_time_yearly
plan_code = PLUS_ANUAL / PREMIUM_ANUAL / INSIGNE_ANUAL
current_period_ends_at = fecha_pago + 365 días
```

Si MercadoPago no permite cancelar el preapproval automáticamente, debe quedar registrado en `provider_payload.preapproval_cancelled = false` para revisión manual.

## Archivos preparados en esta rama

### Worker anual

```text
worker_annual_plan_hotfix.js
```

Agrega:

```text
GET  /api/planes
GET  /api/mi-plan
POST /api/mercadopago/create-checkout-link
POST /api/mercadopago/webhook
```

Funciones principales:

- agrega los planes anuales al catálogo;
- genera checkout MercadoPago de pago único anual;
- calcula crédito proporcional si el usuario tenía mensual activo;
- bloquea downgrade desde anual activo a anual menor;
- procesa webhook de pago anual;
- activa `current_period_ends_at = fecha_pago + 365 días`;
- no activa débito mensual automático;
- intenta cancelar preapproval mensual anterior si existía.

### Migración SQL preparada

```text
supabase/migrations/20260624000000_add_annual_one_time_plans.sql
```

Agrega o actualiza las filas:

```text
PLUS_ANUAL
PREMIUM_ANUAL
INSIGNE_ANUAL
```

Usa sólo columnas ya vistas en el código actual:

```text
code
nombre
descripcion
price_ars
trial_days
max_distritos
max_cargos
is_active
public_visible
sort_order
mercadopago_plan_id
feature_flags
```

No se aplica automáticamente.

## Validaciones antes de producción

Antes de tocar producción hay que confirmar por chat:

1. qué archivo exacto corre hoy en Cloudflare;
2. si se integrará `worker_annual_plan_hotfix.js` como capa final o si se copiará la lógica al Worker grande;
3. que `mercadopago_checkout_sessions.provider_payload` acepta JSON;
4. que `subscription_plans.code` tiene restricción única para `ON CONFLICT (code)`;
5. que `user_subscriptions` tiene las columnas usadas por el hotfix;
6. que el webhook real de MercadoPago apunta al Worker correcto;
7. que el texto legal de no reembolso queda visible en la página o panel.

## Copy sugerido para responder a interesados

```text
Sí, tenemos plan anual. Es pago único, sin débito mensual automático. La opción anual tiene 2 meses bonificados: pagás 10 meses y usás 12. Si ya tenés un plan mensual activo, el tiempo no usado de ese mes se descuenta proporcionalmente del anual. No se realizan reembolsos en dinero una vez acreditado el pago.
```

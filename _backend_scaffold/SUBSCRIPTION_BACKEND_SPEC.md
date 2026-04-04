# Suscripciones APDocentePBA — backend seguro

## Lo que hoy usa el frontend

El frontend de este repo consume:
- GET /api/mi-plan
- GET /api/planes
- POST /api/mercadopago/create-checkout-link

Y ya maneja el campo mercadopago_preapproval_id dentro del modelo de suscripción.

## Objetivo

Evitar:
- doble cobro
- volver a prueba gratis con preapproval activo
- cambio automático entre planes pagos sin prorrateo definido
- estado local y estado de Mercado Pago desincronizados

## Reglas mínimas

1. Alta inicial
Permitida si no hay plan actual o si el plan actual es TRIAL_7D.

2. Volver a prueba gratis
Bloqueado si trial_used es true o si existe mercadopago_preapproval_id.

3. Cambio entre planes pagos
Bloqueado por ahora hasta definir prorrateo o cambio al próximo ciclo.

4. Cancelación
Permitida solo si existe mercadopago_preapproval_id.

5. Refresh
Debe reconciliar estado local con estado remoto de Mercado Pago.

## Campos mínimos sugeridos

- user_id
- plan_code
- status
- raw_status
- trial_used
- trial_started_at
- trial_ends_at
- mercadopago_preapproval_id
- mercadopago_plan_id
- cancel_requested_at
- canceled_at
- current_period_ends_at
- next_payment_date
- updated_at
- created_at

## Estados internos recomendados

- trialing
- active
- paused
- past_due
- pending
- canceled

## Endpoints a cerrar

GET /api/mi-plan
Debe devolver plan, suscripción y acciones permitidas.

POST /api/mercadopago/create-checkout-link
Debe validar transición segura antes de abrir checkout.

POST /api/subscription/cancel
Debe cancelar la suscripción remota y dejar marca interna de cancelación solicitada.

POST /api/mercadopago/webhook
Debe normalizar el estado remoto y actualizar la fila interna.

## Estrategia recomendada

Fase 1:
- habilitar alta inicial
- habilitar trial a pago
- habilitar refresh
- habilitar cancelación
- bloquear pago a pago
- bloquear pago a trial

Fase 2:
- habilitar upgrade y downgrade solo cuando se defina una política formal de prorrateo o cambio al próximo ciclo.

## Archivo incluido

En este directorio quedó el archivo subscription_policy_v1.js con:
- normalización de estados
- decisión segura de transición
- decisión segura de cancelación
- base para webhook

## Nota de Mercado Pago

La gestión de suscripciones se hace sobre preapproval. Cancelar un plan no cancela automáticamente a los suscriptores ya adheridos; eso se resuelve sobre cada suscripción activa.

export const INTERNAL_STATUSES = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAUSED: 'paused',
  PAST_DUE: 'past_due',
  PENDING: 'pending',
  CANCELED: 'canceled'
};

export const PLAN_CODES = {
  TRIAL_7D: 'TRIAL_7D',
  BASIC: 'BASIC',
  PLUS: 'PLUS',
  PREMIUM: 'PREMIUM',
  INSIGNE: 'INSIGNE'
};

export function normalizePlanCode(code) {
  const raw = String(code || '').trim().toUpperCase();
  if (raw === 'PRO') return PLAN_CODES.PREMIUM;
  return raw;
}

export function normalizeMpPreapprovalStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return INTERNAL_STATUSES.PENDING;
  if (raw === 'authorized' || raw === 'active') return INTERNAL_STATUSES.ACTIVE;
  if (raw === 'paused') return INTERNAL_STATUSES.PAUSED;
  if (raw === 'cancelled' || raw === 'canceled') return INTERNAL_STATUSES.CANCELED;
  if (raw === 'pending') return INTERNAL_STATUSES.PENDING;
  return INTERNAL_STATUSES.PENDING;
}

export function hasRecurringSubscription(subscription) {
  return !!String(subscription?.mercadopago_preapproval_id || '').trim();
}

export function canReturnToTrial(subscription) {
  return !subscription?.trial_used && !hasRecurringSubscription(subscription);
}

export function safeTransitionDecision({ currentSubscription, targetPlanCode }) {
  const currentPlan = normalizePlanCode(currentSubscription?.plan_code || '');
  const targetPlan = normalizePlanCode(targetPlanCode || '');
  const status = normalizeMpPreapprovalStatus(currentSubscription?.status || '');
  const recurring = hasRecurringSubscription(currentSubscription);

  if (!targetPlan) {
    return {
      allowed: false,
      reason: 'missing_target_plan',
      message: 'No se recibió el plan de destino.'
    };
  }

  if (currentPlan === targetPlan) {
    return {
      allowed: false,
      reason: 'same_plan',
      message: 'El usuario ya está en ese plan.'
    };
  }

  if (!currentPlan || currentPlan === PLAN_CODES.TRIAL_7D) {
    if (targetPlan === PLAN_CODES.TRIAL_7D) {
      return {
        allowed: false,
        reason: 'same_trial',
        message: 'La prueba gratis ya es el plan actual.'
      };
    }

    return {
      allowed: true,
      mode: 'new_checkout',
      reason: 'initial_activation',
      message: 'Alta inicial o salida de prueba a plan pago.'
    };
  }

  if (targetPlan === PLAN_CODES.TRIAL_7D) {
    return {
      allowed: false,
      reason: 'trial_return_blocked',
      message: 'No se permite volver a prueba gratis desde un plan ya activado.'
    };
  }

  if (status === INTERNAL_STATUSES.CANCELED && !recurring) {
    return {
      allowed: true,
      mode: 'new_checkout',
      reason: 'reactivate_without_active_preapproval',
      message: 'No hay preapproval activo; se puede generar checkout nuevo.'
    };
  }

  return {
    allowed: false,
    reason: 'manual_transition_required',
    message: 'Los cambios entre planes pagos quedan bloqueados hasta definir prorrateo, cambio al próximo ciclo y cancelación segura del cobro recurrente.'
  };
}

export function cancelSubscriptionDecision(subscription) {
  const recurringId = String(subscription?.mercadopago_preapproval_id || '').trim();
  if (!recurringId) {
    return {
      allowed: false,
      reason: 'no_preapproval_id',
      message: 'No hay suscripción recurrente en Mercado Pago para cancelar.'
    };
  }

  const status = normalizeMpPreapprovalStatus(subscription?.status || '');
  if (status === INTERNAL_STATUSES.CANCELED) {
    return {
      allowed: false,
      reason: 'already_canceled',
      message: 'La suscripción ya figura cancelada.'
    };
  }

  return {
    allowed: true,
    mode: 'cancel_preapproval',
    reason: 'cancel_active_recurring',
    message: 'Se debe cancelar el preapproval en Mercado Pago y luego marcar la baja interna.'
  };
}

export function buildWebhookMutation(preapprovalPayload) {
  const id = String(preapprovalPayload?.id || '').trim();
  const planCode = normalizePlanCode(preapprovalPayload?.external_reference_plan_code || preapprovalPayload?.reason_plan_code || '');
  const status = normalizeMpPreapprovalStatus(preapprovalPayload?.status || '');

  return {
    mercadopago_preapproval_id: id || null,
    plan_code: planCode || null,
    status,
    raw_status: String(preapprovalPayload?.status || '').trim() || null,
    next_payment_date: preapprovalPayload?.next_payment_date || null,
    reason: preapprovalPayload?.reason || null,
    updated_at: new Date().toISOString()
  };
}

export function buildSafeApiResponse(decision, extra = {}) {
  return {
    ok: !!decision?.allowed,
    allowed: !!decision?.allowed,
    mode: decision?.mode || null,
    reason: decision?.reason || null,
    message: decision?.message || null,
    ...extra
  };
}

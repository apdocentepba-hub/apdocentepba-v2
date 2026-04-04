import baseWorker from "./worker_hotfix.js";

const API_URL_PREFIX = "/api";
const SUBSCRIPTION_POLICY_VERSION = "2026-04-04-subscription-safe-2";

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders() });
}

function norm(v) {
  return String(v || "").trim().toUpperCase();
}

function parseFechaFlexible(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z)?$/);
  if (iso) {
    const [, yyyy, mm, dd, hh = "0", mi = "0", ss = "0"] = iso;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function canonicalPlanCode(code) {
  const raw = norm(code);
  if (raw === "PRO") return "PREMIUM";
  return raw || "PLUS";
}

function normalizeSubscriptionStatus(status) {
  const raw = norm(status);
  if (!raw) return "PENDING";
  if (raw === "APPROVED") return "ACTIVE";
  if (raw === "TRIAL") return "TRIALING";
  if (["ACTIVE", "AUTHORIZED", "TRIALING", "PAUSED", "PENDING", "BETA", "CANCELLED", "CANCELED"].includes(raw)) return raw;
  if (["IN_PROCESS", "PENDING_CONTINGENCY"].includes(raw)) return "PENDING";
  if (["REJECTED", "REFUNDED", "CHARGED_BACK", "EXPIRED"].includes(raw)) return "CANCELLED";
  return raw;
}

function hasRecurringPreapproval(subscription) {
  return !!String(subscription?.mercadopago_preapproval_id || "").trim();
}

function isPaidPlan(planCode) {
  return !!planCode && canonicalPlanCode(planCode) !== "TRIAL_7D";
}

function isSubscriptionCurrent(subscription) {
  if (!subscription) return false;

  const status = normalizeSubscriptionStatus(subscription.status);
  const planCode = canonicalPlanCode(subscription.plan_code);
  const now = Date.now();

  if (status === "CANCELLED") return false;

  if (planCode === "TRIAL_7D") {
    const end = parseFechaFlexible(subscription.trial_ends_at)?.getTime() || 0;
    return !!end && now <= end;
  }

  if (["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED", "BETA"].includes(status)) {
    const end = parseFechaFlexible(subscription.current_period_ends_at)?.getTime() || 0;
    return !end || now <= end;
  }

  return false;
}

function getSubscriptionBillingMode(subscription) {
  if (hasRecurringPreapproval(subscription)) return "recurring_preapproval";
  if (canonicalPlanCode(subscription?.plan_code) === "TRIAL_7D") return "trial";
  return "one_time_cycle";
}

function getRenewalPolicy(subscription) {
  const billingMode = getSubscriptionBillingMode(subscription);
  if (billingMode === "recurring_preapproval") return "automatic_recurring";
  if (billingMode === "trial") return "trial";
  return "manual_renewal";
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

async function supabaseRequest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  return data;
}

async function supabaseSelect(env, query) {
  return await supabaseRequest(env, query, {
    method: "GET",
    headers: { Prefer: "return=representation" }
  });
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserSubscriptions(env, userId) {
  const rows = await supabaseSelect(
    env,
    `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`
  ).catch(() => []);

  return Array.isArray(rows) ? rows : [];
}

async function resolveSubscriptionSnapshot(env, userId) {
  const rows = await getUserSubscriptions(env, userId);
  const current = rows.find(isSubscriptionCurrent) || rows[0] || null;
  const trialUsed = rows.some(row => canonicalPlanCode(row?.plan_code) === "TRIAL_7D");

  return {
    rows,
    current,
    trialUsed,
    hasRecurring: hasRecurringPreapproval(current),
    currentPlanCode: canonicalPlanCode(current?.plan_code || ""),
    currentStatus: normalizeSubscriptionStatus(current?.status || "")
  };
}

function buildSubscriptionActions(snapshot) {
  const current = snapshot?.current || null;
  const currentPlanCode = canonicalPlanCode(current?.plan_code || "");
  const currentPaid = !!current && isPaidPlan(currentPlanCode) && isSubscriptionCurrent(current);
  const recurring = hasRecurringPreapproval(current);

  return {
    can_checkout_new_paid_plan: !currentPaid,
    can_change_paid_plan_automatically: false,
    can_return_to_trial: false,
    can_cancel_recurring: recurring,
    requires_manual_support_for_paid_plan_change: currentPaid,
    billing_mode: getSubscriptionBillingMode(current),
    renewal_policy: getRenewalPolicy(current),
    recurring_enabled: recurring
  };
}

function decidePlanTransition(snapshot, targetPlanCode) {
  const target = canonicalPlanCode(targetPlanCode);
  const current = snapshot?.current || null;
  const currentPlanCode = canonicalPlanCode(current?.plan_code || "");
  const currentPaid = !!current && isPaidPlan(currentPlanCode) && isSubscriptionCurrent(current);
  const recurring = hasRecurringPreapproval(current);

  if (!target) {
    return {
      allowed: false,
      status: 400,
      reason: "missing_target_plan",
      message: "No se recibió el plan de destino."
    };
  }

  if (target === currentPlanCode && current) {
    return {
      allowed: false,
      status: 409,
      reason: "same_plan",
      message: "Ya estás en ese plan."
    };
  }

  if (target === "TRIAL_7D") {
    return {
      allowed: false,
      status: 409,
      reason: "trial_return_blocked",
      message: "La vuelta a prueba gratis queda bloqueada para evitar inconsistencias de facturación y de estado."
    };
  }

  if (!current || !currentPaid || currentPlanCode === "TRIAL_7D") {
    return {
      allowed: true,
      status: 200,
      reason: "initial_activation",
      message: "Alta inicial o salida de prueba a plan pago."
    };
  }

  if (recurring) {
    return {
      allowed: false,
      status: 409,
      reason: "manual_transition_required",
      message: "Los cambios entre planes pagos con renovación automática quedan bloqueados hasta definir bien prorrateos y cancelación segura."
    };
  }

  return {
    allowed: false,
    status: 409,
    reason: "paid_plan_change_blocked",
    message: "Tu plan actual sigue vigente. Por ahora los cambios entre planes pagos quedan bloqueados para evitar doble cobro o solapamiento de períodos."
  };
}

async function delegateJson(worker, request, env, ctx) {
  const response = await worker.fetch(request, env, ctx);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data, text };
}

async function handleMiPlanSubscriptionHotfix(request, url, env, ctx) {
  const delegated = await delegateJson(baseWorker, request, env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) {
    return json(delegated.data || { ok: false, message: "No se pudo leer el plan" }, delegated.response.status || 500);
  }

  const userId = String(url.searchParams.get("user_id") || delegated.data?.user_id || "").trim();
  const snapshot = userId ? await resolveSubscriptionSnapshot(env, userId) : { current: delegated.data?.subscription || null, trialUsed: false };
  const current = snapshot.current || delegated.data?.subscription || null;

  return json({
    ...delegated.data,
    subscription: {
      ...(delegated.data?.subscription || {}),
      ...(current || {}),
      plan_code: canonicalPlanCode(current?.plan_code || delegated.data?.subscription?.plan_code || "TRIAL_7D"),
      status: String(current?.status || delegated.data?.subscription?.status || "available").toLowerCase(),
      billing_mode: getSubscriptionBillingMode(current),
      renewal_policy: getRenewalPolicy(current),
      recurring_enabled: hasRecurringPreapproval(current),
      trial_used: !!snapshot.trialUsed
    },
    actions: buildSubscriptionActions(snapshot),
    subscription_policy_version: SUBSCRIPTION_POLICY_VERSION,
    billing_note: hasRecurringPreapproval(current)
      ? "Tu plan usa renovación automática por preapproval."
      : (canonicalPlanCode(current?.plan_code) === "TRIAL_7D"
          ? "Tu cuenta está en prueba gratis."
          : "El checkout actual activa un ciclo del plan y no deja renovación automática mensual.")
  }, delegated.response.status || 200);
}

async function handleCreateCheckoutSubscriptionHotfix(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  const targetPlanCode = canonicalPlanCode(body?.plan_code || "");

  if (!userId || !targetPlanCode) {
    return json({
      ok: false,
      reason: "missing_data",
      message: "Faltan user_id o plan_code.",
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, 400);
  }

  const user = await getUserById(env, userId);
  if (!user) {
    return json({
      ok: false,
      reason: "user_not_found",
      message: "Usuario no encontrado.",
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, 404);
  }

  const snapshot = await resolveSubscriptionSnapshot(env, userId);
  const decision = decidePlanTransition(snapshot, targetPlanCode);

  if (!decision.allowed) {
    return json({
      ok: false,
      reason: decision.reason,
      message: decision.message,
      actions: buildSubscriptionActions(snapshot),
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, decision.status);
  }

  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ ...body, plan_code: targetPlanCode })
  });

  const delegated = await delegateJson(baseWorker, forwardedRequest, env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) {
    return json(delegated.data || { ok: false, message: "No se pudo preparar el checkout" }, delegated.response.status || 500);
  }

  return json({
    ...delegated.data,
    plan_code: targetPlanCode,
    recurring_enabled: false,
    billing_mode: "one_time_cycle",
    renewal_policy: "manual_renewal",
    subscription_policy_version: SUBSCRIPTION_POLICY_VERSION,
    message: `${delegated.data?.message || "Checkout preparado"}. Este checkout activa un ciclo del plan y no deja renovación automática mensual.`
  }, delegated.response.status || 200);
}

async function handleCancelSubscriptionHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || getBearerToken(request) || "").trim();

  if (!userId) {
    return json({
      ok: false,
      reason: "missing_user_id",
      message: "Falta user_id.",
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, 400);
  }

  const user = await getUserById(env, userId);
  if (!user) {
    return json({
      ok: false,
      reason: "user_not_found",
      message: "Usuario no encontrado.",
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, 404);
  }

  const snapshot = await resolveSubscriptionSnapshot(env, userId);
  const current = snapshot.current;

  if (!current || !isPaidPlan(current?.plan_code)) {
    return json({
      ok: false,
      reason: "no_paid_subscription",
      message: "No hay un plan pago activo para cancelar.",
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, 409);
  }

  if (!hasRecurringPreapproval(current)) {
    return json({
      ok: false,
      reason: "no_recurring_subscription",
      message: current?.current_period_ends_at
        ? `Tu plan actual no tiene renovación automática mensual en Mercado Pago. No hay un cobro recurrente para cancelar; el acceso vence al final del período actual (${current.current_period_ends_at}).`
        : "Tu plan actual no tiene renovación automática mensual en Mercado Pago. No hay un cobro recurrente para cancelar.",
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, 409);
  }

  return json({
    ok: false,
    reason: "manual_cancel_required",
    message: "Existe un preapproval asociado, pero la cancelación automática segura todavía no quedó habilitada en este hotfix.",
    subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
  }, 501);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === `${API_URL_PREFIX}/mi-plan` && request.method === "GET") {
      try {
        return await handleMiPlanSubscriptionHotfix(request, url, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo leer el plan", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/mercadopago/create-checkout-link` && request.method === "POST") {
      try {
        return await handleCreateCheckoutSubscriptionHotfix(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo preparar el checkout", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/subscription/cancel` && request.method === "POST") {
      try {
        return await handleCancelSubscriptionHotfix(request, env);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo resolver la cancelación", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 500);
      }
    }

    return await baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      return await baseWorker.scheduled(controller, env, ctx);
    }
  }
};

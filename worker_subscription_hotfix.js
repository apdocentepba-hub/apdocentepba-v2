import baseWorker from "./worker_hotfix.js";

const API_URL_PREFIX = "/api";
const SUBSCRIPTION_POLICY_VERSION = "2026-04-04-subscription-safe-3";

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

function formatDateAr(value) {
  const date = parseFechaFlexible(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function roundArs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function planPresets() {
  return {
    TRIAL_7D: {
      code: "TRIAL_7D",
      nombre: "Prueba gratis 7 días",
      price_ars: 0,
      description: "Prueba gratis"
    },
    PLUS: {
      code: "PLUS",
      nombre: "Plan Plus",
      price_ars: 2990,
      description: "2 distritos y 4 materias/cargos"
    },
    PREMIUM: {
      code: "PREMIUM",
      nombre: "Plan Pro",
      price_ars: 4990,
      description: "3 distritos y 6 materias/cargos"
    },
    INSIGNE: {
      code: "INSIGNE",
      nombre: "Plan Insigne",
      price_ars: 7990,
      description: "3 distritos principales + 2 de emergencia y hasta 10 materias/cargos"
    }
  };
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

async function supabaseInsertReturning(env, table, data) {
  const rows = await supabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data)
  });
  return Array.isArray(rows) ? rows[0] : rows;
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

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  const rows = await supabaseSelect(
    env,
    `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags,sort_order&limit=1`
  ).catch(() => []);

  if (Array.isArray(rows) && rows[0]) {
    return rows[0];
  }

  return planPresets()[code] || null;
}

async function resolveSubscriptionSnapshot(env, userId) {
  const rows = await getUserSubscriptions(env, userId);
  const current = rows.find(isSubscriptionCurrent) || rows[0] || null;
  const trialUsed = rows.some(row => canonicalPlanCode(row?.plan_code) === "TRIAL_7D");
  const currentPlan = current ? await getPlanByCode(env, current.plan_code) : null;

  return {
    rows,
    current,
    currentPlan,
    trialUsed,
    hasRecurring: hasRecurringPreapproval(current),
    currentPlanCode: canonicalPlanCode(current?.plan_code || ""),
    currentStatus: normalizeSubscriptionStatus(current?.status || "")
  };
}

function buildSubscriptionActions(snapshot) {
  const current = snapshot?.current || null;
  const currentPlan = snapshot?.currentPlan || null;
  const currentPlanCode = canonicalPlanCode(current?.plan_code || "");
  const currentPaid = !!current && isPaidPlan(currentPlanCode) && isSubscriptionCurrent(current);
  const recurring = hasRecurringPreapproval(current);

  return {
    can_checkout_new_paid_plan: !currentPaid,
    can_upgrade_paid_plan: currentPaid && !recurring,
    can_change_paid_plan_automatically: currentPaid && !recurring,
    can_return_to_trial: false,
    can_cancel_recurring: recurring,
    requires_manual_support_for_paid_plan_change: currentPaid && recurring,
    billing_mode: getSubscriptionBillingMode(current),
    renewal_policy: getRenewalPolicy(current),
    recurring_enabled: recurring,
    current_plan_price_ars: Number(currentPlan?.price_ars || 0) || 0
  };
}

function calculateUpgradeQuote(currentPlan, targetPlan, currentSubscription) {
  const currentPrice = Number(currentPlan?.price_ars || 0);
  const targetPrice = Number(targetPlan?.price_ars || 0);
  const delta = Math.max(0, targetPrice - currentPrice);

  const startTs = parseFechaFlexible(currentSubscription?.started_at)?.getTime() || 0;
  const endTs = parseFechaFlexible(currentSubscription?.current_period_ends_at)?.getTime() || 0;
  const nowTs = Date.now();

  let credit = 0;
  if (startTs && endTs && endTs > startTs && endTs > nowTs) {
    const totalMs = endTs - startTs;
    const remainingMs = endTs - nowTs;
    const remainingRatio = Math.max(0, Math.min(1, remainingMs / totalMs));
    credit = roundArs(currentPrice * remainingRatio);
  }

  if (!credit) {
    credit = 0;
  }

  const amountToCharge = Math.max(1, roundArs(targetPrice - credit));

  return {
    current_plan_code: canonicalPlanCode(currentPlan?.code || currentSubscription?.plan_code || ""),
    target_plan_code: canonicalPlanCode(targetPlan?.code || ""),
    current_price_ars: currentPrice,
    target_price_ars: targetPrice,
    credit_ars: credit,
    amount_to_charge_ars: amountToCharge,
    cycle_started_at: currentSubscription?.started_at || null,
    cycle_ends_at: currentSubscription?.current_period_ends_at || null,
    cycle_ends_label: formatDateAr(currentSubscription?.current_period_ends_at)
  };
}

function decidePlanTransition(snapshot, targetPlan) {
  const targetPlanCode = canonicalPlanCode(targetPlan?.code || "");
  const current = snapshot?.current || null;
  const currentPlan = snapshot?.currentPlan || null;
  const currentPlanCode = canonicalPlanCode(current?.plan_code || "");
  const currentPaid = !!current && isPaidPlan(currentPlanCode) && isSubscriptionCurrent(current);
  const recurring = hasRecurringPreapproval(current);

  if (!targetPlanCode) {
    return {
      allowed: false,
      status: 400,
      reason: "missing_target_plan",
      message: "No se recibió el plan de destino."
    };
  }

  if (targetPlanCode === currentPlanCode && current) {
    return {
      allowed: false,
      status: 409,
      reason: "same_plan",
      message: "Ya estás en ese plan."
    };
  }

  if (targetPlanCode === "TRIAL_7D") {
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
      mode: "new_checkout",
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

  const currentPrice = Number(currentPlan?.price_ars || 0);
  const targetPrice = Number(targetPlan?.price_ars || 0);

  if (targetPrice > currentPrice) {
    return {
      allowed: true,
      status: 200,
      mode: "upgrade_prorated",
      reason: "paid_upgrade_prorated",
      message: "Upgrade habilitado con cobro proporcional sobre el tiempo restante del plan actual.",
      quote: calculateUpgradeQuote(currentPlan, targetPlan, current)
    };
  }

  if (targetPrice < currentPrice) {
    return {
      allowed: false,
      status: 409,
      reason: "downgrade_wait_for_renewal",
      message: current?.current_period_ends_at
        ? `Tu plan actual ya está pago hasta el ${formatDateAr(current.current_period_ends_at)}. El cambio a un plan menor se hace cuando renueve o cuando venza el ciclo actual.`
        : "Tu plan actual ya está pago. El cambio a un plan menor se hace cuando renueve o cuando venza el ciclo actual."
    };
  }

  return {
    allowed: false,
    status: 409,
    reason: "same_price_manual",
    message: "El cambio entre planes del mismo valor todavía no quedó automatizado."
  };
}

function mapMercadoPagoCheckoutStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  if (key === "APPROVED") return "approved";
  if (key === "AUTHORIZED") return "authorized";
  if (["PENDING", "IN_PROCESS", "PENDING_CONTINGENCY"].includes(key)) return "pending";
  if (["REJECTED", "CANCELLED"].includes(key)) return "rejected";
  if (["REFUNDED", "CHARGED_BACK"].includes(key)) return "refunded";
  return key.toLowerCase() || "pending";
}

function addDaysIso(baseIso, days) {
  const baseDate = parseFechaFlexible(baseIso) || new Date();
  const next = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

async function createMercadoPagoCheckoutPreference(env, context) {
  const accessToken = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  const amount = Number(context?.amount_ars);

  if (!accessToken) {
    throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto calculado para el checkout no es válido");
  }

  const payload = {
    items: [
      {
        id: String(context?.target_plan?.code || "PLAN").trim().toUpperCase(),
        title: String(context?.title || context?.target_plan?.nombre || "Suscripción APDocentePBA").trim(),
        description: String(context?.description || context?.target_plan?.descripcion || "").trim() || undefined,
        quantity: 1,
        currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS",
        unit_price: amount
      }
    ],
    payer: {
      email: String(context?.user?.email || "").trim().toLowerCase() || undefined,
      name: String(context?.user?.nombre || "").trim() || undefined,
      surname: String(context?.user?.apellido || "").trim() || undefined
    },
    external_reference: context.external_reference,
    notification_url: context.webhook_url,
    statement_descriptor: String(env.MERCADOPAGO_STATEMENT_DESCRIPTOR || "APDOCENTEPBA").slice(0, 13)
  };

  const successUrl = String(env.MERCADOPAGO_SUCCESS_URL || "").trim();
  const pendingUrl = String(env.MERCADOPAGO_PENDING_URL || "").trim();
  const failureUrl = String(env.MERCADOPAGO_FAILURE_URL || "").trim();

  if (successUrl || pendingUrl || failureUrl) {
    payload.back_urls = {};
    if (successUrl) payload.back_urls.success = successUrl;
    if (pendingUrl) payload.back_urls.pending = pendingUrl;
    if (failureUrl) payload.back_urls.failure = failureUrl;
  }

  if (successUrl) {
    payload.auto_return = "approved";
  }

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { raw_text: rawText };
  }

  if (!res.ok) {
    throw new Error(data?.message || data?.cause?.[0]?.description || "Mercado Pago no pudo crear la preferencia");
  }

  return {
    mode: "mercadopago_preference",
    preference_id: data?.id || null,
    checkout_url: data?.init_point || null,
    sandbox_init_point: data?.sandbox_init_point || null,
    raw: data
  };
}

async function createCheckoutSessionRecord(env, session) {
  return await supabaseInsertReturning(env, "mercadopago_checkout_sessions", session);
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
  const snapshot = userId ? await resolveSubscriptionSnapshot(env, userId) : { current: delegated.data?.subscription || null, trialUsed: false, currentPlan: delegated.data?.plan || null };
  const current = snapshot.current || delegated.data?.subscription || null;
  const currentPlan = snapshot.currentPlan || delegated.data?.plan || null;

  const billingNote = hasRecurringPreapproval(current)
    ? "Tu plan usa renovación automática por preapproval."
    : (canonicalPlanCode(current?.plan_code) === "TRIAL_7D"
      ? "Tu cuenta está en prueba gratis."
      : current?.current_period_ends_at
        ? `Tu plan actual corre hasta el ${formatDateAr(current.current_period_ends_at)}. Si subís de plan antes de esa fecha, se calcula una diferencia proporcional y el nuevo ciclo arranca cuando se acredita el pago.`
        : "Tu plan actual usa ciclos manuales. Si subís de plan, se puede cobrar la diferencia proporcional del tiempo restante.");

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
    plan: delegated.data?.plan || currentPlan,
    actions: buildSubscriptionActions(snapshot),
    subscription_policy_version: SUBSCRIPTION_POLICY_VERSION,
    billing_note: billingNote
  }, delegated.response.status || 200);
}

async function handleCreateCheckoutSubscriptionHotfix(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  const targetPlanCode = canonicalPlanCode(body?.plan_code || "");

  if (!userId || !targetPlanCode) {
    return json({ ok: false, reason: "missing_data", message: "Faltan user_id o plan_code.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 400);
  }

  const user = await getUserById(env, userId);
  if (!user) {
    return json({ ok: false, reason: "user_not_found", message: "Usuario no encontrado.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 404);
  }

  const snapshot = await resolveSubscriptionSnapshot(env, userId);
  const targetPlan = await getPlanByCode(env, targetPlanCode);
  if (!targetPlan) {
    return json({ ok: false, reason: "plan_not_found", message: "No encontramos el plan elegido.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 404);
  }

  const decision = decidePlanTransition(snapshot, targetPlan);
  if (!decision.allowed) {
    return json({
      ok: false,
      reason: decision.reason,
      message: decision.message,
      actions: buildSubscriptionActions(snapshot),
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, decision.status);
  }

  if (decision.mode === "new_checkout") {
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

  if (decision.mode === "upgrade_prorated") {
    const quote = decision.quote;
    const externalReference = `${userId}:${targetPlanCode}:${Date.now()}`;
    const webhookUrl = env.MERCADOPAGO_WEBHOOK_URL || new URL(`${API_URL_PREFIX}/mercadopago/webhook`, request.url).toString();
    const currentPlanName = snapshot.currentPlan?.nombre || snapshot.currentPlan?.display_name || snapshot.currentPlanCode || "Plan actual";
    const targetPlanName = targetPlan?.nombre || targetPlan?.display_name || targetPlanCode;

    const preference = await createMercadoPagoCheckoutPreference(env, {
      user,
      target_plan: targetPlan,
      amount_ars: quote.amount_to_charge_ars,
      external_reference: externalReference,
      webhook_url: webhookUrl,
      title: `Upgrade APDocentePBA: ${currentPlanName} → ${targetPlanName}`,
      description: `Diferencia proporcional para pasar de ${currentPlanName} a ${targetPlanName}. Crédito aplicado por tiempo restante del ciclo actual.`
    }).catch(err => {
      throw new Error(err?.message || "No se pudo crear el checkout de upgrade");
    });

    const session = await createCheckoutSessionRecord(env, {
      user_id: userId,
      plan_code: targetPlanCode,
      status: preference?.checkout_url ? "ready" : "pending_config",
      provider: "mercadopago",
      checkout_url: preference?.checkout_url || null,
      external_reference: externalReference,
      provider_payload: {
        configured: !!preference?.checkout_url,
        provider_mode: preference?.mode || "mercadopago_preference",
        preference_id: preference?.preference_id || null,
        sandbox_init_point: preference?.sandbox_init_point || null,
        transition_mode: "upgrade_prorated",
        current_plan_code: snapshot.currentPlanCode,
        target_plan_code: targetPlanCode,
        current_price_ars: quote.current_price_ars,
        target_price_ars: quote.target_price_ars,
        credit_ars: quote.credit_ars,
        amount_to_charge_ars: quote.amount_to_charge_ars,
        cycle_started_at: quote.cycle_started_at,
        cycle_ends_at: quote.cycle_ends_at
      }
    });

    return json({
      ok: true,
      configured: !!preference?.checkout_url,
      provider_mode: preference?.mode || "mercadopago_preference",
      message: `Upgrade habilitado. Se te va a cobrar $${quote.amount_to_charge_ars.toLocaleString("es-AR")} como diferencia proporcional para pasar de ${currentPlanName} a ${targetPlanName}. El crédito aplicado por el tiempo restante es de $${quote.credit_ars.toLocaleString("es-AR")}${quote.cycle_ends_label ? ` y tu ciclo actual vencía el ${quote.cycle_ends_label}` : ""}.`,
      session_id: session?.id || null,
      checkout_url: preference?.checkout_url || null,
      sandbox_init_point: preference?.sandbox_init_point || null,
      preference_id: preference?.preference_id || null,
      external_reference: externalReference,
      plan: targetPlan,
      upgrade_quote: quote,
      recurring_enabled: false,
      billing_mode: "one_time_cycle",
      renewal_policy: "manual_renewal",
      subscription_policy_version: SUBSCRIPTION_POLICY_VERSION
    }, 200);
  }

  return json({ ok: false, reason: "unsupported_transition_mode", message: "No pudimos resolver ese cambio todavía.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 409);
}

async function handleCancelSubscriptionHotfix(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || getBearerToken(request) || "").trim();

  if (!userId) {
    return json({ ok: false, reason: "missing_user_id", message: "Falta user_id.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 400);
  }

  const user = await getUserById(env, userId);
  if (!user) {
    return json({ ok: false, reason: "user_not_found", message: "Usuario no encontrado.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 404);
  }

  const snapshot = await resolveSubscriptionSnapshot(env, userId);
  const current = snapshot.current;

  if (!current || !isPaidPlan(current?.plan_code)) {
    return json({ ok: false, reason: "no_paid_subscription", message: "No hay un plan pago activo para cancelar.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 409);
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

  return json({ ok: false, reason: "manual_cancel_required", message: "Existe un preapproval asociado, pero la cancelación automática segura todavía no quedó habilitada en este hotfix.", subscription_policy_version: SUBSCRIPTION_POLICY_VERSION }, 501);
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

import baseWorker from "./worker_subscription_state_hotfix.js";

const API_URL_PREFIX = "/api";
const RECURRING_PLAN_CHANGE_VERSION = "2026-04-05-recurring-change-1";
const REUSE_SESSION_WINDOW_MS = 20 * 60 * 1000;

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

function canonicalPlanCode(code) {
  const raw = norm(code);
  if (raw === "PRO") return "PREMIUM";
  return raw || "";
}

function parseFechaFlexible(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateAr(value) {
  const d = parseFechaFlexible(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function addDaysIso(baseIso, days) {
  const baseDate = parseFechaFlexible(baseIso) || new Date();
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
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

function safeJsonParse(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sessionCreatedAtTs(session) {
  return parseFechaFlexible(session?.created_at)?.getTime() || 0;
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

  if (!res.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

async function supabaseSelect(env, query) {
  return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}

async function supabaseInsertReturning(env, table, data) {
  const rows = await supabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function supabasePatchById(env, table, id, payload) {
  const rows = await supabaseRequest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  const rows = await supabaseSelect(env, `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,mercadopago_plan_id&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserSubscriptions(env, userId) {
  const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getUserCheckoutSessions(env, userId) {
  const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at&order=created_at.desc&limit=50`).catch(() => []);
  return Array.isArray(rows) ? rows.map(row => ({ ...row, provider_payload: safeJsonParse(row.provider_payload) || row.provider_payload || null })) : [];
}

async function findCheckoutSessionByExternalReference(env, externalReference) {
  const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at&limit=1`).catch(() => []);
  const session = Array.isArray(rows) ? rows[0] || null : null;
  return session ? { ...session, provider_payload: safeJsonParse(session.provider_payload) || session.provider_payload || null } : null;
}

async function resolveCurrentSubscription(env, userId) {
  const rows = await getUserSubscriptions(env, userId);
  const current = rows.find(isSubscriptionCurrent) || rows[0] || null;
  const currentPlan = current ? await getPlanByCode(env, current.plan_code) : null;
  return { rows, current, currentPlan };
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
    credit = Math.max(0, Math.round(currentPrice * remainingRatio));
  }

  const amountToCharge = Math.max(1, Math.round(Math.max(delta, targetPrice - credit)));

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

function findReusableSession(sessions, matcher) {
  const now = Date.now();
  return (Array.isArray(sessions) ? sessions : []).find(session => {
    const status = String(session?.status || "").trim().toLowerCase();
    if (!["ready", "pending_config", "scheduled", "approved", "authorized"].includes(status)) return false;
    const createdAt = sessionCreatedAtTs(session);
    if (createdAt && now - createdAt > REUSE_SESSION_WINDOW_MS && status !== "scheduled") return false;
    return matcher(session, safeJsonParse(session?.provider_payload) || session?.provider_payload || {});
  }) || null;
}

async function mercadoPagoRequest(env, path, init = {}) {
  const accessToken = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");

  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = rawText;
  }

  if (!res.ok) throw new Error(data?.message || data?.cause?.[0]?.description || `Mercado Pago error ${res.status}`);
  return data;
}

async function createMercadoPagoCheckoutPreference(env, context) {
  const amount = Number(context?.amount_ars);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto calculado para el checkout no es válido");

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
  if (successUrl) payload.auto_return = "approved";

  const data = await mercadoPagoRequest(env, "/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return {
    mode: "mercadopago_preference",
    preference_id: data?.id || null,
    checkout_url: data?.init_point || null,
    sandbox_init_point: data?.sandbox_init_point || null,
    raw: data
  };
}

async function updateMercadoPagoPreapprovalAmount(env, preapprovalId, amount) {
  const payload = {
    auto_recurring: {
      transaction_amount: Number(amount),
      currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS"
    }
  };
  return await mercadoPagoRequest(env, `/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

async function fetchMercadoPagoPayment(env, paymentId) {
  return await mercadoPagoRequest(env, `/v1/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
}

async function delegateJson(request, env, ctx) {
  const response = await baseWorker.fetch(request, env, ctx);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data, text };
}

function buildReuseCheckoutResponse(session, message) {
  const payload = safeJsonParse(session?.provider_payload) || {};
  return {
    ok: true,
    configured: !!session?.checkout_url,
    provider_mode: payload?.provider_mode || payload?.transition_mode || "reuse_existing_session",
    message,
    session_id: session?.id || null,
    checkout_url: session?.checkout_url || null,
    sandbox_init_point: payload?.sandbox_init_point || null,
    preference_id: payload?.preference_id || null,
    external_reference: session?.external_reference || null,
    recurring_enabled: true,
    recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION
  };
}

async function handleRecurringPlanChangeCheckout(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  const targetPlanCode = canonicalPlanCode(body?.plan_code || "");

  if (!userId || !targetPlanCode) {
    return json({ ok: false, message: "Faltan user_id o plan_code.", recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, 400);
  }

  const user = await getUserById(env, userId);
  if (!user) {
    return json({ ok: false, message: "Usuario no encontrado.", recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, 404);
  }

  const { current, currentPlan } = await resolveCurrentSubscription(env, userId);
  const targetPlan = await getPlanByCode(env, targetPlanCode);
  if (!targetPlan) {
    return json({ ok: false, message: "No encontramos el plan elegido.", recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, 404);
  }

  const currentPlanCode = canonicalPlanCode(current?.plan_code || "");
  const currentRecurring = !!current && isPaidPlan(currentPlanCode) && isSubscriptionCurrent(current) && hasRecurringPreapproval(current);
  if (!currentRecurring) {
    const delegated = await delegateJson(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...body, plan_code: targetPlanCode })
    }), env, ctx);
    return json({ ...(delegated.data || {}), recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, delegated.response.status || 200);
  }

  if (targetPlanCode === currentPlanCode) {
    return json({ ok: false, message: "Ya estás en ese plan.", recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, 409);
  }

  const currentPrice = Number(currentPlan?.price_ars || 0);
  const targetPrice = Number(targetPlan?.price_ars || 0);
  const sessions = await getUserCheckoutSessions(env, userId);

  if (targetPrice < currentPrice) {
    const existing = findReusableSession(sessions, (_session, payload) => String(payload?.transition_mode || "") === "recurring_downgrade_next_cycle" && canonicalPlanCode(payload?.target_plan_code || "") === targetPlanCode && canonicalPlanCode(payload?.current_plan_code || "") === currentPlanCode);
    if (existing) {
      return json({
        ok: true,
        scheduled: true,
        mode: "recurring_downgrade_next_cycle",
        message: `Ya estaba programado el cambio a ${targetPlan?.nombre || targetPlanCode} para el próximo ciclo.`,
        session_id: existing.id || null,
        recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION
      }, 200);
    }

    await updateMercadoPagoPreapprovalAmount(env, current.mercadopago_preapproval_id, targetPrice);
    const scheduled = await supabaseInsertReturning(env, "mercadopago_checkout_sessions", {
      user_id: userId,
      plan_code: targetPlanCode,
      status: "scheduled",
      provider: "mercadopago",
      checkout_url: null,
      external_reference: `RECURDOWN:${userId}:${targetPlanCode}:${Date.now()}`,
      provider_payload: {
        transition_mode: "recurring_downgrade_next_cycle",
        current_subscription_id: current.id,
        current_plan_code: currentPlanCode,
        target_plan_code: targetPlanCode,
        current_price_ars: currentPrice,
        target_price_ars: targetPrice,
        recurring_preapproval_id: current.mercadopago_preapproval_id,
        apply_at: current.current_period_ends_at || null,
        recurring_amount_updated: true
      }
    });

    return json({
      ok: true,
      scheduled: true,
      mode: "recurring_downgrade_next_cycle",
      message: current?.current_period_ends_at
        ? `Vas a seguir con ${currentPlan?.nombre || currentPlanCode} hasta el ${formatDateAr(current.current_period_ends_at)}. Después el débito automático ya va a cobrar ${targetPlan?.nombre || targetPlanCode} por $${targetPrice.toLocaleString("es-AR")}.`
        : `El próximo débito automático ya va a cobrar ${targetPlan?.nombre || targetPlanCode} por $${targetPrice.toLocaleString("es-AR")}.`,
      session_id: scheduled?.id || null,
      recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION
    }, 200);
  }

  if (targetPrice > currentPrice) {
    const existing = findReusableSession(sessions, (_session, payload) => String(payload?.transition_mode || "") === "recurring_upgrade_prorated" && canonicalPlanCode(payload?.target_plan_code || "") === targetPlanCode && canonicalPlanCode(payload?.current_plan_code || "") === currentPlanCode);
    if (existing?.checkout_url) {
      return json(buildReuseCheckoutResponse(existing, "Ya había un checkout reciente preparado para este upgrade con débito automático. Reutilizamos ese enlace para evitar duplicados."), 200);
    }

    const quote = calculateUpgradeQuote(currentPlan, targetPlan, current);
    const externalReference = `RECURUP:${userId}:${targetPlanCode}:${Date.now()}`;
    const webhookUrl = env.MERCADOPAGO_WEBHOOK_URL || new URL(`${API_URL_PREFIX}/mercadopago/webhook`, request.url).toString();
    const preference = await createMercadoPagoCheckoutPreference(env, {
      user,
      target_plan: targetPlan,
      amount_ars: quote.amount_to_charge_ars,
      external_reference: externalReference,
      webhook_url: webhookUrl,
      title: `Upgrade APDocentePBA: ${currentPlan?.nombre || currentPlanCode} → ${targetPlan?.nombre || targetPlanCode}`,
      description: `Diferencia proporcional para pasar de ${currentPlan?.nombre || currentPlanCode} a ${targetPlan?.nombre || targetPlanCode}. El próximo débito automático se actualizará al nuevo plan.`
    });

    const session = await supabaseInsertReturning(env, "mercadopago_checkout_sessions", {
      user_id: userId,
      plan_code: targetPlanCode,
      status: preference?.checkout_url ? "ready" : "pending_config",
      provider: "mercadopago",
      checkout_url: preference?.checkout_url || null,
      external_reference: externalReference,
      provider_payload: {
        provider_mode: preference?.mode || "mercadopago_preference",
        preference_id: preference?.preference_id || null,
        sandbox_init_point: preference?.sandbox_init_point || null,
        transition_mode: "recurring_upgrade_prorated",
        current_subscription_id: current.id,
        current_plan_code: currentPlanCode,
        target_plan_code: targetPlanCode,
        current_price_ars: quote.current_price_ars,
        target_price_ars: quote.target_price_ars,
        credit_ars: quote.credit_ars,
        amount_to_charge_ars: quote.amount_to_charge_ars,
        cycle_started_at: current.started_at || null,
        cycle_ends_at: current.current_period_ends_at || null,
        recurring_preapproval_id: current.mercadopago_preapproval_id,
        recurring_new_amount_ars: targetPrice,
        preserve_cycle_ends_at: current.current_period_ends_at || null,
        preserve_started_at: current.started_at || null,
        apply_plan_now: true
      }
    });

    return json({
      ok: true,
      configured: !!preference?.checkout_url,
      provider_mode: preference?.mode || "mercadopago_preference",
      message: `Upgrade habilitado. Se te va a cobrar $${quote.amount_to_charge_ars.toLocaleString("es-AR")} como diferencia proporcional para pasar de ${currentPlan?.nombre || currentPlanCode} a ${targetPlan?.nombre || targetPlanCode}. En cuanto se acredite, tu plan cambia ahora y el próximo débito automático ya queda actualizado al nuevo valor.`,
      session_id: session?.id || null,
      checkout_url: preference?.checkout_url || null,
      sandbox_init_point: preference?.sandbox_init_point || null,
      preference_id: preference?.preference_id || null,
      external_reference: externalReference,
      recurring_enabled: true,
      upgrade_quote: quote,
      recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION
    }, 200);
  }

  return json({ ok: false, message: "El cambio entre planes del mismo valor todavía no quedó automatizado.", recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, 409);
}

async function applyRecurringUpgradePayment(env, payment, session) {
  const payload = safeJsonParse(session?.provider_payload) || {};
  const paymentStatus = String(payment?.status || "").trim().toUpperCase();
  const sessionStatus = mapMercadoPagoCheckoutStatus(paymentStatus);
  const nowIso = new Date().toISOString();

  await supabasePatchById(env, "mercadopago_checkout_sessions", session.id, {
    status: sessionStatus,
    provider_payload: {
      ...payload,
      payment_id: payment?.id || null,
      payment_status: payment?.status || null,
      payment_status_detail: payment?.status_detail || null,
      payer_email: payment?.payer?.email || null,
      processed_at: nowIso
    },
    updated_at: nowIso
  }).catch(() => null);

  if (!["APPROVED", "AUTHORIZED"].includes(paymentStatus)) {
    return {
      processed: true,
      external_reference: payment?.external_reference || null,
      payment_id: payment?.id || null,
      payment_status: paymentStatus,
      recurring_plan_change_applied: false,
      reason: "payment_not_approved"
    };
  }

  const currentSubscriptionId = String(payload?.current_subscription_id || "").trim();
  const recurringPreapprovalId = String(payload?.recurring_preapproval_id || "").trim();
  const targetPlanCode = canonicalPlanCode(payload?.target_plan_code || session?.plan_code || "");
  const recurringNewAmount = Number(payload?.recurring_new_amount_ars || 0);

  if (!currentSubscriptionId || !recurringPreapprovalId || !targetPlanCode || !Number.isFinite(recurringNewAmount) || recurringNewAmount <= 0) {
    return {
      processed: false,
      reason: "missing_upgrade_payload",
      external_reference: payment?.external_reference || null
    };
  }

  await updateMercadoPagoPreapprovalAmount(env, recurringPreapprovalId, recurringNewAmount);
  await supabasePatchById(env, "user_subscriptions", currentSubscriptionId, {
    plan_code: targetPlanCode,
    status: paymentStatus === "AUTHORIZED" ? "AUTHORIZED" : "ACTIVE",
    source: "mercadopago_recurring_upgrade",
    current_period_ends_at: payload?.preserve_cycle_ends_at || null,
    started_at: payload?.preserve_started_at || null,
    mercadopago_preapproval_id: recurringPreapprovalId,
    updated_at: nowIso
  });

  await supabasePatchById(env, "mercadopago_checkout_sessions", session.id, {
    provider_payload: {
      ...payload,
      payment_id: payment?.id || null,
      payment_status: payment?.status || null,
      recurring_amount_updated: true,
      plan_change_applied: true,
      applied_at: nowIso
    },
    updated_at: nowIso
  }).catch(() => null);

  return {
    processed: true,
    external_reference: payment?.external_reference || null,
    payment_id: payment?.id || null,
    payment_status: paymentStatus,
    recurring_plan_change_applied: true,
    user_id: session?.user_id || null,
    plan_code: targetPlanCode
  };
}

async function handleMercadoPagoWebhookWithRecurringChanges(request, env, ctx) {
  const raw = await request.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw_text: raw };
  }

  const topic = String(payload?.type || payload?.topic || payload?.action || "").trim().toLowerCase();
  const resourceId = String(payload?.data?.id || payload?.id || "").trim();
  if (!resourceId || !topic.includes("payment")) {
    return await baseWorker.fetch(new Request(request.url, { method: request.method, headers: request.headers, body: raw }), env, ctx);
  }

  const payment = await fetchMercadoPagoPayment(env, resourceId);
  const externalReference = String(payment?.external_reference || "").trim();
  const session = externalReference ? await findCheckoutSessionByExternalReference(env, externalReference) : null;
  const sessionPayload = safeJsonParse(session?.provider_payload) || session?.provider_payload || {};

  if (String(sessionPayload?.transition_mode || "") !== "recurring_upgrade_prorated") {
    return await baseWorker.fetch(new Request(request.url, { method: request.method, headers: request.headers, body: raw }), env, ctx);
  }

  const sync = await applyRecurringUpgradePayment(env, payment, session);
  return json({ ok: true, sync, recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === `${API_URL_PREFIX}/mercadopago/create-checkout-link` && request.method === "POST") {
      try {
        return await handleRecurringPlanChangeCheckout(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo resolver el cambio de plan", recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/mercadopago/webhook` && request.method === "POST") {
      try {
        return await handleMercadoPagoWebhookWithRecurringChanges(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo procesar el webhook", recurring_plan_change_version: RECURRING_PLAN_CHANGE_VERSION }, 500);
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

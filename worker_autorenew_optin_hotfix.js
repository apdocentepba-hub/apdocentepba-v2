import baseWorker from "./worker_subscription_hotfix.js";

const API_URL_PREFIX = "/api";
const AUTORENEW_POLICY_VERSION = "2026-04-04-autorenew-optin-1";

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

function norm(v) { return String(v || "").trim().toUpperCase(); }
function canonicalPlanCode(code) { const raw = norm(code); return raw === "PRO" ? "PREMIUM" : raw || ""; }
function hasRecurringPreapproval(subscription) { return !!String(subscription?.mercadopago_preapproval_id || "").trim(); }
function parseFechaFlexible(value) { const d = new Date(String(value || "").trim()); return Number.isNaN(d.getTime()) ? null : d; }
function addDaysIso(baseIso, days) { const baseDate = parseFechaFlexible(baseIso) || new Date(); return new Date(baseDate.getTime() + days * 86400000).toISOString(); }
function formatDateAr(value) { const d = parseFechaFlexible(value); return d ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : ""; }
function normalizeRecurringStatus(status) { const raw = String(status || "").trim().toLowerCase(); if (!raw) return "inactive"; if (raw === "authorized" || raw === "active") return "active"; if (raw === "pending") return "pending_setup"; if (raw === "paused") return "paused"; if (raw === "cancelled" || raw === "canceled") return "canceled"; return raw; }

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
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

async function supabaseSelect(env, query) {
  return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}

async function supabasePatchById(env, table, id, payload) {
  const rows = await supabaseRequest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function supabaseInsertReturning(env, table, payload) {
  const rows = await supabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserSubscriptions(env, userId) {
  const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  const rows = await supabaseSelect(env, `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,mercadopago_plan_id&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function isSubscriptionCurrent(subscription) {
  if (!subscription) return false;
  const planCode = canonicalPlanCode(subscription.plan_code);
  const status = String(subscription.status || "").trim().toUpperCase();
  const now = Date.now();
  if (status === "CANCELLED" || status === "CANCELED") return false;
  if (planCode === "TRIAL_7D") {
    const end = parseFechaFlexible(subscription.trial_ends_at)?.getTime() || 0;
    return !!end && now <= end;
  }
  const end = parseFechaFlexible(subscription.current_period_ends_at)?.getTime() || 0;
  return !end || now <= end;
}

async function resolveCurrentSubscription(env, userId) {
  const rows = await getUserSubscriptions(env, userId);
  const current = rows.find(isSubscriptionCurrent) || rows[0] || null;
  const currentPlan = current ? await getPlanByCode(env, current.plan_code) : null;
  return { current, currentPlan };
}

async function mercadoPagoRequest(env, path, init = {}) {
  const token = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || data?.cause?.[0]?.description || `Mercado Pago error ${res.status}`);
  return data;
}

async function getMercadoPagoPreapproval(env, preapprovalId) {
  if (!preapprovalId) return null;
  return await mercadoPagoRequest(env, `/preapproval/${encodeURIComponent(preapprovalId)}`, { method: "GET" }).catch(() => null);
}

async function cancelMercadoPagoPreapproval(env, preapprovalId) {
  return await mercadoPagoRequest(env, `/preapproval/${encodeURIComponent(preapprovalId)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
}

async function createMercadoPagoPendingPreapproval(env, context) {
  const backUrl = String(env.MERCADOPAGO_SUCCESS_URL || env.APP_PUBLIC_URL || "https://apdocentepba-hub.github.io/apdocentepba-v2/").trim();
  return await mercadoPagoRequest(env, "/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: context.reason,
      external_reference: context.external_reference,
      payer_email: context.payer_email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        start_date: context.start_date,
        transaction_amount: context.transaction_amount,
        currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS"
      },
      back_url: backUrl,
      status: "pending"
    })
  });
}

async function delegateJson(request, env, ctx) {
  const response = await baseWorker.fetch(request, env, ctx);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

async function enrichMiPlan(request, env, ctx) {
  const url = new URL(request.url);
  const delegated = await delegateJson(request, env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) return json(delegated.data || { ok: false }, delegated.response.status || 500);

  const userId = String(url.searchParams.get("user_id") || delegated.data?.user_id || "").trim();
  if (!userId) return json({ ...delegated.data, auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, delegated.response.status || 200);

  const { current, currentPlan } = await resolveCurrentSubscription(env, userId);
  const currentPaid = !!current && canonicalPlanCode(current.plan_code) !== "TRIAL_7D" && isSubscriptionCurrent(current);
  let recurringInfo = null;
  let recurringStatus = "inactive";
  let recurringEnabled = false;

  if (hasRecurringPreapproval(current)) {
    recurringInfo = await getMercadoPagoPreapproval(env, current.mercadopago_preapproval_id);
    recurringStatus = normalizeRecurringStatus(recurringInfo?.status || "pending");
    recurringEnabled = recurringStatus !== "canceled";
    if (!recurringEnabled && current?.id) {
      await supabasePatchById(env, "user_subscriptions", current.id, { mercadopago_preapproval_id: null });
      current.mercadopago_preapproval_id = null;
    }
  }

  const actions = {
    ...(delegated.data?.actions || {}),
    can_enable_auto_renew: currentPaid && !recurringEnabled,
    can_disable_auto_renew: currentPaid && recurringEnabled
  };

  let billingNote = delegated.data?.billing_note || "";
  if (currentPaid && !recurringEnabled) {
    billingNote = current?.current_period_ends_at
      ? `Tu plan actual está pago hasta el ${formatDateAr(current.current_period_ends_at)}. Si no activás renovación automática, cuando venza ese ciclo dejarás de poder usar APDocentePBA.`
      : `Tu plan actual usa renovación manual. Si no activás renovación automática, cuando venza el ciclo dejarás de poder usar APDocentePBA.`;
  }
  if (recurringEnabled) {
    billingNote = recurringStatus === "pending_setup"
      ? `La renovación automática quedó iniciada, pero falta completar el medio de pago en Mercado Pago. Si no terminás esa configuración, al vencer el ciclo actual se corta el acceso.`
      : `La renovación automática está activa. Si Mercado Pago no logra cobrar el próximo ciclo, el plan no se renueva y el acceso se corta al vencimiento.`;
  }

  return json({
    ...delegated.data,
    subscription: {
      ...(delegated.data?.subscription || {}),
      ...(current || {}),
      recurring_enabled: recurringEnabled,
      renewal_policy: recurringEnabled ? "automatic_opt_in" : "manual_renewal",
      billing_mode: recurringEnabled ? "recurring_preapproval" : (delegated.data?.subscription?.billing_mode || "one_time_cycle"),
      auto_renew_status: recurringStatus,
      next_payment_date: recurringInfo?.next_payment_date || null
    },
    plan: delegated.data?.plan || currentPlan,
    actions,
    billing_note: billingNote,
    auto_renew_policy_version: AUTORENEW_POLICY_VERSION
  }, delegated.response.status || 200);
}

async function createCheckoutSessionRecord(env, payload) {
  return await supabaseInsertReturning(env, "mercadopago_checkout_sessions", payload);
}

async function handleEnableAutoRenew(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  if (!userId) return json({ ok: false, message: "Falta user_id.", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 400);

  const user = await getUserById(env, userId);
  if (!user) return json({ ok: false, message: "Usuario no encontrado.", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 404);

  const { current, currentPlan } = await resolveCurrentSubscription(env, userId);
  if (!current || !currentPlan || canonicalPlanCode(current.plan_code) === "TRIAL_7D" || !isSubscriptionCurrent(current)) {
    return json({ ok: false, message: "Necesitás un plan pago activo para activar renovación automática.", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 409);
  }
  if (hasRecurringPreapproval(current)) {
    return json({ ok: false, message: "La renovación automática ya está activa o en proceso de configuración.", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 409);
  }

  const startDate = current.current_period_ends_at || addDaysIso(new Date().toISOString(), 30);
  const externalReference = `AUTORENEW:${userId}:${canonicalPlanCode(current.plan_code)}:${Date.now()}`;
  const mp = await createMercadoPagoPendingPreapproval(env, {
    reason: `APDocentePBA · Renovación automática ${currentPlan?.nombre || canonicalPlanCode(current.plan_code)}`,
    external_reference: externalReference,
    payer_email: user.email,
    transaction_amount: Number(currentPlan?.price_ars || 0),
    start_date: startDate
  });

  await createCheckoutSessionRecord(env, {
    user_id: userId,
    plan_code: canonicalPlanCode(current.plan_code),
    status: mp?.init_point ? "ready" : "pending_config",
    provider: "mercadopago",
    checkout_url: mp?.init_point || null,
    external_reference: externalReference,
    provider_payload: { provider_mode: "mercadopago_preapproval_pending", preapproval_id: mp?.id || null, status: mp?.status || null, auto_renew_opt_in: true, starts_at: startDate }
  }).catch(() => null);

  if (current?.id && mp?.id) {
    await supabasePatchById(env, "user_subscriptions", current.id, { mercadopago_preapproval_id: mp.id, external_reference: externalReference });
  }

  return json({
    ok: true,
    checkout_url: mp?.init_point || null,
    preapproval_id: mp?.id || null,
    recurring_enabled: true,
    auto_renew_status: normalizeRecurringStatus(mp?.status || "pending"),
    message: `Se abrió Mercado Pago para activar la renovación automática. El próximo ciclo se intentará cobrar desde el ${formatDateAr(startDate)} solo si completás la configuración del débito automático.`,
    auto_renew_policy_version: AUTORENEW_POLICY_VERSION
  }, 200);
}

async function handleDisableAutoRenew(request, env) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  if (!userId) return json({ ok: false, message: "Falta user_id.", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 400);

  const user = await getUserById(env, userId);
  if (!user) return json({ ok: false, message: "Usuario no encontrado.", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 404);

  const { current } = await resolveCurrentSubscription(env, userId);
  if (!current || !hasRecurringPreapproval(current)) {
    return json({ ok: false, message: "No tenés renovación automática activa para desactivar.", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 409);
  }

  await cancelMercadoPagoPreapproval(env, current.mercadopago_preapproval_id);
  await supabasePatchById(env, "user_subscriptions", current.id, { mercadopago_preapproval_id: null });

  return json({ ok: true, recurring_enabled: false, renewal_policy: "manual_renewal", message: current?.current_period_ends_at ? `La renovación automática quedó desactivada. Conservás el acceso hasta el ${formatDateAr(current.current_period_ends_at)} y después el plan vence sin cobrarte de nuevo.` : `La renovación automática quedó desactivada. No se harán nuevos cobros automáticos.`, auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 200);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === `${API_URL_PREFIX}/mi-plan` && request.method === "GET") {
      try { return await enrichMiPlan(request, env, ctx); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo leer el plan", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 500); }
    }

    if (path === `${API_URL_PREFIX}/subscription/enable-auto-renew` && request.method === "POST") {
      try { return await handleEnableAutoRenew(request, env); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo activar la renovación automática", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 500); }
    }

    if (path === `${API_URL_PREFIX}/subscription/cancel` && request.method === "POST") {
      try { return await handleDisableAutoRenew(request, env); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo desactivar la renovación automática", auto_renew_policy_version: AUTORENEW_POLICY_VERSION }, 500); }
    }

    return await baseWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") return await baseWorker.scheduled(controller, env, ctx);
  }
};

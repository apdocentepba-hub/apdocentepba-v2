import baseWorker from "./worker_autorenew_optin_hotfix.js";

const API_URL_PREFIX = "/api";
const ANNUAL_PLAN_VERSION = "2026-06-24-annual-one-time-1";
const ANNUAL_DAYS = 365;

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

function norm(value) { return String(value || "").trim().toUpperCase(); }
function canonicalPlanCode(code) { const raw = norm(code); if (raw === "PRO") return "PREMIUM"; if (raw === "PRO_ANUAL") return "PREMIUM_ANUAL"; return raw || ""; }
function isAnnualPlanCode(code) { return canonicalPlanCode(code).endsWith("_ANUAL"); }
function monthlyCodeFromAnnual(code) { const c = canonicalPlanCode(code); if (c === "PLUS_ANUAL") return "PLUS"; if (c === "PREMIUM_ANUAL") return "PREMIUM"; if (c === "INSIGNE_ANUAL") return "INSIGNE"; return c; }
function rankPlan(code) { const c = monthlyCodeFromAnnual(code); if (c === "PLUS") return 1; if (c === "PREMIUM") return 2; if (c === "INSIGNE") return 3; return 0; }
function parseFechaFlexible(value) { const raw = String(value || "").trim(); if (!raw) return null; const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d; }
function addDaysIso(baseIso, days) { const baseDate = parseFechaFlexible(baseIso) || new Date(); return new Date(baseDate.getTime() + days * 86400000).toISOString(); }
function maxIsoDate(a, b) { const da = parseFechaFlexible(a); const db = parseFechaFlexible(b) || new Date(); if (!da) return db.toISOString(); return da.getTime() > db.getTime() ? da.toISOString() : db.toISOString(); }
function formatDateAr(value) { const d = parseFechaFlexible(value); return d ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : ""; }
function safeJsonParse(value) { if (!value) return null; if (typeof value === "object") return value; try { return JSON.parse(value); } catch { return null; } }

function annualPlanPresets() {
  return [
    {
      code: "PLUS_ANUAL",
      nombre: "Plan Plus Anual",
      display_name: "Plan Plus Anual",
      descripcion: "Pago único anual: 12 meses de Plan Plus por el valor de 10 meses. No tiene débito mensual automático.",
      price_ars: 10000,
      trial_days: 0,
      max_distritos: 2,
      max_distritos_normales: 2,
      max_distritos_emergencia: 0,
      max_cargos: 4,
      is_active: true,
      public_visible: true,
      sort_order: 12,
      mercadopago_plan_id: null,
      billing_interval: "yearly",
      billing_months: 12,
      billing_mode: "one_time_yearly",
      annual_days: ANNUAL_DAYS,
      no_refund_policy: true,
      feature_flags: { email: true, whatsapp: false, telegram: false, telegram_coming_soon: true, whatsapp_coming_soon: false, provincia: true, insights_plus: false, annual_one_time: true }
    },
    {
      code: "PREMIUM_ANUAL",
      nombre: "Plan Pro Anual",
      display_name: "Plan Pro Anual",
      descripcion: "Pago único anual: 12 meses de Plan Pro por el valor de 10 meses. No tiene débito mensual automático.",
      price_ars: 20000,
      trial_days: 0,
      max_distritos: 3,
      max_distritos_normales: 3,
      max_distritos_emergencia: 0,
      max_cargos: 6,
      is_active: true,
      public_visible: true,
      sort_order: 13,
      mercadopago_plan_id: null,
      billing_interval: "yearly",
      billing_months: 12,
      billing_mode: "one_time_yearly",
      annual_days: ANNUAL_DAYS,
      no_refund_policy: true,
      feature_flags: { email: true, whatsapp: false, telegram: false, telegram_coming_soon: true, whatsapp_coming_soon: false, provincia: true, insights_plus: true, annual_one_time: true }
    },
    {
      code: "INSIGNE_ANUAL",
      nombre: "Plan Insigne Anual",
      display_name: "Plan Insigne Anual",
      descripcion: "Pago único anual: 12 meses de Plan Insigne por el valor de 10 meses. No tiene débito mensual automático.",
      price_ars: 30000,
      trial_days: 0,
      max_distritos: 5,
      max_distritos_normales: 3,
      max_distritos_emergencia: 2,
      max_cargos: 10,
      is_active: true,
      public_visible: true,
      sort_order: 14,
      mercadopago_plan_id: null,
      billing_interval: "yearly",
      billing_months: 12,
      billing_mode: "one_time_yearly",
      annual_days: ANNUAL_DAYS,
      no_refund_policy: true,
      feature_flags: { email: true, whatsapp: false, telegram: false, telegram_coming_soon: false, whatsapp_coming_soon: true, provincia: true, insights_plus: true, emergency_districts: true, annual_one_time: true }
    }
  ];
}

function getAnnualPlanByCode(code) { const c = canonicalPlanCode(code); return annualPlanPresets().find(plan => canonicalPlanCode(plan.code) === c) || null; }
function normalizeSubscriptionStatus(status) { const raw = norm(status); if (!raw) return "PENDING"; if (raw === "APPROVED") return "ACTIVE"; if (raw === "TRIAL") return "TRIALING"; if (["ACTIVE", "AUTHORIZED", "TRIALING", "PAUSED", "PENDING", "BETA", "CANCELLED", "CANCELED"].includes(raw)) return raw; if (["IN_PROCESS", "PENDING_CONTINGENCY"].includes(raw)) return "PENDING"; if (["REJECTED", "REFUNDED", "CHARGED_BACK", "EXPIRED"].includes(raw)) return "CANCELLED"; return raw; }
function hasRecurringPreapproval(subscription) { return !!String(subscription?.mercadopago_preapproval_id || "").trim(); }
function isSubscriptionCurrent(subscription) { if (!subscription) return false; const status = normalizeSubscriptionStatus(subscription.status); const planCode = canonicalPlanCode(subscription.plan_code); const now = Date.now(); if (status === "CANCELLED" || status === "CANCELED") return false; if (planCode === "TRIAL_7D") { const end = parseFechaFlexible(subscription.trial_ends_at)?.getTime() || 0; return !!end && now <= end; } if (["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED", "BETA"].includes(status)) { const end = parseFechaFlexible(subscription.current_period_ends_at)?.getTime() || 0; return !end || now <= end; } return false; }

async function supabaseRequest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

async function supabaseSelect(env, query) { return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } }); }
async function supabaseInsertReturning(env, table, data) { const rows = await supabaseRequest(env, table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) }); return Array.isArray(rows) ? rows[0] || null : rows; }
async function supabasePatchById(env, table, id, payload) { const rows = await supabaseRequest(env, `${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }); return Array.isArray(rows) ? rows[0] || null : rows; }
async function getUserById(env, userId) { const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo&limit=1`).catch(() => []); return Array.isArray(rows) ? rows[0] || null : null; }
async function getUserSubscriptions(env, userId) { const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`).catch(() => []); return Array.isArray(rows) ? rows : []; }
async function getCurrentSubscription(env, userId) { const rows = await getUserSubscriptions(env, userId); return rows.find(isSubscriptionCurrent) || rows[0] || null; }
async function getCheckoutSessionByExternalReference(env, externalReference) { const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at&limit=1`).catch(() => []); const row = Array.isArray(rows) ? rows[0] || null : null; return row ? { ...row, provider_payload: safeJsonParse(row.provider_payload) || row.provider_payload || null } : null; }

async function mercadoPagoRequest(env, path, init = {}) {
  const accessToken = String(env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  const res = await fetch(`https://api.mercadopago.com${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const rawText = await res.text();
  let data = null;
  try { data = rawText ? JSON.parse(rawText) : null; } catch { data = rawText; }
  if (!res.ok) throw new Error(data?.message || data?.cause?.[0]?.description || `Mercado Pago error ${res.status}`);
  return data;
}

async function fetchMercadoPagoPayment(env, paymentId) { return await mercadoPagoRequest(env, `/v1/payments/${encodeURIComponent(paymentId)}`, { method: "GET" }); }
async function cancelMercadoPagoPreapproval(env, preapprovalId) { if (!preapprovalId) return null; return await mercadoPagoRequest(env, `/preapproval/${encodeURIComponent(preapprovalId)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }); }

async function createMercadoPagoCheckoutPreference(env, context) {
  const amount = Number(context?.amount_ars || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto anual no es válido");
  const payload = {
    items: [{ id: String(context?.target_plan?.code || "PLAN_ANUAL").trim().toUpperCase(), title: String(context?.title || context?.target_plan?.nombre || "Plan anual APDocentePBA").trim(), description: String(context?.description || context?.target_plan?.descripcion || "").trim() || undefined, quantity: 1, currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS", unit_price: amount }],
    payer: { email: String(context?.user?.email || "").trim().toLowerCase() || undefined, name: String(context?.user?.nombre || "").trim() || undefined, surname: String(context?.user?.apellido || "").trim() || undefined },
    external_reference: context.external_reference,
    notification_url: context.webhook_url,
    statement_descriptor: String(env.MERCADOPAGO_STATEMENT_DESCRIPTOR || "APDOCENTEPBA").slice(0, 13)
  };
  const successUrl = String(env.MERCADOPAGO_SUCCESS_URL || "").trim();
  const pendingUrl = String(env.MERCADOPAGO_PENDING_URL || "").trim();
  const failureUrl = String(env.MERCADOPAGO_FAILURE_URL || "").trim();
  if (successUrl || pendingUrl || failureUrl) { payload.back_urls = {}; if (successUrl) payload.back_urls.success = successUrl; if (pendingUrl) payload.back_urls.pending = pendingUrl; if (failureUrl) payload.back_urls.failure = failureUrl; }
  if (successUrl) payload.auto_return = "approved";
  const data = await mercadoPagoRequest(env, "/checkout/preferences", { method: "POST", body: JSON.stringify(payload) });
  return { mode: "mercadopago_preference", preference_id: data?.id || null, checkout_url: data?.init_point || null, sandbox_init_point: data?.sandbox_init_point || null, raw: data };
}

async function delegateJson(request, env, ctx) {
  const response = await baseWorker.fetch(request, env, ctx);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data, text };
}

function mergeAnnualPlans(data) {
  const annual = annualPlanPresets();
  const planes = Array.isArray(data?.planes) ? data.planes : [];
  const seen = new Set(planes.map(plan => canonicalPlanCode(plan?.code || plan?.display_code || "")));
  const merged = [...planes, ...annual.filter(plan => !seen.has(canonicalPlanCode(plan.code)))];
  merged.sort((a, b) => Number(a?.sort_order || 999) - Number(b?.sort_order || 999));
  return { ...data, planes: merged, annual_plan_version: ANNUAL_PLAN_VERSION };
}

function calculateProratedCredit(current, currentPlan) {
  if (!current || !currentPlan) return { credit_ars: 0, remaining_ratio: 0, cycle_started_at: null, cycle_ends_at: null, credit_note: "Sin crédito proporcional." };
  const status = normalizeSubscriptionStatus(current.status);
  const currentCode = canonicalPlanCode(current.plan_code);
  if (!["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED", "BETA"].includes(status)) return { credit_ars: 0, remaining_ratio: 0, cycle_started_at: null, cycle_ends_at: null, credit_note: "El plan actual no genera crédito proporcional." };
  const startTs = parseFechaFlexible(current.started_at)?.getTime() || 0;
  const endTs = parseFechaFlexible(current.current_period_ends_at)?.getTime() || 0;
  const nowTs = Date.now();
  if (!startTs || !endTs || endTs <= startTs || endTs <= nowTs) return { credit_ars: 0, remaining_ratio: 0, cycle_started_at: current.started_at || null, cycle_ends_at: current.current_period_ends_at || null, credit_note: "No queda tiempo vigente para descontar." };
  const remainingRatio = Math.max(0, Math.min(1, (endTs - nowTs) / (endTs - startTs)));
  const basePrice = Number(currentPlan?.price_ars || 0) || 0;
  const credit = Math.max(0, Math.round(basePrice * remainingRatio));
  return { credit_ars: credit, remaining_ratio: Number(remainingRatio.toFixed(4)), cycle_started_at: current.started_at || null, cycle_ends_at: current.current_period_ends_at || null, credit_note: `Crédito aplicado por el tiempo no usado del plan ${currentCode}: $${credit.toLocaleString("es-AR")}.` };
}

async function getPlanForCredit(env, code) {
  const monthly = monthlyCodeFromAnnual(code);
  const rows = await supabaseSelect(env, `subscription_plans?code=eq.${encodeURIComponent(monthly)}&select=code,nombre,descripcion,price_ars,mercadopago_plan_id&limit=1`).catch(() => []);
  if (Array.isArray(rows) && rows[0]) return rows[0];
  if (monthly === "PLUS") return { code: "PLUS", nombre: "Plan Plus", price_ars: 1000 };
  if (monthly === "PREMIUM") return { code: "PREMIUM", nombre: "Plan Pro", price_ars: 2000 };
  if (monthly === "INSIGNE") return { code: "INSIGNE", nombre: "Plan Insigne", price_ars: 3000 };
  return null;
}

async function handlePlanes(request, env, ctx) {
  const delegated = await delegateJson(request, env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) return json(delegated.data || { ok: false }, delegated.response.status || 500);
  return json(mergeAnnualPlans(delegated.data), delegated.response.status || 200);
}

async function handleMiPlan(request, env, ctx) {
  const delegated = await delegateJson(request, env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) return json(delegated.data || { ok: false }, delegated.response.status || 500);
  const sub = delegated.data?.subscription || null;
  const annualPlan = isAnnualPlanCode(sub?.plan_code) ? getAnnualPlanByCode(sub.plan_code) : null;
  if (!annualPlan) return json({ ...delegated.data, annual_plan_version: ANNUAL_PLAN_VERSION }, delegated.response.status || 200);
  const until = sub?.current_period_ends_at ? formatDateAr(sub.current_period_ends_at) : "";
  return json({
    ...delegated.data,
    plan: annualPlan,
    subscription: { ...sub, plan_code: canonicalPlanCode(sub.plan_code), billing_mode: "one_time_yearly", renewal_policy: "annual_manual", recurring_enabled: false, annual_one_time: true },
    actions: { ...(delegated.data?.actions || {}), can_enable_auto_renew: false, can_disable_auto_renew: false },
    billing_note: until ? `Tu plan anual está activo hasta el ${until}. Es pago único anual y no tiene débito mensual automático.` : "Tu plan anual es pago único y no tiene débito mensual automático.",
    annual_plan_version: ANNUAL_PLAN_VERSION
  }, delegated.response.status || 200);
}

async function handleAnnualCheckout(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  const targetPlanCode = canonicalPlanCode(body?.plan_code || "");
  if (!isAnnualPlanCode(targetPlanCode)) return await baseWorker.fetch(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }), env, ctx);
  if (!userId) return json({ ok: false, reason: "missing_user_id", message: "Falta user_id.", annual_plan_version: ANNUAL_PLAN_VERSION }, 400);
  const targetPlan = getAnnualPlanByCode(targetPlanCode);
  if (!targetPlan) return json({ ok: false, reason: "annual_plan_not_found", message: "No encontramos el plan anual elegido.", annual_plan_version: ANNUAL_PLAN_VERSION }, 404);
  const user = await getUserById(env, userId);
  if (!user) return json({ ok: false, reason: "user_not_found", message: "Usuario no encontrado.", annual_plan_version: ANNUAL_PLAN_VERSION }, 404);

  const current = await getCurrentSubscription(env, userId);
  const currentCode = canonicalPlanCode(current?.plan_code || "");
  if (current && isAnnualPlanCode(currentCode) && isSubscriptionCurrent(current)) {
    if (currentCode === targetPlanCode) return json({ ok: false, reason: "same_annual_plan", message: "Ya tenés activo ese plan anual.", annual_plan_version: ANNUAL_PLAN_VERSION }, 409);
    if (rankPlan(targetPlanCode) <= rankPlan(currentCode)) return json({ ok: false, reason: "annual_downgrade_blocked", message: "Ya tenés un plan anual activo. Los cambios a un plan anual menor se realizan al vencimiento; no se hacen reembolsos en dinero.", annual_plan_version: ANNUAL_PLAN_VERSION }, 409);
  }

  const currentPlan = current ? await getPlanForCredit(env, currentCode) : null;
  const credit = current && !isAnnualPlanCode(currentCode) ? calculateProratedCredit(current, currentPlan) : { credit_ars: 0, remaining_ratio: 0, cycle_started_at: null, cycle_ends_at: null, credit_note: "Sin crédito proporcional." };
  const amountToCharge = Math.max(1, Math.round(Number(targetPlan.price_ars || 0) - Number(credit.credit_ars || 0)));
  const externalReference = `ANNUAL:${userId}:${targetPlanCode}:${Date.now()}`;
  const webhookUrl = env.MERCADOPAGO_WEBHOOK_URL || new URL(`${API_URL_PREFIX}/mercadopago/webhook`, request.url).toString();
  const hasRecurring = hasRecurringPreapproval(current);

  const preference = await createMercadoPagoCheckoutPreference(env, {
    user,
    target_plan: targetPlan,
    amount_ars: amountToCharge,
    external_reference: externalReference,
    webhook_url: webhookUrl,
    title: `APDocentePBA · ${targetPlan.nombre}`,
    description: `${targetPlan.descripcion} No se realizan reembolsos; si tenés mensual activo se descuenta el proporcional no usado.`
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
      transition_mode: "annual_one_time",
      target_plan_code: targetPlanCode,
      target_price_ars: Number(targetPlan.price_ars || 0),
      current_subscription_id: current?.id || null,
      current_plan_code: currentCode || null,
      current_preapproval_id: current?.mercadopago_preapproval_id || null,
      cancel_existing_preapproval_on_approval: hasRecurring,
      credit_ars: credit.credit_ars,
      credit_ratio: credit.remaining_ratio,
      credit_cycle_started_at: credit.cycle_started_at,
      credit_cycle_ends_at: credit.cycle_ends_at,
      amount_to_charge_ars: amountToCharge,
      annual_days: ANNUAL_DAYS,
      no_cash_refund: true,
      no_refund_policy_ack_required: true
    }
  });

  return json({
    ok: true,
    configured: !!preference?.checkout_url,
    provider_mode: preference?.mode || "mercadopago_preference",
    checkout_url: preference?.checkout_url || null,
    sandbox_init_point: preference?.sandbox_init_point || null,
    preference_id: preference?.preference_id || null,
    external_reference: externalReference,
    session_id: session?.id || null,
    plan: targetPlan,
    annual_quote: { target_price_ars: Number(targetPlan.price_ars || 0), credit_ars: credit.credit_ars, amount_to_charge_ars: amountToCharge, credit_note: credit.credit_note, no_cash_refund: true },
    billing_mode: "one_time_yearly",
    recurring_enabled: false,
    message: credit.credit_ars > 0
      ? `Plan anual preparado. Precio anual $${Number(targetPlan.price_ars || 0).toLocaleString("es-AR")}; se descuenta $${credit.credit_ars.toLocaleString("es-AR")} del tiempo no usado de tu mensual. Pagás ahora $${amountToCharge.toLocaleString("es-AR")}. No se hacen reembolsos en dinero.`
      : `Plan anual preparado por $${amountToCharge.toLocaleString("es-AR")}. Es pago único anual, sin débito mensual automático. No se hacen reembolsos en dinero.`,
    annual_plan_version: ANNUAL_PLAN_VERSION
  }, 200);
}

async function safeApplySubscription(env, currentId, payload) {
  if (currentId) {
    try { return await supabasePatchById(env, "user_subscriptions", currentId, { ...payload, updated_at: new Date().toISOString() }); }
    catch { return await supabasePatchById(env, "user_subscriptions", currentId, payload); }
  }
  return await supabaseInsertReturning(env, "user_subscriptions", payload);
}

async function applyAnnualPayment(env, payment, session) {
  const payload = safeJsonParse(session?.provider_payload) || {};
  const paymentStatus = norm(payment?.status || "");
  const approved = ["APPROVED", "AUTHORIZED"].includes(paymentStatus);
  const nowIso = new Date().toISOString();
  await supabasePatchById(env, "mercadopago_checkout_sessions", session.id, {
    status: approved ? "approved" : String(payment?.status || "pending"),
    provider_payload: { ...payload, payment_id: payment?.id || null, payment_status: payment?.status || null, payment_status_detail: payment?.status_detail || null, payer_email: payment?.payer?.email || null, processed_at: nowIso }
  }).catch(() => null);

  if (!approved) return { processed: true, annual_plan_applied: false, reason: "payment_not_approved", payment_status: paymentStatus };
  const targetPlanCode = canonicalPlanCode(payload?.target_plan_code || session?.plan_code || "");
  if (!isAnnualPlanCode(targetPlanCode)) return { processed: false, annual_plan_applied: false, reason: "not_annual_plan" };

  let preapprovalCancelled = false;
  const preapprovalId = String(payload?.current_preapproval_id || "").trim();
  if (payload?.cancel_existing_preapproval_on_approval && preapprovalId) {
    try { await cancelMercadoPagoPreapproval(env, preapprovalId); preapprovalCancelled = true; } catch { preapprovalCancelled = false; }
  }

  const endsAt = addDaysIso(nowIso, ANNUAL_DAYS);
  const subscriptionPayload = {
    user_id: session.user_id,
    plan_code: targetPlanCode,
    status: paymentStatus === "AUTHORIZED" ? "AUTHORIZED" : "ACTIVE",
    source: "mercadopago_annual_one_time",
    started_at: nowIso,
    trial_ends_at: null,
    current_period_ends_at: endsAt,
    mercadopago_preapproval_id: null,
    external_reference: session.external_reference
  };

  const currentSubscriptionId = String(payload?.current_subscription_id || "").trim();
  const subscription = await safeApplySubscription(env, currentSubscriptionId, subscriptionPayload);
  await supabasePatchById(env, "mercadopago_checkout_sessions", session.id, {
    provider_payload: { ...payload, payment_id: payment?.id || null, payment_status: payment?.status || null, annual_plan_applied: true, applied_at: nowIso, annual_period_ends_at: endsAt, preapproval_cancelled: preapprovalCancelled, no_cash_refund: true }
  }).catch(() => null);

  return { processed: true, annual_plan_applied: true, user_id: session.user_id, plan_code: targetPlanCode, current_period_ends_at: endsAt, preapproval_cancelled: preapprovalCancelled, subscription_id: subscription?.id || currentSubscriptionId || null };
}

async function handleMercadoPagoWebhook(request, env, ctx) {
  const raw = await request.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw_text: raw }; }
  const topic = String(payload?.type || payload?.topic || payload?.action || "").trim().toLowerCase();
  const resourceId = String(payload?.data?.id || payload?.id || "").trim();
  if (!resourceId || !topic.includes("payment")) return await baseWorker.fetch(new Request(request.url, { method: request.method, headers: request.headers, body: raw }), env, ctx);
  const payment = await fetchMercadoPagoPayment(env, resourceId);
  const externalReference = String(payment?.external_reference || "").trim();
  const session = externalReference ? await getCheckoutSessionByExternalReference(env, externalReference) : null;
  const sessionPayload = safeJsonParse(session?.provider_payload) || session?.provider_payload || {};
  if (String(sessionPayload?.transition_mode || "") !== "annual_one_time") return await baseWorker.fetch(new Request(request.url, { method: request.method, headers: request.headers, body: raw }), env, ctx);
  const sync = await applyAnnualPayment(env, payment, session);
  return json({ ok: true, sync, annual_plan_version: ANNUAL_PLAN_VERSION });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === `${API_URL_PREFIX}/planes` && request.method === "GET") {
      try { return await handlePlanes(request, env, ctx); } catch (err) { return json({ ok: false, message: err?.message || "No se pudieron cargar planes", annual_plan_version: ANNUAL_PLAN_VERSION }, 500); }
    }
    if (path === `${API_URL_PREFIX}/mi-plan` && request.method === "GET") {
      try { return await handleMiPlan(request, env, ctx); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo leer el plan", annual_plan_version: ANNUAL_PLAN_VERSION }, 500); }
    }
    if (path === `${API_URL_PREFIX}/mercadopago/create-checkout-link` && request.method === "POST") {
      try { return await handleAnnualCheckout(request, env, ctx); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo preparar el plan anual", annual_plan_version: ANNUAL_PLAN_VERSION }, 500); }
    }
    if (path === `${API_URL_PREFIX}/mercadopago/webhook` && request.method === "POST") {
      try { return await handleMercadoPagoWebhook(request, env, ctx); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo procesar el webhook anual", annual_plan_version: ANNUAL_PLAN_VERSION }, 500); }
    }
    return await baseWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") return await baseWorker.scheduled(controller, env, ctx);
  }
};

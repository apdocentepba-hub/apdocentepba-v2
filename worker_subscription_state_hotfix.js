import baseWorker from "./worker_autorenew_optin_hotfix.js";

const API_URL_PREFIX = "/api";
const SUBSCRIPTION_STATE_POLICY_VERSION = "2026-04-06-admin-payments-1";
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

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
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

  if (["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED", "BETA", "TRIALING"].includes(status)) {
    const end = parseFechaFlexible(subscription.current_period_ends_at)?.getTime() || 0;
    return !end || now <= end;
  }

  return false;
}

function getSubscriptionAccessUntil(subscription) {
  if (!subscription) return null;
  const planCode = canonicalPlanCode(subscription.plan_code);
  return planCode === "TRIAL_7D" ? subscription.trial_ends_at || null : subscription.current_period_ends_at || null;
}

function getSubscriptionBillingMode(subscription) {
  if (hasRecurringPreapproval(subscription)) return "recurring_preapproval";
  if (canonicalPlanCode(subscription?.plan_code) === "TRIAL_7D") return "trial";
  return "one_time_cycle";
}

function getRenewalPolicy(subscription) {
  const billingMode = getSubscriptionBillingMode(subscription);
  if (billingMode === "recurring_preapproval") return "automatic_opt_in";
  if (billingMode === "trial") return "trial";
  return "manual_renewal";
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

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,es_admin&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getSessionByToken(env, token) {
  const rows = await supabaseSelect(env, `sessions?token=eq.${encodeURIComponent(token)}&activo=eq.true&select=token,user_id,metodo,created_at,expires_at,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function resolveAuthUser(env, request) {
  const bearer = getBearerToken(request);
  if (!bearer) return null;

  const session = await getSessionByToken(env, bearer);
  if (session) {
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;
    return await getUserById(env, session.user_id);
  }

  return await getUserById(env, bearer);
}

async function getUserSubscriptions(env, userId) {
  const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  const rows = await supabaseSelect(env, `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags,sort_order&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserCheckoutSessions(env, userId) {
  const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at&order=created_at.desc&limit=50`).catch(() => []);
  return Array.isArray(rows) ? rows.map((row) => ({ ...row, provider_payload: safeJsonParse(row.provider_payload) || row.provider_payload || null })) : [];
}

async function getRecentSubscriptionsAdmin(env, limit = 200) {
  const rows = await supabaseSelect(env, `user_subscriptions?select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,mercadopago_payer_email,external_reference,created_at&order=created_at.desc&limit=${limit}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getRecentCheckoutSessionsAdmin(env, limit = 200) {
  const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at,updated_at&order=created_at.desc&limit=${limit}`).catch(() => []);
  return Array.isArray(rows) ? rows.map((row) => ({ ...row, provider_payload: safeJsonParse(row.provider_payload) || row.provider_payload || null })) : [];
}

function resolveLifecycleStatus(subscription) {
  if (!subscription) return "none";
  const status = normalizeSubscriptionStatus(subscription.status);
  const accessUntilTs = parseFechaFlexible(getSubscriptionAccessUntil(subscription))?.getTime() || 0;
  const now = Date.now();

  if (status === "CANCELLED") return accessUntilTs && accessUntilTs > now ? "active_until_canceled" : "canceled";
  if (!accessUntilTs) return "active_open";
  if (accessUntilTs <= now) return "expired";
  if (accessUntilTs - now <= 72 * 60 * 60 * 1000) return "expiring";
  return status === "TRIALING" ? "trialing" : "active";
}

function findReusableCheckoutSession(sessions, options = {}) {
  const planCode = canonicalPlanCode(options.planCode || "");
  const transitionMode = String(options.transitionMode || "").trim();
  const autoRenewOptIn = options.autoRenewOptIn === true;
  const now = Date.now();

  return (Array.isArray(sessions) ? sessions : []).find((session) => {
    const status = String(session?.status || "").trim().toLowerCase();
    if (!["ready", "pending_config"].includes(status)) return false;
    if (!session?.checkout_url) return false;
    const createdAt = sessionCreatedAtTs(session);
    if (!createdAt || now - createdAt > REUSE_SESSION_WINDOW_MS) return false;
    const payload = safeJsonParse(session?.provider_payload) || {};
    if (autoRenewOptIn) {
      return payload?.auto_renew_opt_in === true && canonicalPlanCode(session?.plan_code || payload?.plan_code || "") === planCode;
    }
    const payloadMode = String(payload?.transition_mode || "").trim();
    if (transitionMode) {
      return canonicalPlanCode(session?.plan_code || payload?.target_plan_code || "") === planCode && payloadMode === transitionMode;
    }
    return canonicalPlanCode(session?.plan_code || "") === planCode && !payloadMode && payload?.auto_renew_opt_in !== true;
  }) || null;
}

function findScheduledDowngradeSession(sessions, currentPlanCode) {
  return (Array.isArray(sessions) ? sessions : []).find((session) => {
    if (String(session?.status || "").trim().toLowerCase() !== "scheduled") return false;
    const payload = safeJsonParse(session?.provider_payload) || {};
    return String(payload?.transition_mode || "") === "downgrade_next_cycle" && (!currentPlanCode || canonicalPlanCode(payload?.current_plan_code || "") === currentPlanCode);
  }) || null;
}

async function resolveSubscriptionSnapshot(env, userId) {
  const rows = await getUserSubscriptions(env, userId);
  const current = rows.find(isSubscriptionCurrent) || rows[0] || null;
  const trialUsed = rows.some((row) => canonicalPlanCode(row?.plan_code) === "TRIAL_7D");
  const currentPlan = current ? await getPlanByCode(env, current.plan_code) : null;
  const sessions = await getUserCheckoutSessions(env, userId);
  const currentPlanCode = canonicalPlanCode(current?.plan_code || "");
  const scheduledChangeSession = findScheduledDowngradeSession(sessions, currentPlanCode);
  const scheduledPayload = safeJsonParse(scheduledChangeSession?.provider_payload) || null;

  return {
    rows,
    sessions,
    current,
    currentPlan,
    trialUsed,
    hasRecurring: hasRecurringPreapproval(current),
    currentPlanCode,
    currentStatus: normalizeSubscriptionStatus(current?.status || ""),
    scheduledChange: scheduledChangeSession ? {
      session_id: scheduledChangeSession.id || null,
      status: scheduledChangeSession.status || "scheduled",
      mode: String(scheduledPayload?.transition_mode || "downgrade_next_cycle"),
      current_plan_code: canonicalPlanCode(scheduledPayload?.current_plan_code || currentPlanCode),
      next_plan_code: canonicalPlanCode(scheduledPayload?.target_plan_code || scheduledChangeSession?.plan_code || ""),
      apply_at: scheduledPayload?.apply_at || null,
      created_at: scheduledChangeSession?.created_at || null
    } : null
  };
}

function buildResolvedState(snapshot) {
  const current = snapshot?.current || null;
  const accessUntil = getSubscriptionAccessUntil(current);
  return {
    access_active: !!current && isSubscriptionCurrent(current),
    access_until: accessUntil,
    access_until_label: formatDateAr(accessUntil),
    current_plan_code: canonicalPlanCode(current?.plan_code || "TRIAL_7D"),
    current_status: normalizeSubscriptionStatus(current?.status || ""),
    lifecycle_status: resolveLifecycleStatus(current),
    billing_mode: getSubscriptionBillingMode(current),
    renewal_policy: getRenewalPolicy(current),
    recurring_enabled: hasRecurringPreapproval(current),
    scheduled_next_plan_code: snapshot?.scheduledChange?.next_plan_code || null,
    scheduled_next_plan_apply_at: snapshot?.scheduledChange?.apply_at || null,
    scheduled_next_plan_apply_label: formatDateAr(snapshot?.scheduledChange?.apply_at)
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
    can_schedule_downgrade: currentPaid,
    can_return_to_trial: false,
    can_cancel_recurring: recurring,
    requires_manual_support_for_paid_plan_change: currentPaid && recurring,
    billing_mode: getSubscriptionBillingMode(current),
    renewal_policy: getRenewalPolicy(current),
    recurring_enabled: recurring,
    current_plan_price_ars: Number(currentPlan?.price_ars || 0) || 0
  };
}

function decidePlanTransition(snapshot, targetPlan) {
  const targetPlanCode = canonicalPlanCode(targetPlan?.code || "");
  const current = snapshot?.current || null;
  const currentPlan = snapshot?.currentPlan || null;
  const currentPlanCode = canonicalPlanCode(current?.plan_code || "");
  const currentPaid = !!current && isPaidPlan(currentPlanCode) && isSubscriptionCurrent(current);
  const recurring = hasRecurringPreapproval(current);

  if (!targetPlanCode) return { allowed: false, status: 400, reason: "missing_target_plan", message: "No se recibió el plan de destino." };
  if (targetPlanCode === currentPlanCode && current) return { allowed: false, status: 409, reason: "same_plan", message: "Ya estás en ese plan." };
  if (targetPlanCode === "TRIAL_7D") return { allowed: false, status: 409, reason: "trial_return_blocked", message: "La vuelta a prueba gratis queda bloqueada para evitar inconsistencias de facturación y de estado." };
  if (!current || !currentPaid || currentPlanCode === "TRIAL_7D") return { allowed: true, status: 200, mode: "new_checkout", reason: "initial_activation", message: "Alta inicial o salida de prueba a plan pago." };

  const currentPrice = Number(currentPlan?.price_ars || 0);
  const targetPrice = Number(targetPlan?.price_ars || 0);

  if (targetPrice < currentPrice) {
    return {
      allowed: true,
      status: 200,
      mode: "downgrade_scheduled",
      reason: "downgrade_next_cycle",
      message: current?.current_period_ends_at
        ? `El cambio a ${targetPlan?.nombre || targetPlanCode} queda programado para cuando venza el ciclo actual (${formatDateAr(current.current_period_ends_at)}).`
        : `El cambio a ${targetPlan?.nombre || targetPlanCode} queda programado para el próximo ciclo.`
    };
  }

  if (recurring) {
    return {
      allowed: false,
      status: 409,
      reason: "manual_transition_required",
      message: "Los cambios hacia arriba con renovación automática activa quedan bloqueados hasta actualizar el débito del próximo ciclo de forma segura."
    };
  }

  if (targetPrice > currentPrice) {
    return { allowed: true, status: 200, mode: "delegate_checkout", reason: "paid_upgrade_prorated", message: "Upgrade permitido." };
  }

  return { allowed: false, status: 409, reason: "same_price_manual", message: "El cambio entre planes del mismo valor todavía no quedó automatizado." };
}

async function handleAdminPagos(request, env) {
  const user = await resolveAuthUser(env, request);
  if (!user) return json({ ok: false, error: "No autenticado" }, 401);
  if (!user.es_admin) return json({ ok: false, error: "No autorizado" }, 403);

  const [subscriptions, checkouts] = await Promise.all([
    getRecentSubscriptionsAdmin(env, 200),
    getRecentCheckoutSessionsAdmin(env, 200)
  ]);

  const planCounts = {};
  for (const row of subscriptions) {
    const code = canonicalPlanCode(row?.plan_code || "") || "SIN_PLAN";
    planCounts[code] = (planCounts[code] || 0) + 1;
  }

  const summary = {
    subscriptions_total: subscriptions.length,
    subscriptions_active: subscriptions.filter(isSubscriptionCurrent).length,
    subscriptions_trial: subscriptions.filter((row) => canonicalPlanCode(row?.plan_code) === "TRIAL_7D").length,
    subscriptions_recurring: subscriptions.filter((row) => hasRecurringPreapproval(row)).length,
    subscriptions_cancelled: subscriptions.filter((row) => normalizeSubscriptionStatus(row?.status) === "CANCELLED").length,
    checkout_total: checkouts.length,
    checkout_ready: checkouts.filter((row) => String(row?.status || "").toLowerCase() === "ready").length,
    checkout_pending: checkouts.filter((row) => ["pending", "pending_config", "scheduled"].includes(String(row?.status || "").toLowerCase())).length,
    checkout_approved: checkouts.filter((row) => ["approved", "authorized"].includes(String(row?.status || "").toLowerCase())).length,
    checkout_rejected: checkouts.filter((row) => ["rejected", "refunded"].includes(String(row?.status || "").toLowerCase())).length,
    by_plan: planCounts
  };

  return json({
    ok: true,
    generated_at: new Date().toISOString(),
    summary,
    recent_subscriptions: subscriptions.slice(0, 60),
    recent_checkouts: checkouts.slice(0, 60)
  });
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

async function handleMiPlanWithState(request, env, ctx) {
  const delegated = await delegateJson(request, env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) {
    return json(delegated.data || { ok: false, message: "No se pudo leer el plan" }, delegated.response.status || 500);
  }

  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || delegated.data?.user_id || "").trim();
  if (!userId) {
    return json({ ...delegated.data, subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, delegated.response.status || 200);
  }

  const snapshot = await resolveSubscriptionSnapshot(env, userId);
  const resolvedState = buildResolvedState(snapshot);
  const actions = { ...(delegated.data?.actions || {}), ...buildSubscriptionActions(snapshot) };
  let billingNote = delegated.data?.billing_note || "";

  if (snapshot?.scheduledChange?.next_plan_code) {
    const nextPlan = await getPlanByCode(env, snapshot.scheduledChange.next_plan_code).catch(() => null);
    const nextLabel = nextPlan?.nombre || snapshot.scheduledChange.next_plan_code;
    const dateLabel = formatDateAr(snapshot.scheduledChange.apply_at);
    const extra = dateLabel ? ` Ya quedó programado el cambio a ${nextLabel} para el ${dateLabel}.` : ` Ya quedó programado el cambio a ${nextLabel} para el próximo ciclo.`;
    billingNote = `${billingNote || ""}${extra}`.trim();
  }

  return json({
    ...delegated.data,
    actions,
    resolved_state: resolvedState,
    scheduled_change: snapshot?.scheduledChange || null,
    billing_note: billingNote,
    subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION
  }, delegated.response.status || 200);
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
    recurring_enabled: false,
    subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION
  };
}

async function handleCreateCheckoutWithSafety(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  const targetPlanCode = canonicalPlanCode(body?.plan_code || "");

  if (!userId || !targetPlanCode) return json({ ok: false, reason: "missing_data", message: "Faltan user_id o plan_code.", subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 400);

  const user = await getUserById(env, userId);
  if (!user) return json({ ok: false, reason: "user_not_found", message: "Usuario no encontrado.", subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 404);

  const snapshot = await resolveSubscriptionSnapshot(env, userId);
  const targetPlan = await getPlanByCode(env, targetPlanCode);
  if (!targetPlan) return json({ ok: false, reason: "plan_not_found", message: "No encontramos el plan elegido.", subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 404);

  const decision = decidePlanTransition(snapshot, targetPlan);
  if (!decision.allowed) return json({ ok: false, reason: decision.reason, message: decision.message, actions: buildSubscriptionActions(snapshot), subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, decision.status);

  if (decision.mode === "downgrade_scheduled") {
    const existing = snapshot?.scheduledChange;
    if (existing?.next_plan_code === targetPlanCode) {
      return json({ ok: true, scheduled: true, mode: "downgrade_next_cycle", message: decision.message, scheduled_change: existing, subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 200);
    }

    const currentPlanName = snapshot.currentPlan?.nombre || snapshot.currentPlanCode || "Plan actual";
    const applyAt = snapshot?.current?.current_period_ends_at || null;
    const scheduled = await supabaseInsertReturning(env, "mercadopago_checkout_sessions", {
      user_id: userId,
      plan_code: targetPlanCode,
      status: "scheduled",
      provider: "mercadopago",
      checkout_url: null,
      external_reference: `DOWNGRADE:${userId}:${targetPlanCode}:${Date.now()}`,
      provider_payload: {
        transition_mode: "downgrade_next_cycle",
        current_plan_code: snapshot.currentPlanCode,
        current_plan_name: currentPlanName,
        target_plan_code: targetPlanCode,
        target_plan_name: targetPlan?.nombre || targetPlanCode,
        apply_at: applyAt,
        scheduled_by: "user_request"
      }
    });

    return json({
      ok: true,
      scheduled: true,
      mode: "downgrade_next_cycle",
      message: decision.message,
      scheduled_change: {
        session_id: scheduled?.id || null,
        status: scheduled?.status || "scheduled",
        mode: "downgrade_next_cycle",
        current_plan_code: snapshot.currentPlanCode,
        next_plan_code: targetPlanCode,
        apply_at: applyAt,
        created_at: scheduled?.created_at || null
      },
      subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION
    }, 200);
  }

  const transitionMode = !snapshot?.current || canonicalPlanCode(snapshot?.current?.plan_code || "") === "TRIAL_7D" ? "new_checkout" : "upgrade_prorated";
  const reusable = findReusableCheckoutSession(snapshot?.sessions, { planCode: targetPlanCode, transitionMode: transitionMode === "new_checkout" ? "" : "upgrade_prorated" });
  if (reusable) {
    return json(buildReuseCheckoutResponse(reusable, "Ya había un checkout reciente preparado para este cambio. Reutilizamos ese enlace para evitar duplicados."), 200);
  }

  const delegated = await delegateJson(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, plan_code: targetPlanCode }) }), env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) return json(delegated.data || { ok: false, message: "No se pudo preparar el checkout" }, delegated.response.status || 500);

  return json({ ...delegated.data, subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, delegated.response.status || 200);
}

async function handleEnableAutoRenewWithSafety(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  if (!userId) return json({ ok: false, message: "Falta user_id.", subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 400);

  const snapshot = await resolveSubscriptionSnapshot(env, userId);
  const currentPlanCode = snapshot?.currentPlanCode || canonicalPlanCode(snapshot?.current?.plan_code || "");
  const reusable = findReusableCheckoutSession(snapshot?.sessions, { planCode: currentPlanCode, autoRenewOptIn: true });
  if (reusable) return json(buildReuseCheckoutResponse(reusable, "Ya había una activación reciente de débito automático en curso. Reutilizamos ese enlace para evitar duplicados."), 200);

  const delegated = await delegateJson(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }), env, ctx);
  if (!delegated.response.ok || !delegated.data?.ok) return json(delegated.data || { ok: false, message: "No se pudo activar la renovación automática" }, delegated.response.status || 500);

  return json({ ...delegated.data, subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, delegated.response.status || 200);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === `${API_URL_PREFIX}/admin/pagos` && request.method === "GET") {
      try {
        return await handleAdminPagos(request, env);
      } catch (err) {
        return json({ ok: false, error: err?.message || "No se pudieron leer los pagos" }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/mi-plan` && request.method === "GET") {
      try {
        return await handleMiPlanWithState(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo leer el plan", subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/mercadopago/create-checkout-link` && request.method === "POST") {
      try {
        return await handleCreateCheckoutWithSafety(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo preparar el checkout", subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/subscription/enable-auto-renew` && request.method === "POST") {
      try {
        return await handleEnableAutoRenewWithSafety(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo activar la renovación automática", subscription_state_policy_version: SUBSCRIPTION_STATE_POLICY_VERSION }, 500);
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

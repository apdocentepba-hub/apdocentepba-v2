import baseWorker from "./worker_recurring_plan_change_hotfix.js";

const API_URL_PREFIX = "/api";
const SUBSCRIPTION_RECONCILIATION_VERSION = "2026-04-05-reconcile-1";
const RECONCILE_BATCH_LIMIT = 25;

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

async function supabasePatchById(env, table, id, payload) {
  const rows = await supabaseRequest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function getUserSubscriptions(env, userId) {
  const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getRecurringSubscriptionsBatch(env, limit = RECONCILE_BATCH_LIMIT) {
  const rows = await supabaseSelect(env, `user_subscriptions?mercadopago_preapproval_id=not.is.null&status=in.(ACTIVE,AUTHORIZED,PENDING,PAUSED)&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc&limit=${Math.max(1, Number(limit) || RECONCILE_BATCH_LIMIT)}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  const rows = await supabaseSelect(env, `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,mercadopago_plan_id&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserCheckoutSessions(env, userId) {
  const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at&order=created_at.desc&limit=100`).catch(() => []);
  return Array.isArray(rows)
    ? rows.map(row => ({ ...row, provider_payload: safeJsonParse(row.provider_payload) || row.provider_payload || null }))
    : [];
}

function mapRemotePreapprovalStatus(status) {
  const raw = norm(status);
  if (!raw) return "PENDING";
  if (raw === "ACTIVE") return "ACTIVE";
  if (raw === "AUTHORIZED") return "AUTHORIZED";
  if (raw === "PAUSED") return "PAUSED";
  if (raw === "CANCELLED" || raw === "CANCELED") return "CANCELLED";
  if (raw === "PENDING") return "PENDING";
  return raw;
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

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) throw new Error(data?.message || data?.cause?.[0]?.description || `Mercado Pago error ${res.status}`);
  return data;
}

async function fetchMercadoPagoPreapproval(env, preapprovalId) {
  return await mercadoPagoRequest(env, `/preapproval/${encodeURIComponent(preapprovalId)}`, { method: "GET" });
}

function findScheduledRecurringDowngradeSession(sessions, subscriptionId) {
  return (Array.isArray(sessions) ? sessions : []).find(session => {
    const payload = safeJsonParse(session?.provider_payload) || {};
    return String(payload?.transition_mode || "") === "recurring_downgrade_next_cycle"
      && String(payload?.current_subscription_id || "") === String(subscriptionId || "")
      && String(session?.status || "").trim().toLowerCase() === "scheduled";
  }) || null;
}

async function reconcileRecurringSubscription(env, subscription, sessions = null) {
  if (!subscription?.id || !hasRecurringPreapproval(subscription)) {
    return { checked: false, reason: "no_recurring_preapproval" };
  }

  const remote = await fetchMercadoPagoPreapproval(env, subscription.mercadopago_preapproval_id);
  const remoteStatus = mapRemotePreapprovalStatus(remote?.status || "");
  const remoteNextPaymentDate = remote?.next_payment_date || null;
  const remoteAmountArs = Number(remote?.auto_recurring?.transaction_amount || 0) || 0;
  const nowIso = new Date().toISOString();
  const updates = {};

  if (remoteStatus && remoteStatus !== normalizeSubscriptionStatus(subscription.status)) {
    updates.status = remoteStatus;
  }

  if (remoteNextPaymentDate && remoteNextPaymentDate !== subscription.current_period_ends_at) {
    updates.current_period_ends_at = remoteNextPaymentDate;
  }

  if (!subscription.started_at && remote?.date_created) {
    updates.started_at = remote.date_created;
  }

  let scheduledApplied = false;
  let switchedPlanCode = null;

  const sessionRows = Array.isArray(sessions) ? sessions : await getUserCheckoutSessions(env, subscription.user_id);
  const scheduledDowngrade = findScheduledRecurringDowngradeSession(sessionRows, subscription.id);
  if (scheduledDowngrade) {
    const payload = safeJsonParse(scheduledDowngrade.provider_payload) || {};
    const targetPlanCode = canonicalPlanCode(payload?.target_plan_code || scheduledDowngrade.plan_code || "");
    const targetPlan = targetPlanCode ? await getPlanByCode(env, targetPlanCode).catch(() => null) : null;
    const targetPrice = Number(targetPlan?.price_ars || 0) || Number(payload?.target_price_ars || 0) || 0;
    const applyAt = parseFechaFlexible(payload?.apply_at || subscription.current_period_ends_at)?.getTime() || 0;
    const remoteNextTs = parseFechaFlexible(remoteNextPaymentDate)?.getTime() || 0;
    const lastChargedTs = parseFechaFlexible(remote?.summarized?.last_charged_date)?.getTime() || 0;

    const renewalDetected = !!applyAt && (
      (remoteNextTs && remoteNextTs > applyAt) ||
      (lastChargedTs && lastChargedTs >= applyAt - 24 * 60 * 60 * 1000)
    );

    if (targetPlanCode && targetPrice > 0 && Math.abs(remoteAmountArs - targetPrice) < 0.01 && renewalDetected) {
      if (targetPlanCode !== canonicalPlanCode(subscription.plan_code || "")) {
        updates.plan_code = targetPlanCode;
        switchedPlanCode = targetPlanCode;
      }
      scheduledApplied = true;
      await supabasePatchById(env, "mercadopago_checkout_sessions", scheduledDowngrade.id, {
        status: "applied",
        provider_payload: {
          ...payload,
          applied_at: nowIso,
          detected_by: "reconciliation",
          remote_next_payment_date: remoteNextPaymentDate,
          remote_status: remoteStatus
        },
        updated_at: nowIso
      }).catch(() => null);
    }
  }

  const updated = Object.keys(updates).length
    ? await supabasePatchById(env, "user_subscriptions", subscription.id, { ...updates, updated_at: nowIso }).catch(() => null)
    : null;

  return {
    checked: true,
    user_id: subscription.user_id,
    subscription_id: subscription.id,
    remote_status: remoteStatus,
    remote_next_payment_date: remoteNextPaymentDate,
    remote_amount_ars: remoteAmountArs || null,
    local_updated: !!updated,
    switched_plan_code: switchedPlanCode,
    scheduled_change_applied: scheduledApplied,
    reconciliation_message: scheduledApplied
      ? (switchedPlanCode
          ? `Se confirmó en Mercado Pago la renovación del ciclo y el plan pasó a ${switchedPlanCode}.`
          : "Se confirmó en Mercado Pago la renovación del ciclo programado.")
      : null
  };
}

async function resolveCurrentRecurringSubscription(env, userId) {
  const rows = await getUserSubscriptions(env, userId);
  const current = rows.find(row => isSubscriptionCurrent(row) && isPaidPlan(row.plan_code) && hasRecurringPreapproval(row))
    || rows.find(row => isPaidPlan(row.plan_code) && hasRecurringPreapproval(row))
    || null;
  return current;
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

async function handleMiPlanWithReconciliation(request, env, ctx) {
  const first = await delegateJson(request, env, ctx);
  if (!first.response.ok || !first.data?.ok) {
    return json(first.data || { ok: false, message: "No se pudo leer el plan" }, first.response.status || 500);
  }

  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || first.data?.user_id || "").trim();
  if (!userId) {
    return json({ ...first.data, subscription_reconciliation_version: SUBSCRIPTION_RECONCILIATION_VERSION }, first.response.status || 200);
  }

  const currentRecurring = await resolveCurrentRecurringSubscription(env, userId);
  if (!currentRecurring) {
    return json({
      ...first.data,
      reconciliation: { checked: false, reason: "no_current_recurring_subscription" },
      subscription_reconciliation_version: SUBSCRIPTION_RECONCILIATION_VERSION
    }, first.response.status || 200);
  }

  const sessions = await getUserCheckoutSessions(env, userId);
  const reconciliation = await reconcileRecurringSubscription(env, currentRecurring, sessions).catch(err => ({
    checked: false,
    reason: "reconcile_failed",
    message: err?.message || "No se pudo reconciliar con Mercado Pago"
  }));

  if (reconciliation?.local_updated || reconciliation?.scheduled_change_applied) {
    const second = await delegateJson(request, env, ctx);
    if (second.response.ok && second.data?.ok) {
      let billingNote = second.data?.billing_note || "";
      if (reconciliation?.reconciliation_message) {
        billingNote = `${billingNote ? `${billingNote} ` : ""}${reconciliation.reconciliation_message}`.trim();
      }
      return json({
        ...second.data,
        billing_note: billingNote,
        reconciliation,
        subscription_reconciliation_version: SUBSCRIPTION_RECONCILIATION_VERSION
      }, second.response.status || 200);
    }
  }

  return json({
    ...first.data,
    reconciliation,
    subscription_reconciliation_version: SUBSCRIPTION_RECONCILIATION_VERSION
  }, first.response.status || 200);
}

async function reconcileRecurringSubscriptionsBatch(env) {
  const rows = await getRecurringSubscriptionsBatch(env, RECONCILE_BATCH_LIMIT);
  let checked = 0;
  let updated = 0;
  let scheduledApplied = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const sessions = await getUserCheckoutSessions(env, row.user_id);
      const result = await reconcileRecurringSubscription(env, row, sessions);
      if (result.checked) checked += 1;
      if (result.local_updated) updated += 1;
      if (result.scheduled_change_applied) scheduledApplied += 1;
    } catch (err) {
      errors.push({
        subscription_id: row.id,
        user_id: row.user_id,
        message: err?.message || "Error de reconciliación"
      });
    }
  }

  return {
    ok: true,
    checked,
    updated,
    scheduled_applied: scheduledApplied,
    errors
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === `${API_URL_PREFIX}/mi-plan` && request.method === "GET") {
      try {
        return await handleMiPlanWithReconciliation(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo reconciliar el plan", subscription_reconciliation_version: SUBSCRIPTION_RECONCILIATION_VERSION }, 500);
      }
    }

    return await baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      await baseWorker.scheduled(controller, env, ctx);
    }

    ctx.waitUntil(
      reconcileRecurringSubscriptionsBatch(env).catch(err => {
        console.error("SUBSCRIPTION RECONCILIATION ERROR:", err);
      })
    );
  }
};

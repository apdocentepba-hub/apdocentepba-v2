import baseWorker from "./worker_plan_catalog_hotfix.js";

const API_URL_PREFIX = "/api";
const PRICE_POLICY_VERSION = "2026-04-05-price-policy-1";
const PRICE_POLICY_MODE = "next_renewal_uses_current_price";
const REPRICE_BATCH_LIMIT = 25;

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
  if (!raw) return "";
  if (["FREE", "TRIAL", "PRUEBA", "PRUEBA_7D"].includes(raw)) return "TRIAL_7D";
  if (raw === "PRO") return "PREMIUM";
  if (raw === "SIGNATURE") return "INSIGNE";
  return raw;
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

function isCurrentOrUpcomingRecurring(subscription) {
  if (!subscription || !hasRecurringPreapproval(subscription)) return false;
  const status = normalizeSubscriptionStatus(subscription.status);
  return ["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED", "BETA"].includes(status);
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

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  const rows = await supabaseSelect(env, `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags,sort_order&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getRecurringSubscriptionsBatch(env, limit = REPRICE_BATCH_LIMIT) {
  const rows = await supabaseSelect(env, `user_subscriptions?mercadopago_preapproval_id=not.is.null&status=in.(ACTIVE,AUTHORIZED,PENDING,PAUSED,BETA)&select=id,user_id,plan_code,status,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc&limit=${Math.max(1, Number(limit) || REPRICE_BATCH_LIMIT)}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getCurrentRecurringSubscription(env, userId) {
  const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&mercadopago_preapproval_id=not.is.null&select=id,user_id,plan_code,status,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc&limit=10`).catch(() => []);
  const items = Array.isArray(rows) ? rows : [];
  return items.find(isCurrentOrUpcomingRecurring) || items[0] || null;
}

async function getRecentSubscriptionsAdmin(env, limit = 200) {
  const rows = await supabaseSelect(env, `user_subscriptions?select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,mercadopago_payer_email,external_reference,created_at&order=created_at.desc&limit=${Math.max(1, Number(limit) || 200)}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getRecentCheckoutSessionsAdmin(env, limit = 200) {
  const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at,updated_at&order=created_at.desc&limit=${Math.max(1, Number(limit) || 200)}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
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

async function updateMercadoPagoPreapprovalAmount(env, preapprovalId, amount, reason) {
  return await mercadoPagoRequest(env, `/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    body: JSON.stringify({
      reason,
      auto_recurring: {
        transaction_amount: Number(amount),
        currency_id: env.MERCADOPAGO_CURRENCY_ID || "ARS"
      }
    })
  });
}

function buildPricePolicyInfo(subscription, plan, remotePreapproval, repriced) {
  const currentPlanCode = canonicalPlanCode(subscription?.plan_code || plan?.code || "");
  const planName = String(plan?.nombre || currentPlanCode || "tu plan").trim() || currentPlanCode || "tu plan";
  const dbPrice = plan?.price_ars != null ? Number(plan.price_ars) : null;
  const remoteAmount = remotePreapproval?.auto_recurring?.transaction_amount != null ? Number(remotePreapproval.auto_recurring.transaction_amount) : null;
  const nextDate = remotePreapproval?.next_payment_date || subscription?.current_period_ends_at || null;

  return {
    mode: PRICE_POLICY_MODE,
    canonical_plan_code: currentPlanCode,
    plan_name: planName,
    current_price_ars: dbPrice,
    recurring_amount_ars: remoteAmount,
    next_renewal_date: nextDate,
    next_renewal_label: formatDateAr(nextDate),
    will_use_current_price_on_next_renewal: dbPrice != null,
    repriced_for_next_cycle: !!repriced,
    pricing_note: dbPrice == null
      ? `El precio vigente de ${planName} no está cargado todavía en la base, así que no se puede reprogramar la próxima renovación automáticamente.`
      : repriced
        ? `La próxima renovación de ${planName} ya quedó actualizada al precio vigente de $${dbPrice.toLocaleString("es-AR")}.`
        : `La próxima renovación de ${planName} usa el precio vigente que tengas cargado en la base al momento de renovar.`
  };
}

async function syncRecurringAmountToCurrentPrice(env, subscription, options = {}) {
  if (!subscription?.mercadopago_preapproval_id) {
    return { checked: false, reason: "no_preapproval" };
  }

  const plan = await getPlanByCode(env, subscription.plan_code);
  const targetPrice = plan?.price_ars != null ? Number(plan.price_ars) : null;
  const remote = await fetchMercadoPagoPreapproval(env, subscription.mercadopago_preapproval_id);
  const remoteAmount = remote?.auto_recurring?.transaction_amount != null ? Number(remote.auto_recurring.transaction_amount) : null;

  if (targetPrice == null || !Number.isFinite(targetPrice) || targetPrice < 0) {
    return {
      checked: true,
      repriced: false,
      reason: "missing_plan_price",
      price_policy: buildPricePolicyInfo(subscription, plan, remote, false)
    };
  }

  if (remoteAmount != null && Math.abs(remoteAmount - targetPrice) < 0.01) {
    return {
      checked: true,
      repriced: false,
      reason: "already_current_price",
      price_policy: buildPricePolicyInfo(subscription, plan, remote, false)
    };
  }

  if (options.read_only) {
    return {
      checked: true,
      repriced: false,
      reason: "read_only",
      price_policy: buildPricePolicyInfo(subscription, plan, remote, false)
    };
  }

  const updatedRemote = await updateMercadoPagoPreapprovalAmount(
    env,
    subscription.mercadopago_preapproval_id,
    targetPrice,
    `APDocentePBA · ${String(plan?.nombre || canonicalPlanCode(subscription.plan_code || "")).trim()} · Precio vigente para próxima renovación`
  );

  return {
    checked: true,
    repriced: true,
    reason: "repriced_for_next_cycle",
    previous_amount_ars: remoteAmount,
    new_amount_ars: targetPrice,
    price_policy: buildPricePolicyInfo(subscription, plan, updatedRemote || remote, true)
  };
}

function buildAdminPaymentsSummary(subscriptions, checkouts) {
  const planCounts = {};
  for (const row of Array.isArray(subscriptions) ? subscriptions : []) {
    const code = canonicalPlanCode(row?.plan_code || "") || "SIN_PLAN";
    planCounts[code] = (planCounts[code] || 0) + 1;
  }

  return {
    subscriptions_total: subscriptions.length,
    subscriptions_active: subscriptions.filter(isSubscriptionCurrent).length,
    subscriptions_trial: subscriptions.filter((row) => canonicalPlanCode(row?.plan_code) === "TRIAL_7D").length,
    subscriptions_recurring: subscriptions.filter((row) => hasRecurringPreapproval(row)).length,
    subscriptions_cancelled: subscriptions.filter((row) => normalizeSubscriptionStatus(row?.status) === "CANCELLED").length,
    checkout_total: checkouts.length,
    checkout_ready: checkouts.filter((row) => ["ready", "pending_config"].includes(String(row?.status || "").toLowerCase())).length,
    checkout_pending: checkouts.filter((row) => ["pending", "scheduled"].includes(String(row?.status || "").toLowerCase())).length,
    checkout_approved: checkouts.filter((row) => ["approved", "authorized"].includes(String(row?.status || "").toLowerCase())).length,
    checkout_rejected: checkouts.filter((row) => ["rejected", "refunded"].includes(String(row?.status || "").toLowerCase())).length,
    by_plan: planCounts
  };
}

async function handleAdminPagos(request, env) {
  const user = await resolveAuthUser(env, request);
  if (!user) return json({ ok: false, error: "No autenticado" }, 401);
  if (!user.es_admin) return json({ ok: false, error: "No autorizado" }, 403);

  const [subscriptions, checkouts] = await Promise.all([
    getRecentSubscriptionsAdmin(env, 200),
    getRecentCheckoutSessionsAdmin(env, 200)
  ]);

  return json({
    ok: true,
    generated_at: new Date().toISOString(),
    summary: buildAdminPaymentsSummary(subscriptions, checkouts),
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

function attachPricePolicyToResponse(data, pricePolicy) {
  if (!data || typeof data !== "object") {
    return { price_policy_version: PRICE_POLICY_VERSION, price_policy: pricePolicy || null };
  }

  let billingNote = String(data?.billing_note || "").trim();
  if (pricePolicy?.pricing_note) {
    billingNote = `${billingNote ? `${billingNote} ` : ""}${pricePolicy.pricing_note}`.trim();
  }

  return {
    ...data,
    billing_note: billingNote,
    price_policy_version: PRICE_POLICY_VERSION,
    price_policy: pricePolicy || null
  };
}

async function handleMiPlanWithPricePolicy(request, env, ctx) {
  const delegated = await delegateJson(request, env, ctx);
  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || delegated.data?.user_id || "").trim();

  if (!delegated.response.ok || !delegated.data?.ok || !userId) {
    return json(attachPricePolicyToResponse(delegated.data, null), delegated.response.status || 200);
  }

  const currentRecurring = await getCurrentRecurringSubscription(env, userId);
  if (!currentRecurring) {
    return json(attachPricePolicyToResponse(delegated.data, {
      mode: PRICE_POLICY_MODE,
      will_use_current_price_on_next_renewal: true,
      pricing_note: "Los cambios de precio impactan en la próxima renovación de los planes recurrentes."
    }), delegated.response.status || 200);
  }

  const sync = await syncRecurringAmountToCurrentPrice(env, currentRecurring).catch(err => ({
    checked: false,
    repriced: false,
    reason: "price_policy_sync_failed",
    price_policy: {
      mode: PRICE_POLICY_MODE,
      will_use_current_price_on_next_renewal: true,
      pricing_note: err?.message || "No se pudo verificar el precio de la próxima renovación."
    }
  }));

  let finalData = delegated.data;
  if (sync?.repriced) {
    const refreshed = await delegateJson(request, env, ctx);
    if (refreshed.response.ok && refreshed.data?.ok) {
      finalData = refreshed.data;
    }
  }

  return json(attachPricePolicyToResponse(finalData, sync?.price_policy || null), delegated.response.status || 200);
}

async function runRecurringRepricingSweep(env) {
  const rows = await getRecurringSubscriptionsBatch(env, REPRICE_BATCH_LIMIT);
  let checked = 0;
  let repriced = 0;
  const results = [];

  for (const row of rows) {
    try {
      const sync = await syncRecurringAmountToCurrentPrice(env, row);
      checked += 1;
      if (sync?.repriced) repriced += 1;
      results.push({ user_id: row.user_id, subscription_id: row.id, sync });
    } catch (err) {
      results.push({ user_id: row.user_id, subscription_id: row.id, error: err?.message || "repricing error" });
    }
  }

  return { ok: true, checked, repriced, results };
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

    if (path === "/api/mi-plan" && request.method === "GET") {
      try {
        return await handleMiPlanWithPricePolicy(request, env, ctx);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo aplicar la política de precios", price_policy_version: PRICE_POLICY_VERSION }, 500);
      }
    }

    const delegated = await delegateJson(request, env, ctx);
    return json(attachPricePolicyToResponse(delegated.data, {
      mode: PRICE_POLICY_MODE,
      will_use_current_price_on_next_renewal: true
    }), delegated.response.status || 200);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      await baseWorker.scheduled(controller, env, ctx);
    }

    ctx.waitUntil(runRecurringRepricingSweep(env).catch(err => {
      console.error("PRICE POLICY SWEEP ERROR:", err);
    }));
  }
};

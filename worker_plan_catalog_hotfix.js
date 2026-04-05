import baseWorker from "./worker_payment_notifications_hotfix.js";

const API_URL_PREFIX = "/api";
const PLAN_CATALOG_VERSION = "2026-04-05-plan-catalog-1";

const PLAN_FALLBACKS = {
  TRIAL_7D: {
    code: "TRIAL_7D",
    canonical_code: "TRIAL_7D",
    family: "free_trial",
    legacy_codes: ["TRIAL", "FREE", "PRUEBA", "PRUEBA_7D"],
    display_name: "Prueba gratis",
    short_name: "Free",
    price_ars: 0,
    trial_days: 7,
    public_visible: true,
    is_paid: false,
    sort_order: 0,
    ui_badge: "Gratis"
  },
  PLUS: {
    code: "PLUS",
    canonical_code: "PLUS",
    family: "plus",
    legacy_codes: ["BASIC"],
    display_name: "Plus",
    short_name: "Plus",
    price_ars: null,
    trial_days: 0,
    public_visible: true,
    is_paid: true,
    sort_order: 10,
    ui_badge: "Plan pago"
  },
  PREMIUM: {
    code: "PREMIUM",
    canonical_code: "PREMIUM",
    family: "premium",
    legacy_codes: ["PRO"],
    display_name: "Premium",
    short_name: "Premium",
    price_ars: null,
    trial_days: 0,
    public_visible: true,
    is_paid: true,
    sort_order: 20,
    ui_badge: "Plan pago"
  },
  INSIGNE: {
    code: "INSIGNE",
    canonical_code: "INSIGNE",
    family: "insigne",
    legacy_codes: ["SIGNATURE"],
    display_name: "Insigne",
    short_name: "Insigne",
    price_ars: null,
    trial_days: 0,
    public_visible: true,
    is_paid: true,
    sort_order: 30,
    ui_badge: "Plan pago"
  }
};

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
  if (!raw) return "";

  for (const fallback of Object.values(PLAN_FALLBACKS)) {
    if (raw === fallback.canonical_code) return fallback.canonical_code;
    if ((fallback.legacy_codes || []).includes(raw)) return fallback.canonical_code;
  }

  if (raw === "PRO") return "PREMIUM";
  if (raw === "SIGNATURE") return "INSIGNE";
  if (raw === "FREE") return "TRIAL_7D";
  return raw;
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

async function getSubscriptionPlans(env) {
  const rows = await supabaseSelect(env, "subscription_plans?select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,public_visible,mercadopago_plan_id,feature_flags,sort_order&order=sort_order.asc").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getUserSubscriptions(env, userId) {
  const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
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

function getSubscriptionAccessUntil(subscription) {
  if (!subscription) return null;
  return canonicalPlanCode(subscription?.plan_code) === "TRIAL_7D"
    ? subscription?.trial_ends_at || null
    : subscription?.current_period_ends_at || null;
}

function isSubscriptionCurrent(subscription) {
  if (!subscription) return false;
  const status = normalizeSubscriptionStatus(subscription.status);
  if (status === "CANCELLED") return false;
  const end = parseFechaFlexible(getSubscriptionAccessUntil(subscription))?.getTime() || 0;
  if (!end) return ["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED", "BETA", "TRIALING"].includes(status);
  return end > Date.now();
}

function buildPlanFromFallback(fallback) {
  return {
    code: fallback.canonical_code,
    canonical_code: fallback.canonical_code,
    legacy_codes: fallback.legacy_codes || [],
    family: fallback.family || fallback.canonical_code.toLowerCase(),
    display_name: fallback.display_name || fallback.short_name || fallback.canonical_code,
    short_name: fallback.short_name || fallback.display_name || fallback.canonical_code,
    descripcion: "",
    price_ars: fallback.price_ars,
    trial_days: fallback.trial_days || 0,
    max_distritos: null,
    max_cargos: null,
    public_visible: fallback.public_visible !== false,
    mercadopago_plan_id: null,
    feature_flags: null,
    sort_order: fallback.sort_order || 999,
    is_paid: fallback.is_paid !== false,
    ui_badge: fallback.ui_badge || null
  };
}

function mergePlanData(basePlan, dbRow) {
  const canonical = canonicalPlanCode(dbRow?.code || basePlan?.code || "");
  const fallback = PLAN_FALLBACKS[canonical] || null;
  const displayName = String(dbRow?.nombre || "").trim() || basePlan?.display_name || fallback?.display_name || canonical;
  return {
    code: canonical,
    canonical_code: canonical,
    legacy_codes: fallback?.legacy_codes || basePlan?.legacy_codes || [],
    family: fallback?.family || basePlan?.family || canonical.toLowerCase(),
    display_name: displayName,
    short_name: displayName,
    descripcion: String(dbRow?.descripcion || basePlan?.descripcion || "").trim(),
    price_ars: dbRow?.price_ars != null ? Number(dbRow.price_ars) : (basePlan?.price_ars ?? fallback?.price_ars ?? null),
    trial_days: dbRow?.trial_days != null ? Number(dbRow.trial_days) : (basePlan?.trial_days ?? fallback?.trial_days ?? 0),
    max_distritos: dbRow?.max_distritos ?? basePlan?.max_distritos ?? null,
    max_cargos: dbRow?.max_cargos ?? basePlan?.max_cargos ?? null,
    public_visible: dbRow?.public_visible != null ? !!dbRow.public_visible : (basePlan?.public_visible ?? fallback?.public_visible ?? true),
    mercadopago_plan_id: dbRow?.mercadopago_plan_id || basePlan?.mercadopago_plan_id || null,
    feature_flags: dbRow?.feature_flags ?? basePlan?.feature_flags ?? null,
    sort_order: dbRow?.sort_order != null ? Number(dbRow.sort_order) : (basePlan?.sort_order ?? fallback?.sort_order ?? 999),
    is_paid: canonical !== "TRIAL_7D",
    ui_badge: fallback?.ui_badge || basePlan?.ui_badge || null
  };
}

async function buildNormalizedPlanCatalog(env) {
  const dbPlans = await getSubscriptionPlans(env);
  const byCode = new Map();

  for (const fallback of Object.values(PLAN_FALLBACKS)) {
    byCode.set(fallback.canonical_code, buildPlanFromFallback(fallback));
  }

  for (const row of dbPlans) {
    const canonical = canonicalPlanCode(row?.code || "");
    const current = byCode.get(canonical) || buildPlanFromFallback(PLAN_FALLBACKS[canonical] || {
      canonical_code: canonical,
      display_name: canonical,
      short_name: canonical,
      public_visible: true,
      is_paid: canonical !== "TRIAL_7D",
      sort_order: 999,
      legacy_codes: []
    });
    byCode.set(canonical, mergePlanData(current, row));
  }

  return Array.from(byCode.values()).sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));
}

function findPlanInCatalog(catalog, code) {
  const canonical = canonicalPlanCode(code);
  return (Array.isArray(catalog) ? catalog : []).find(plan => canonicalPlanCode(plan?.code || plan?.canonical_code || "") === canonical) || null;
}

function normalizePlanPayload(plan, catalog) {
  if (!plan) return null;
  const canonical = canonicalPlanCode(plan?.code || plan?.plan_code || plan?.canonical_code || "");
  const catalogPlan = findPlanInCatalog(catalog, canonical);
  return {
    code: canonical,
    canonical_code: canonical,
    display_name: catalogPlan?.display_name || String(plan?.nombre || plan?.display_name || canonical).trim() || canonical,
    short_name: catalogPlan?.short_name || catalogPlan?.display_name || String(plan?.nombre || plan?.display_name || canonical).trim() || canonical,
    price_ars: plan?.price_ars != null ? Number(plan.price_ars) : (catalogPlan?.price_ars ?? null),
    trial_days: plan?.trial_days != null ? Number(plan.trial_days) : (catalogPlan?.trial_days ?? 0),
    max_distritos: plan?.max_distritos ?? catalogPlan?.max_distritos ?? null,
    max_cargos: plan?.max_cargos ?? catalogPlan?.max_cargos ?? null,
    is_paid: canonical !== "TRIAL_7D",
    mercadopago_plan_id: plan?.mercadopago_plan_id || catalogPlan?.mercadopago_plan_id || null,
    public_visible: catalogPlan?.public_visible ?? true,
    legacy_codes: catalogPlan?.legacy_codes || []
  };
}

function normalizePlansArray(plans, catalog) {
  const seen = new Set();
  const out = [];
  for (const plan of Array.isArray(plans) ? plans : []) {
    const normalized = normalizePlanPayload(plan, catalog);
    const key = normalized?.canonical_code;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function normalizeResolvedState(resolvedState, catalog) {
  if (!resolvedState) return resolvedState;
  const currentPlan = findPlanInCatalog(catalog, resolvedState?.current_plan_code || "");
  const nextPlan = findPlanInCatalog(catalog, resolvedState?.scheduled_next_plan_code || "");
  return {
    ...resolvedState,
    current_plan_code: currentPlan?.canonical_code || canonicalPlanCode(resolvedState?.current_plan_code || ""),
    current_plan_name: currentPlan?.display_name || null,
    scheduled_next_plan_code: nextPlan?.canonical_code || canonicalPlanCode(resolvedState?.scheduled_next_plan_code || ""),
    scheduled_next_plan_name: nextPlan?.display_name || null
  };
}

function normalizeScheduledChange(scheduledChange, catalog) {
  if (!scheduledChange) return scheduledChange;
  const currentPlan = findPlanInCatalog(catalog, scheduledChange?.current_plan_code || "");
  const nextPlan = findPlanInCatalog(catalog, scheduledChange?.next_plan_code || scheduledChange?.target_plan_code || "");
  return {
    ...scheduledChange,
    current_plan_code: currentPlan?.canonical_code || canonicalPlanCode(scheduledChange?.current_plan_code || ""),
    current_plan_name: currentPlan?.display_name || null,
    next_plan_code: nextPlan?.canonical_code || canonicalPlanCode(scheduledChange?.next_plan_code || scheduledChange?.target_plan_code || ""),
    next_plan_name: nextPlan?.display_name || null,
    apply_label: formatDateAr(scheduledChange?.apply_at || scheduledChange?.scheduled_next_plan_apply_at || "")
  };
}

function normalizeUpgradeQuote(quote, catalog) {
  if (!quote) return quote;
  const currentPlan = findPlanInCatalog(catalog, quote?.current_plan_code || "");
  const targetPlan = findPlanInCatalog(catalog, quote?.target_plan_code || "");
  return {
    ...quote,
    current_plan_code: currentPlan?.canonical_code || canonicalPlanCode(quote?.current_plan_code || ""),
    current_plan_name: currentPlan?.display_name || null,
    target_plan_code: targetPlan?.canonical_code || canonicalPlanCode(quote?.target_plan_code || ""),
    target_plan_name: targetPlan?.display_name || null
  };
}

function normalizeResponsePayload(data, catalog) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };

  if (out.plan) out.plan = normalizePlanPayload(out.plan, catalog);
  if (out.current_plan) out.current_plan = normalizePlanPayload(out.current_plan, catalog);
  if (out.available_plans) out.available_plans = normalizePlansArray(out.available_plans, catalog);
  if (out.plans) out.plans = normalizePlansArray(out.plans, catalog);
  if (out.resolved_state) out.resolved_state = normalizeResolvedState(out.resolved_state, catalog);
  if (out.scheduled_change) out.scheduled_change = normalizeScheduledChange(out.scheduled_change, catalog);
  if (out.upgrade_quote) out.upgrade_quote = normalizeUpgradeQuote(out.upgrade_quote, catalog);

  if (out.actions && typeof out.actions === "object") {
    out.actions = {
      ...out.actions,
      plan_catalog_version: PLAN_CATALOG_VERSION
    };
  }

  out.plan_catalog = catalog;
  out.plan_catalog_version = PLAN_CATALOG_VERSION;
  return out;
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

function shouldNormalizePath(path) {
  return [
    `${API_URL_PREFIX}/mi-plan`,
    `${API_URL_PREFIX}/mercadopago/create-checkout-link`,
    `${API_URL_PREFIX}/subscription/enable-auto-renew`,
    `${API_URL_PREFIX}/subscription/cancel`
  ].includes(path);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    const delegated = await delegateJson(request, env, ctx);
    if (!shouldNormalizePath(path) || !delegated.data || typeof delegated.data !== "object") {
      return json(
        typeof delegated.data === "object" && delegated.data !== null
          ? { ...delegated.data, plan_catalog_version: PLAN_CATALOG_VERSION }
          : delegated.data,
        delegated.response.status || 200
      );
    }

    const catalog = await buildNormalizedPlanCatalog(env).catch(() => Object.values(PLAN_FALLBACKS).map(buildPlanFromFallback));
    const normalized = normalizeResponsePayload(delegated.data, catalog);
    return json(normalized, delegated.response.status || 200);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      return await baseWorker.scheduled(controller, env, ctx);
    }
  }
};

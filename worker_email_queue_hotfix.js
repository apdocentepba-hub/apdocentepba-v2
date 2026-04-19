import baseWorker from "./worker_telegram_hotfix.js";
import { processPendingEmailQueue, handleEmailAlertsHealth, handleEmailAlertsRun } from "./email_queue_hotfix.js";

const API_URL_PREFIX = "/api";
const EMAIL_QUEUE_WRAPPER_VERSION = "2026-04-18-email-wrapper-2-whatsapp-manual";

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders() });
}

function norm(value) {
  return String(value || "").trim();
}

function normUpper(value) {
  return norm(value).toUpperCase();
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function canonicalPlanCode(code) {
  const raw = normUpper(code);
  if (!raw) return "";
  if (["FREE", "TRIAL", "PRUEBA", "PRUEBA_7D"].includes(raw)) return "TRIAL_7D";
  if (raw === "PRO") return "PREMIUM";
  if (raw === "SIGNATURE") return "INSIGNE";
  if (raw === "BASIC") return "PLUS";
  return raw;
}

function parseFechaFlexible(value) {
  const raw = norm(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSubscriptionCurrent(subscription) {
  if (!subscription) return false;
  const status = normUpper(subscription.status);
  if (["CANCELLED", "CANCELED"].includes(status)) return false;
  const now = Date.now();
  const planCode = canonicalPlanCode(subscription.plan_code);
  const end = parseFechaFlexible(
    planCode === "TRIAL_7D"
      ? subscription.trial_ends_at || ""
      : subscription.current_period_ends_at || ""
  )?.getTime() || 0;
  if (!end) return ["ACTIVE", "AUTHORIZED", "PENDING", "PAUSED", "BETA", "TRIALING"].includes(status);
  return end > now;
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

function normalizeWhatsAppPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  if (digits.startsWith("9") && digits.length >= 11) return `54${digits}`;
  if (digits.startsWith("15") && digits.length > 8) digits = digits.slice(2);
  return `549${digits}`;
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
  return await supabaseRequest(env, query, {
    method: "GET",
    headers: { Prefer: "return=representation" }
  });
}

async function supabaseInsert(env, table, rows) {
  return await supabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
  });
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,es_admin&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getSessionByToken(env, token) {
  const rows = await supabaseSelect(
    env,
    `sessions?token=eq.${encodeURIComponent(token)}&activo=eq.true&select=token,user_id,expires_at,activo&limit=1`
  ).catch(() => []);
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
  const rows = await supabaseSelect(
    env,
    `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,started_at,trial_ends_at,current_period_ends_at,created_at&order=created_at.desc`
  ).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  if (!code) return null;
  const rows = await supabaseSelect(
    env,
    `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,feature_flags&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function resolveWhatsAppEntitlement(env, userId) {
  const subscriptions = await getUserSubscriptions(env, userId);
  const current = subscriptions.find(isSubscriptionCurrent) || subscriptions[0] || null;
  const planCode = canonicalPlanCode(current?.plan_code || "TRIAL_7D");
  const plan = await getPlanByCode(env, planCode);
  const flags = safeJsonParse(plan?.feature_flags) || {};
  return {
    plan_code: planCode,
    plan_name: norm(plan?.nombre) || planCode || "TRIAL_7D",
    allowed: flags.whatsapp !== false && planCode === "INSIGNE"
  };
}

async function delegateJsonByRequest(request, env, ctx) {
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

async function sendWhatsAppText(env, to, body) {
  const phoneNumberId = norm(env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken = norm(env.WHATSAPP_ACCESS_TOKEN);
  if (!phoneNumberId || !accessToken) throw new Error("Faltan credenciales de WhatsApp");

  const payload = {
    messaging_product: "whatsapp",
    to: normalizeWhatsAppPhone(to),
    type: "text",
    text: {
      preview_url: false,
      body: String(body || "")
    }
  };

  const res = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp HTTP ${res.status}`);
  return data;
}

function buildWhatsAppDigestMessage(user, alerts) {
  const visible = Array.isArray(alerts) ? alerts.slice(0, 5) : [];
  const lines = [
    `Hola ${norm(user?.nombre) || "Docente"}.`,
    visible.length
      ? `Estas son tus alertas del momento (${alerts.length}):`
      : "Ahora mismo no hay alertas compatibles con tus filtros.",
    ""
  ];

  if (!visible.length) {
    lines.push("Podés revisar nuevamente más tarde desde tu panel.");
    return lines.join("\n");
  }

  visible.forEach((item, idx) => {
    lines.push(`${idx + 1}) ${norm(item?.cargo || item?.area || "Oferta APD")}`);
    if (item?.escuela) lines.push(`   ${norm(item.escuela)}`);
    lines.push(`   ${norm(item?.distrito || "-")} · turno ${norm(item?.turno || "-")}`);
    if (item?.finoferta_label || item?.fecha_cierre || item?.cierre) {
      lines.push(`   cierre ${norm(item?.finoferta_label || item?.fecha_cierre || item?.cierre)}`);
    }
    lines.push("");
  });

  if (alerts.length > visible.length) {
    lines.push(`+ ${alerts.length - visible.length} alerta(s) más en tu panel.`);
    lines.push("");
  }

  lines.push("Panel APDocentePBA: revisá el detalle completo ahí.");
  return lines.join("\n");
}

async function handleManualWhatsAppAlerts(request, env, ctx) {
  const authUser = await resolveAuthUser(env, request);
  if (!authUser) return json({ ok: false, error: "No autenticado" }, 401);

  const body = await request.json().catch(() => ({}));
  const requestedUserId = normUpper(body?.user_id) || authUser.id;
  if (requestedUserId !== authUser.id && !authUser.es_admin) {
    return json({ ok: false, error: "No autorizado" }, 403);
  }

  const user = await getUserById(env, requestedUserId);
  if (!user?.id || user.activo === false) {
    return json({ ok: false, error: "Usuario no encontrado" }, 404);
  }

  const entitlement = await resolveWhatsAppEntitlement(env, requestedUserId);
  if (!entitlement.allowed) {
    return json({ ok: false, error: `WhatsApp no está habilitado para ${entitlement.plan_name || "tu plan"}` }, 400);
  }

  const prefsRows = await supabaseSelect(
    env,
    `user_preferences?user_id=eq.${encodeURIComponent(requestedUserId)}&select=alertas_activas,alertas_whatsapp&limit=1`
  ).catch(() => []);
  const prefs = Array.isArray(prefsRows) ? prefsRows[0] || {} : {};

  if (!prefs?.alertas_activas) {
    return json({ ok: false, error: "Alertas generales apagadas" }, 400);
  }

  const phone = normalizeWhatsAppPhone(user?.celular || "");
  if (!phone) {
    return json({ ok: false, error: "El usuario no tiene celular válido" }, 400);
  }

  const delegated = await delegateJsonByRequest(
    new Request(`https://internal.apdocentepba.dev/api/mis-alertas?user_id=${encodeURIComponent(requestedUserId)}`, { method: "GET" }),
    env,
    ctx
  );
  const alerts = delegated.response.ok && delegated.data?.ok && Array.isArray(delegated.data?.resultados)
    ? delegated.data.resultados
    : [];

  const reply = buildWhatsAppDigestMessage(user, alerts);
  const sent = await sendWhatsAppText(env, phone, reply);

  await supabaseInsert(env, "notification_delivery_logs", {
    user_id: requestedUserId,
    channel: "whatsapp",
    template_code: "manual_alerts",
    destination: phone,
    status: "sent_manual",
    provider_message_id: sent?.messages?.[0]?.id || null,
    payload: {
      alerts_count: alerts.length,
      requested_flag: !!prefs?.alertas_whatsapp
    },
    provider_response: sent
  }).catch(() => null);

  return json({
    ok: true,
    sent: true,
    to: phone,
    alerts_count: alerts.length,
    provider_message_id: sent?.messages?.[0]?.id || null
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === `${API_URL_PREFIX}/email-alerts-health` && request.method === "GET") {
        return await handleEmailAlertsHealth(request, env, false);
      }

      if (url.pathname === `${API_URL_PREFIX}/email-alerts-run` && request.method === "POST") {
        return await handleEmailAlertsRun(request, env, false);
      }

      if (url.pathname === `${API_URL_PREFIX}/admin/email-alerts-health` && request.method === "GET") {
        return await handleEmailAlertsHealth(request, env, true);
      }

      if (url.pathname === `${API_URL_PREFIX}/admin/email-alerts-run` && request.method === "POST") {
        return await handleEmailAlertsRun(request, env, true);
      }

      if (url.pathname === `${API_URL_PREFIX}/whatsapp/manual-alerts` && request.method === "POST") {
        return await handleManualWhatsAppAlerts(request, env, ctx);
      }

      if (url.pathname === `${API_URL_PREFIX}/version` && request.method === "GET") {
        const delegated = await baseWorker.fetch(request, env, ctx);
        const text = await delegated.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = {};
        }
        return json({ ...(data || {}), email_queue_wrapper_version: EMAIL_QUEUE_WRAPPER_VERSION }, 200);
      }
    } catch (err) {
      return json({ ok: false, error: err?.message || "Email queue wrapper error", email_queue_wrapper_version: EMAIL_QUEUE_WRAPPER_VERSION }, Number(err?.status || 500) || 500);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      await baseWorker.scheduled(controller, env, ctx);
    }

    ctx.waitUntil(
      processPendingEmailQueue(env, { source: "cron_queue_hotfix" }).catch(err => {
        console.error("EMAIL QUEUE WRAPPER ERROR:", err);
      })
    );
  }
};
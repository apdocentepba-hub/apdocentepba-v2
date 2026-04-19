import baseWorker from "./worker_pid_lookup_hotfix.js";

const API_URL_PREFIX = "/api";
const TELEGRAM_VERSION = "2026-04-11-telegram-alerts-3";
const TELEGRAM_SWEEP_LIMIT = 200;
const TELEGRAM_MESSAGE_ALERTS_LIMIT = 5;
const TELEGRAM_SENT_TTL_SECONDS = 60 * 60 * 24 * 30;

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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(norm(value));
}

function parseFechaFlexible(value) {
  const raw = norm(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateAr(value) {
  const d = parseFechaFlexible(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
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

async function supabasePatchReturning(env, table, filter, payload) {
  const rows = await supabaseRequest(env, `${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
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
    `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,created_at&order=created_at.desc`
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

async function resolveTelegramEntitlement(env, userId) {
  const subscriptions = await getUserSubscriptions(env, userId);
  const current = subscriptions.find(isSubscriptionCurrent) || subscriptions[0] || null;
  const planCode = canonicalPlanCode(current?.plan_code || "TRIAL_7D");
  const plan = await getPlanByCode(env, planCode);
  const flags = safeJsonParse(plan?.feature_flags) || {};

  return {
    plan_code: planCode,
    plan_name: norm(plan?.nombre) || planCode || "TRIAL_7D",
    allowed: true,
    source: "global_opt_in_policy",
    flags
  };
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
    allowed: flags.whatsapp !== false && planCode === "INSIGNE",
    source: "plan_feature_flag",
    flags
  };
}

function telegramStateKey(userId) {
  return `telegram:user:${normUpper(userId)}`;
}

function telegramSentKey(userId, offerKey) {
  return `telegram:sent:${normUpper(userId)}:${normUpper(offerKey)}`;
}

function getKv(env) {
  return env.EMAIL_SWEEP_STATE || null;
}

async function getTelegramState(env, userId) {
  const kv = getKv(env);
  if (!kv || !userId) return null;
  const raw = await kv.get(telegramStateKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveTelegramState(env, userId, patch) {
  const kv = getKv(env);
  if (!kv || !userId) throw new Error("Falta EMAIL_SWEEP_STATE para guardar estado de Telegram");

  const current = (await getTelegramState(env, userId)) || {};
  const next = {
    ...current,
    ...patch,
    user_id: normUpper(userId),
    updated_at: new Date().toISOString()
  };

  await kv.put(telegramStateKey(userId), JSON.stringify(next));
  return next;
}

function maskChatId(chatId) {
  const raw = norm(chatId);
  if (!raw) return "";
  if (raw.length <= 4) return raw;
  return `${"•".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

function buildTelegramBotLink(env, userId) {
  const username = norm(env.TELEGRAM_BOT_USERNAME).replace(/^@+/, "");
  if (!username || !userId) return "";
  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(norm(userId))}`;
}

async function insertNotificationDeliveryLogs(env, logs) {
  const rows = (Array.isArray(logs) ? logs : [logs]).filter(Boolean);
  if (!rows.length) return;
  try {
    await supabaseInsert(env, "notification_delivery_logs", rows);
  } catch (err) {
    console.error("NOTIFICATION DELIVERY LOG INSERT ERROR:", err);
  }
}

function baseLogRow({userId, channel = "telegram", eventType, deliveryKey = null, status, provider = "telegram", providerMessageId = null, planCode = null, payload = null, errorMessage = null}) {
  return {
    user_id: userId || null,
    channel,
    event_type: eventType,
    delivery_key: deliveryKey,
    status,
    provider,
    provider_message_id: providerMessageId,
    plan_code: planCode || null,
    payload: payload || {},
    error_message: errorMessage || null
  };
}

function buildTelegramStatusPayload(env, state, entitlement) {
  const connected = !!state?.connected && !!norm(state?.chat_id);
  const allowedByPlan = !!entitlement?.allowed;
  return {
    ok: true,
    version: TELEGRAM_VERSION,
    connected,
    alerts_enabled: allowedByPlan ? !!state?.alerts_enabled : false,
    allowed_by_plan: allowedByPlan,
    channel_policy: entitlement?.source || "default_policy",
    plan_code: entitlement?.plan_code || "",
    plan_name: entitlement?.plan_name || "",
    chat_id_masked: connected ? maskChatId(state?.chat_id) : "",
    username: norm(state?.username),
    first_name: norm(state?.first_name),
    connected_at: norm(state?.connected_at),
    connected_at_label: state?.connected_at ? formatDateAr(state.connected_at) : "",
    bot_username: norm(env.TELEGRAM_BOT_USERNAME).replace(/^@+/, ""),
    bot_link: buildTelegramBotLink(env, state?.user_id || entitlement?.user_id || ""),
    feature_flags: entitlement?.flags || {}
  };
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

function whatsappPhoneVariants(value) {
  const normalized = normalizeWhatsAppPhone(value);
  if (!normalized) return [];
  const local = normalized.startsWith("549") ? normalized.slice(3) : normalized;
  const withoutMobileNine = normalized.startsWith("549") ? `54${normalized.slice(3)}` : normalized;
  return [...new Set([
    normalized,
    `+${normalized}`,
    withoutMobileNine,
    `+${withoutMobileNine}`,
    local,
    `0${local}`,
    local.length > 8 ? `15${local}` : ""
  ].filter(Boolean))];
}

async function findUserByWhatsAppPhone(env, fromPhone) {
  const variants = whatsappPhoneVariants(fromPhone);
  for (const candidate of variants) {
    const rows = await supabaseSelect(
      env,
      `users?celular=eq.${encodeURIComponent(candidate)}&select=id,nombre,apellido,email,celular,activo&limit=1`
    ).catch(() => []);
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  const tail = normalizeWhatsAppPhone(fromPhone).slice(-8);
  if (tail) {
    const rows = await supabaseSelect(
      env,
      `users?celular=ilike.*${encodeURIComponent(tail)}*&select=id,nombre,apellido,email,celular,activo&limit=5`
    ).catch(() => []);
    const hit = (Array.isArray(rows) ? rows : []).find((row) => normalizeWhatsAppPhone(row?.celular || "") === normalizeWhatsAppPhone(fromPhone));
    if (hit) return hit;
  }
  return null;
}

function buildWhatsAppStatusPayload(user, prefs, entitlement) {
  const connected = !!normalizeWhatsAppPhone(user?.celular || "");
  const requested = !!prefs?.alertas_whatsapp;
  return {
    ok: true,
    version: TELEGRAM_VERSION,
    connected,
    alerts_enabled: entitlement.allowed ? requested : false,
    alerts_requested: requested,
    allowed_by_plan: !!entitlement.allowed,
    channel_mode: "query_only",
    channel_policy: entitlement.source || "default_policy",
    plan_code: entitlement.plan_code || "",
    plan_name: entitlement.plan_name || "",
    phone_masked: connected ? `••••${normalizeWhatsAppPhone(user?.celular || "").slice(-4)}` : "",
    connect_hint: connected
      ? "Escribí ALERTAS en el chat de WhatsApp para pedir tus alertas del momento."
      : "Guardá un celular válido y escribí ALERTAS desde ese número para usar WhatsApp.",
    feature_flags: entitlement.flags || {}
  };
}

async function sendTelegramText(env, chatId, text) {
  const token = norm(env.TELEGRAM_BOT_TOKEN);
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  if (!chatId) throw new Error("Falta chat_id de Telegram");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram HTTP ${res.status}`);
  }
  return data;
}

async function sendWhatsAppText(env, to, body) {
  const phoneNumberId = norm(env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken = norm(env.WHATSAPP_ACCESS_TOKEN);
  if (!phoneNumberId || !accessToken) throw new Error("Faltan credenciales de WhatsApp");
  const rawDestination = String(to || "").replace(/\s+/g, "");
  const normalizedDestination = normalizeWhatsAppPhone(rawDestination);
  const destination = /^\d{8,}$/.test(rawDestination) ? rawDestination : normalizedDestination;
  const payload = {
    messaging_product: "whatsapp",
    to: destination,
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

async function trySendWhatsAppText(env, to, body, context = "unknown") {
  try {
    return await sendWhatsAppText(env, to, body);
  } catch (err) {
    console.error("WHATSAPP SEND ERROR:", {
      context,
      to,
      error: err?.message || String(err || "send_failed")
    });
    return null;
  }
}

function requireWebhookSecret(request, env) {
  const configured = norm(env.TELEGRAM_WEBHOOK_SECRET);
  if (!configured) {
    throw new Error("Falta TELEGRAM_WEBHOOK_SECRET");
  }
  const provided = norm(request.headers.get("X-Telegram-Bot-Api-Secret-Token"));
  if (!provided || provided !== configured) {
    const err = new Error("Webhook Telegram no autorizado");
    err.status = 401;
    throw err;
  }
}

function extractTelegramStartPayload(update) {
  const message = update?.message;
  const text = norm(message?.text);
  if (!text.startsWith("/start")) return null;
  const payload = text.replace(/^\/start\s*/i, "").trim();
  return payload || null;
}

function extractWhatsAppMessages(payload) {
  const out = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      for (const msg of Array.isArray(value?.messages) ? value.messages : []) {
        const rawFrom = norm(msg?.from || "");
        const normalizedFrom = normalizeWhatsAppPhone(rawFrom);
        const rawText = msg?.text?.body || msg?.button?.text || msg?.interactive?.button_reply?.title || "";
        out.push({
          from: rawFrom || normalizedFrom,
          normalized_from: normalizedFrom,
          text: normUpper(rawText),
          id: norm(msg?.id),
          raw: msg,
          metadata: value?.metadata || {}
        });
      }
    }
  }
  return out;
}

function buildWhatsAppDigestMessage(user, alerts) {
  const visible = alerts.slice(0, 5);
  const lines = [
    `Hola ${norm(user?.nombre) || "Docente"}.`,
    visible.length
      ? `Estas son tus alertas del momento (${alerts.length}):`
      : "Ahora mismo no hay alertas compatibles con tus filtros.",
    ""
  ];
  if (!visible.length) {
    lines.push("Podés volver a escribir ALERTAS más tarde.");
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
  lines.push("Volvé a escribir ALERTAS cuando quieras consultar otra vez.");
  return lines.join("\n");
}

async function handleTelegramWebhook(request, env) {
  requireWebhookSecret(request, env);

  const update = await request.json().catch(() => ({}));
  const payload = extractTelegramStartPayload(update);

  if (!payload || !isUuid(payload)) {
    return json({ ok: true, version: TELEGRAM_VERSION, ignored: true, reason: "start_payload_missing_or_invalid" });
  }

  const chatId = norm(update?.message?.chat?.id);
  const chatType = norm(update?.message?.chat?.type || "private");
  if (!chatId || (chatType && chatType !== "private")) {
    return json({ ok: true, version: TELEGRAM_VERSION, ignored: true, reason: "invalid_chat" });
  }

  const entitlement = await resolveTelegramEntitlement(env, payload);
  const prev = (await getTelegramState(env, payload)) || {};
  const next = await saveTelegramState(env, payload, {
    connected: true,
    chat_id: chatId,
    username: norm(update?.message?.from?.username),
    first_name: norm(update?.message?.from?.first_name),
    connected_at: prev.connected_at || new Date().toISOString(),
    alerts_enabled: entitlement.allowed
      ? (typeof prev.alerts_enabled === "boolean" ? prev.alerts_enabled : true)
      : false,
    last_update_id: update?.update_id ?? null
  });

  const confirmText = [
    "✅ APDocentePBA conectó este chat con tu cuenta.",
    "",
    "Ya podés activar o pausar Telegram desde “Editar preferencias reales” en el panel.",
    "Cuando haya alertas nuevas compatibles, te van a llegar por acá."
  ].join("\n");

  const sent = await sendTelegramText(env, chatId, confirmText).catch(err => {
    console.error("TELEGRAM CONFIRM SEND ERROR:", err);
    return null;
  });

  await insertNotificationDeliveryLogs(env, baseLogRow({
    userId: payload,
    eventType: "telegram_connect",
    deliveryKey: `telegram_connect:${payload}:${chatId}`,
    status: sent ? "sent" : "error",
    providerMessageId: sent?.result?.message_id ? String(sent.result.message_id) : null,
    planCode: entitlement.plan_code,
    payload: {
      connected: true,
      chat_id_masked: maskChatId(chatId),
      allowed_by_plan: entitlement.allowed,
      channel_policy: entitlement.source
    },
    errorMessage: sent ? null : "No se pudo enviar confirmación de conexión"
  }));

  return json({
    ok: true,
    version: TELEGRAM_VERSION,
    connected: true,
    user_id: payload,
    state: buildTelegramStatusPayload(env, next, entitlement)
  });
}

async function handleTelegramStatus(request, env) {
  const authUser = await resolveAuthUser(env, request);
  if (!authUser) return json({ ok: false, error: "No autenticado" }, 401);
  const url = new URL(request.url);
  const requestedUserId = normUpper(url.searchParams.get("user_id")) || authUser.id;
  if (requestedUserId !== authUser.id && !authUser.es_admin) {
    return json({ ok: false, error: "No autorizado" }, 403);
  }
  const state = (await getTelegramState(env, requestedUserId)) || {
    user_id: requestedUserId,
    alerts_enabled: false,
    connected: false
  };
  const entitlement = await resolveTelegramEntitlement(env, requestedUserId);
  return json(buildTelegramStatusPayload(env, { ...state, user_id: requestedUserId }, entitlement));
}

async function handleWhatsAppStatus(request, env) {
  const authUser = await resolveAuthUser(env, request);
  if (!authUser) return json({ ok: false, error: "No autenticado" }, 401);
  const url = new URL(request.url);
  const requestedUserId = normUpper(url.searchParams.get("user_id")) || authUser.id;
  if (requestedUserId !== authUser.id && !authUser.es_admin) {
    return json({ ok: false, error: "No autorizado" }, 403);
  }
  const user = await getUserById(env, requestedUserId);
  const prefsRows = await supabaseSelect(
    env,
    `user_preferences?user_id=eq.${encodeURIComponent(requestedUserId)}&select=alertas_activas,alertas_whatsapp&limit=1`
  ).catch(() => []);
  const prefs = Array.isArray(prefsRows) ? prefsRows[0] || {} : {};
  const entitlement = await resolveWhatsAppEntitlement(env, requestedUserId);
  return json(buildWhatsAppStatusPayload(user, prefs, entitlement));
}

async function handleWhatsAppWebhookVerify(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = norm(env.WHATSAPP_VERIFY_TOKEN || "apdocente_token");

  if (mode === "subscribe" && token === expectedToken) {
    return new Response(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  return new Response("Forbidden", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
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

async function handleGuardarPreferenciasTelegramAware(request, env, ctx) {
  const rawText = await request.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }

  const delegatedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: rawText
  });
  const delegated = await delegateJsonByRequest(delegatedRequest, env, ctx);

  if (!delegated.response.ok || !delegated.data?.ok) {
    return json(delegated.data || { ok: false, error: "No se pudieron guardar las preferencias" }, delegated.response.status || 500);
  }

  const userId = normUpper(payload?.user_id);
  const requestedTelegram = !!payload?.preferencias?.alertas_telegram;
  const requestedWhatsApp = !!payload?.preferencias?.alertas_whatsapp;
  let telegramStatus = null;
  let whatsappStatus = null;

  if (userId) {
    const entitlement = await resolveTelegramEntitlement(env, userId);
    const currentState = await getTelegramState(env, userId);
    const effectiveEnabled = requestedTelegram && !!currentState?.connected;

    const state = await saveTelegramState(env, userId, {
      alerts_enabled: effectiveEnabled,
      connected: !!currentState?.connected
    });

    telegramStatus = buildTelegramStatusPayload(env, { ...state, user_id: userId }, entitlement);

    await supabasePatchReturning(
      env,
      "user_preferences",
      `user_id=eq.${encodeURIComponent(userId)}`,
      {
        alertas_whatsapp: requestedWhatsApp,
        updated_at: new Date().toISOString()
      }
    ).catch(err => {
      console.error("WHATSAPP PREF PERSIST ERROR:", err);
      return null;
    });

    const user = await getUserById(env, userId);
    const waEntitlement = await resolveWhatsAppEntitlement(env, userId);
    whatsappStatus = buildWhatsAppStatusPayload(user, { alertas_whatsapp: requestedWhatsApp }, waEntitlement);

    if (delegated.data?.preferencias && typeof delegated.data.preferencias === "object") {
      delegated.data.preferencias.alertas_whatsapp = requestedWhatsApp;
    }

    await insertNotificationDeliveryLogs(env, baseLogRow({
      userId,
      eventType: "telegram_preferences_update",
      deliveryKey: `telegram_preferences_update:${userId}:${new Date().toISOString()}`,
      status: "updated",
      planCode: entitlement.plan_code,
      payload: {
        requested_alerts_enabled: requestedTelegram,
        effective_alerts_enabled: effectiveEnabled,
        connected: !!currentState?.connected,
        allowed_by_plan: entitlement.allowed,
        channel_policy: entitlement.source,
        requested_whatsapp_enabled: requestedWhatsApp
      },
      errorMessage: null
    }));
  }

  let message = delegated.data?.message || "Preferencias guardadas";
  if (telegramStatus && requestedTelegram && !telegramStatus.connected) {
    message = `${message}. Para activar Telegram, primero tenés que vincular el bot.`;
  }

  return json({
    ...(typeof delegated.data === "object" && delegated.data ? delegated.data : { ok: true }),
    message,
    telegram_status: telegramStatus,
    whatsapp_status: whatsappStatus,
    telegram_version: TELEGRAM_VERSION
  }, delegated.response.status || 200);
}

async function handleWhatsAppWebhook(request, env, ctx) {
  if (!norm(env.WHATSAPP_PHONE_NUMBER_ID) || !norm(env.WHATSAPP_ACCESS_TOKEN)) {
    return json({ ok: true, version: TELEGRAM_VERSION, skipped: true, reason: "missing_config" });
  }

  const payload = await request.json().catch(() => ({}));
  const messages = extractWhatsAppMessages(payload);
  if (!messages.length) {
    return json({ ok: true, version: TELEGRAM_VERSION, ignored: true, reason: "no_messages" });
  }

  const results = [];
  for (const message of messages) {
    const lookupPhone = norm(message.normalized_from || message.from);
    const replyTo = norm(message.from || message.normalized_from);
    if (!lookupPhone || !replyTo) continue;

    const user = await findUserByWhatsAppPhone(env, lookupPhone);
    if (!user?.id || user.activo === false) {
      const text = "No pude vincular este número con una cuenta activa de APDocentePBA. Revisá tu celular en el panel y volvé a escribir ALERTAS.";
      const sent = await trySendWhatsAppText(env, replyTo, text, "user_not_found");
      results.push({ from: replyTo, ok: false, reason: "user_not_found", sent: !!sent });
      continue;
    }

    const prefsRows = await supabaseSelect(
      env,
      `user_preferences?user_id=eq.${encodeURIComponent(user.id)}&select=alertas_activas,alertas_whatsapp&limit=1`
    ).catch(() => []);
    const prefs = Array.isArray(prefsRows) ? prefsRows[0] || {} : {};
    const entitlement = await resolveWhatsAppEntitlement(env, user.id);

    if (!message.text.includes("ALERTA")) {
      const text = "Escribí ALERTAS para recibir tus alertas del momento por WhatsApp.";
      const sent = await trySendWhatsAppText(env, replyTo, text, "help_sent");
      results.push({ from: replyTo, ok: true, reason: "help_sent", sent: !!sent });
      continue;
    }

    if (!entitlement.allowed) {
      const text = `Tu plan actual no tiene WhatsApp habilitado. Con ${entitlement.plan_name || "tu plan"} podés usar email y Telegram.`;
      const sent = await trySendWhatsAppText(env, replyTo, text, "not_allowed_by_plan");
      results.push({ from: replyTo, ok: false, reason: "not_allowed_by_plan", sent: !!sent });
      continue;
    }

    if (!prefs?.alertas_activas) {
      const text = "Tus alertas generales están apagadas en preferencias. Activá alertas en el panel y después escribí ALERTAS otra vez.";
      const sent = await trySendWhatsAppText(env, replyTo, text, "alerts_inactive");
      results.push({ from: replyTo, ok: false, reason: "alerts_inactive", sent: !!sent });
      continue;
    }

    const internalRequest = new Request(`https://internal.apdocentepba.dev/api/mis-alertas?user_id=${encodeURIComponent(user.id)}`, {
      method: "GET"
    });
    const delegated = await delegateJsonByRequest(internalRequest, env, ctx);
    const alerts = delegated.response.ok && delegated.data?.ok && Array.isArray(delegated.data?.resultados)
      ? delegated.data.resultados
      : [];
    const reply = buildWhatsAppDigestMessage(user, alerts);
    const sent = await sendWhatsAppText(env, replyTo, reply).catch(async (err) => {
      await insertNotificationDeliveryLogs(env, baseLogRow({
        userId: user.id,
        channel: "whatsapp",
        eventType: "whatsapp_query_only_alertas",
        deliveryKey: `whatsapp_alertas:${user.id}:${message.id || new Date().toISOString()}`,
        status: "error",
        provider: "whatsapp",
        planCode: entitlement.plan_code,
        payload: { from: replyTo, alerts_count: alerts.length },
        errorMessage: err?.message || "whatsapp_send_failed"
      }));
      return null;
    });

    await insertNotificationDeliveryLogs(env, baseLogRow({
      userId: user.id,
      channel: "whatsapp",
      eventType: "whatsapp_query_only_alertas",
      deliveryKey: `whatsapp_alertas:${user.id}:${message.id || new Date().toISOString()}`,
      status: sent ? "sent" : "error",
      provider: "whatsapp",
      providerMessageId: sent?.messages?.[0]?.id ? String(sent.messages[0].id) : null,
      planCode: entitlement.plan_code,
      payload: { from: replyTo, alerts_count: alerts.length, requested_flag: !!prefs?.alertas_whatsapp },
      errorMessage: sent ? null : "No se pudo enviar respuesta por WhatsApp"
    }));

    results.push({ from: replyTo, ok: !!sent, alerts: alerts.length, user_id: user.id });
  }

  return json({ ok: true, version: TELEGRAM_VERSION, results });
}

async function getActivePreferenceUserIds(env, limit = TELEGRAM_SWEEP_LIMIT) {
  const rows = await supabaseSelect(
    env,
    `user_preferences?alertas_activas=eq.true&select=user_id&limit=${Math.max(1, Number(limit) || TELEGRAM_SWEEP_LIMIT)}`
  ).catch(() => []);

  const unique = new Set();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const userId = normUpper(row?.user_id);
    if (userId) unique.add(userId);
  });
  return [...unique];
}

async function getUserAlertsFromBase(env, userId) {
  const request = new Request(`https://internal.apdocentepba.dev/api/mis-alertas?user_id=${encodeURIComponent(userId)}`, {
    method: "GET"
  });
  const delegated = await delegateJsonByRequest(request, env, {});
  if (!delegated.response.ok || !delegated.data?.ok) return [];
  return Array.isArray(delegated.data?.resultados) ? delegated.data.resultados : [];
}

function alertOfferKey(alert) {
  const direct = [
    alert?.source_offer_key,
    alert?.offer_id,
    alert?.idoferta,
    alert?.iddetalle,
    alert?.id
  ].map(norm).find(Boolean);

  if (direct) return direct;

  return [
    norm(alert?.cargo),
    norm(alert?.area),
    norm(alert?.escuela),
    norm(alert?.distrito),
    norm(alert?.finoferta || alert?.fecha_cierre || alert?.fecha_cierre_fmt)
  ].filter(Boolean).join("|");
}

function alertSummaryLine(alert) {
  const title = [norm(alert?.cargo), norm(alert?.area)]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(" · ") || "Oferta APD";
  const escuela = norm(alert?.escuela) || "Sin escuela";
  const distrito = norm(alert?.distrito) || "-";
  const turno = norm(alert?.turno) || "-";
  const cierre = norm(alert?.finoferta_label || alert?.fecha_cierre_fmt || alert?.fecha_cierre || alert?.finoferta);

  return [
    `• ${title}`,
    `  ${escuela}`,
    `  ${distrito} · turno ${turno}${cierre ? ` · cierre ${cierre}` : ""}`
  ].join("\n");
}

function buildTelegramDigestMessage(alerts) {
  const visible = alerts.slice(0, TELEGRAM_MESSAGE_ALERTS_LIMIT);
  const hiddenCount = Math.max(0, alerts.length - visible.length);

  return [
    `🔔 APDocentePBA detectó ${alerts.length} alerta(s) nueva(s) compatible(s).`,
    "",
    ...visible.map(alertSummaryLine),
    hiddenCount ? `\n+ ${hiddenCount} alerta(s) más en tu panel.` : "",
    "",
    "Entrá al panel para ver el detalle completo y decidir rápido."
  ].filter(Boolean).join("\n");
}

async function wasTelegramAlertSent(env, userId, offerKey) {
  const kv = getKv(env);
  if (!kv) return false;
  const raw = await kv.get(telegramSentKey(userId, offerKey));
  return !!raw;
}

async function markTelegramAlertSent(env, userId, offerKey) {
  const kv = getKv(env);
  if (!kv) return;
  await kv.put(telegramSentKey(userId, offerKey), new Date().toISOString(), {
    expirationTtl: TELEGRAM_SENT_TTL_SECONDS
  });
}

async function runTelegramAlertsSweep(env) {
  if (!norm(env.TELEGRAM_BOT_TOKEN)) {
    return { ok: true, version: TELEGRAM_VERSION, skipped: true, reason: "missing_bot_token" };
  }

  const userIds = await getActivePreferenceUserIds(env, TELEGRAM_SWEEP_LIMIT);
  const results = [];
  let checked = 0;
  let sentUsers = 0;

  for (const userId of userIds) {
    checked += 1;

    try {
      const entitlement = await resolveTelegramEntitlement(env, userId);
      const state = await getTelegramState(env, userId);

      if (!state?.connected || !state?.alerts_enabled || !norm(state?.chat_id)) {
        results.push({ user_id: userId, skipped: true, reason: "telegram_not_ready" });
        await insertNotificationDeliveryLogs(env, baseLogRow({
          userId,
          eventType: "telegram_alert_sweep",
          deliveryKey: `telegram_sweep:${userId}:${new Date().toISOString()}`,
          status: "skipped",
          planCode: entitlement.plan_code,
          payload: {
            reason: "telegram_not_ready",
            connected: !!state?.connected,
            alerts_enabled: !!state?.alerts_enabled
          }
        }));
        continue;
      }

      const alerts = await getUserAlertsFromBase(env, userId);
      const unseen = [];

      for (const alert of alerts) {
        const offerKey = alertOfferKey(alert);
        if (!offerKey) continue;

        if (await wasTelegramAlertSent(env, userId, offerKey)) {
          await insertNotificationDeliveryLogs(env, baseLogRow({
            userId,
            eventType: "telegram_alert",
            deliveryKey: offerKey,
            status: "deduped",
            planCode: entitlement.plan_code,
            payload: { source_offer_key: offerKey }
          }));
          continue;
        }

        unseen.push({ ...alert, __offer_key: offerKey });
      }

      if (!unseen.length) {
        results.push({ user_id: userId, sent: false, unseen: 0 });
        continue;
      }

      const message = buildTelegramDigestMessage(unseen);
      try {
        const sent = await sendTelegramText(env, state.chat_id, message);
        sentUsers += 1;

        for (const alert of unseen) {
          await markTelegramAlertSent(env, userId, alert.__offer_key);
        }

        await insertNotificationDeliveryLogs(env, unseen.map(alert => baseLogRow({
          userId,
          eventType: "telegram_alert",
          deliveryKey: alert.__offer_key,
          status: "sent",
          providerMessageId: sent?.result?.message_id ? String(sent.result.message_id) : null,
          planCode: entitlement.plan_code,
          payload: {
            source_offer_key: alert.__offer_key,
            cargo: norm(alert?.cargo),
            area: norm(alert?.area),
            escuela: norm(alert?.escuela),
            distrito: norm(alert?.distrito),
            digest_size: unseen.length
          }
        })));

        results.push({ user_id: userId, sent: true, unseen: unseen.length });
      } catch (err) {
        await insertNotificationDeliveryLogs(env, unseen.map(alert => baseLogRow({
          userId,
          eventType: "telegram_alert",
          deliveryKey: alert.__offer_key,
          status: "error",
          planCode: entitlement.plan_code,
          payload: {
            source_offer_key: alert.__offer_key,
            digest_size: unseen.length
          },
          errorMessage: err?.message || "telegram_send_failed"
        })));
        throw err;
      }
    } catch (err) {
      console.error("TELEGRAM SWEEP USER ERROR:", userId, err);
      results.push({ user_id: userId, error: err?.message || "telegram_sweep_error" });
    }
  }

  return {
    ok: true,
    version: TELEGRAM_VERSION,
    checked,
    sent_users: sentUsers,
    results
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === `${API_URL_PREFIX}/telegram/status` && request.method === "GET") {
        return await handleTelegramStatus(request, env);
      }

      if (path === `${API_URL_PREFIX}/whatsapp/status` && request.method === "GET") {
        return await handleWhatsAppStatus(request, env);
      }

      if (path === `${API_URL_PREFIX}/whatsapp/webhook` && request.method === "GET") {
        return await handleWhatsAppWebhookVerify(request, env);
      }

      if (path === `${API_URL_PREFIX}/telegram/webhook` && request.method === "POST") {
        return await handleTelegramWebhook(request, env);
      }

      if (path === `${API_URL_PREFIX}/whatsapp/webhook` && request.method === "POST") {
        return await handleWhatsAppWebhook(request, env, ctx);
      }

      if (path === `${API_URL_PREFIX}/guardar-preferencias` && request.method === "POST") {
        return await handleGuardarPreferenciasTelegramAware(request, env, ctx);
      }
    } catch (err) {
      const status = Number(err?.status || 500) || 500;
      return json({ ok: false, error: err?.message || "Telegram wrapper error", telegram_version: TELEGRAM_VERSION }, status);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      await baseWorker.scheduled(controller, env, ctx);
    }

    ctx.waitUntil(runTelegramAlertsSweep(env).catch(err => {
      console.error("TELEGRAM SWEEP ERROR:", err);
    }));
  }
}

import baseWorker from "./worker_pid_lookup_hotfix.js";

const API_URL_PREFIX = "/api";
const TELEGRAM_VERSION = "2026-04-07-telegram-alerts-1";
const TELEGRAM_SWEEP_LIMIT = 200;
const TELEGRAM_MESSAGE_ALERTS_LIMIT = 5;
const TELEGRAM_SENT_TTL_SECONDS = 60 * 60 * 24 * 30;

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

function norm(value) {
  return String(value || "").trim();
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(norm(value));
}

function formatDateAr(value) {
  const raw = norm(value);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
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

function telegramStateKey(userId) {
  return `telegram:user:${norm(userId)}`;
}

function telegramSentKey(userId, offerKey) {
  return `telegram:sent:${norm(userId)}:${norm(offerKey)}`;
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
    user_id: norm(userId),
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

function buildTelegramStatusPayload(env, state) {
  const connected = !!state?.connected && !!norm(state?.chat_id);
  return {
    ok: true,
    version: TELEGRAM_VERSION,
    connected,
    alerts_enabled: !!state?.alerts_enabled,
    chat_id_masked: connected ? maskChatId(state?.chat_id) : "",
    username: norm(state?.username),
    first_name: norm(state?.first_name),
    connected_at: norm(state?.connected_at),
    connected_at_label: state?.connected_at ? formatDateAr(state.connected_at) : "",
    bot_username: norm(env.TELEGRAM_BOT_USERNAME).replace(/^@+/, ""),
    bot_link: buildTelegramBotLink(env, state?.user_id)
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

function extractTelegramStartPayload(update) {
  const message = update?.message;
  const text = norm(message?.text);
  if (!text.startsWith('/start')) return null;
  const payload = text.replace(/^\/start\s*/i, '').trim();
  return payload || null;
}

async function handleTelegramWebhook(request, env) {
  const update = await request.json().catch(() => ({}));
  const payload = extractTelegramStartPayload(update);

  if (!payload || !isUuid(payload)) {
    return json({ ok: true, version: TELEGRAM_VERSION, ignored: true, reason: 'start_payload_missing_or_invalid' });
  }

  const chatId = norm(update?.message?.chat?.id);
  const chatType = norm(update?.message?.chat?.type || 'private');
  if (!chatId || (chatType && chatType !== 'private')) {
    return json({ ok: true, version: TELEGRAM_VERSION, ignored: true, reason: 'invalid_chat' });
  }

  const prev = (await getTelegramState(env, payload)) || {};
  const next = await saveTelegramState(env, payload, {
    connected: true,
    chat_id: chatId,
    username: norm(update?.message?.from?.username),
    first_name: norm(update?.message?.from?.first_name),
    connected_at: prev.connected_at || new Date().toISOString(),
    alerts_enabled: typeof prev.alerts_enabled === 'boolean' ? prev.alerts_enabled : true,
    last_update_id: update?.update_id ?? null
  });

  const confirmText = [
    '✅ APDocentePBA conectó este chat con tu cuenta.',
    '',
    'Ya podés activar o pausar Telegram desde “Editar preferencias reales” en el panel.',
    'Cuando haya alertas nuevas compatibles, te van a llegar por acá.'
  ].join('\n');

  await sendTelegramText(env, chatId, confirmText).catch(err => {
    console.error('TELEGRAM CONFIRM SEND ERROR:', err);
  });

  return json({
    ok: true,
    version: TELEGRAM_VERSION,
    connected: true,
    user_id: payload,
    state: buildTelegramStatusPayload(env, next)
  });
}

async function handleTelegramStatus(request, env) {
  const authUser = await resolveAuthUser(env, request);
  if (!authUser) return json({ ok: false, error: 'No autenticado' }, 401);

  const url = new URL(request.url);
  const requestedUserId = norm(url.searchParams.get('user_id')) || authUser.id;
  if (requestedUserId !== authUser.id && !authUser.es_admin) {
    return json({ ok: false, error: 'No autorizado' }, 403);
  }

  const state = (await getTelegramState(env, requestedUserId)) || {
    user_id: requestedUserId,
    alerts_enabled: false,
    connected: false
  };

  return json(buildTelegramStatusPayload(env, { ...state, user_id: requestedUserId }));
}

async function delegateJsonRequest(request, env, ctx) {
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
  const delegated = await delegateJsonRequest(delegatedRequest, env, ctx);

  if (!delegated.response.ok || !delegated.data?.ok) {
    return json(delegated.data || { ok: false, error: 'No se pudieron guardar las preferencias' }, delegated.response.status || 500);
  }

  const userId = norm(payload?.user_id);
  const telegramEnabled = !!payload?.preferencias?.alertas_telegram;
  let telegramStatus = null;

  if (userId) {
    const currentState = await getTelegramState(env, userId);
    const state = await saveTelegramState(env, userId, {
      alerts_enabled: telegramEnabled,
      connected: !!currentState?.connected
    });
    telegramStatus = buildTelegramStatusPayload(env, { ...state, user_id: userId });
  }

  return json({
    ...(typeof delegated.data === 'object' && delegated.data ? delegated.data : { ok: true }),
    telegram_status: telegramStatus,
    telegram_version: TELEGRAM_VERSION
  }, delegated.response.status || 200);
}

async function getActivePreferenceUserIds(env, limit = TELEGRAM_SWEEP_LIMIT) {
  const rows = await supabaseSelect(
    env,
    `user_preferences?alertas_activas=eq.true&select=user_id&limit=${Math.max(1, Number(limit) || TELEGRAM_SWEEP_LIMIT)}`
  ).catch(() => []);

  const unique = new Set();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const userId = norm(row?.user_id);
    if (userId) unique.add(userId);
  });
  return [...unique];
}

async function getUserAlertsFromBase(env, userId) {
  const request = new Request(`https://internal.apdocentepba.dev/api/mis-alertas?user_id=${encodeURIComponent(userId)}`, {
    method: 'GET'
  });
  const delegated = await delegateJsonRequest(request, env, {});
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
  ].filter(Boolean).join('|');
}

function alertSummaryLine(alert) {
  const title = [norm(alert?.cargo), norm(alert?.area)].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ') || 'Oferta APD';
  const escuela = norm(alert?.escuela) || 'Sin escuela';
  const distrito = norm(alert?.distrito) || '-';
  const turno = norm(alert?.turno) || '-';
  const cierre = norm(alert?.finoferta_label || alert?.fecha_cierre_fmt || alert?.fecha_cierre || alert?.finoferta);

  const lines = [
    `• ${title}`,
    `  ${escuela}`,
    `  ${distrito} · turno ${turno}${cierre ? ` · cierre ${cierre}` : ''}`
  ];

  return lines.join('\n');
}

function buildTelegramDigestMessage(alerts) {
  const visible = alerts.slice(0, TELEGRAM_MESSAGE_ALERTS_LIMIT);
  const hiddenCount = Math.max(0, alerts.length - visible.length);

  return [
    `🔔 APDocentePBA detectó ${alerts.length} alerta(s) nueva(s) compatible(s).`,
    '',
    ...visible.map(alertSummaryLine),
    hiddenCount ? `\n+ ${hiddenCount} alerta(s) más en tu panel.` : '',
    '',
    'Entrá al panel para ver el detalle completo y decidir rápido.'
  ].filter(Boolean).join('\n');
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
    return { ok: true, version: TELEGRAM_VERSION, skipped: true, reason: 'missing_bot_token' };
  }

  const userIds = await getActivePreferenceUserIds(env, TELEGRAM_SWEEP_LIMIT);
  const results = [];
  let checked = 0;
  let sent_users = 0;

  for (const userId of userIds) {
    checked += 1;
    try {
      const state = await getTelegramState(env, userId);
      if (!state?.connected || !state?.alerts_enabled || !norm(state?.chat_id)) {
        results.push({ user_id: userId, skipped: true, reason: 'telegram_not_ready' });
        continue;
      }

      const alerts = await getUserAlertsFromBase(env, userId);
      const unseen = [];

      for (const alert of alerts) {
        const offerKey = alertOfferKey(alert);
        if (!offerKey) continue;
        if (await wasTelegramAlertSent(env, userId, offerKey)) continue;
        unseen.push({ ...alert, __offer_key: offerKey });
      }

      if (!unseen.length) {
        results.push({ user_id: userId, sent: false, unseen: 0 });
        continue;
      }

      const message = buildTelegramDigestMessage(unseen);
      await sendTelegramText(env, state.chat_id, message);
      for (const alert of unseen) {
        await markTelegramAlertSent(env, userId, alert.__offer_key);
      }

      sent_users += 1;
      results.push({ user_id: userId, sent: true, unseen: unseen.length });
    } catch (err) {
      console.error('TELEGRAM SWEEP USER ERROR:', userId, err);
      results.push({ user_id: userId, error: err?.message || 'telegram_sweep_error' });
    }
  }

  return {
    ok: true,
    version: TELEGRAM_VERSION,
    checked,
    sent_users,
    results
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === `${API_URL_PREFIX}/telegram/status` && request.method === 'GET') {
        return await handleTelegramStatus(request, env);
      }

      if (path === `${API_URL_PREFIX}/telegram/webhook` && request.method === 'POST') {
        return await handleTelegramWebhook(request, env);
      }

      if (path === `${API_URL_PREFIX}/guardar-preferencias` && request.method === 'POST') {
        return await handleGuardarPreferenciasTelegramAware(request, env, ctx);
      }
    } catch (err) {
      return json({ ok: false, error: err?.message || 'Telegram wrapper error', telegram_version: TELEGRAM_VERSION }, 500);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === 'function') {
      await baseWorker.scheduled(controller, env, ctx);
    }

    ctx.waitUntil(runTelegramAlertsSweep(env).catch(err => {
      console.error('TELEGRAM SWEEP ERROR:', err);
    }));
  }
};

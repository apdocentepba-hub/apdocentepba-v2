import baseWorker from "./worker_email_queue_hotfix.js";

const WHATSAPP_LINK_HOTFIX_VERSION = "2026-04-26-whatsapp-link-1";
const API_URL_PREFIX = "/api";

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

async function readJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { text, data };
}

function directWhatsAppLinkFromEnv(env) {
  const link = norm(
    env.WHATSAPP_BOT_LINK ||
    env.WHATSAPP_LINK ||
    env.WHATSAPP_CONNECT_URL ||
    env.WHATSAPP_DEEP_LINK ||
    ""
  );
  return /^https?:\/\//i.test(link) ? link : "";
}

function phoneFromEnv(env) {
  return normalizeWhatsAppPhone(
    env.WHATSAPP_BOT_PHONE ||
    env.WHATSAPP_BUSINESS_PHONE ||
    env.WHATSAPP_DISPLAY_PHONE ||
    env.WHATSAPP_FROM_PHONE ||
    env.WHATSAPP_PHONE ||
    env.WHATSAPP_NUMBER ||
    ""
  );
}

async function phoneFromMeta(env) {
  const phoneNumberId = norm(env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken = norm(env.WHATSAPP_ACCESS_TOKEN);
  if (!phoneNumberId || !accessToken) return "";

  try {
    const graphVersion = norm(env.WHATSAPP_GRAPH_VERSION) || "v23.0";
    const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    return normalizeWhatsAppPhone(data?.display_phone_number || data?.phone_number || "");
  } catch (err) {
    console.error("WHATSAPP LINK HOTFIX META PHONE ERROR:", err?.message || err);
    return "";
  }
}

async function resolveWhatsAppBotPhone(env, payload = {}) {
  return normalizeWhatsAppPhone(
    payload?.bot_phone ||
    payload?.whatsapp_phone ||
    payload?.phone_e164 ||
    payload?.business_phone ||
    ""
  ) || phoneFromEnv(env) || await phoneFromMeta(env);
}

async function buildWhatsAppBotLink(env, payload = {}) {
  const existing = norm(
    payload?.whatsapp_link ||
    payload?.wa_link ||
    payload?.connect_url ||
    payload?.deep_link ||
    payload?.bot_link ||
    ""
  );
  if (/^https?:\/\//i.test(existing)) return existing;

  const direct = directWhatsAppLinkFromEnv(env);
  if (direct) return direct;

  const phone = await resolveWhatsAppBotPhone(env, payload);
  return phone ? `https://wa.me/${phone}?text=ALERTAS` : "";
}

async function handleWhatsAppStatusWithLink(request, env, ctx) {
  const response = await baseWorker.fetch(request, env, ctx);
  const { text, data } = await readJsonResponse(response.clone());

  if (!response.ok || !data || typeof data !== "object") {
    return new Response(text, { status: response.status, headers: corsHeaders() });
  }

  const phone = await resolveWhatsAppBotPhone(env, data);
  const link = await buildWhatsAppBotLink(env, { ...data, bot_phone: phone });

  return json({
    ...data,
    whatsapp_link_hotfix_version: WHATSAPP_LINK_HOTFIX_VERSION,
    bot_phone: phone || data.bot_phone || data.whatsapp_phone || "",
    whatsapp_phone: phone || data.whatsapp_phone || data.bot_phone || "",
    phone_e164: phone ? `+${phone}` : data.phone_e164 || "",
    business_phone: phone || data.business_phone || "",
    whatsapp_link: link || data.whatsapp_link || "",
    wa_link: link || data.wa_link || "",
    connect_url: link || data.connect_url || "",
    bot_link: link || data.bot_link || "",
    deep_link: link || data.deep_link || "",
    connect_hint: link
      ? "Abrí el bot de WhatsApp y escribí ALERTAS para pedir tus alertas del momento."
      : data.connect_hint || "Escribí ALERTAS en el chat de WhatsApp para pedir tus alertas del momento."
  }, response.status);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === `${API_URL_PREFIX}/whatsapp/status` && request.method === "GET") {
        return await handleWhatsAppStatusWithLink(request, env, ctx);
      }

      if (url.pathname === `${API_URL_PREFIX}/version` && request.method === "GET") {
        const response = await baseWorker.fetch(request, env, ctx);
        const { text, data } = await readJsonResponse(response.clone());
        return json({
          ...(data && typeof data === "object" ? data : {}),
          whatsapp_link_hotfix_version: WHATSAPP_LINK_HOTFIX_VERSION
        }, response.status || 200);
      }
    } catch (err) {
      return json({
        ok: false,
        error: err?.message || "whatsapp_link_hotfix_error",
        whatsapp_link_hotfix_version: WHATSAPP_LINK_HOTFIX_VERSION
      }, Number(err?.status || 500) || 500);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      return await baseWorker.scheduled(controller, env, ctx);
    }
  }
};

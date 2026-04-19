import baseWorker from "./worker_telegram_hotfix.js";
import { processPendingEmailQueue, handleEmailAlertsHealth, handleEmailAlertsRun } from "./email_queue_hotfix.js";

const API_URL_PREFIX = "/api";
const EMAIL_QUEUE_WRAPPER_VERSION = "2026-04-11-email-wrapper-1";

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

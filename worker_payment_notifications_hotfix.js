import baseWorker from "./worker_subscription_reconciliation_hotfix.js";

const API_URL_PREFIX = "/api";
const PAYMENT_NOTIFICATIONS_VERSION = "2026-04-05-paymail-1";
const NOTIFY_TTL_SECONDS = 60 * 24 * 60 * 60;
const EXPIRING_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;
const EXPIRED_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 50;

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function getSubscriptionAccessUntil(subscription) {
  if (!subscription) return null;
  const planCode = canonicalPlanCode(subscription.plan_code);
  return planCode === "TRIAL_7D" ? subscription.trial_ends_at || null : subscription.current_period_ends_at || null;
}

function isSubscriptionCurrent(subscription) {
  if (!subscription) return false;
  const status = normalizeSubscriptionStatus(subscription.status);
  const now = Date.now();
  if (status === "CANCELLED") return false;
  const end = parseFechaFlexible(getSubscriptionAccessUntil(subscription))?.getTime() || 0;
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
  return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getPlanByCode(env, planCode) {
  const code = canonicalPlanCode(planCode);
  const rows = await supabaseSelect(env, `subscription_plans?code=eq.${encodeURIComponent(code)}&select=code,nombre,descripcion,price_ars&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserSubscriptions(env, userId) {
  const rows = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getUserCheckoutSessions(env, userId) {
  const rows = await supabaseSelect(env, `mercadopago_checkout_sessions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,plan_code,status,provider,checkout_url,external_reference,provider_payload,created_at&order=created_at.desc&limit=100`).catch(() => []);
  return Array.isArray(rows) ? rows.map(row => ({ ...row, provider_payload: safeJsonParse(row.provider_payload) || row.provider_payload || null })) : [];
}

async function getSubscriptionsForBillingSweep(env, limit = BATCH_LIMIT) {
  const rows = await supabaseSelect(env, `user_subscriptions?status=in.(ACTIVE,AUTHORIZED,PENDING,PAUSED,TRIALING,BETA)&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id,external_reference,created_at&order=created_at.desc&limit=${Math.max(1, Number(limit) || BATCH_LIMIT)}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function resolveBrevoConfig(env) {
  const apiKey = String(
    env.BREVO_API_KEY ||
    env.SENDINBLUE_API_KEY ||
    env.BREVO_TRANSACTIONAL_API_KEY ||
    ""
  ).trim();

  const senderEmail = String(
    env.BREVO_FROM_EMAIL ||
    env.BREVO_SENDER_EMAIL ||
    env.ALERT_FROM_EMAIL ||
    env.EMAIL_FROM ||
    ""
  ).trim();

  const senderName = String(
    env.BREVO_FROM_NAME ||
    env.BREVO_SENDER_NAME ||
    env.ALERT_FROM_NAME ||
    env.EMAIL_FROM_NAME ||
    "APDocentePBA"
  ).trim() || "APDocentePBA";

  return {
    apiKey,
    senderEmail,
    senderName,
    replyToEmail: String(env.BREVO_REPLY_TO_EMAIL || env.EMAIL_REPLY_TO || "").trim(),
    replyToName: String(env.BREVO_REPLY_TO_NAME || senderName).trim() || senderName,
    appUrl: String(env.MERCADOPAGO_SUCCESS_URL || env.APP_PUBLIC_URL || "https://apdocentepba-hub.github.io/apdocentepba-v2/").trim()
  };
}

async function sendBrevoEmail(env, payload) {
  const config = resolveBrevoConfig(env);
  if (!config.apiKey || !config.senderEmail) {
    return { ok: false, reason: "brevo_not_configured" };
  }

  const body = {
    sender: { email: config.senderEmail, name: config.senderName },
    to: [{ email: payload.to.email, name: payload.to.name || "" }],
    subject: payload.subject,
    htmlContent: payload.htmlContent,
    tags: payload.tags || ["apdocentepba", "billing"],
    textContent: payload.textContent || undefined,
    replyTo: config.replyToEmail ? { email: config.replyToEmail, name: config.replyToName } : undefined
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": config.apiKey
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    return { ok: false, reason: "brevo_request_failed", status: res.status, error: data };
  }

  return { ok: true, messageId: data?.messageId || null };
}

function getNotificationStore(env) {
  return env.EMAIL_SWEEP_STATE && typeof env.EMAIL_SWEEP_STATE.get === "function" ? env.EMAIL_SWEEP_STATE : null;
}

async function notificationAlreadySent(env, key) {
  const store = getNotificationStore(env);
  if (!store) return false;
  return !!(await store.get(key).catch(() => null));
}

async function markNotificationSent(env, key, data) {
  const store = getNotificationStore(env);
  if (!store) return;
  await store.put(key, JSON.stringify(data || {}), { expirationTtl: NOTIFY_TTL_SECONDS }).catch(() => null);
}

function displayName(user) {
  const full = `${String(user?.nombre || "").trim()} ${String(user?.apellido || "").trim()}`.trim();
  return full || String(user?.email || "").trim() || "docente";
}

function buildMailShell(title, intro, bullets, closingHtml) {
  const bulletHtml = (bullets || []).filter(Boolean).map(item => `<li style=\"margin:0 0 8px 0;\">${escapeHtml(item)}</li>`).join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">APDocentePBA · Pagos</div>
        <h1 style="font-size:24px;line-height:1.3;margin:0 0 14px 0;">${escapeHtml(title)}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">${escapeHtml(intro)}</p>
        ${bulletHtml ? `<ul style="padding-left:20px;margin:0 0 18px 0;font-size:14px;line-height:1.6;">${bulletHtml}</ul>` : ""}
        ${closingHtml || ""}
      </div>
    </div>
  </body>
</html>`;
}

async function sendBillingNotification(env, eventKey, user, mail) {
  const email = String(user?.email || "").trim();
  if (!email) return { ok: false, reason: "missing_user_email" };
  if (await notificationAlreadySent(env, eventKey)) {
    return { ok: true, deduped: true };
  }

  const result = await sendBrevoEmail(env, {
    to: { email, name: displayName(user) },
    subject: mail.subject,
    htmlContent: mail.htmlContent,
    textContent: mail.textContent,
    tags: ["apdocentepba", "billing", mail.tag || "generic"]
  });

  if (result.ok) {
    await markNotificationSent(env, eventKey, {
      sent_at: new Date().toISOString(),
      subject: mail.subject,
      message_id: result.messageId || null,
      user_id: user?.id || null,
      event_tag: mail.tag || "generic"
    });
  }
  return result;
}

function autoRenewEnabledMail(user, planName, appUrl) {
  const intro = `${displayName(user)}, te abrimos Mercado Pago para que completes la activación del débito automático de ${planName}.`;
  const bullets = [
    "La renovación automática no queda confirmada hasta que completes la autorización en Mercado Pago.",
    "Si no completás ese paso, tu plan seguirá con renovación manual.",
    "Podés volver a entrar a Mi plan para revisar el estado cuando quieras."
  ];
  const closingHtml = `<p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">Entrá desde tu panel para continuar o revisar el estado.</p><p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Abrir APDocentePBA</a></p>`;
  return {
    subject: `APDocentePBA · Activación de débito automático para ${planName}`,
    htmlContent: buildMailShell(`Activación de débito automático`, intro, bullets, closingHtml),
    textContent: `${intro}\n- ${bullets.join("\n- ")}\n${appUrl}`,
    tag: "auto-renew-enabled"
  };
}

function autoRenewCanceledMail(user, planName, accessUntil, appUrl) {
  const dateLabel = formatDateAr(accessUntil) || "el fin del ciclo actual";
  const intro = `${displayName(user)}, desactivaste el débito automático de ${planName}.`;
  const bullets = [
    `Vas a conservar el acceso hasta ${dateLabel}.`,
    "Después de esa fecha el plan no se volverá a cobrar automáticamente.",
    "Si querés continuar, más adelante podés renovarlo de forma manual o volver a activar el débito automático."
  ];
  const closingHtml = `<p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Ver Mi plan</a></p>`;
  return {
    subject: `APDocentePBA · Débito automático desactivado`,
    htmlContent: buildMailShell(`Débito automático desactivado`, intro, bullets, closingHtml),
    textContent: `${intro}\n- ${bullets.join("\n- ")}\n${appUrl}`,
    tag: "auto-renew-cancelled"
  };
}

function downgradeScheduledMail(user, currentPlanName, targetPlanName, accessUntil, appUrl) {
  const dateLabel = formatDateAr(accessUntil) || "el próximo ciclo";
  const intro = `${displayName(user)}, programaste el cambio de ${currentPlanName} a ${targetPlanName}.`;
  const bullets = [
    `Vas a seguir usando ${currentPlanName} hasta ${dateLabel}.`,
    `En el próximo ciclo se va a cobrar ${targetPlanName}.`,
    "No tenés que hacer nada más ahora; el cambio quedó agendado."
  ];
  const closingHtml = `<p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Revisar cambio programado</a></p>`;
  return {
    subject: `APDocentePBA · Cambio de plan programado`,
    htmlContent: buildMailShell(`Cambio de plan programado`, intro, bullets, closingHtml),
    textContent: `${intro}\n- ${bullets.join("\n- ")}\n${appUrl}`,
    tag: "downgrade-scheduled"
  };
}

function upgradeAppliedMail(user, currentPlanName, targetPlanName, amountToCharge, appUrl) {
  const intro = `${displayName(user)}, tu cambio de ${currentPlanName} a ${targetPlanName} quedó aplicado.`;
  const bullets = [
    `Se registró el cobro de $${Number(amountToCharge || 0).toLocaleString("es-AR")} por la diferencia proporcional del upgrade.`,
    `Desde ahora ya tenés activo ${targetPlanName}.`,
    "El próximo débito automático va a usar el valor del plan nuevo."
  ];
  const closingHtml = `<p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Ver Mi plan</a></p>`;
  return {
    subject: `APDocentePBA · Upgrade confirmado`,
    htmlContent: buildMailShell(`Upgrade confirmado`, intro, bullets, closingHtml),
    textContent: `${intro}\n- ${bullets.join("\n- ")}\n${appUrl}`,
    tag: "upgrade-applied"
  };
}

function recurringStatusProblemMail(user, planName, statusLabel, accessUntil, appUrl) {
  const intro = `${displayName(user)}, detectamos un problema con la renovación automática de ${planName}.`;
  const bullets = [
    `Estado detectado en Mercado Pago: ${statusLabel}.`,
    accessUntil ? `Tu acceso actual figura hasta ${formatDateAr(accessUntil)}.` : "Revisá tu plan y el medio de pago para evitar cortes.",
    "Entrá a Mi plan para revisar el estado y, si hace falta, volver a activar el débito automático o renovar manualmente."
  ];
  const closingHtml = `<p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Revisar pagos</a></p>`;
  return {
    subject: `APDocentePBA · Problema con la renovación automática`,
    htmlContent: buildMailShell(`Revisá tu renovación automática`, intro, bullets, closingHtml),
    textContent: `${intro}\n- ${bullets.join("\n- ")}\n${appUrl}`,
    tag: "renewal-problem"
  };
}

function expiringSoonMail(user, planName, accessUntil, appUrl) {
  const dateLabel = formatDateAr(accessUntil) || "próximamente";
  const intro = `${displayName(user)}, tu plan ${planName} está por vencer.`;
  const bullets = [
    `La fecha de corte actual es ${dateLabel}.`,
    "Si querés seguir usando APDocentePBA sin interrupciones, renová el plan o activá el débito automático antes de esa fecha.",
    "Si no hacés nada, al vencer el ciclo se te va a cortar el acceso al plan pago."
  ];
  const closingHtml = `<p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Resolver ahora</a></p>`;
  return {
    subject: `APDocentePBA · Tu plan está por vencer`,
    htmlContent: buildMailShell(`Tu plan está por vencer`, intro, bullets, closingHtml),
    textContent: `${intro}\n- ${bullets.join("\n- ")}\n${appUrl}`,
    tag: "expiring-soon"
  };
}

function expiredMail(user, planName, accessUntil, appUrl) {
  const dateLabel = formatDateAr(accessUntil) || "la fecha prevista";
  const intro = `${displayName(user)}, tu acceso al plan ${planName} venció.`;
  const bullets = [
    `La última fecha de acceso registrada fue ${dateLabel}.`,
    "Para volver a usar las funciones pagas necesitás renovar el plan o activar el débito automático.",
    "Tus datos siguen ahí; lo que cambia es el acceso al plan pago."
  ];
  const closingHtml = `<p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Volver a activar</a></p>`;
  return {
    subject: `APDocentePBA · Tu plan venció`,
    htmlContent: buildMailShell(`Tu plan venció`, intro, bullets, closingHtml),
    textContent: `${intro}\n- ${bullets.join("\n- ")}\n${appUrl}`,
    tag: "expired"
  };
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

async function maybeNotifyAutoRenewEnabled(env, data, userId) {
  const user = await getUserById(env, userId);
  if (!user) return null;
  const subscriptions = await getUserSubscriptions(env, userId);
  const current = subscriptions.find(isSubscriptionCurrent) || subscriptions[0] || null;
  const planCode = canonicalPlanCode(current?.plan_code || data?.plan?.code || data?.current_plan_code || "");
  const plan = await getPlanByCode(env, planCode).catch(() => null);
  const appUrl = resolveBrevoConfig(env).appUrl;
  const eventKey = `paymail:auto-renew-enabled:${userId}:${planCode}:${String(data?.preapproval_id || data?.external_reference || "pending")}`;
  return await sendBillingNotification(env, eventKey, user, autoRenewEnabledMail(user, plan?.nombre || planCode || "tu plan", appUrl));
}

async function maybeNotifyAutoRenewCanceled(env, data, userId) {
  const user = await getUserById(env, userId);
  if (!user) return null;
  const subscriptions = await getUserSubscriptions(env, userId);
  const current = subscriptions.find(isSubscriptionCurrent) || subscriptions[0] || null;
  const planCode = canonicalPlanCode(current?.plan_code || data?.current_plan_code || "");
  const plan = await getPlanByCode(env, planCode).catch(() => null);
  const appUrl = resolveBrevoConfig(env).appUrl;
  const eventKey = `paymail:auto-renew-cancelled:${userId}:${planCode}:${formatDateAr(current?.current_period_ends_at || data?.access_until || "")}`;
  return await sendBillingNotification(env, eventKey, user, autoRenewCanceledMail(user, plan?.nombre || planCode || "tu plan", current?.current_period_ends_at || data?.access_until || null, appUrl));
}

async function maybeNotifyDowngradeScheduled(env, data, userId, targetPlanCode) {
  const user = await getUserById(env, userId);
  if (!user) return null;
  const subscriptions = await getUserSubscriptions(env, userId);
  const current = subscriptions.find(isSubscriptionCurrent) || subscriptions[0] || null;
  const currentPlan = await getPlanByCode(env, current?.plan_code || "").catch(() => null);
  const targetPlan = await getPlanByCode(env, targetPlanCode).catch(() => null);
  const appUrl = resolveBrevoConfig(env).appUrl;
  const eventKey = `paymail:downgrade-scheduled:${userId}:${canonicalPlanCode(current?.plan_code || "")}:${targetPlanCode}:${formatDateAr(data?.scheduled_change?.apply_at || current?.current_period_ends_at || "")}`;
  return await sendBillingNotification(env, eventKey, user, downgradeScheduledMail(user, currentPlan?.nombre || current?.plan_code || "plan actual", targetPlan?.nombre || targetPlanCode, data?.scheduled_change?.apply_at || current?.current_period_ends_at || null, appUrl));
}

async function maybeNotifyUpgradeApplied(env, sync) {
  const userId = String(sync?.user_id || "").trim();
  if (!userId) return null;
  const user = await getUserById(env, userId);
  if (!user) return null;
  const targetPlanCode = canonicalPlanCode(sync?.plan_code || "");
  const targetPlan = await getPlanByCode(env, targetPlanCode).catch(() => null);
  const sessions = await getUserCheckoutSessions(env, userId);
  const paymentId = String(sync?.payment_id || "").trim();
  const upgradeSession = sessions.find(session => {
    const payload = safeJsonParse(session?.provider_payload) || {};
    return String(payload?.payment_id || "") === paymentId || String(session?.external_reference || "") === String(sync?.external_reference || "");
  }) || null;
  const payload = safeJsonParse(upgradeSession?.provider_payload) || {};
  const currentPlanCode = canonicalPlanCode(payload?.current_plan_code || "");
  const currentPlan = await getPlanByCode(env, currentPlanCode).catch(() => null);
  const appUrl = resolveBrevoConfig(env).appUrl;
  const eventKey = `paymail:upgrade-applied:${userId}:${paymentId || targetPlanCode}`;
  return await sendBillingNotification(env, eventKey, user, upgradeAppliedMail(user, currentPlan?.nombre || currentPlanCode || "plan actual", targetPlan?.nombre || targetPlanCode || "plan nuevo", Number(payload?.amount_to_charge_ars || 0), appUrl));
}

async function maybeNotifyBillingSweepItem(env, subscription) {
  const userId = String(subscription?.user_id || "").trim();
  if (!userId) return null;
  const user = await getUserById(env, userId);
  if (!user) return null;
  const planCode = canonicalPlanCode(subscription?.plan_code || "");
  const plan = await getPlanByCode(env, planCode).catch(() => null);
  const appUrl = resolveBrevoConfig(env).appUrl;
  const status = normalizeSubscriptionStatus(subscription?.status || "");
  const accessUntil = getSubscriptionAccessUntil(subscription);
  const accessTs = parseFechaFlexible(accessUntil)?.getTime() || 0;
  const now = Date.now();

  if (hasRecurringPreapproval(subscription) && ["PAUSED", "CANCELLED"].includes(status)) {
    const eventKey = `paymail:renewal-problem:${userId}:${subscription.id}:${status}:${formatDateAr(accessUntil)}`;
    return await sendBillingNotification(env, eventKey, user, recurringStatusProblemMail(user, plan?.nombre || planCode || "tu plan", status, accessUntil, appUrl));
  }

  if (!hasRecurringPreapproval(subscription)) {
    if (accessTs > now && accessTs - now <= EXPIRING_SOON_WINDOW_MS) {
      const eventKey = `paymail:expiring-soon:${userId}:${subscription.id}:${formatDateAr(accessUntil)}`;
      return await sendBillingNotification(env, eventKey, user, expiringSoonMail(user, plan?.nombre || planCode || "tu plan", accessUntil, appUrl));
    }

    if (accessTs && accessTs <= now && now - accessTs <= EXPIRED_WINDOW_MS) {
      const eventKey = `paymail:expired:${userId}:${subscription.id}:${formatDateAr(accessUntil)}`;
      return await sendBillingNotification(env, eventKey, user, expiredMail(user, plan?.nombre || planCode || "tu plan", accessUntil, appUrl));
    }
  }

  return null;
}

async function runBillingNotificationsSweep(env) {
  const rows = await getSubscriptionsForBillingSweep(env, BATCH_LIMIT);
  let processed = 0;
  let sent = 0;
  const results = [];
  for (const subscription of rows) {
    try {
      const result = await maybeNotifyBillingSweepItem(env, subscription);
      processed += 1;
      if (result?.ok && !result?.deduped) sent += 1;
      if (result) {
        results.push({ user_id: subscription.user_id, subscription_id: subscription.id, result });
      }
    } catch (err) {
      results.push({ user_id: subscription.user_id, subscription_id: subscription.id, error: err?.message || "billing sweep error" });
    }
  }
  return { ok: true, processed, sent, results };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === `${API_URL_PREFIX}/subscription/enable-auto-renew` && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const delegated = await delegateJson(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }), env, ctx);
        if (delegated.response.ok && delegated.data?.ok) {
          ctx.waitUntil(maybeNotifyAutoRenewEnabled(env, delegated.data, String(body?.user_id || delegated.data?.user_id || "").trim()).catch(() => null));
        }
        return json({ ...(delegated.data || {}), payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, delegated.response.status || 200);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo activar la renovación automática", payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/subscription/cancel` && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const delegated = await delegateJson(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }), env, ctx);
        if (delegated.response.ok && delegated.data?.ok) {
          ctx.waitUntil(maybeNotifyAutoRenewCanceled(env, delegated.data, String(body?.user_id || delegated.data?.user_id || "").trim()).catch(() => null));
        }
        return json({ ...(delegated.data || {}), payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, delegated.response.status || 200);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo desactivar la renovación automática", payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/mercadopago/create-checkout-link` && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const targetPlanCode = canonicalPlanCode(body?.plan_code || "");
        const delegated = await delegateJson(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }), env, ctx);
        if (delegated.response.ok && delegated.data?.ok && delegated.data?.scheduled === true) {
          const mode = String(delegated.data?.mode || "").trim();
          if (mode === "downgrade_next_cycle" || mode === "recurring_downgrade_next_cycle") {
            ctx.waitUntil(maybeNotifyDowngradeScheduled(env, delegated.data, String(body?.user_id || delegated.data?.user_id || "").trim(), targetPlanCode).catch(() => null));
          }
        }
        return json({ ...(delegated.data || {}), payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, delegated.response.status || 200);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo preparar el checkout", payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, 500);
      }
    }

    if (path === `${API_URL_PREFIX}/mercadopago/webhook` && request.method === "POST") {
      try {
        const raw = await request.text();
        const delegated = await delegateJson(new Request(request.url, { method: "POST", headers: request.headers, body: raw }), env, ctx);
        if (delegated.response.ok && delegated.data?.ok && delegated.data?.sync?.recurring_plan_change_applied) {
          ctx.waitUntil(maybeNotifyUpgradeApplied(env, delegated.data.sync).catch(() => null));
        }
        return json({ ...(delegated.data || {}), payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, delegated.response.status || 200);
      } catch (err) {
        return json({ ok: false, message: err?.message || "No se pudo procesar el webhook", payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, 500);
      }
    }

    const delegated = await delegateJson(request, env, ctx);
    return json({ ...(delegated.data || {}), payment_notifications_version: PAYMENT_NOTIFICATIONS_VERSION }, delegated.response.status || 200);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") {
      await baseWorker.scheduled(controller, env, ctx);
    }

    ctx.waitUntil(runBillingNotificationsSweep(env).catch(err => {
      console.error("PAYMENT NOTIFICATION SWEEP ERROR:", err);
    }));
  }
};

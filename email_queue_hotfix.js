const EMAIL_QUEUE_HOTFIX_VERSION = "2026-04-11-email-queue-1";

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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
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

async function supabaseInsert(env, table, data) {
  await supabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(data)
  });
  return true;
}

async function supabasePatchById(env, table, id, payload) {
  return await supabaseRequest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload)
  });
}

async function getSessionByToken(env, token) {
  const rows = await supabaseSelect(env, `sessions?token=eq.${encodeURIComponent(token)}&activo=eq.true&select=token,user_id,expires_at,activo&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,es_admin&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserPreferences(env, userId) {
  const rows = await supabaseSelect(env, `user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=user_id,alertas_activas,alertas_email,alertas_whatsapp&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function resolveAuthUser(env, request) {
  const bearer = getBearerToken(request);
  if (!bearer) return null;
  const session = await getSessionByToken(env, bearer);
  if (session?.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;
  const userId = session?.user_id || bearer;
  const user = await getUserById(env, userId);
  if (!user || user.activo === false) return null;
  return user;
}

function summarizeBy(items, keyFn) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(keyFn(item) || "").trim() || "(vacío)";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key, "es"));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveBrevoConfig(env) {
  const apiKey = String(env.BREVO_API_KEY || env.SENDINBLUE_API_KEY || env.BREVO_TRANSACTIONAL_API_KEY || "").trim();
  const senderEmail = String(env.BREVO_FROM_EMAIL || env.BREVO_SENDER_EMAIL || env.ALERT_FROM_EMAIL || env.EMAIL_FROM || "").trim();
  const senderName = String(env.BREVO_FROM_NAME || env.BREVO_SENDER_NAME || env.ALERT_FROM_NAME || env.EMAIL_FROM_NAME || "APDocentePBA").trim() || "APDocentePBA";
  const appUrl = String(env.MERCADOPAGO_SUCCESS_URL || env.APP_PUBLIC_URL || "https://alertasapd.com.ar").trim();
  return { apiKey, senderEmail, senderName, appUrl };
}

async function sendBrevoEmail(env, payload) {
  const config = resolveBrevoConfig(env);
  if (!config.apiKey || !config.senderEmail) {
    return { ok: false, reason: "brevo_not_configured" };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": config.apiKey
    },
    body: JSON.stringify({
      sender: { email: config.senderEmail, name: config.senderName },
      to: [{ email: payload.to.email, name: payload.to.name || "" }],
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent || undefined,
      tags: payload.tags || ["apdocentepba", "email-queue-hotfix"]
    })
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

  return { ok: true, messageId: data?.messageId || null, provider: data };
}

function normalizeQueuedAlert(payload) {
  const raw = payload?.alert || payload?.offer_payload || payload || {};
  return {
    source_offer_key: normalizeText(raw.source_offer_key || payload?.alert_key || ""),
    distrito: normalizeText(raw.distrito || ""),
    cargo: normalizeText(raw.cargo || raw.title || "Oferta APD"),
    escuela: normalizeText(raw.escuela || ""),
    turno: normalizeText(raw.turno || ""),
    nivel: normalizeText(raw.nivel || raw.nivel_modalidad || raw.modalidad || ""),
    jornada: normalizeText(raw.jornada || ""),
    modulos: normalizeText(raw.modulos || raw.hsmodulos || ""),
    desde: normalizeText(raw.desde || raw.supl_desde || ""),
    hasta: normalizeText(raw.hasta || raw.supl_hasta || ""),
    fecha_cierre: normalizeText(raw.fecha_cierre || raw.finoferta_label || raw.cierre || ""),
    observaciones: normalizeText(raw.observaciones || ""),
    total_postulantes: raw.total_postulantes ?? null,
    puntaje_primero: raw.puntaje_primero ?? null,
    listado_origen_primero: normalizeText(raw.listado_origen_primero || ""),
    link: normalizeText(raw.abc_url || raw.link || "")
  };
}

function buildQueuedDigestHtml(user, alerts, appUrl) {
  const cards = (Array.isArray(alerts) ? alerts : []).map((alert) => `
    <div style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;color:#0f3460;">${escapeHtml(alert.cargo || "Oferta APD")}</div>
      ${alert.distrito ? `<div><b>Distrito:</b> ${escapeHtml(alert.distrito)}</div>` : ""}
      ${alert.escuela ? `<div><b>Escuela:</b> ${escapeHtml(alert.escuela)}</div>` : ""}
      ${alert.turno ? `<div><b>Turno:</b> ${escapeHtml(alert.turno)}</div>` : ""}
      ${alert.nivel ? `<div><b>Nivel:</b> ${escapeHtml(alert.nivel)}</div>` : ""}
      ${alert.jornada ? `<div><b>Jornada:</b> ${escapeHtml(alert.jornada)}</div>` : ""}
      ${alert.modulos ? `<div><b>Módulos:</b> ${escapeHtml(alert.modulos)}</div>` : ""}
      ${alert.desde ? `<div><b>Desde:</b> ${escapeHtml(alert.desde)}</div>` : ""}
      ${alert.hasta ? `<div><b>Hasta:</b> ${escapeHtml(alert.hasta)}</div>` : ""}
      ${alert.fecha_cierre ? `<div><b>Cierre:</b> ${escapeHtml(alert.fecha_cierre)}</div>` : ""}
      ${alert.total_postulantes != null ? `<div><b>Postulados:</b> ${escapeHtml(String(alert.total_postulantes))}</div>` : ""}
      ${alert.puntaje_primero != null ? `<div><b>Puntaje más alto:</b> ${escapeHtml(String(alert.puntaje_primero))}</div>` : ""}
      ${alert.listado_origen_primero ? `<div><b>Listado del más alto:</b> ${escapeHtml(alert.listado_origen_primero)}</div>` : ""}
      ${alert.observaciones ? `<div><b>Observaciones:</b> ${escapeHtml(alert.observaciones)}</div>` : ""}
      ${alert.link ? `<div style="margin-top:10px;"><a href="${escapeHtml(alert.link)}" target="_blank" style="display:inline-block;background:#1f66ff;color:#ffffff;padding:10px 14px;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;">Ir a ABC</a></div>` : ""}
    </div>
  `).join("");

  return `<!doctype html>
<html>
  <body style="background:#f0f2f7;padding:20px 0;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:620px;">
        <tr><td style="background:linear-gradient(135deg,#0f3460 0%,#1a4f8a 100%);color:#ffffff;padding:22px;border-radius:16px 16px 0 0;">
          <div style="font-size:24px;font-weight:700;line-height:1.2;">APDocentePBA</div>
          <div style="font-size:13px;line-height:1.4;opacity:.9;margin-top:4px;">Hotfix de alertas por mail</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:18px;border:1px solid #dbe3f0;border-top:none;border-radius:0 0 16px 16px;">
          <div style="font-size:21px;font-weight:700;line-height:1.25;color:#0f3460;margin:0 0 10px 0;">Tenés ${alerts.length} alerta${alerts.length === 1 ? "" : "s"} nueva${alerts.length === 1 ? "" : "s"}</div>
          <div style="font-size:14px;line-height:1.5;color:#374151;margin:0 0 16px 0;">Hola ${escapeHtml(user?.nombre || "")}, este envío salió desde la cola pendiente para no perder avisos.</div>
          ${cards}
          <div style="margin-top:16px;text-align:center;"><a href="${escapeHtml(appUrl)}" target="_blank" style="display:inline-block;background:#0f3460;color:#ffffff;padding:10px 14px;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;">Ir a mi panel</a></div>
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
}

async function loadPendingEmailNotifications(env, targetUserId = null, limit = 200) {
  const base = `pending_notifications?channel=eq.email&status=eq.pending&select=id,user_id,alert_key,payload,status,created_at&order=created_at.asc&limit=${limit}`;
  const query = targetUserId ? `${base}&user_id=eq.${encodeURIComponent(String(targetUserId).trim())}` : base;
  const rows = await supabaseSelect(env, query).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function loadRecentEmailLogs(env, targetUserId = null, limit = 200) {
  const base = `notification_delivery_logs?channel=eq.email&select=id,user_id,destination,status,template_code,created_at,payload,provider_response&order=created_at.desc&limit=${limit}`;
  const query = targetUserId ? `${base}&user_id=eq.${encodeURIComponent(String(targetUserId).trim())}` : base;
  const rows = await supabaseSelect(env, query).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function markPendingRows(env, ids, status) {
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!id) continue;
    await supabasePatchById(env, "pending_notifications", id, { status }).catch(() => null);
  }
}

async function insertEmailQueueLog(env, userId, destination, status, payload, providerResponse) {
  await supabaseInsert(env, "notification_delivery_logs", {
    user_id: userId || null,
    channel: "email",
    template_code: "apd_queue_digest",
    destination: destination || null,
    status,
    provider_message_id: providerResponse?.messageId || null,
    payload,
    provider_response: providerResponse || null
  }).catch(() => null);
}

export async function processPendingEmailQueue(env, options = {}) {
  const rows = await loadPendingEmailNotifications(env, options.target_user_id || null, 250);
  if (!rows.length) {
    return { ok: true, version: EMAIL_QUEUE_HOTFIX_VERSION, pending_found: 0, processed_users: 0, sent_users: 0, failed_users: 0, marked_sent: 0, marked_failed: 0, message: "No hay pendientes en pending_notifications" };
  }

  const groups = new Map();
  for (const row of rows) {
    const userId = String(row?.user_id || "").trim();
    if (!userId) continue;
    if (!groups.has(userId)) groups.set(userId, []);
    groups.get(userId).push(row);
  }

  let processedUsers = 0;
  let sentUsers = 0;
  let failedUsers = 0;
  let markedSent = 0;
  let markedFailed = 0;
  const results = [];

  for (const [userId, userRows] of groups.entries()) {
    processedUsers += 1;
    const user = await getUserById(env, userId).catch(() => null);
    const prefs = await getUserPreferences(env, userId).catch(() => null);
    const rowIds = userRows.map((row) => row.id).filter(Boolean);

    if (!user?.email) {
      await markPendingRows(env, rowIds, "failed_no_email");
      markedFailed += rowIds.length;
      failedUsers += 1;
      await insertEmailQueueLog(env, userId, null, "failed_queue_no_email", { source: options.source || "hotfix", total_pending: rowIds.length }, { message: "Usuario sin email válido" });
      results.push({ user_id: userId, ok: false, reason: "missing_email", total_pending: rowIds.length });
      continue;
    }

    if (prefs && (!prefs.alertas_activas || !prefs.alertas_email)) {
      await markPendingRows(env, rowIds, "skipped_email_disabled");
      markedFailed += rowIds.length;
      results.push({ user_id: userId, ok: true, skipped: true, reason: "email_disabled", total_pending: rowIds.length });
      continue;
    }

    const alerts = userRows.map((row) => normalizeQueuedAlert(row?.payload || {})).filter((item) => item.cargo || item.distrito || item.escuela);
    if (!alerts.length) {
      await markPendingRows(env, rowIds, "failed_empty_payload");
      markedFailed += rowIds.length;
      failedUsers += 1;
      await insertEmailQueueLog(env, userId, user.email, "failed_queue_empty", { source: options.source || "hotfix", total_pending: rowIds.length }, { message: "No había alertas válidas en la cola" });
      results.push({ user_id: userId, ok: false, reason: "empty_payload", total_pending: rowIds.length });
      continue;
    }

    const config = resolveBrevoConfig(env);
    const subject = `APDocentePBA: ${alerts.length} alerta${alerts.length === 1 ? "" : "s"} nueva${alerts.length === 1 ? "" : "s"}`;
    const htmlContent = buildQueuedDigestHtml(user, alerts, config.appUrl);
    const textContent = `APDocentePBA\nTenés ${alerts.length} alerta(s) nueva(s).\n${config.appUrl}`;
    const send = await sendBrevoEmail(env, { to: { email: user.email, name: user.nombre || "" }, subject, htmlContent, textContent, tags: ["apdocentepba", "email-queue-hotfix"] });

    if (send.ok) {
      await markPendingRows(env, rowIds, "sent");
      markedSent += rowIds.length;
      sentUsers += 1;
      await insertEmailQueueLog(env, userId, user.email, "sent_queue_digest", { source: options.source || "hotfix", total_alerts: alerts.length, pending_ids: rowIds }, send);
      results.push({ user_id: userId, ok: true, total_alerts: alerts.length, pending_ids: rowIds.length });
    } else {
      await markPendingRows(env, rowIds, "failed_send");
      markedFailed += rowIds.length;
      failedUsers += 1;
      await insertEmailQueueLog(env, userId, user.email, "failed_queue_digest", { source: options.source || "hotfix", total_alerts: alerts.length, pending_ids: rowIds }, send);
      results.push({ user_id: userId, ok: false, reason: send.reason || "send_failed", total_alerts: alerts.length, pending_ids: rowIds.length });
    }
  }

  return { ok: true, version: EMAIL_QUEUE_HOTFIX_VERSION, pending_found: rows.length, processed_users: processedUsers, sent_users: sentUsers, failed_users: failedUsers, marked_sent: markedSent, marked_failed: markedFailed, results };
}

export async function handleEmailAlertsHealth(request, env, adminMode = false) {
  const authUser = await resolveAuthUser(env, request);
  if (!authUser) return json({ ok: false, error: "No autenticado" }, 401);
  if (adminMode && !authUser.es_admin) return json({ ok: false, error: "No autorizado" }, 403);

  const targetUserId = adminMode ? normalizeText(new URL(request.url).searchParams.get("user_id") || "") || null : authUser.id;
  const pending = await loadPendingEmailNotifications(env, targetUserId, 200);
  const logs = await loadRecentEmailLogs(env, targetUserId, 200);
  const prefs = targetUserId ? await getUserPreferences(env, targetUserId).catch(() => null) : null;
  const config = resolveBrevoConfig(env);

  return json({
    ok: true,
    version: EMAIL_QUEUE_HOTFIX_VERSION,
    scope: adminMode ? (targetUserId ? "admin_user" : "admin_global") : "self",
    target_user_id: targetUserId,
    auth_user_id: authUser.id,
    email_config: {
      brevo_api_key_ready: !!config.apiKey,
      sender_ready: !!config.senderEmail,
      sender_email: config.senderEmail || null
    },
    preferences: prefs ? { alertas_activas: !!prefs.alertas_activas, alertas_email: !!prefs.alertas_email, alertas_whatsapp: !!prefs.alertas_whatsapp } : null,
    pending_summary: { total: pending.length, by_status: summarizeBy(pending, (row) => row.status), by_user: summarizeBy(pending, (row) => row.user_id).slice(0, 20) },
    log_summary: { total: logs.length, by_status: summarizeBy(logs, (row) => row.status), by_template: summarizeBy(logs, (row) => row.template_code) },
    pending_preview: pending.slice(0, 20),
    recent_logs: logs.slice(0, 40)
  });
}

export async function handleEmailAlertsRun(request, env, adminMode = false) {
  const authUser = await resolveAuthUser(env, request);
  if (!authUser) return json({ ok: false, error: "No autenticado" }, 401);
  if (adminMode && !authUser.es_admin) return json({ ok: false, error: "No autorizado" }, 403);

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const targetUserId = adminMode ? normalizeText(body?.user_id || new URL(request.url).searchParams.get("user_id") || "") || null : authUser.id;
  const result = await processPendingEmailQueue(env, { source: adminMode ? "manual_admin_run" : "manual_self_run", target_user_id: targetUserId });

  return json({ ok: true, version: EMAIL_QUEUE_HOTFIX_VERSION, scope: adminMode ? (targetUserId ? "admin_user" : "admin_global") : "self", target_user_id: targetUserId, result });
}

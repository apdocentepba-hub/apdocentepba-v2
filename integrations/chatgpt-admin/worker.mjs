/**
 * APDocente — integración administrativa de SOLO LECTURA (prototipo aislado).
 * No está incorporada al Worker de producción ni desplegada.
 * Nunca devuelve usuarios individuales, correos, tokens ni datos de pago.
 */
const json = (payload, status = 200, extra = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...extra,
  },
});

async function sameSecret(supplied, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(supplied)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function countRows(env, table, filters = {}) {
  const url = new URL("/rest/v1/" + table, env.SUPABASE_URL);
  url.searchParams.set("select", "id");
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { "apikey": key, "prefer": "count=exact", "accept": "application/json" };
  // Solamente para compatibilidad con llaves antiguas; las nuevas sb_secret_ usan apikey.
  if (!key.startsWith("sb_secret_")) headers["authorization"] = "Bearer " + key;
  const res = await fetch(url.toString(), { method: "HEAD", headers, redirect: "error" });
  if (!res.ok) throw new Error("upstream");
  const range = res.headers.get("content-range") || "";
  const count = Number(range.split("/").pop());
  if (!range.includes("/") || !Number.isSafeInteger(count) || count < 0) throw new Error("missing_count");
  return count;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/v1/overview") return json({ error: "not_found" }, 404);
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { "allow": "GET" });
    if (!env.APD_AUDIT_TOKEN || !(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY) || !env.SUPABASE_URL) {
      return json({ error: "unconfigured" }, 503);
    }
    // No permitir endpoints Supabase suministrados por clientes ni HTTP inseguro.
    let backend;
    try { backend = new URL(env.SUPABASE_URL); } catch { return json({ error: "unconfigured" }, 503); }
    if (backend.protocol !== "https:" || !backend.hostname.endsWith(".supabase.co")) {
      return json({ error: "unconfigured" }, 503);
    }
    const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") || "");
    if (!match || !(await sameSecret(match[1], env.APD_AUDIT_TOKEN))) {
      return json({ error: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
    }
    try {
      const now = new Date();
      const last30d = new Date(now.getTime() - 30 * 86400000).toISOString();
      const current = now.toISOString();
      const [
        registered,
        subscriptionRecords,
        expiredTrialRecords,
        expiredPaidRecords,
        deliveryLogs30d,
        markedSent30d,
      ] = await Promise.all([
        countRows(env, "users"),
        countRows(env, "user_subscriptions"),
        countRows(env, "user_subscriptions", { plan_code: "eq.TRIAL_7D", trial_ends_at: "lt." + current }),
        countRows(env, "user_subscriptions", { plan_code: "neq.TRIAL_7D", current_period_ends_at: "lt." + current }),
        countRows(env, "notification_delivery_logs", { created_at: "gte." + last30d }),
        countRows(env, "notification_delivery_logs", {
          created_at: "gte." + last30d,
          status: "in.(sent_alert_digest,sent_expiry_notice)",
        }),
      ]);
      return json({
        generated_at: current,
        registered_users: registered,
        subscription_rows: subscriptionRecords,
        expired_trial_rows_by_date: expiredTrialRecords,
        expired_paid_rows_by_date: expiredPaidRecords,
        delivery_log_rows_last_30_days: deliveryLogs30d,
        marked_sent_rows_last_30_days: markedSent30d,
        caveat: "Son conteos de filas, no usuarios únicos ni derechos de acceso efectivos; se deben reconciliar suscripciones duplicadas y excepciones.",
      });
    } catch {
      // Ni errores SQL ni headers de Supabase salen al cliente.
      return json({ error: "backend_unavailable" }, 502);
    }
  },
};

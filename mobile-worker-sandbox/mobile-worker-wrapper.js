import clonedWorker from "./worker-cloudflare-clone.js";

const MOBILE_VERSION = "2026-06-20-mobile-wrapper-1";

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function offerKey(item) {
  return String(
    item?.source_offer_key ||
    item?.offer_id ||
    item?.iddetalle ||
    item?.idoferta ||
    item?.id ||
    ""
  ).trim();
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fingerprint(items) {
  const base = safeArray(items).map(item => [
    offerKey(item),
    item?.cargo || item?.area || "",
    item?.distrito || "",
    item?.escuela || "",
    item?.turno || "",
    item?.fecha_cierre || item?.finoferta_label || item?.cierre || ""
  ].join("|"));
  return await sha256Hex(base.join("\n"));
}

async function delegateJson(path, request, env, ctx) {
  const headers = new Headers();
  const auth = request.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);
  headers.set("Accept", "application/json");

  const delegatedRequest = new Request(`https://mobile-worker.local${path}`, {
    method: "GET",
    headers
  });

  const res = await clonedWorker.fetch(delegatedRequest, env, ctx);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { res, data, text };
}

async function handleMobileHealth() {
  return json({
    ok: true,
    service: "apdocentepba-mobile-alerts",
    mobile_wrapper_version: MOBILE_VERSION
  });
}

async function handleMobileVersion(request, env, ctx) {
  const delegated = await delegateJson("/api/version", request, env, ctx);
  return json({
    ok: true,
    mobile_wrapper_version: MOBILE_VERSION,
    upstream_status: delegated.res.status,
    upstream_version: delegated.data || null
  });
}

async function handleMobileAlerts(request, env, ctx) {
  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) {
    return json({ ok: false, error: "Falta user_id" }, 400);
  }

  const delegated = await delegateJson(`/api/mis-alertas?user_id=${encodeURIComponent(userId)}`, request, env, ctx);
  if (!delegated.res.ok || !delegated.data || delegated.data.ok === false) {
    return json({
      ok: false,
      error: delegated.data?.error || delegated.data?.message || "No se pudieron leer alertas",
      upstream_status: delegated.res.status,
      mobile_wrapper_version: MOBILE_VERSION
    }, delegated.res.status || 500);
  }

  const items = safeArray(delegated.data.resultados || delegated.data.items || delegated.data.alertas);
  const fp = await fingerprint(items);

  return json({
    ok: true,
    total: items.length,
    fingerprint: fp,
    items,
    mobile_wrapper_version: MOBILE_VERSION,
    upstream_total: delegated.data.total ?? delegated.data.total_resultados ?? null
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    const url = new URL(request.url);

    try {
      if (url.pathname === "/mobile/health" && request.method === "GET") {
        return await handleMobileHealth();
      }
      if (url.pathname === "/mobile/version" && request.method === "GET") {
        return await handleMobileVersion(request, env, ctx);
      }
      if (url.pathname === "/mobile/alerts" && request.method === "GET") {
        return await handleMobileAlerts(request, env, ctx);
      }
      return json({ ok: false, error: "Ruta mobile no encontrada" }, 404);
    } catch (err) {
      return json({
        ok: false,
        error: err?.message || "Error mobile wrapper",
        mobile_wrapper_version: MOBILE_VERSION
      }, 500);
    }
  }
};

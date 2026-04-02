const API_URL_PREFIX = "/api";
const PD_ABC_LISTADO_SELECT_URL = "https://abc.gob.ar/listado-oficial/select/";
const PD_ABC_SYNC_SOURCE = "abc_public";

function pdCorsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function pdJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: pdCorsHeaders() });
}

function pdNorm(v) {
  return String(v || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s/().,-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdGetBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? String(auth.slice(7) || "").trim() : "";
}

function pdGetAuthedUserId(request, body = null, url = null) {
  const bearer = pdGetBearerToken(request);
  const hinted = String(body?.user_id || url?.searchParams?.get("user_id") || "").trim();
  if (bearer && hinted && bearer !== hinted) {
    throw new Error("La sesión no coincide con el user_id enviado");
  }
  return bearer || hinted;
}

async function pdSupabaseRequest(env, path, init = {}) {
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
  if (!res.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }
  return data;
}

async function pdSupabaseSelect(env, query) {
  return await pdSupabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } });
}

async function pdSupabaseInsertReturning(env, table, data) {
  const rows = await pdSupabaseRequest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function pdSupabaseUpsert(env, table, rows, conflict) {
  return await pdSupabaseRequest(env, `${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}

async function pdGetUserById(env, userId) {
  const rows = await pdSupabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo&limit=1`
}

const API_PREFIX = "/api/repositorio";
const BUCKET_ID = "repositorio-docs";
const MANIFEST_PATH = "_meta/manifest.json";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function corsHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders()
  });
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function encodeStoragePath(path) {
  return String(path || "").split("/").map(part => encodeURIComponent(part)).join("/");
}

function publicObjectUrl(env, path) {
  return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_ID}/${encodeStoragePath(path)}`;
}

function slugify(value) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "archivo";
}

function fileParts(filename) {
  const raw = normalizeText(filename) || "archivo";
  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === raw.length - 1) return { base: raw, ext: "" };
  return { base: raw.slice(0, lastDot), ext: raw.slice(lastDot + 1) };
}

function previewKind(contentType, filename) {
  const type = String(contentType || "").toLowerCase();
  const name = String(filename || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) return "text";
  return "none";
}

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  return crypto.randomUUID();
}

function serviceHeaders(env, extra) {
  const key = env["SUPABASE_SERVICE_ROLE_KEY"];
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    ...(extra || {})
  };
}

async function storageRequest(env, path, init = {}) {
  return await fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: serviceHeaders(env, init.headers || {})
  });
}

async function supabaseSelect(env, query) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${query}`, {
    method: "GET",
    headers: serviceHeaders(env, {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    })
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,activo,es_admin&limit=1`).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function resolveAuthUser(env, request) {
  const bearer = getBearerToken(request);
  if (!bearer) return null;

  const sessions = await supabaseSelect(env, `sessions?token=eq.${encodeURIComponent(bearer)}&activo=eq.true&select=token,user_id,expires_at&limit=1`).catch(() => []);
  const session = Array.isArray(sessions) ? sessions[0] || null : null;

  if (session) {
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;
    const user = await getUserById(env, session.user_id).catch(() => null);
    if (user?.id && user?.activo !== false) return user;
  }

  const legacyUser = await getUserById(env, bearer).catch(() => null);
  if (legacyUser?.id && legacyUser?.activo !== false) return legacyUser;
  return null;
}

async function ensureBucket(env) {
  const res = await storageRequest(env, "/storage/v1/bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET_ID, name: BUCKET_ID, public: true, file_size_limit: MAX_FILE_SIZE })
  });

  if (res.ok || res.status === 400 || res.status === 409) return true;
  const text = await res.text();
  throw new Error(text || "No se pudo asegurar el bucket del repositorio");
}

async function readManifest(env) {
  const res = await fetch(`${publicObjectUrl(env, MANIFEST_PATH)}?v=${Date.now()}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ items: [] }));
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function writeManifest(env, items) {
  const res = await storageRequest(env, `/storage/v1/object/${BUCKET_ID}/${encodeStoragePath(MANIFEST_PATH)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-upsert": "true" },
    body: JSON.stringify({ items, updated_at: nowIso() })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "No se pudo actualizar el manifiesto del repositorio");
  }
}

async function uploadObject(env, path, body, contentType) {
  const res = await storageRequest(env, `/storage/v1/object/${BUCKET_ID}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": contentType || "application/octet-stream", "x-upsert": "true" },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "No se pudo subir el archivo al bucket");
  }
}

function sanitizeManifestItem(item) {
  return {
    id: String(item?.id || randomId()),
    title: normalizeText(item?.title || "Documento"),
    description: normalizeText(item?.description || ""),
    category: normalizeText(item?.category || "General"),
    audience: normalizeText(item?.audience || "Todos"),
    filename: normalizeText(item?.filename || "archivo"),
    stored_path: normalizeText(item?.stored_path || ""),
    public_url: normalizeText(item?.public_url || ""),
    content_type: normalizeText(item?.content_type || "application/octet-stream"),
    size_bytes: Number(item?.size_bytes || 0),
    preview_kind: normalizeText(item?.preview_kind || "none"),
    created_at: normalizeText(item?.created_at || nowIso()),
    uploaded_by_user_id: normalizeText(item?.uploaded_by_user_id || ""),
    uploaded_by_name: normalizeText(item?.uploaded_by_name || "")
  };
}

async function handleList(request, env) {
  await ensureBucket(env);
  const authUser = await resolveAuthUser(env, request).catch(() => null);
  const items = (await readManifest(env)).map(sanitizeManifestItem).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return json({ ok: true, items, is_admin: !!authUser?.es_admin, total: items.length, bucket: BUCKET_ID });
}

async function handleUpload(request, env) {
  const authUser = await resolveAuthUser(env, request);
  if (!authUser?.id) return json({ ok: false, error: "No autenticado" }, 401);
  if (!authUser?.es_admin) return json({ ok: false, error: "Solo admins pueden subir archivos al repositorio" }, 403);

  await ensureBucket(env);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ ok: false, error: "Formulario inválido" }, 400);

  const title = normalizeText(form.get("title") || "");
  const category = normalizeText(form.get("category") || "General");
  const audience = normalizeText(form.get("audience") || "Todos");
  const description = normalizeText(form.get("description") || "");
  const file = form.get("file");

  if (!(file instanceof File)) return json({ ok: false, error: "Falta el archivo" }, 400);
  if (!title) return json({ ok: false, error: "Falta el título" }, 400);
  if (!file.size || file.size <= 0) return json({ ok: false, error: "El archivo está vacío" }, 400);
  if (file.size > MAX_FILE_SIZE) return json({ ok: false, error: "El archivo supera el tamaño máximo permitido de 25 MB" }, 400);

  const createdAt = nowIso();
  const fileInfo = fileParts(file.name);
  const safeBase = slugify(fileInfo.base || title || "archivo");
  const safeExt = slugify(fileInfo.ext || "");
  const fileName = safeExt ? `${safeBase}.${safeExt}` : safeBase;
  const yyyy = createdAt.slice(0, 4);
  const mm = createdAt.slice(5, 7);
  const storedPath = `${yyyy}/${mm}/${Date.now()}-${fileName}`;
  const contentType = normalizeText(file.type || "application/octet-stream");
  const body = await file.arrayBuffer();

  await uploadObject(env, storedPath, body, contentType);

  const item = sanitizeManifestItem({
    id: randomId(),
    title,
    description,
    category,
    audience,
    filename: file.name,
    stored_path: storedPath,
    public_url: publicObjectUrl(env, storedPath),
    content_type: contentType,
    size_bytes: file.size,
    preview_kind: previewKind(contentType, file.name),
    created_at: createdAt,
    uploaded_by_user_id: authUser.id,
    uploaded_by_name: `${normalizeText(authUser.nombre)} ${normalizeText(authUser.apellido)}`.trim() || normalizeText(authUser.email)
  });

  const currentItems = (await readManifest(env)).map(sanitizeManifestItem);
  const nextItems = [item, ...currentItems].slice(0, 1000);
  await writeManifest(env, nextItems);

  return json({ ok: true, item, total: nextItems.length });
}

export async function handleRepositoryRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === `${API_PREFIX}/list` && request.method === "GET") return await handleList(request, env);
  if (path === `${API_PREFIX}/upload` && request.method === "POST") return await handleUpload(request, env);
  return null;
}

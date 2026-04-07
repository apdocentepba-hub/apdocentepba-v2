import baseWorker from "./worker_plan_price_policy_hotfix.js";

const API_URL_PREFIX = "/api";
const PID_LOOKUP_VERSION = "2026-04-06-pid-live-2";

const PID_LISTADOS = [
  { value: "oficial", label: "Listado Oficial" },
  { value: "108a", label: "108 A" },
  { value: "108b", label: "108 B" },
  { value: "fines", label: "FINES Listado 1" },
  { value: "108bfines", label: "FINES Listado 2" },
  { value: "s108a", label: "108 A Terciario" },
  { value: "s108b", label: "108 B Terciario" },
  { value: "108ainfine", label: "108 A In Fine" },
  { value: "108bEncierro", label: "108 B Contextos de Encierro" },
  { value: "formacionProfesionalPrincipalPreceptores", label: "FP Principal Preceptores" },
  { value: "formacionProfesionalComplementoPreceptores", label: "FP Complementario Preceptores" },
  { value: "formacionProfesionalPrincipalPanol", label: "FP Principal Pañol" },
  { value: "formacionProfesionalComplementarioPanol", label: "FP Complementario Pañol" },
  { value: "formacionProfesionalPrincipalFp", label: "Formación Profesional Principal" },
  { value: "formacionProfesionalComplementarioFp", label: "Formación Profesional Complementario" }
];

const PID_ALLOWED_LISTADOS = new Set(PID_LISTADOS.map((item) => item.value));

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

function normalizeDni(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function normalizeYear(value) {
  const year = Number(String(value || "").trim());
  return Number.isInteger(year) && year >= 2015 && year <= 2100 ? year : null;
}

function normalizeListado(value) {
  return String(value || "").trim();
}

function b64(value) {
  return btoa(String(value || "").trim());
}

function buildPidUrl(dni, anio, listado) {
  return "http://servicios2.abc.gov.ar/servaddo/puntaje.ingreso.docencia/ingreso.servaddo.cfm" +
    `?documento=${encodeURIComponent(b64(dni))}` +
    `&anio=${encodeURIComponent(b64(anio))}` +
    `&listado=${encodeURIComponent(b64(listado))}` +
    "&tipo=";
}

function cleanText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&iacute;/gi, "í")
    .replace(/&eacute;/gi, "é")
    .replace(/&aacute;/gi, "á")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLabelValue(html, label) {
  const rx = new RegExp(`<label[^>]*>\\s*<b>\\s*${escapeRegExp(label)}\\s*<\\/b>\\s*([^<]*)<\\/label>`, "i");
  const match = html.match(rx);
  return cleanText(match?.[1] || "");
}

function parsePidHtml(html) {
  const raw = String(html || "");
  const legend = cleanText((raw.match(/<legend[^>]*>([\s\S]*?)<\/legend>/i) || [])[1] || "").replace(/<[^>]+>/g, " ");
  const apellido_nombre = extractLabelValue(raw, "Apellido y Nombre");
  const distrito_residencia = extractLabelValue(raw, "Distrito de Residencia");
  const distritos_solicitados = extractLabelValue(raw, "Distritos Solicitados");

  const items = [];
  const tdRx = /<td[^>]*title=['"]([^'"]*Puntaje Total[^'"]*)['"][^>]*>\s*([^<]+)\s*<\/td>/gi;
  for (const match of raw.matchAll(tdRx)) {
    const title = cleanText(match[1] || "");
    const codigo = cleanText(((title.match(/\(([^,\)]+)\s*,\s*Puntaje Total/i) || [])[1] || ""));
    const rama = cleanText(((title.match(/Rama\s*:\s*([A-Z])/i) || [])[1] || ""));
    const fecha = cleanText(((title.match(/Fecha\s*:\s*([0-9:\-\. ]+)/i) || [])[1] || ""));
    const puntaje = cleanText(match[2] || "");
    items.push({ codigo, rama, puntaje, fecha });
  }

  return {
    oblea: legend,
    apellido_nombre,
    distrito_residencia,
    distritos_solicitados,
    items
  };
}

async function handlePidListados() {
  return json({ ok: true, version: PID_LOOKUP_VERSION, listados: PID_LISTADOS });
}

async function handlePidConsultar(request) {
  const body = await request.json().catch(() => ({}));
  const dni = normalizeDni(body?.dni);
  const anio = normalizeYear(body?.anio || new Date().getFullYear());
  const listado = normalizeListado(body?.listado);

  if (!/^\d{7,8}$/.test(dni)) return json({ ok: false, error: "DNI inválido. Usá 7 u 8 dígitos." }, 400);
  if (!anio) return json({ ok: false, error: "Año inválido." }, 400);
  if (!PID_ALLOWED_LISTADOS.has(listado)) return json({ ok: false, error: "Listado no permitido." }, 400);

  const upstream_url = buildPidUrl(dni, anio, listado);
  const res = await fetch(upstream_url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 APDocentePBA PID Lookup"
    }
  });

  const html = await res.text();
  if (!res.ok) {
    return json({ ok: false, error: `PID devolvió HTTP ${res.status}.`, upstream_status: res.status, upstream_url }, 502);
  }
  if (!/PUNTAJE INGRESO A LA DOCENCIA|Apellido y Nombre/i.test(html)) {
    return json({ ok: false, error: "La respuesta del PID no parece una oblea válida.", upstream_status: res.status, upstream_url }, 502);
  }

  return json({
    ok: true,
    version: PID_LOOKUP_VERSION,
    dni,
    anio,
    listado,
    upstream_url,
    result: parsePidHtml(html)
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    if (url.pathname === `${API_URL_PREFIX}/pid-listados` && request.method === "GET") return handlePidListados();
    if (url.pathname === `${API_URL_PREFIX}/pid-consultar` && request.method === "POST") return handlePidConsultar(request);

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") return baseWorker.scheduled(controller, env, ctx);
  }
};

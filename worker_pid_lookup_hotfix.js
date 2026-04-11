import baseWorker from "./worker_plan_price_policy_hotfix.js";

const API_URL_PREFIX = "/api";
const PID_LOOKUP_VERSION = "2026-04-11-pid-live-3";
const TEST_DIGEST_VERSION = "2026-04-11-test-digest-1";

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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  const appUrl = String(
    env.MERCADOPAGO_SUCCESS_URL ||
    env.APP_PUBLIC_URL ||
    "https://apdocentepba-hub.github.io/apdocentepba-v2/"
  ).trim();

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
      tags: payload.tags || ["apdocentepba", "test-digest"]
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

  return { ok: true, messageId: data && data.messageId || null };
}

function resolveTestRecipient(url, env) {
  const fixed = normalizeEmail(env.BREVO_TEST_TO || env.ALERT_TEST_TO || env.EMAIL_TEST_TO || "");
  const requested = normalizeEmail(url.searchParams.get("to") || "");
  const secret = String(env.TEST_DIGEST_KEY || "").trim();
  const provided = String(url.searchParams.get("key") || "").trim();

  if (requested) {
    if (!isValidEmail(requested)) {
      return { error: "Email destino inválido.", status: 400 };
    }

    if (secret) {
      if (provided !== secret) {
        return { error: "Key inválida para envío manual.", status: 403 };
      }
      return { to: requested };
    }

    if (fixed && requested === fixed) {
      return { to: requested };
    }

    return {
      error: fixed
        ? `Sin key, el test solo puede enviarse a ${fixed}.`
        : "Falta configurar BREVO_TEST_TO o TEST_DIGEST_KEY para habilitar destinatario manual.",
      status: 400
    };
  }

  if (fixed && isValidEmail(fixed)) {
    return { to: fixed };
  }

  return {
    error: "Falta configurar BREVO_TEST_TO/ALERT_TEST_TO o usar ?to=...&key=...",
    status: 400
  };
}

function buildTestDigestHtml(to, subject, appUrl) {
  const sentAt = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date());

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">APDocentePBA · Test digest</div>
        <h1 style="font-size:24px;line-height:1.3;margin:0 0 14px 0;">${escapeHtml(subject)}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">Este es un mail de prueba disparado manualmente desde el worker actual de APDocentePBA.</p>
        <ul style="padding-left:20px;margin:0 0 18px 0;font-size:14px;line-height:1.6;">
          <li>Destino: ${escapeHtml(to)}</li>
          <li>Enviado: ${escapeHtml(sentAt)}</li>
          <li>Versión: ${escapeHtml(TEST_DIGEST_VERSION)}</li>
        </ul>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">Si te llegó este correo, el canal transaccional quedó operativo.</p>
        <p style="margin:0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Abrir APDocentePBA</a></p>
      </div>
    </div>
  </body>
</html>`;
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

async function handleTestDigest(request, env) {
  const url = new URL(request.url);
  const recipient = resolveTestRecipient(url, env);
  if (recipient.error) {
    return json({ ok: false, error: recipient.error, version: TEST_DIGEST_VERSION }, recipient.status || 400);
  }

  const subject = String(url.searchParams.get("subject") || "APDocentePBA · Mail de prueba").trim().slice(0, 160) || "APDocentePBA · Mail de prueba";
  const config = resolveBrevoConfig(env);
  const htmlContent = buildTestDigestHtml(recipient.to, subject, config.appUrl);
  const textContent = `Mail de prueba APDocentePBA\nDestino: ${recipient.to}\nVersión: ${TEST_DIGEST_VERSION}\n${config.appUrl}`;

  const result = await sendBrevoEmail(env, {
    to: { email: recipient.to, name: "Prueba APDocentePBA" },
    subject,
    htmlContent,
    textContent,
    tags: ["apdocentepba", "test-digest"]
  });

  if (!result.ok) {
    return json({
      ok: false,
      error: "No se pudo enviar el mail de prueba.",
      details: result,
      version: TEST_DIGEST_VERSION
    }, result.reason === "brevo_not_configured" ? 500 : 502);
  }

  return json({
    ok: true,
    message: "Mail de prueba enviado.",
    to: recipient.to,
    subject,
    message_id: result.messageId || null,
    version: TEST_DIGEST_VERSION,
    usable_paths: ["/test-digest", "/api/test-digest"]
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    if (url.pathname === `${API_URL_PREFIX}/pid-listados` && request.method === "GET") return handlePidListados();
    if (url.pathname === `${API_URL_PREFIX}/pid-consultar` && request.method === "POST") return handlePidConsultar(request);
    if ((url.pathname === "/test-digest" || url.pathname === `${API_URL_PREFIX}/test-digest`) && request.method === "GET") return handleTestDigest(request, env);

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker?.scheduled === "function") return baseWorker.scheduled(controller, env, ctx);
  }
};

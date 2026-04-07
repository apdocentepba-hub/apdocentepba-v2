const PID_LOOKUP_VERSION = "2026-04-07-pid-standalone-2";

const PID_LISTADOS = [
  { value: "oficial", label: "Listado Oficial" },
  { value: "108a", label: "Listado 108 a" },
  { value: "fines", label: "Listado FINES 1 (UNO)" },
  { value: "108bfines", label: "Listado FINES 2 (DOS)" },
  { value: "108b", label: "Listado 108 b" },
  { value: "s108a", label: "Listado 108 a Terciario" },
  { value: "s108b", label: "Listado 108 b Terciario" },
  { value: "108ainfine", label: "Listado 108 a In Fine" },
  { value: "108binfine", label: "Listado 108 b In Fine" },
  { value: "108aEncierro", label: "Listado Contextos de Encierro" },
  { value: "108bEncierro", label: "Listado 108 b Contextos de Encierro" },
  { value: "formacionProfesionalPrincipalPreceptores", label: "Listado FP PRINCIPAL PRECEPTORES" },
  { value: "formacionProfesionalComplementoPreceptores", label: "Listado Formacion FP Complementario Preceptores" },
  { value: "formacionProfesionalPrincipalPanol", label: "Listado FP Principal Pañol" },
  { value: "formacionProfesionalComplementarioPanol", label: "Listado FP Complementario Pañol" },
  { value: "formacionProfesionalPrincipalFp", label: "Listado FP Principal Formacion Profesional" },
  { value: "formacionProfesionalComplementarioFp", label: "Listado Complementario Formacion Profesional" }
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
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders()
  });
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
    `&anio=${encodeURIComponent(b64(String(anio)))}` +
    `&listado=${encodeURIComponent(b64(listado))}` +
    "&tipo=";
}

function cleanText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#34;/gi, "\"")
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
  const rx = new RegExp(
    `<label[^>]*>\\s*<b>\\s*${escapeRegExp(label)}\\s*<\\/b>\\s*([^<]*)<\\/label>`,
    "i"
  );
  const match = html.match(rx);
  return cleanText(match?.[1] || "");
}

function parsePidHtml(html) {
  const raw = String(html || "");

  const legend = cleanText(
    ((raw.match(/<legend[^>]*>([\s\S]*?)<\/legend>/i) || [])[1] || "")
      .replace(/<[^>]+>/g, " ")
  );

  const apellido_nombre = extractLabelValue(raw, "Apellido y Nombre");
  const distrito_residencia = extractLabelValue(raw, "Distrito de Residencia");
  const distritos_solicitados = extractLabelValue(raw, "Distritos Solicitados");

  const items = [];
  const sectionRows = [];

  let currentSection = "";
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of raw.matchAll(rowRx)) {
    const rowHtml = rowMatch[1] || "";
    const plainRow = cleanText(rowHtml.replace(/<[^>]+>/g, " "));
    if (!plainRow) continue;

    const headingOnly = plainRow.match(/^(TECNICO PROFESIONAL|SECUNDARIA \([A-Z]\)|ADULTOS Y CFS \([A-Z]\)|ARTISTICA \([A-Z]\)|SUPERIOR|INICIAL|PRIMARIA|ESPECIAL|PSICOLOGIA|EDUCACION FISICA|FORMACION PROFESIONAL)/i);
    if (headingOnly) {
      currentSection = cleanText(headingOnly[1]);
      continue;
    }

    const cellMatches = [...rowHtml.matchAll(/<t[dh][^>]*([^>]*)>([\s\S]*?)<\/t[dh]>/gi)];
    if (!cellMatches.length) continue;

    const cells = cellMatches.map((m) => {
      const attrs = String(m[1] || "");
      const inner = String(m[2] || "");
      const text = cleanText(inner.replace(/<[^>]+>/g, " "));
      const titleMatch = attrs.match(/title=['"]([^'"]*)['"]/i);
      const title = cleanText(titleMatch?.[1] || "");
      return { text, title };
    });

    const rowText = cleanText(cells.map((c) => c.text).join(" "));
    if (!rowText) continue;

    if (/AREA|TITULO|PORC|PUNTAJE TOTAL|PROM|BON|ANTIG/i.test(rowText)) continue;

    // Formato tabla real: Área | Título | Porc. | Tit. | Prom. | Antig. Rama | Bon. | Puntaje Total
    if (cells.length >= 8) {
      const area = cells[0]?.text || "";
      const titulo = cells[1]?.text || "";
      const porcentaje = cells[2]?.text || "";
      const puntaje_total = cells[cells.length - 1]?.text || "";

      if (area || titulo || porcentaje || puntaje_total) {
        sectionRows.push({
          bloque: currentSection,
          area,
          titulo,
          porcentaje,
          puntaje_total
        });
      }
    }

    // Compatibilidad con formato viejo reducido
    const allTitles = cleanText(cells.map((c) => c.title).join(" "));
    const combined = cleanText(rowText + " " + allTitles);

    let puntaje = "";
    for (const c of cells) {
      if (/^\d{1,3}([.,]\d{1,2})?$/.test(c.text)) {
        puntaje = c.text;
        break;
      }
    }
    if (!puntaje) {
      const pm = combined.match(/\b\d{1,3}(?:[.,]\d{1,2})\b/);
      puntaje = pm ? pm[0] : "";
    }

    let fecha = "";
    const fm = combined.match(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/);
    if (fm) fecha = fm[0];

    let codigo = "";
    const cm1 = combined.match(/\(([A-Z0-9]+)\s*,\s*Puntaje Total/i);
    const cm2 = rowText.match(/\b[A-Z]{1,4}\d{0,3}\b/);
    if (cm1) codigo = cleanText(cm1[1]);
    else if (cm2) codigo = cleanText(cm2[0]);

    let rama = "";
    const rm = combined.match(/Rama\s*:\s*([A-Z])/i);
    if (rm) rama = cleanText(rm[1]);

    if (puntaje || codigo || rama || fecha) {
      items.push({ codigo, rama, puntaje, fecha });
    }
  }

  const dedup = [];
  const seen = new Set();
  for (const item of items) {
    const key = [item.codigo, item.rama, item.puntaje, item.fecha].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(item);
  }

  return {
    oblea: legend,
    apellido_nombre,
    distrito_residencia,
    distritos_solicitados,
    items: dedup,
    section_rows: sectionRows
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
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  return json({ ok: true, version: PID_LOOKUP_VERSION, dni, anio, listado, upstream_url, result: parsePidHtml(html) });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    if (url.pathname === "/") return json({ ok: true, service: "apdocentepba-pid", version: PID_LOOKUP_VERSION });
    if (url.pathname === "/api/pid-listados" && request.method === "GET") return handlePidListados();
    if (url.pathname === "/api/pid-consultar" && request.method === "POST") return handlePidConsultar(request);
    return json({ ok: false, error: "Ruta no encontrada" }, 404);
  }
};

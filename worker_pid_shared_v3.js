export const PID_LOOKUP_VERSION = "2026-04-07-pid-standalone-4";

export const PID_LISTADOS = [
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

export const PID_ALLOWED_LISTADOS = new Set(PID_LISTADOS.map((item) => item.value));

export function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders()
  });
}

export function normalizeDni(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

export function normalizeYear(value) {
  const year = Number(String(value || "").trim());
  return Number.isInteger(year) && year >= 2015 && year <= 2100 ? year : null;
}

export function normalizeListado(value) {
  return String(value || "").trim();
}

export function b64(value) {
  return btoa(String(value || "").trim());
}

export function buildPidUrl(dni, anio, listado) {
  return "http://servicios2.abc.gov.ar/servaddo/puntaje.ingreso.docencia/ingreso.servaddo.cfm" +
    `?documento=${encodeURIComponent(b64(dni))}` +
    `&anio=${encodeURIComponent(b64(String(anio)))}` +
    `&listado=${encodeURIComponent(b64(listado))}` +
    "&tipo=";
}

export function cleanText(value) {
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

export function normalizeComparable(value) {
  return cleanText(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractLabelValue(html, label) {
  const rx = new RegExp(
    `<label[^>]*>\\s*<b>\\s*${escapeRegExp(label)}\\s*<\\/b>\\s*([^<]*)<\\/label>`,
    "i"
  );
  const match = html.match(rx);
  return cleanText(match?.[1] || "");
}

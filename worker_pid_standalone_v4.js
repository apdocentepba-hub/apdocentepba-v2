import { PID_LOOKUP_VERSION, PID_LISTADOS, PID_ALLOWED_LISTADOS, corsHeaders, json, normalizeDni, normalizeYear, normalizeListado, buildPidUrl } from "./worker_pid_shared_v3.js";
import { parsePidHtml } from "./worker_pid_parser_v4.js";

async function handlePidListados() {
  return json({ ok: true, version: PID_LOOKUP_VERSION, listados: PID_LISTADOS });
}

async function handlePidConsultar(request) {
  const body = await request.json().catch(() => ({}));
  const dni = normalizeDni(body && body.dni);
  const anio = normalizeYear((body && body.anio) || new Date().getFullYear());
  const listado = normalizeListado(body && body.listado);

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
  if (!res.ok) return json({ ok: false, error: "PID devolvió HTTP " + res.status + ".", upstream_status: res.status, upstream_url: upstream_url }, 502);
  if (!/PUNTAJE INGRESO A LA DOCENCIA|Apellido y Nombre/i.test(html)) return json({ ok: false, error: "La respuesta del PID no parece una oblea válida.", upstream_status: res.status, upstream_url: upstream_url }, 502);

  const parsed = parsePidHtml(html);
  const payload = { ok: true, version: PID_LOOKUP_VERSION, dni: dni, anio: anio, listado: listado, upstream_url: upstream_url, parser_debug: parsed.parser_debug, result: parsed.result };
  if (parsed.html_debug_excerpt) payload.html_debug_excerpt = parsed.html_debug_excerpt;
  return json(payload);
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

/* Builds a candidate bundle for local tests ONLY. Never updates worker-live. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const FUNCTION_ANCHOR = "var worker_default = {";
const ROUTE_ANCHOR = '      if (path === `${API_URL_PREFIX2}/admin/resumen` && request.method === "GET") {';
const EXPORT_ANCHOR = "export async function handleApdAdminDailyHistory(";
function exactlyOnce(source, text, context) {
  const count = source.split(text).length - 1;
  if (count !== 1) throw new Error(context + ": ancla esperada 1, halladas " + count);
}
export function buildAdminHistoryPreview(liveSource, readSource) {
  if (liveSource.includes("handleApdAdminDailyHistory") ||
      liveSource.includes("APD_DAILY_HISTORY_READ_ENABLED")) {
    throw new Error("El worker ya incorpora la ruta; no se puede integrar dos veces");
  }
  exactlyOnce(liveSource, FUNCTION_ANCHOR, "Worker export");
  exactlyOnce(liveSource, ROUTE_ANCHOR, "Existing authenticated admin router");
  exactlyOnce(readSource, EXPORT_ANCHOR, "Reader export");
  if (!liveSource.includes("async function requireAdmin(env, request)") ||
      !liveSource.includes("async function supabaseSelect(env, query)") ||
      !liveSource.includes("function json(data, status = 200)")) {
    throw new Error("Faltan dependencias de autenticacion, DB o JSON verificadas");
  }
  if (/^\s*import\s/m.test(readSource)) {
    throw new Error("El reader debe ser autonomo sin imports externos");
  }
  const fn = readSource.replace(EXPORT_ANCHOR, "async function handleApdAdminDailyHistory(");
  const prepared = liveSource.replace(FUNCTION_ANCHOR, fn + "\n" + FUNCTION_ANCHOR);
  return prepared.replace(ROUTE_ANCHOR, [
    '      if (path === "/api/admin/provincia/historico-diario" && request.method === "GET") {',
    "        return await handleApdAdminDailyHistory(request, url, env, requireAdmin, supabaseSelect, json);",
    "      }",
    ROUTE_ANCHOR
  ].join("\n"));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = resolve(process.argv[2] || "tmp/apd-history-read/worker_preview.mjs");
  const live = readFileSync("worker-live/worker_hotfix.js", "utf8");
  const reader = readFileSync("worker-live/apd_history_admin_read.mjs", "utf8");
  const preview = buildAdminHistoryPreview(live, reader);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, preview);
  console.log("Generated preview-only admin history Worker: " + out);
}

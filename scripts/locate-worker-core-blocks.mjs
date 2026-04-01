import fs from "node:fs";
import path from "node:path";

const workerPath = path.join(process.cwd(), "worker.js");

if (!fs.existsSync(workerPath)) {
  console.error(JSON.stringify({ ok: false, error: "worker.js no existe en la raíz del repo" }, null, 2));
  process.exit(1);
}

const source = fs.readFileSync(workerPath, "utf8");
const lines = source.split("\n");

function findLineIndex(fragment) {
  const idx = lines.findIndex(line => line.includes(fragment));
  return idx === -1 ? null : idx + 1;
}

const duplicateKickLine = findLineIndex('if (path === "/api/provincia/backfill-kick" && request.method === "POST")');
const duplicateStatusLine = findLineIndex('if (path === "/api/provincia/backfill-status" && request.method === "GET")');
const prefixedStatusLine = findLineIndex('if (path === `${API_URL_PREFIX}/provincia/backfill-status` && request.method === "GET")');
const prefixedKickLine = findLineIndex('if (path === `${API_URL_PREFIX}/provincia/backfill-kick` && request.method === "POST")');
const exportDefaultLine = findLineIndex("export default {");
const scheduledLine = findLineIndex("  async scheduled(_controller, env, ctx) {");
const handleLoginLine = findLineIndex("async function handleLogin(request, env) {");
const handleProvinciaBackfillKickLine = findLineIndex("async function handleProvinciaBackfillKick(request, env, ctx) {");
const handleProvinciaBackfillStatusLine = findLineIndex("async function handleProvinciaBackfillStatus(env) {");

console.log(JSON.stringify({
  ok: true,
  file: "worker.js",
  markers: {
    export_default_start_line: exportDefaultLine,
    scheduled_line: scheduledLine,
    handle_login_line: handleLoginLine,
    duplicate_provincia_kick_line: duplicateKickLine,
    duplicate_provincia_status_line: duplicateStatusLine,
    prefixed_provincia_status_line: prefixedStatusLine,
    prefixed_provincia_kick_line: prefixedKickLine,
    handler_provincia_backfill_status_line: handleProvinciaBackfillStatusLine,
    handler_provincia_backfill_kick_line: handleProvinciaBackfillKickLine
  }
}, null, 2));

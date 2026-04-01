import fs from "node:fs";
import path from "node:path";

const workerPath = path.join(process.cwd(), "worker.js");

const duplicateProvinciaBlock = `if (path === "/api/provincia/backfill-kick" && request.method === "POST") {\n        return await handleProvinciaBackfillKick(request, env, ctx);\n      }\n\n      if (path === "/api/provincia/backfill-status" && request.method === "GET") {\n        return await handleProvinciaBackfillStatus(env);\n      }\n\n`;

if (!fs.existsSync(workerPath)) {
  console.error(JSON.stringify({ ok: false, error: "worker.js no existe en la raíz del repo" }, null, 2));
  process.exit(1);
}

const content = fs.readFileSync(workerPath, "utf8");
const found = content.includes(duplicateProvinciaBlock);

console.log(JSON.stringify({
  ok: true,
  duplicated_provincia_routes_found: found
}, null, 2));

if (found) {
  process.exit(2);
}

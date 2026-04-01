import fs from "node:fs";
import path from "node:path";

const workerPath = path.join(process.cwd(), "worker.js");

if (!fs.existsSync(workerPath)) {
  console.error(JSON.stringify({ ok: false, error: "worker.js no existe en la raíz del repo" }, null, 2));
  process.exit(1);
}

const source = fs.readFileSync(workerPath, "utf8");

const routeRegex = /if\s*\(\s*path\s*===\s*(?:`([^`]+)`|"([^"]+)")\s*&&\s*request\.method\s*===\s*"([A-Z]+)"\s*\)/g;
const matches = [];
let match;

while ((match = routeRegex.exec(source)) !== null) {
  const routePath = (match[1] || match[2] || "").trim();
  const method = String(match[3] || "").trim().toUpperCase();
  matches.push({ method, path: routePath });
}

const normalized = matches.map(item => ({
  ...item,
  normalized_path: item.path.replaceAll("${API_URL_PREFIX}", "/api")
}));

const byKey = new Map();
for (const item of normalized) {
  const key = `${item.method} ${item.normalized_path}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(item);
}

const duplicates = Array.from(byKey.entries())
  .filter(([, items]) => items.length > 1)
  .map(([key, items]) => ({
    route: key,
    occurrences: items.length,
    variants: items.map(x => x.path)
  }))
  .sort((a, b) => a.route.localeCompare(b.route, "en"));

const report = {
  ok: true,
  total_route_checks: matches.length,
  unique_routes: byKey.size,
  duplicated_routes: duplicates.length,
  duplicates,
  routes: Array.from(byKey.keys()).sort((a, b) => a.localeCompare(b, "en"))
};

console.log(JSON.stringify(report, null, 2));

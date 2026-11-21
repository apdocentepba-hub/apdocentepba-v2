/* Read-only catalog connector for the official ABC SAD directory.
 * Resolves the current public directory dynamically; it does not fetch notices yet.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

const ENDPOINT = new URL("https://servicios3.abc.gob.ar/dti/api/sads.regional/select");
ENDPOINT.searchParams.set("q", "*:*");
ENDPOINT.searchParams.set("rows", "200");
ENDPOINT.searchParams.set("fl", "distrito,url");
ENDPOINT.searchParams.set("sort", "distrito asc");
ENDPOINT.searchParams.set("facet", "true");
ENDPOINT.searchParams.set("fq", "{!collapse field=distrito}");
ENDPOINT.searchParams.set("json.nl", "arrarr");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 20_000);

let response;
try {
  response = await fetch(ENDPOINT, {
    method: "GET",
    signal: controller.signal,
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
    headers: {Accept: "application/json"},
  });
} finally {
  clearTimeout(timeout);
}

if (!response.ok) throw new Error(`ABC SAD directory returned HTTP ${response.status}`);
const contentLength = Number(response.headers.get("content-length") || 0);
if (contentLength > 1_000_000) throw new Error("ABC SAD directory response exceeded 1 MB");
const payload = await response.json();
const expectedCount = payload?.response?.numFound;
const docs = payload?.response?.docs;

if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || !Array.isArray(docs)) {
  throw new Error("ABC SAD directory response has an unexpected structure");
}
if (docs.length !== expectedCount) {
  throw new Error(`ABC SAD directory is incomplete: expected ${expectedCount} rows, received ${docs.length}`);
}

const offices = docs.map((row) => {
  if (typeof row?.distrito !== "string" || typeof row?.url !== "string" || !row.url.startsWith("/")) {
    throw new Error("ABC SAD directory contains an invalid district row");
  }
  return {
    district: row.distrito,
    official_path: row.url,
    official_page: new URL(`/sad${row.url}`, "https://abc.gob.ar").href,
    verification: "listed_by_official_abc_directory",
  };
});

const names = offices.map((office) => office.district);
const paths = offices.map((office) => office.official_path);
if (new Set(names).size !== offices.length || new Set(paths).size !== offices.length) {
  throw new Error("ABC SAD directory contains duplicate district names or routes");
}

const result = {
  source: "ABC Dirección de Gestión de Asuntos Docentes — public SAD directory API",
  source_endpoint: ENDPOINT.href,
  captured_at: new Date().toISOString(),
  directory_count: expectedCount,
  expected_current_count: 137,
  pages_checked: 0,
  note: "This catalog confirms directory entries and official URLs; it does not yet verify notice-page content or external channels.",
  offices,
};

const outputPath = resolve(process.argv[2] || "tmp/observatorio-sad/source-directory.json");
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  source: result.source,
  directory_count: result.directory_count,
  captured_at: result.captured_at,
  output: outputPath,
}, null, 2));

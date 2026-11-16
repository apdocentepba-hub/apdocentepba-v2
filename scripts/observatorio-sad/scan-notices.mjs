/* Read-only hourly first-pass monitor for public SAD pages.
 * Tracks selected notice/document links and a main-content fingerprint.
 * External links are recorded, never fetched by this script.
 */
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

const DIRECTORY_ENDPOINT = new URL("https://servicios3.abc.gob.ar/dti/api/sads.regional/select");
DIRECTORY_ENDPOINT.searchParams.set("q", "*:*");
DIRECTORY_ENDPOINT.searchParams.set("rows", "200");
DIRECTORY_ENDPOINT.searchParams.set("fl", "distrito,url");
DIRECTORY_ENDPOINT.searchParams.set("sort", "distrito asc");
DIRECTORY_ENDPOINT.searchParams.set("facet", "true");
DIRECTORY_ENDPOINT.searchParams.set("fq", "{!collapse field=distrito}");
DIRECTORY_ENDPOINT.searchParams.set("json.nl", "arrarr");

const OUT_DIR = resolve("tmp/observatorio-sad");
const STATE_PATH = resolve(process.env.SAD_STATE_PATH || `${OUT_DIR}/state.json`);
const REPORT_PATH = resolve(process.env.SAD_REPORT_PATH || `${OUT_DIR}/report.json`);
const MAX_RESPONSE_BYTES = 12_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const POLITE_DELAY_MS = 500;
const MATERIAL_TEXT = /comunic|convoc|acto|cobertura|designaci|listado|vacant|inscrip|notific|titular|acrecent|calific|reubic|mad\b|apd\b|proyecto|difusi|licencia|excus|concurso|recurso|interino|suplente|ofrecimiento|titulariz/i;
const DOCUMENT_PATH = /\.(pdf|docx?|xlsx?|pptx?|odt|ods)(?:$|[?#])/i;
const EXTERNAL_CHANNEL = /(^|\.)((drive|docs)\.google\.com|forms\.gle|sites\.google\.com|forms\.office\.com|facebook\.com|instagram\.com|t\.me)$/i;

async function fetchText(url, accept) {
  if (!["https://abc.gob.ar", "https://servicios3.abc.gob.ar"].includes(url.origin)) {
    throw new Error("Blocked unexpected request destination");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      headers: {Accept: accept},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_RESPONSE_BYTES) throw new Error("Response exceeds 12 MB");
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw new Error("Response exceeds 12 MB");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function plainText(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractMain(html) {
  const withoutNoise = html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const main = withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return main?.[1] || withoutNoise;
}

function isNoticeLink(rawHref, label) {
  let url;
  try { url = new URL(rawHref, "https://abc.gob.ar"); } catch { return false; }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const hostname = url.hostname.toLowerCase();
  const external = hostname !== "abc.gob.ar" && hostname !== "www.abc.gob.ar";
  return DOCUMENT_PATH.test(url.href) ||
    EXTERNAL_CHANNEL.test(hostname) ||
    MATERIAL_TEXT.test(label) ||
    (external && MATERIAL_TEXT.test(url.href));
}

function extractNoticeLinks(mainHtml) {
  const links = new Map();
  const anchorRegex = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of mainHtml.matchAll(anchorRegex)) {
    const rawHref = decodeHtml(match[3]).trim();
    const label = plainText(match[5]).slice(0, 500);
    if (!rawHref || !isNoticeLink(rawHref, label)) continue;
    try {
      const url = new URL(rawHref, "https://abc.gob.ar");
      url.hash = "";
      const key = url.href;
      if (!links.has(key)) links.set(key, {title: label || key, url: key});
    } catch {}
  }
  return [...links.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeReadState() {
  if (!existsSync(STATE_PATH)) return {offices: {}};
  const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  if (!parsed || typeof parsed.offices !== "object" || Array.isArray(parsed.offices)) {
    throw new Error("Previous SAD state file has an invalid structure");
  }
  return parsed;
}

const directoryText = await fetchText(DIRECTORY_ENDPOINT, "application/json");
const directory = JSON.parse(directoryText);
const declaredCount = directory?.response?.numFound;
const docs = directory?.response?.docs;
if (!Number.isSafeInteger(declaredCount) || !Array.isArray(docs) || docs.length !== declaredCount) {
  throw new Error("Official ABC directory response is incomplete or malformed");
}

const offices = docs.map((row) => {
  if (typeof row?.distrito !== "string" || typeof row?.url !== "string" || !row.url.startsWith("/")) {
    throw new Error("Official ABC directory contains an invalid SAD row");
  }
  return {
    district: row.distrito,
    page: new URL(`/sad${row.url}`, "https://abc.gob.ar").href,
  };
});
if (new Set(offices.map((office) => office.district)).size !== offices.length ||
    new Set(offices.map((office) => office.page)).size !== offices.length) {
  throw new Error("Official ABC directory contains duplicate offices or routes");
}

const previous = safeReadState();
const nextOffices = {...previous.offices};
const errors = [];
const changes = [];
let checked = 0;

for (const office of offices) {
  try {
    const html = await fetchText(new URL(office.page), "text/html");
    const mainHtml = extractMain(html);
    const current = {
      district: office.district,
      page: office.page,
      checked_at: new Date().toISOString(),
      main_content_sha256: digest(plainText(mainHtml)),
      notice_links: extractNoticeLinks(mainHtml),
    };
    const prior = previous.offices[office.page];
    if (!prior) {
      changes.push({district: office.district, page: office.page, kind: "baseline_created", link_count: current.notice_links.length});
    } else {
      const priorByUrl = new Map((prior.notice_links || []).map((link) => [link.url, link]));
      const currentByUrl = new Map(current.notice_links.map((link) => [link.url, link]));
      const added = [...currentByUrl.values()].filter((link) => !priorByUrl.has(link.url));
      const removed = [...priorByUrl.values()].filter((link) => !currentByUrl.has(link.url));
      const relabeled = [...currentByUrl.values()].filter((link) => priorByUrl.has(link.url) && priorByUrl.get(link.url).title !== link.title);
      if (added.length || removed.length || relabeled.length) {
        changes.push({
          district: office.district,
          page: office.page,
          kind: "notice_links_changed",
          added,
          removed,
          relabeled,
        });
      } else if (prior.main_content_sha256 !== current.main_content_sha256) {
        changes.push({district: office.district, page: office.page, kind: "page_content_changed_needs_review"});
      }
    }
    nextOffices[office.page] = current;
    checked += 1;
  } catch (error) {
    errors.push({district: office.district, page: office.page, error: String(error?.message || error)});
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, POLITE_DELAY_MS));
}

const capturedAt = new Date().toISOString();
const state = {
  source: "ABC official public SAD directory and district pages",
  directory_count: declaredCount,
  captured_at: capturedAt,
  offices: nextOffices,
};
const report = {
  source: "ABC official public SAD directory and district pages",
  captured_at: capturedAt,
  directory_count: declaredCount,
  pages_checked: checked,
  pages_failed: errors.length,
  changes_count: changes.filter((change) => !change.kind.startsWith("baseline_")).length,
  changes,
  errors,
  limitation: "The page fingerprint is a review signal, not a verified new communiqué. Links are heuristically selected; external targets are recorded but never fetched. This first monitor does not archive document contents.",
};

mkdirSync(dirname(STATE_PATH), {recursive: true});
mkdirSync(dirname(REPORT_PATH), {recursive: true});
writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  captured_at: capturedAt,
  directory_count: declaredCount,
  pages_checked: checked,
  pages_failed: errors.length,
  changes_count: report.changes_count,
  report: REPORT_PATH,
}, null, 2));

if (checked === 0) throw new Error("No SAD page was successfully checked");

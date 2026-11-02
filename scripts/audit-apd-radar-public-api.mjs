/* Read-only public APD API smoke. No Supabase access, tokens, cookies, or PII. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("app_v2.js", "utf8");
const match = source.match(/^const API_URL = "(https:\/\/[^"]+)";/m);
assert.ok(match, "Cannot establish canonical public API origin.");
const base = new URL(match[1]);
assert.equal(base.protocol, "https:");
assert.ok(/^([a-z0-9-]+)\.apdocentepba\.workers\.dev$/.test(base.hostname), "Disallowed API hostname");
assert.equal(base.pathname, "/");

async function readPublic(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 17000);
  try {
    const res = await fetch(new URL(path, base), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {"Accept": "application/json"}
    });
    assert.equal(res.status, 200, path + ": unexpected HTTP status " + res.status);
    const type = res.headers.get("content-type") || "";
    assert.match(type, /application\/json/i, path + ": non-JSON response");
    const length = Number(res.headers.get("content-length") || 0);
    assert.ok(length < 6 * 1024 * 1024, path + ": unexpectedly large response");
    const data = await res.json();
    assert.equal(data?.ok,true,path + ": API did not confirm data available");
    return data;
  } finally { clearTimeout(timer); }
}
const scan = await readPublic("/api/provincia/backfill-status");
for(const field of ["total_districts","districts_completed","offers_processed"]) {
  assert.ok(Number.isSafeInteger(Number(scan[field])) && Number(scan[field])>=0,
    "Invalid scan " + field);
}
assert.ok(Number(scan.districts_completed)<=Number(scan.total_districts),"Invalid scan progress");
const summary = await readPublic("/api/provincia/resumen");
assert.ok(Number.isSafeInteger(Number(summary.total_ofertas)) && Number(summary.total_ofertas)>=0,
  "Invalid summary offer count");
const completed = scan.status==="finished" &&
  Number(scan.districts_completed)===Number(scan.total_districts);
const finishTime = Date.parse(scan.finished_at||"");
const recent = completed && Number.isFinite(finishTime) && Math.abs(Date.now()-finishTime)<36*3600000;
const mismatch = recent && Number(summary.ventana_dias)>=7 &&
  Number(summary.total_ofertas)<Number(scan.offers_processed);
const result = {
  worker_origin: base.origin,
  scan_status: scan.status,
  scan_completed_districts: scan.districts_completed,
  scan_total_districts: scan.total_districts,
  scan_offers_processed: scan.offers_processed,
  scan_finished_at: scan.finished_at || null,
  summary_window_days: summary.ventana_dias ?? null,
  summary_records_reported: summary.total_ofertas,
  summary_empty: summary.empty===true,
  mismatch_on_recent_full_scan: !!mismatch,
  conclusion: mismatch ? "SUMMARY_REQUIRES_PAGINATION_AUDIT" : "NO_COUNT_MISMATCH_DETECTED"
};
console.log(JSON.stringify(result,null,2));
if(mismatch) console.log("::warning::Provincial summary is lower than a recent complete scan. Do not treat the summary as exhaustive.");

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const WORKER_PATH = path.join(ROOT, "worker.js");
const PROTOTYPE_PATH = path.join(ROOT, "prototypes", "worker.fetch.cleaned.js");
const OUTPUT_DIR = path.join(ROOT, "artifacts");
const OUTPUT_REPORT_PATH = path.join(OUTPUT_DIR, "worker.export-default.applied-report.json");

const args = new Set(process.argv.slice(2));
const writeReport = args.has("--write");
const failOnProblems = args.has("--strict");

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo requerido: ${path.relative(ROOT, filePath)}`);
  }
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function normalizeBlock(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function countOccurrences(text, snippet) {
  if (!snippet) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const idx = text.indexOf(snippet, offset);
    if (idx === -1) break;
    count += 1;
    offset = idx + snippet.length;
  }
  return count;
}

function findExportDefaultBlock(text) {
  const start = text.indexOf("export default {");
  if (start === -1) throw new Error("No se encontró export default en worker.js");
  const nextFunctionMarker = "\nasync function handleLogin(";
  const end = text.indexOf(nextFunctionMarker, start);
  if (end === -1) throw new Error("No se encontró el final esperado del bloque export default");
  return text.slice(start, end);
}

function extractScheduledBlock(exportBlock) {
  const marker = "async scheduled(";
  const start = exportBlock.indexOf(marker);
  if (start === -1) return "";
  return exportBlock.slice(start);
}

function buildReport(workerSource, prototypeSource) {
  const currentExport = findExportDefaultBlock(workerSource);
  const prototypeExport = normalizeBlock(prototypeSource);

  const currentNormalized = normalizeBlock(currentExport);
  const prototypeNormalized = normalizeBlock(prototypeExport);

  const hardcodedKick = 'if (path === "/api/provincia/backfill-kick" && request.method === "POST") {';
  const hardcodedStatus = 'if (path === "/api/provincia/backfill-status" && request.method === "GET") {';
  const prefixedKick = 'if (path === `${API_URL_PREFIX}/provincia/backfill-kick` && request.method === "POST") {';
  const prefixedStatus = 'if (path === `${API_URL_PREFIX}/provincia/backfill-status` && request.method === "GET") {';

  const currentScheduled = normalizeBlock(extractScheduledBlock(currentExport));
  const prototypeScheduled = normalizeBlock(extractScheduledBlock(prototypeExport));

  const report = {
    created_at: new Date().toISOString(),
    worker_path: path.relative(ROOT, WORKER_PATH),
    prototype_path: path.relative(ROOT, PROTOTYPE_PATH),
    checks: {
      export_default_matches_prototype: currentNormalized === prototypeNormalized,
      scheduled_block_same_hash: sha256(currentScheduled) === sha256(prototypeScheduled),
      hardcoded_duplicate_kick_absent: countOccurrences(workerSource, hardcodedKick) === 0,
      hardcoded_duplicate_status_absent: countOccurrences(workerSource, hardcodedStatus) === 0,
      prefixed_kick_present_once: countOccurrences(workerSource, prefixedKick) === 1,
      prefixed_status_present_once: countOccurrences(workerSource, prefixedStatus) === 1
    },
    counts: {
      hardcoded_kick: countOccurrences(workerSource, hardcodedKick),
      hardcoded_status: countOccurrences(workerSource, hardcodedStatus),
      prefixed_kick: countOccurrences(workerSource, prefixedKick),
      prefixed_status: countOccurrences(workerSource, prefixedStatus)
    },
    hashes: {
      worker_export_default_sha256: sha256(currentNormalized),
      prototype_export_default_sha256: sha256(prototypeNormalized),
      worker_scheduled_sha256: sha256(currentScheduled),
      prototype_scheduled_sha256: sha256(prototypeScheduled)
    }
  };

  report.ok = Object.values(report.checks).every(Boolean);
  return report;
}

function printSummary(report) {
  const lines = [
    `ok=${report.ok}`,
    `export_default_matches_prototype=${report.checks.export_default_matches_prototype}`,
    `scheduled_block_same_hash=${report.checks.scheduled_block_same_hash}`,
    `hardcoded_kick=${report.counts.hardcoded_kick}`,
    `hardcoded_status=${report.counts.hardcoded_status}`,
    `prefixed_kick=${report.counts.prefixed_kick}`,
    `prefixed_status=${report.counts.prefixed_status}`
  ];
  console.log(lines.join("\n"));
}

function main() {
  ensureFile(WORKER_PATH);
  ensureFile(PROTOTYPE_PATH);

  const workerSource = readUtf8(WORKER_PATH);
  const prototypeSource = readUtf8(PROTOTYPE_PATH);
  const report = buildReport(workerSource, prototypeSource);

  if (writeReport) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  }

  printSummary(report);

  if (failOnProblems && !report.ok) {
    process.exitCode = 1;
  }
}

main();

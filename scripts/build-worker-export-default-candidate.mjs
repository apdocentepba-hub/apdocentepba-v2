#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const WORKER_PATH = path.join(ROOT, "worker.js");
const PROTOTYPE_PATH = path.join(ROOT, "prototypes", "worker.fetch.cleaned.js");
const OUTPUT_DIR = path.join(ROOT, "artifacts");
const OUTPUT_WORKER_PATH = path.join(OUTPUT_DIR, "worker.export-default.candidate.js");
const OUTPUT_REPORT_PATH = path.join(OUTPUT_DIR, "worker.export-default.report.json");

const args = new Set(process.argv.slice(2));
const writeCandidate = args.has("--write");
const applyInPlace = args.has("--apply");
const failOnProblems = args.has("--strict");

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo requerido: ${path.relative(ROOT, filePath)}`);
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function countOccurrences(text, snippet) {
  if (!snippet) return 0;
  let count = 0;
  let start = 0;

  while (true) {
    const idx = text.indexOf(snippet, start);
    if (idx === -1) break;
    count += 1;
    start = idx + snippet.length;
  }

  return count;
}

function findExportDefaultBlock(text) {
  const start = text.indexOf("export default {");
  if (start === -1) {
    throw new Error("No se encontró el inicio de export default en worker.js");
  }

  const nextFunctionMarker = "\nasync function handleLogin(";
  const end = text.indexOf(nextFunctionMarker, start);
  if (end === -1) {
    throw new Error("No se encontró el final esperado del bloque export default (marker handleLogin)");
  }

  const block = text.slice(start, end);
  return { start, end, block };
}

function normalizeBlock(text) {
  return String(text || "").trim().replace(/\r\n/g, "\n");
}

function extractScheduledBlock(exportBlock) {
  const marker = "async scheduled(";
  const start = exportBlock.indexOf(marker);
  if (start === -1) return "";
  return exportBlock.slice(start).trim();
}

function buildCandidate(workerSource, cleanedPrototype) {
  const current = findExportDefaultBlock(workerSource);
  const before = workerSource.slice(0, current.start);
  const after = workerSource.slice(current.end);
  const replacement = `${normalizeBlock(cleanedPrototype)}\n\n`;
  return {
    current,
    candidate: `${before}${replacement}${after.replace(/^\n+/, "")}`
  };
}

function buildReport(workerSource, cleanedPrototype, candidateSource) {
  const current = findExportDefaultBlock(workerSource);
  const candidate = findExportDefaultBlock(candidateSource);

  const hardcodedKick = 'if (path === "/api/provincia/backfill-kick" && request.method === "POST") {';
  const hardcodedStatus = 'if (path === "/api/provincia/backfill-status" && request.method === "GET") {';
  const prefixedKick = 'if (path === `${API_URL_PREFIX}/provincia/backfill-kick` && request.method === "POST") {';
  const prefixedStatus = 'if (path === `${API_URL_PREFIX}/provincia/backfill-status` && request.method === "GET") {';

  const currentScheduled = extractScheduledBlock(current.block);
  const candidateScheduled = extractScheduledBlock(candidate.block);

  const report = {
    created_at: new Date().toISOString(),
    worker_path: path.relative(ROOT, WORKER_PATH),
    prototype_path: path.relative(ROOT, PROTOTYPE_PATH),
    writes_candidate_file: writeCandidate,
    applies_in_place: applyInPlace,
    checks: {
      current_export_default_found: true,
      candidate_export_default_found: true,
      prefix_unchanged: workerSource.slice(0, current.start) === candidateSource.slice(0, candidate.start),
      suffix_unchanged: workerSource.slice(current.end) === candidateSource.slice(candidate.end),
      scheduled_block_same_hash: sha256(normalizeBlock(currentScheduled)) === sha256(normalizeBlock(candidateScheduled)),
      hardcoded_duplicate_kick_removed: countOccurrences(candidateSource, hardcodedKick) === 0,
      hardcoded_duplicate_status_removed: countOccurrences(candidateSource, hardcodedStatus) === 0,
      prefixed_kick_present_once: countOccurrences(candidateSource, prefixedKick) === 1,
      prefixed_status_present_once: countOccurrences(candidateSource, prefixedStatus) === 1
    },
    counts: {
      current: {
        hardcoded_kick: countOccurrences(workerSource, hardcodedKick),
        hardcoded_status: countOccurrences(workerSource, hardcodedStatus),
        prefixed_kick: countOccurrences(workerSource, prefixedKick),
        prefixed_status: countOccurrences(workerSource, prefixedStatus)
      },
      candidate: {
        hardcoded_kick: countOccurrences(candidateSource, hardcodedKick),
        hardcoded_status: countOccurrences(candidateSource, hardcodedStatus),
        prefixed_kick: countOccurrences(candidateSource, prefixedKick),
        prefixed_status: countOccurrences(candidateSource, prefixedStatus)
      }
    },
    hashes: {
      worker_export_default_sha256: sha256(normalizeBlock(current.block)),
      prototype_export_default_sha256: sha256(normalizeBlock(cleanedPrototype)),
      candidate_export_default_sha256: sha256(normalizeBlock(candidate.block)),
      current_scheduled_sha256: sha256(normalizeBlock(currentScheduled)),
      candidate_scheduled_sha256: sha256(normalizeBlock(candidateScheduled))
    }
  };

  report.ok = Object.values(report.checks).every(Boolean);
  return report;
}

function printSummary(report) {
  const lines = [
    `ok=${report.ok}`,
    `prefix_unchanged=${report.checks.prefix_unchanged}`,
    `suffix_unchanged=${report.checks.suffix_unchanged}`,
    `scheduled_block_same_hash=${report.checks.scheduled_block_same_hash}`,
    `current hardcoded kick=${report.counts.current.hardcoded_kick}`,
    `current hardcoded status=${report.counts.current.hardcoded_status}`,
    `candidate hardcoded kick=${report.counts.candidate.hardcoded_kick}`,
    `candidate hardcoded status=${report.counts.candidate.hardcoded_status}`,
    `candidate prefixed kick=${report.counts.candidate.prefixed_kick}`,
    `candidate prefixed status=${report.counts.candidate.prefixed_status}`
  ];

  console.log(lines.join("\n"));
}

function main() {
  ensureFile(WORKER_PATH);
  ensureFile(PROTOTYPE_PATH);

  const workerSource = readUtf8(WORKER_PATH);
  const cleanedPrototype = readUtf8(PROTOTYPE_PATH);

  const { candidate } = buildCandidate(workerSource, cleanedPrototype);
  const report = buildReport(workerSource, cleanedPrototype, candidate);

  if (writeCandidate || applyInPlace) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_WORKER_PATH, candidate, "utf8");
    fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  }

  if (applyInPlace) {
    fs.writeFileSync(WORKER_PATH, candidate, "utf8");
  }

  printSummary(report);

  if (failOnProblems && !report.ok) {
    process.exitCode = 1;
  }
}

main();

/* Build an integrated preview ONLY. No Cloudflare deploy or schema changes. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPilotWorker } from "./build-apd-daily-history-pilot.mjs";
import { buildAdminHistoryPreview } from "./build-apd-history-admin-read-preview.mjs";

export function buildUnifiedDailyHistoryPreview(liveSource, writeHook, readHook) {
  const writePreview = buildPilotWorker(liveSource, writeHook);
  const integrated = buildAdminHistoryPreview(writePreview, readHook);
  const counts = [
    ["capture call", "await maybeCaptureDailyProvinceSummary("],
    ["admin read route", "return await handleApdAdminDailyHistory("],
    ["write opt-in gate", 'if (finished && env?.APD_DAILY_SUMMARY_ENABLED === "true")'],
    ["read opt-in gate", 'env?.APD_DAILY_HISTORY_READ_ENABLED !== "true"']
  ];
  for (const [name, marker] of counts) {
    if (integrated.split(marker).length - 1 !== 1) {
      throw new Error("Unexpected integrated preview count for " + name);
    }
  }
  if (!integrated.includes("snapshot_writes: false")) {
    throw new Error("Bulk snapshots unexpectedly enabled");
  }
  return integrated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dest = resolve(process.argv[2] || "tmp/apd-history-unified/worker_preview.mjs");
  const content = buildUnifiedDailyHistoryPreview(
    readFileSync("worker-live/worker_hotfix.js", "utf8"),
    readFileSync("worker-live/apd_daily_summary_hook.mjs", "utf8"),
    readFileSync("worker-live/apd_history_admin_read.mjs", "utf8")
  );
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  console.log("Unified preview generated; NOT deployed: " + dest);
}

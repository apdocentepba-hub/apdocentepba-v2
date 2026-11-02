import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildUnifiedDailyHistoryPreview } from "./build-apd-history-unified-preview.mjs";

const live=readFileSync("worker-live/worker_hotfix.js","utf8");
const write=readFileSync("worker-live/apd_daily_summary_hook.mjs","utf8");
const read=readFileSync("worker-live/apd_history_admin_read.mjs","utf8");

test("one Worker can have both opt-in components without enabling snapshots",()=>{
  const result=buildUnifiedDailyHistoryPreview(live,write,read);
  assert.equal((result.match(/await maybeCaptureDailyProvinceSummary\(/g)||[]).length,1);
  assert.equal((result.match(/return await handleApdAdminDailyHistory\(/g)||[]).length,1);
  assert.ok(result.includes("snapshot_writes: false"));
  assert.ok(!live.includes("maybeCaptureDailyProvinceSummary"));
  assert.ok(!live.includes("handleApdAdminDailyHistory"));
  assert.ok(result.length>live.length);
  const scanStart=result.indexOf("async function runProvinciaBackfillStep(env, options = {})");
  const saved=result.indexOf("      notes: nextNotes\n    });",scanStart);
  const invoked=result.indexOf("await maybeCaptureDailyProvinceSummary(",scanStart);
  const completed=result.indexOf('    return {\n      ok: true,\n      mode: "current_published"',scanStart);
  assert.ok(scanStart>0 && saved>scanStart && invoked>saved && completed>invoked);
  assert.throws(()=>buildUnifiedDailyHistoryPreview(result,write,read),/integración/);
});
test("integrated canonical bundle parses as real ESM JavaScript",()=>{
  const source=buildUnifiedDailyHistoryPreview(live,write,read);
  const r=spawnSync(process.execPath,["--input-type=module","--check"],{
    input:source,encoding:"utf8",maxBuffer:3*1024*1024
  });
  assert.equal(r.status,0,r.stderr);
});
test("exported Worker keeps history disabled without upstream requests",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"apd-history-two-features-"));
  const before=globalThis.fetch;
  try {
    const filepath=join(directory,"unified-preview.mjs");
    writeFileSync(filepath,buildUnifiedDailyHistoryPreview(live,write,read),"utf8");
    const {default:worker}=await import(pathToFileURL(filepath).href);
    let n=0;
    globalThis.fetch=async()=>{n++;throw new Error("Unexpected network request");};
    const request=new Request("https://worker.example.invalid/api/admin/provincia/historico-diario");
    const env={APD_DAILY_SUMMARY_ENABLED:"false",APD_DAILY_HISTORY_READ_ENABLED:"false"};
    const response=await worker.fetch(request,env,{});
    assert.equal(response.status,404);
    assert.equal(n,0);
    const noBearer=await worker.fetch(request,{
      ...env,APD_DAILY_SUMMARY_ENABLED:"true",APD_DAILY_HISTORY_READ_ENABLED:"true"
    },{});
    assert.equal(noBearer.status,401);
    assert.equal(n,0);
  } finally {
    globalThis.fetch=before;
    rmSync(directory,{recursive:true,force:true});
  }
});

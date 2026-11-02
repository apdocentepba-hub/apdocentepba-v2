import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { handleApdAdminDailyHistory } from "../worker-live/apd_history_admin_read.mjs";
import { buildAdminHistoryPreview } from "./build-apd-history-admin-read-preview.mjs";

const live = readFileSync("worker-live/worker_hotfix.js", "utf8");
const reader = readFileSync("worker-live/apd_history_admin_read.mjs", "utf8");
const ENV = {
  APD_DAILY_HISTORY_READ_ENABLED: "true",
  SUPABASE_URL: "https://mock.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "MOCK_SECRET_NEVER_REAL"
};
const ADMIN = async () => ({ ok: true, user: { es_admin: true } });
const DENIED = (status) => async () => ({
  ok: false,
  response: new Response(JSON.stringify({ ok:false }), { status })
});
const mkUrl = (limit = null) => new URL(
  "https://example.invalid/api/admin/provincia/historico-diario" +
  (limit === null ? "" : "?limit=" + limit)
);
const json = (body, status=200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type":"application/json" } });
const ROWS = [{
  scan_date:"2026-11-02",scan_finished_at:"2026-11-02T07:33:18Z",
  total_districts:137,districts_with_offers:2,offers_total:3,
  district_offer_counts:{"AVELLANEDA":2,"QUILMES":1}
}, {
  scan_date:"2026-11-01",scan_finished_at:"2026-11-01T07:31:00Z",
  total_districts:137,districts_with_offers:1,offers_total:2,
  district_offer_counts:{"QUILMES":2}
}];
test("closed flag returns 404 with zero session or DB reads", async () => {
  let invoked=0;
  const fail=async()=>{invoked++;throw Error("MUST NOT CALL");};
  for(const enabled of [undefined,"false","TRUE","1"]) {
    const r=await handleApdAdminDailyHistory(new Request(mkUrl()),mkUrl(),
      {...ENV,APD_DAILY_HISTORY_READ_ENABLED:enabled},fail,fail,json);
    assert.equal(r.status,404);
    assert.equal(r.headers.get("Cache-Control"),"no-store");
  }
  assert.equal(invoked,0);
});
test("401/403 from existing authenticated admin guard, zero data reads",async()=>{
  let queries=0;
  const db=async()=>{queries++;return ROWS;};
  for(const status of [401,403]) {
    const r=await handleApdAdminDailyHistory(new Request(mkUrl()),mkUrl(),
      ENV,DENIED(status),db,json);
    assert.equal(r.status,status);
  }
  assert.equal(queries,0);
});
test("only admin can read bounded, aggregated summaries; at least two dates needed",async()=>{
  let query=null;
  const db=async(_env,q)=>{query=q;return ROWS;};
  const r=await handleApdAdminDailyHistory(new Request(mkUrl()),mkUrl(),ENV,ADMIN,db,json);
  assert.equal(r.status,200);
  assert.equal(r.headers.get("Cache-Control"),"no-store");
  const payload=await r.json();
  assert.equal(payload.ok,true);
  assert.equal(payload.comparable,true);
  assert.equal(payload.total_dates,2);
  assert.equal(payload.dates[0].offers_total,3);
  assert.equal(payload.dates[1].offers_total,2);
  assert.match(query,/order=scan_date.desc&limit=30$/);
  assert.ok(!/users|raw|email|token|source_offer_key/.test(query));
  const one=await handleApdAdminDailyHistory(new Request(mkUrl("1")),mkUrl("1"),
    ENV,ADMIN,async()=>ROWS.slice(0,1),json);
  assert.equal((await one.json()).comparable,false);
});
test("empty new table is explicitly empty, never fabricated history",async()=>{
  const r=await handleApdAdminDailyHistory(new Request(mkUrl()),mkUrl(),
    ENV,ADMIN,async()=>[],json);
  const data=await r.json();
  assert.equal(data.total_dates,0);
  assert.equal(data.comparable,false);
  assert.deepEqual(data.dates,[]);
});
test("invalid limits are rejected before database request",async()=>{
  let calls=0;
  const db=async()=>{calls++;return [];};
  for(const limit of ["0","61","-1","1e2","1.5","01","abc",""]) {
    const u=mkUrl(limit);
    const r=await handleApdAdminDailyHistory(new Request(u),u,ENV,ADMIN,db,json);
    assert.equal(r.status,400,limit);
  }
  assert.equal(calls,0);
});
test("upstream failures, missing migration, secret misconfiguration never leak details",async()=>{
  const db=async()=>{throw Error("private: MOCK_SECRET_NEVER_REAL missing table");};
  for(const env of [ENV, {...ENV,SUPABASE_SERVICE_ROLE_KEY:""}]) {
    const r=await handleApdAdminDailyHistory(new Request(mkUrl()),mkUrl(),
      env,ADMIN,db,json);
    assert.equal(r.status,503);
    assert.deepEqual(await r.json(),{ok:false,error:"Historico no disponible"});
  }
});
test("corrupt counts, excessive rows, invalid date fail closed",async()=>{
  const badRows=[
    [{...ROWS[0],offers_total:4}],
    [{...ROWS[0],district_offer_counts:{"AVELLANEDA":-1,"QUILMES":4}}],
    [{...ROWS[0],scan_date:"2026-13-99"}],
    Array(31).fill(ROWS[0]),
    [{...ROWS[0],district_offer_counts:{"__proto__":1}}],
  ];
  for(const rows of badRows){
    const r=await handleApdAdminDailyHistory(new Request(mkUrl()),mkUrl(),
      ENV,ADMIN,async()=>rows,json);
    assert.equal(r.status,503);
  }
});
test("builder inserts one guarded GET route, no production source edits",()=>{
  const candidate=buildAdminHistoryPreview(live,reader);
  assert.equal((candidate.match(/async function handleApdAdminDailyHistory\(/g)||[]).length,1);
  assert.equal((candidate.match(/return await handleApdAdminDailyHistory\(/g)||[]).length,1);
  assert.match(candidate,/path === "\/api\/admin\/provincia\/historico-diario" && request.method === "GET"/);
  assert.ok(candidate.indexOf("async function handleApdAdminDailyHistory") <
            candidate.indexOf("var worker_default = {"));
  assert.ok(candidate.includes('snapshot_writes: false'));
  assert.ok(!live.includes("APD_DAILY_HISTORY_READ_ENABLED"));
  assert.ok(!live.includes("handleApdAdminDailyHistory"));
  assert.throws(()=>buildAdminHistoryPreview(candidate,reader),/no se puede integrar dos veces/);
  assert.throws(()=>buildAdminHistoryPreview("unknown source",reader),/ancla/);
  assert.throws(()=>buildAdminHistoryPreview(live,reader.replace("export async function handleApdAdminDailyHistory(", "")),/ancla/);
  assert.throws(()=>buildAdminHistoryPreview(live,"import x from 'x';\n"+reader),/imports externos/);
});
test("generated 600 KB ESM worker passes real syntax parser",()=>{
  const source=buildAdminHistoryPreview(live,reader);
  const result=spawnSync(process.execPath,["--input-type=module","--check"],
    {input:source,encoding:"utf8",maxBuffer:2*1024*1024});
  assert.equal(result.status,0,result.stderr);
});

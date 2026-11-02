import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildAdminHistoryPreview } from "./build-apd-history-admin-read-preview.mjs";

const LIVE = readFileSync("worker-live/worker_hotfix.js", "utf8");
const READER = readFileSync("worker-live/apd_history_admin_read.mjs", "utf8");
const URL = "https://worker.example.invalid/api/admin/provincia/historico-diario";
const KEY = "MOCK_ONLY_NOT_A_CREDENTIAL";
const SCHEMA = [{
  scan_date:"2026-11-02",
  scan_finished_at:"2026-11-02T07:33:18Z",
  total_districts:137,
  districts_with_offers:2,
  offers_total:3,
  district_offer_counts:{AVELLANEDA:2,QUILMES:1}
}];
function fakeReply(data, status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
}

test("the actual exported compiled Worker delegates safe admin history route",async()=>{
  const tmp=mkdtempSync(join(tmpdir(),"apd-history-compiled-smoke-"));
  const oldFetch=globalThis.fetch;
  try {
    const preview=join(tmp,"worker-preview.mjs");
    writeFileSync(preview,buildAdminHistoryPreview(LIVE,READER),"utf8");
    const mod=await import(pathToFileURL(preview).href);
    const worker=mod.default;
    assert.equal(typeof worker?.fetch,"function");

    let calls=[];
    let role="admin";
    let historyData=SCHEMA;
    let historyStatus=200;
    globalThis.fetch=async(input,init={})=>{
      const u=new URL(input instanceof Request?input.url:String(input));
      assert.equal(u.origin,"https://fake-supabase.invalid","Unexpected network domain");
      assert.equal(init.method,"GET","Admin history must never write");
      calls.push(u.pathname);
      if(u.pathname==="/rest/v1/sessions") {
        return fakeReply([{token:"mock_token",user_id:"mock_user",
          activo:true,expires_at:new Date(Date.now()+3600000).toISOString()}]);
      }
      if(u.pathname==="/rest/v1/users") {
        return fakeReply([{id:"mock_user",activo:true,es_admin:role==="admin"}]);
      }
      if(u.pathname==="/rest/v1/apd_daily_province_summary") {
        return fakeReply(historyData,historyStatus);
      }
      throw Error("Unexpected fake request path: " + u.pathname);
    };
    const env=(enabled)=>({
      APD_DAILY_HISTORY_READ_ENABLED:enabled,
      SUPABASE_URL:"https://fake-supabase.invalid",
      SUPABASE_SERVICE_ROLE_KEY:KEY
    });
    const send=async(enabled,opts={})=>{
      const headers=opts.token?{Authorization:"Bearer mock_token"}:{};
      const req=new Request(URL+(opts.query||""),{method:opts.method||"GET",headers});
      const res=await worker.fetch(req,env(enabled),{});
      return {res,json:await res.json()};
    };

    const disabled=await send(undefined,{token:true});
    assert.equal(disabled.res.status,404);
    assert.deepEqual(calls,[],"disabled feature must not fetch session or history");

    const noBearer=await send("true");
    assert.equal(noBearer.res.status,401);
    assert.deepEqual(calls,[],"without bearer must not query database");

    role="regular";
    const regular=await send("true",{token:true});
    assert.equal(regular.res.status,403);
    assert.deepEqual(calls,["/rest/v1/sessions","/rest/v1/users"]);
    calls=[];

    role="admin";
    const admin=await send("true",{token:true});
    assert.equal(admin.res.status,200,JSON.stringify(admin.json));
    assert.equal(admin.json.total_dates,1);
    assert.equal(admin.json.comparable,false);
    assert.equal(admin.json.dates[0].offers_total,3);
    assert.equal(admin.res.headers.get("Cache-Control"),"no-store");
    assert.deepEqual(calls,[
      "/rest/v1/sessions","/rest/v1/users","/rest/v1/apd_daily_province_summary"
    ]);
    calls=[];

    const invalid=await send("true",{token:true,query:"?limit=999"});
    assert.equal(invalid.res.status,400);
    assert.deepEqual(calls,["/rest/v1/sessions","/rest/v1/users"]);
    calls=[];

    historyStatus=404;
    historyData={message:"table does not exist",secret:KEY};
    const missing=await send("true",{token:true});
    assert.equal(missing.res.status,503);
    assert.equal(missing.json.error,"Historico no disponible");
    assert.ok(!JSON.stringify(missing.json).includes(KEY));
  } finally {
    globalThis.fetch=oldFetch;
    rmSync(tmp,{recursive:true,force:true});
  }
});

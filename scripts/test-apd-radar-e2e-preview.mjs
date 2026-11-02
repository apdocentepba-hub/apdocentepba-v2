/* Offline E2E of compiled Worker + browser radar, with ALL external calls stubbed.
 * Run node --test scripts/test-apd-radar-e2e-preview.mjs. No real credentials/network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {buildPaginatedProvinciaPreview} from "./build-apd-provincia-paginated-preview.mjs";

const LIVE=readFileSync("worker-live/worker_hotfix.js","utf8");
const HOOK=readFileSync("worker-live/apd_provincia_summary_pagination_hook.mjs","utf8");
const RADAR=readFileSync("candidates/radar_provincia_live_20261102.js","utf8");
const now=Date.now(), finished=new Date(now-60000).toISOString();
const started=new Date(now-180000).toISOString();
const STATE={scope:"PROVINCIA_FULL",status:"finished",mode:"current_published",
  total_districts:137,districts_completed:137,offers_processed:2609,
  started_at:started,finished_at:finished,district_index:137,notes:{completed_scan_date:"2026-11-02"}};
const OFFERS=Array.from({length:2609},(_,i)=>({
  source_offer_key:"offer-"+String(i).padStart(6,"0"),
  idoferta:String(i),iddetalle:String(i),estado:"PUBLICADA",
  distrito:i%2?"AVELLANEDA":"QUILMES",escuela:"ENSAYO",
  cargo:"INFORMATICA",area:"EDUCACION TECNICA",turno:"M",
  first_seen_at:started,last_seen_at:new Date(now-120000).toISOString(),
  times_seen:1,state_changes:0
}));
const API="https://worker-preview.invalid";
const DB="https://fake-supabase.invalid";
function mockJson(data,status=200){
 return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
}
function e2eBrowser(worker, env){
 class Node {
  constructor(id=""){this.id=id;this.dataset={};this.children=[];this.listeners={};this.textContent="";this.disabled=false;}
  appendChild(e){this.children.push(e);}
  replaceChildren(...xs){this.children=xs;}
  addEventListener(type,fn){this.listeners[type]=fn;}
 }
 const nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);}
 node("panel-content").insertAdjacentHTML=(_position,html)=>{
  for(const m of html.matchAll(/id="([^"]+)"/g))node(m[1]);
 };
 const document={readyState:"complete",getElementById:id=>nodes.get(id)||null,
  createElement:()=>new Node(),head:{appendChild(){}}};
 const window={};
 const context={
  window,document,URL,Date,Intl,AbortController,console,
  fetch:async(url,opts)=>{
    assert.equal(url,API+"/api/provincia/backfill-status");
    assert.equal(opts.method,"GET");
    assert.equal(opts.credentials,"omit");
    return worker.fetch(new Request(url,{method:opts.method}),env,{});
  }
 };
 vm.runInNewContext("const API_URL = "+JSON.stringify(API)+";\n"+RADAR,
  context,{timeout:2000,filename:"radar-preview.js"});
 return {window,node};
}

test("one compiled Worker returns 2609 via six PostgREST pages and browser shows only certified scan count",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"apd-radar-e2e-"));
 const realFetch=globalThis.fetch;
 try {
  const file=join(dir,"worker-preview.mjs");
  writeFileSync(file,buildPaginatedProvinciaPreview(LIVE,HOOK),"utf8");
  const worker=(await import(pathToFileURL(file).href)).default;
  assert.equal(typeof worker.fetch,"function");
  const calls=[];
  let short=false,duplicated=false,badState=false;
  globalThis.fetch=async(input,options={})=>{
    const u=new URL(input instanceof Request?input.url:String(input));
    assert.equal(u.origin,DB,"Unexpected external destination");
    assert.equal(options.method,"GET","No production-changing methods permitted");
    calls.push(u);
    if(u.pathname==="/rest/v1/apd_global_scan_state"){
      return mockJson([badState?{...STATE,status:"running"}:STATE]);
    }
    if(u.pathname==="/rest/v1/apd_ofertas_global_current"){
      const offset=Number(u.searchParams.get("offset")||0);
      const limit=Number(u.searchParams.get("limit")||1000);
      assert.equal(limit,500,"Never permit a 1000+ row page");
      assert.match(u.searchParams.get("order")||"",/source_offer_key\.asc/);
      let rows=OFFERS.slice(offset,Math.min(offset+limit,short?1000:2609));
      if(duplicated&&offset===500)rows=rows.map((x,i)=>i===0?OFFERS[0]:x);
      return mockJson(rows);
    }
    throw Error("Unexpected DB path: "+u.pathname);
  };
  const env={SUPABASE_URL:DB,SUPABASE_SERVICE_ROLE_KEY:"TEST_ONLY",
    APD_PROVINCIA_PAGINATION_ENABLED:"true"};
  const request=()=>new Request(API+"/api/provincia/resumen?days=30");
  const response=await worker.fetch(request(),env,{});
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result).slice(0,900));
  assert.equal(result.verified_complete_scan,true);
  assert.equal(result.total_ofertas,2609);
  assert.equal(result.scan_state.districts_completed,137);
  assert.equal(calls.filter(c=>c.pathname.endsWith("apd_ofertas_global_current")).length,6);
  assert.equal(calls.filter(c=>c.pathname.endsWith("apd_global_scan_state")).length,2);
  assert.equal(response.headers.get("Cache-Control"),"no-store");

  const ui=e2eBrowser(worker,env);
  await ui.window.cargarExtrasProvincia();
  assert.equal(ui.node("apd-radar-vivo-title").textContent,"Último barrido provincial completado");
  assert.ok(ui.node("apd-radar-vivo-stats").children.some(c=>c.textContent.includes("2.609")));
  assert.match(ui.node("apd-radar-vivo-detail").textContent,/verificá|confirmación de disponibilidad/);

  calls.length=0;short=true;
  const incomplete=await worker.fetch(request(),env,{});
  assert.equal(incomplete.status,503);
  assert.equal((await incomplete.json()).error,"Resumen provincial no verificable");
  short=false;duplicated=true;
  assert.equal((await worker.fetch(request(),env,{})).status,503);
  duplicated=false;badState=true;
  const scanError=await worker.fetch(request(),env,{});
  assert.equal(scanError.status,503);
 } finally {
  globalThis.fetch=realFetch;
  rmSync(dir,{recursive:true,force:true});
 }
});

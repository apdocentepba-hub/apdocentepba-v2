import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync("candidates/radar_provincia_live_20261102.js", "utf8");
const API = "https://api-test.apd.invalid";
class FakeNode {
  constructor(id = "") {
    this.id = id; this.children = []; this.dataset = {}; this.listeners = {};
    this.textContent = ""; this.disabled = false;
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  appendChild(node) { this.children.push(node); }
  replaceChildren(...children) { this.children = children; }
}
function setup(fetcher, withApi=true, existingRadar=false) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, new FakeNode(id));
    return nodes.get(id);
  }
  const root = node("panel-content");
  root.insertAdjacentHTML = (_position, html) => {
    for (const found of html.matchAll(/id="([^"]+)"/g)) node(found[1]);
  };
  if (existingRadar) {
    const nativeRadar = node("panel-radar-provincia");
    node("btn-refresh-provincia");
    nativeRadar.insertAdjacentHTML = (_position, html) => {
      for (const found of html.matchAll(/id="([^"]+)"/g)) node(found[1]);
    };
  }
  const document = {
    readyState:"complete",
    head: {appendChild() {}},
    getElementById: id => nodes.get(id) || null,
    createElement: () => new FakeNode(),
    addEventListener() { throw Error("should boot immediately"); }
  };
  const window = {};
  const sandbox = {document,window,fetch:fetcher,Date,Intl,URL,AbortController,console};
  if (withApi) sandbox.API_URL = API;
  vm.runInNewContext(SOURCE,sandbox,{filename:"radar-vivo-candidate.js",timeout:1000});
  return {window,node,nodes,root};
}
function payload(overrides={}) {
  return {ok:true,status:"finished",total_districts:137,districts_completed:137,
    offers_processed:2609,finished_at:new Date().toISOString(),...overrides};
}
function ok(data) {return {ok:true,json:async()=>data};}
function stats(ui) {return ui.node("apd-radar-vivo-stats").children.map(x=>x.textContent);}
const failFetch=async()=>{throw Error("Fake endpoint unreachable");};

test("candidate is not wired to production pages and contains no frozen statistics",()=>{
 assert.doesNotMatch(SOURCE,/SNAPSHOT\s*=|2026-04-06|155984|16766|8014|5095|2679/);
 assert.doesNotMatch(SOURCE,/\.innerHTML\s*=|POST|PUT|PATCH|DELETE/);
 assert.match(SOURCE,/\/api\/provincia\/backfill-status/);
 assert.match(SOURCE,/no-store/);
 assert.match(SOURCE,/NO es el total de ofertas publicadas actualmente en ABC/);
 assert.doesNotMatch(SOURCE,/Último barrido provincial completado/);
});
test("complete scan reflects server counts, source date and explicit ABC disclaimer", async()=>{
 const calls=[];
 const ui=setup(async(url,opts)=>{calls.push({url,opts});return ok(payload());});
 await ui.window.cargarExtrasProvincia();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,API+"/api/provincia/backfill-status");
 assert.equal(calls[0].opts.method,"GET");
 assert.equal(calls[0].opts.credentials,"omit");
 assert.equal(calls[0].opts.cache,"no-store");
 assert.match(ui.node("apd-radar-vivo-title").textContent,/no es en tiempo real/);
 assert.ok(stats(ui).includes("Distritos: 137/137"));
 assert.ok(stats(ui).includes("Publicadas capturadas: 2.609"));
 assert.match(ui.node("apd-radar-vivo-detail").textContent,/no es un conteo oficial en tiempo real/);
 assert.equal(ui.node("btn-refresh-radar-combinado").disabled,false);
});
test("stale scan is labeled outdated without pretending offers are current",async()=>{
 const ts=new Date(Date.now()-48*60*60*1000).toISOString();
 const ui=setup(async()=>ok(payload({finished_at:ts})));
 await ui.window.cargarExtrasProvincia();
 assert.match(ui.node("apd-radar-vivo-title").textContent,/Captura anterior/);
 assert.match(ui.node("apd-radar-vivo-detail").textContent,/más de 6 horas/);
 assert.ok(stats(ui).includes("Publicadas capturadas: 2.609"));
});
test("running/error/partial scans never print a final offer count",async()=>{
 for(const status of ["running","error","finished"]){
   const ui=setup(async()=>ok(payload({status,districts_completed:63})));
   await ui.window.cargarExtrasProvincia();
   assert.ok(stats(ui).every(x=>!x.includes("Publicadas capturadas")),status);
   assert.ok(!ui.node("apd-radar-vivo-title").textContent.includes("no es en tiempo real"),status);
 }
});
test("invalid or failed requests clear stale counts and don't invent zeros", async()=>{
 let count=0;
 const ui=setup(async()=>{count++;return count===1?ok(payload()):Promise.reject(Error("secret SQL error"));});
 await ui.window.cargarExtrasProvincia();
 assert.ok(stats(ui).some(x=>x.includes("2.609")));
 await ui.window.cargarExtrasProvincia();
 assert.equal(stats(ui).length,0);
 assert.match(ui.node("apd-radar-vivo-title").textContent,/No se pudo verificar/);
 assert.doesNotMatch(ui.node("apd-radar-vivo-detail").textContent,/secret SQL error/);
});
test("wrong server shape and missing canonical API fail closed",async()=>{
 for(const item of [null,{},payload({offers_processed:"2609"}),payload({total_districts:0}),
    payload({finished_at:"not-a-date"}),payload({status:"finished",districts_completed:5})]) {
   const ui=setup(async()=>ok(item));
   await ui.window.cargarExtrasProvincia();
   assert.equal(stats(ui).filter(x=>x.includes("Publicadas capturadas")).length,0);
 }
 const noApi=setup(failFetch,false);
 await noApi.window.cargarExtrasProvincia();
 assert.match(noApi.node("apd-radar-vivo-title").textContent,/No se pudo verificar/);
});
test("late response cannot overwrite the newest scan result",async()=>{
 const requests=[];
 const ui=setup((_url,opts)=>new Promise(resolve=>requests.push({resolve,opts})));
 const first=ui.window.cargarExtrasProvincia();
 const second=ui.window.cargarExtrasProvincia();
 assert.equal(requests.length,2);
 assert.equal(requests[0].opts.signal.aborted,true);
 requests[1].resolve(ok(payload({offers_processed:2609})));
 await second;
 requests[0].resolve(ok(payload({offers_processed:99})));
 await first;
 assert.ok(stats(ui).includes("Publicadas capturadas: 2.609"));
 assert.equal(stats(ui).some(x=>x.includes("99")),false);
 assert.equal(ui.node("btn-refresh-radar-combinado").disabled,false);
});
test("refresh button genuinely fetches again without duplicate handlers",async()=>{
 let requests=0;
 const ui=setup(async()=>{requests++;return ok(payload());});
 await ui.window.cargarExtrasProvincia();
 await ui.window.cargarExtrasProvincia();
 assert.equal(requests,2);
 assert.equal(typeof ui.node("btn-refresh-radar-combinado").listeners.click,"function");
 await ui.node("btn-refresh-radar-combinado").listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,3);
});

test("existing public radar card is reused; does not create a duplicate card",async()=>{
 let calls=0;
 const ui=setup(async()=>{calls++;return ok(payload());},true,true);
 await ui.window.cargarExtrasProvincia();
 assert.equal(calls,1);
 assert.equal(ui.nodes.has("panel-radar-combinado-card"),false);
 assert.equal(ui.node("btn-refresh-provincia").textContent,"Revisar última captura");
 assert.ok(stats(ui).includes("Publicadas capturadas: 2.609"));
 assert.equal(typeof ui.node("btn-refresh-provincia").listeners.click,"function");
 ui.node("btn-refresh-provincia").listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,2);
 await ui.window.cargarExtrasProvincia();
 assert.equal(calls,3);
 assert.equal(ui.nodes.has("panel-radar-combinado-card"),false);
});
test("existing index exposes just one primary radar card",()=>{
 const html=readFileSync("index.html","utf8");
 assert.equal((html.match(/id="panel-radar-provincia"/g)||[]).length,1);
 assert.equal((html.match(/id="btn-refresh-provincia"/g)||[]).length,1);
 assert.ok(html.includes('radar_provincia_patch_semaforo.js?v=2'));
});

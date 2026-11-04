import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const src=readFileSync("app_v2.js","utf8");
const renderMarker="function renderAlertasAPD(alertas) {";
const begin=src.indexOf(renderMarker),end=src.indexOf("\nfunction moverAlerta(",begin);
assert.ok(begin>0&&end>begin,"Production renderAlertasAPD() not found");
const renderer=src.slice(begin,end);
function run(status,received){
 const state={items:[{id:"STALE_FAKE_OFFER"}],index:4};
 let renderCalls=0;
 const ctx={
  planActual:{access_active:status},
  alertasState:state,
  filtrarAlertasVigentes:rows=>rows.filter(r=>r?.id!=="EXPIRED_FAKE_OFFER"),
  renderAlertaActual:()=>{renderCalls++;}
 };
 vm.runInNewContext(renderer,ctx,{timeout:2000});
 ctx.renderAlertasAPD(received);
 return {items:state.items,index:state.index,renderCalls};
}
test("only explicit confirmed active plan can render personal alerts",()=>{
 const ok=run(true,[{id:"ACTIVE_FAKE_OFFER"},{id:"EXPIRED_FAKE_OFFER"}]);
 assert.equal(ok.items.length,1);
 assert.equal(ok.items[0].id,"ACTIVE_FAKE_OFFER");
 assert.equal(ok.renderCalls,1);
 assert.equal(ok.index,0);
});
for(const status of [false,null,undefined,"true","ACTIVE",0]){
 test("expired/unverified/faulty access flag hides offers: "+String(status),()=>{
  const result=run(status,[{id:"SYNTHETIC_PRIVATE_OFFER"}]);
  assert.equal(result.items.length,0,"No offer details for unverified plans");
  assert.equal(result.index,0);
  assert.equal(result.renderCalls,1);
 });
}
test("plan error and actual expiry have separate messages without a false zero",()=>{
 const idx=src.indexOf("function renderAlertaActual() {");
 const next=src.indexOf("\nfunction ",idx+8);
 assert.ok(idx>0&&next>idx);
 const render=src.slice(idx,next);
 assert.match(render,/const accessUnverified = planActual\?\.access_active !== true && !needsRenewal/);
 assert.match(render,/No pudimos verificar tu plan/);
 assert.match(render,/Por seguridad, las alertas quedan ocultas/);
 assert.match(render,/Tu plan ya no está vigente/);
 assert.ok(render.indexOf("if (accessUnverified)")<render.indexOf("if (!total)"));
 assert.ok(render.indexOf("if (needsRenewal)")<render.indexOf("if (accessUnverified)"));
});
test("new load clears alerts before awaiting plan, without touching saved preferences",()=>{
 const idx=src.indexOf("async function cargarDashboard() {");
 const next=src.indexOf("\nfunction renderDashboard(",idx);
 assert.ok(idx>0&&next>idx);
 const body=src.slice(idx,next);
 assert.match(body,/previousAlerts\.textContent = "Verificando acceso y alertas/);
 assert.match(body,/alertasState\.items = \[\];\s*alertasState\.index = 0/);
 assert.ok(body.indexOf('previousAlerts.textContent =')<body.indexOf('const alertasPromise ='));
 assert.match(body,/planActual\?\.access_active !== true/);
 assert.doesNotMatch(body,/guardarPreferenciasServidor\s*\(/);
 assert.doesNotMatch(body,/supabaseInsert\s*\(/);
});

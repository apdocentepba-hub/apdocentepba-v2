import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app_v2.js', 'utf8');
function section(from, until) {
  const a=source.indexOf(from), b=source.indexOf(until, a + from.length);
  assert.ok(a>=0 && b>a, 'Missing bounded frontend function: '+from);
  return source.slice(a,b);
}

const fetchAlerts=section('async function obtenerMisAlertas(userId)', '\nfunction renderAlertasAPD(');
const alertPanel=section('function renderAlertasAPD(alertas)', '\nfunction moverAlerta(');
const renderCurrent=section('function renderAlertaActual()', '\nfunction alertaRow(');

test('core alert loader does not depend on monkeypatch for Bearer authentication',async()=>{
  assert.match(fetchAlerts,/await workerFetchJson\(/);
  assert.doesNotMatch(fetchAlerts,/await fetch\(/);
  const calls=[];
  const run=vm.runInNewContext(fetchAlerts+'\nobtenerMisAlertas',{
    workerFetchJson:async path=>{
      calls.push(path);
      return {ok:true,resultados:[{id:'approved-offer'}]};
    },
    filtrarAlertasVigentes:rows=>rows,
    encodeURIComponent
  });
  const result=await run('user-uuid');
  assert.equal(result.length,1);
  assert.equal(result[0].id,'approved-offer');
  assert.deepEqual(calls,['/api/mis-alertas?user_id=user-uuid']);
});

function harness(accessActive,items=[{id:'previous-offer',secret:'ALERTA-PREVIA'}]){
  const badge={textContent:'',classList:{add(){},remove(){}}};
  const button={callback:null,addEventListener(event,fn){if(event==='click')this.callback=fn;}};
  const box={innerHTML:'',querySelector:id=>id==='#apd-renovar-plan-desde-alertas'?button:null};
  let clickedPlan=0, scrolledPlan=0;
  const planTab={click(){clickedPlan++;}};
  const document={
    getElementById:id=>id==='panel-alertas'?box:id==='alertas-badge'?badge:
      id==='panel-plan'?{scrollIntoView(){scrolledPlan++;}}:null,
    querySelector:sel=>sel.includes('data-top-tab-key="plan"') ?planTab:null
  };
  const alertasState={items:[],index:0};
  const context={document,alertasState,planActual: accessActive===undefined?{}:{access_active:accessActive},
    filtrarAlertasVigentes:x=>x};
  const code=alertPanel+'\n'+renderCurrent+'\n({renderAlertasAPD,renderAlertaActual})';
  const fn=vm.runInNewContext(code,context);
  fn.renderAlertasAPD(items);
  return {box,badge,button,alertasState,clickedPlan:()=>clickedPlan,scrolledPlan:()=>scrolledPlan,
    context,functions:fn};
}

test('expired plan shows paywall, does not expose cached alerts and opens Plan tab',()=>{
  const h=harness(false);
  assert.equal(h.alertasState.items.length,0);
  assert.match(h.box.innerHTML,/Tu plan ya no está vigente/);
  assert.match(h.box.innerHTML,/Ver planes y activar mi cuenta/);
  assert.doesNotMatch(h.box.innerHTML,/ALERTA-PREVIA/);
  assert.equal(h.badge.textContent,'');
  assert.equal(typeof h.button.callback,'function');
  h.button.callback();
  assert.equal(h.clickedPlan(),1);
});

test('active plan including admin-approved exception does not see paywall',()=>{
  const h=harness(true,[]);
  assert.match(h.box.innerHTML,/No hay alertas compatibles todavía/);
  assert.doesNotMatch(h.box.innerHTML,/Tu plan ya no está vigente/);
});

test('unknown entitlement during network failure is not incorrectly marked expired',()=>{
  const h=harness(undefined,[]);
  assert.match(h.box.innerHTML,/No hay alertas compatibles todavía/);
  assert.doesNotMatch(h.box.innerHTML,/Ver planes y activar mi cuenta/);
});

test('expired status blocks even stale alerts already resident in memory',()=>{
  const h=harness(true,[]);
  h.context.alertasState.items=[{id:'stale'}];
  h.context.planActual.access_active=false;
  h.functions.renderAlertaActual();
  assert.match(h.box.innerHTML,/Tu plan ya no está vigente/);
  assert.doesNotMatch(h.box.innerHTML,/Oferta 1 de 1/);
});

test('payment is not triggered by merely viewing the paywall',()=>{
  const h=harness(false,[]);
  assert.equal(h.clickedPlan(),0);
  assert.equal(h.scrolledPlan(),0);
});

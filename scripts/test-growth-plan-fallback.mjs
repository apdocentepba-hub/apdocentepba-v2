import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
function extract(a,b){
  const start=app.indexOf(a),end=app.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start, 'No se encontró la sección '+a);
  return app.slice(start,end);
}
const funcs=[
  extract('function buildPlanFallback() {','const DISTRITO_INPUT_IDS ='),
  extract('function renderPlanUI(planInfo) {','function planNombreHumano('),
  extract('async function guardarPreferencias(e) {','function buildPreferenciasPayload() {')
].join('\n');

function harness({verified=false,token='fake-session'}={}){
  const calls={ writes:0, dashboards:0, messages:[], html:[], loading:0, restored:0 };
  const hint={textContent:''};
  const ctx=vm.createContext({
    document:{
      getElementById(id){return id==='prefs-plan-hint'?hint:null;},
      querySelector(){return {}}
    },
    obtenerToken(){return token;},
    setHTML(id,value){calls.html.push([id,value]);},
    showMsg(id,message,kind){calls.messages.push({id,message,kind});},
    btnLoad(){calls.loading++;},
    btnRestore(){calls.restored++;},
    buildPreferenciasPayload(){return {distrito_principal:'AVELLANEDA'};},
    async guardarPreferenciasServidor(){calls.writes++; return {ok:true,message:'Preferencias guardadas'};},
    async cargarDashboard(){calls.dashboards++;},
    renderPlanUI() { throw new Error('No debería renderizar el plan si no cambia'); },
    planActual: verified?{verification_failed:false,plan:{code:'PLUS'}}:null
  });
  // The real renderPlanUI overrides the placeholder; it is only called in
  // save when the endpoint returns new plan information, which our fixture omits.
  vm.runInContext(funcs,ctx);
  if(!verified)ctx.planActual=ctx.buildPlanFallback();
  return {ctx,calls,hint};
}

test('la falta de respuesta del Worker no se presenta como Plus gratis',()=>{
  const {ctx}=harness();
  const fallback=ctx.buildPlanFallback();
  assert.equal(fallback.verification_failed,true);
  assert.equal(fallback.ok,false);
  assert.equal(fallback.plan.price_ars,null);
});

test('el panel informa la imposibilidad de verificar el plan y no inventa beneficios',()=>{
  const {ctx,calls,hint}=harness();
  ctx.renderPlanUI(ctx.planActual);
  assert.equal(calls.html.length,1);
  assert.match(calls.html[0][1],/No pudimos verificar tu plan/);
  assert.doesNotMatch(calls.html[0][1],/Plan Plus|Gratis|Hasta \d+/);
  assert.match(hint.textContent,/sin verificar/);
});

test('el guardado se bloquea antes de truncar preferencias cuando falla el plan',async()=>{
  const {ctx,calls}=harness();
  await ctx.guardarPreferencias({preventDefault(){}});
  assert.equal(calls.writes,0);
  assert.equal(calls.dashboards,0);
  assert.equal(calls.loading,0);
  assert.match(calls.messages.at(-1).message,/No guardamos cambios/);
});

test('el guardado continúa cuando el plan fue verificado',async()=>{
  const {ctx,calls}=harness({verified:true});
  await ctx.guardarPreferencias({preventDefault(){},submitter:{}});
  assert.equal(calls.writes,1);
  assert.equal(calls.dashboards,1);
  assert.equal(calls.restored,1);
  assert.ok(calls.messages.some(m=>m.kind==='ok'));
});

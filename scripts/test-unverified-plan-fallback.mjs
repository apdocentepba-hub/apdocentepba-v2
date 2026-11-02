import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('app_v2.js','utf8');
function between(begin,end){const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);assert.ok(a>=0&&b>a,begin);return source.slice(a,b);}
const fallback=vm.runInNewContext(between('function buildPlanFallback() {','const DISTRITO_INPUT_IDS')+'\nbuildPlanFallback()');
test('caída de API no inventa plan gratis ni vencimiento',()=>{
 assert.equal(fallback.ok,false);
 assert.equal(fallback.access_active,null);
 assert.equal(fallback.subscription.source,'fallback_frontend');
 assert.equal(fallback.subscription.status,'unverified');
 assert.equal(fallback.plan.code,'UNVERIFIED');
 assert.equal(fallback.plan.price_ars,null);
 assert.notEqual(fallback.subscription.plan_code,'PLUS');
});
test('filtro visible conserva todos los campos pero no permite una escritura a ciegas',()=>{
 assert.equal(fallback.plan.max_distritos,5);
 assert.equal(fallback.plan.max_cargos,10);
 assert.match(source,/planActual\?\.subscription\?\.source === "fallback_frontend"/);
 const guard=between('async function guardarPreferencias(e) {','function buildPreferenciasPayload()');
 const reject=guard.indexOf('if (planActual?.subscription?.source === "fallback_frontend")');
 const build=guard.indexOf('buildPreferenciasPayload()');
 assert.ok(reject>=0&&build>reject,'no generar payload si el plan es desconocido');
 assert.match(guard,/No pudimos verificar los límites de tu plan/);
});
test('la UI muestra aviso y reintento sin fingir cuotas o canales',()=>{
 const fn=between('function renderPlanUI(planInfo) {','function planNombreHumano(');
 assert.match(fn,/info\.subscription\?\.source === "fallback_frontend"/);
 assert.match(fn,/No pudimos verificar tu plan/);
 assert.match(fn,/apd-retry-plan/);
 assert.match(fn,/prefs-plan-hint/);
 assert.match(fn,/panel-canales/);
 assert.match(fn,/applyPlanFieldVisibility\(info\)/);
 assert.ok(fn.indexOf('if (info.subscription?.source === "fallback_frontend")')<fn.indexOf('const limits = getPlanLimits(info)'));
});
test('los labels no reflejan precio ni nombre falso al perder la conexión',()=>{
 for(const p of ['function planNombreHumano(plan, subscription) {','function planEstadoHumano(subscription, accessActive) {','function planPrecioHumano(plan, subscription) {']){
  const at=source.indexOf(p);assert.ok(at>=0);assert.match(source.slice(at,at+220),/fallback_frontend/);
 }
 const fn=between('function planNombreHumano(plan, subscription) {','function planEstadoHumano(');
 const res=vm.runInNewContext(fn+'\nplanNombreHumano',{});
 assert.equal(res(fallback.plan,fallback.subscription),'Plan sin verificar');
});
test('suscripciones efectivas y paywall permanecen en el mismo código',()=>{
 assert.match(source,/if \(accessActive === false\) return status === "available" \? "Sin plan vigente" : "Vencido"/);
 assert.match(source,/if \(needsRenewal\)/);
 assert.match(source,/renderAlertasAPD\(items\)/);
 assert.match(source,/maxDistritosEmergencia/);
 assert.match(source,/obtenerMiPlan\(token\)/);
});

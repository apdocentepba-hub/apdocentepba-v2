import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync('app_v2.js','utf8');
function extract(from,to){
 const p=app.indexOf(from),q=app.indexOf(to,p+from.length);
 assert.ok(p>=0&&q>p,'No existe bloque '+from);
 return app.slice(p,q);
}
function deferred(){
 let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});
 return {promise,resolve,reject};
}
function env(){
 const alerts=deferred(),events=[],nodes=new Map(),state={token:'userA',planActive:true,delayed:false};
 const el=id=>{
  if(!nodes.has(id))nodes.set(id,{
    textContent:'',className:'',classList:{toggle(){},add(){},remove(){}},
    setAttribute(){},appendChild(child){this.textContent += child.textContent||'';},addEventListener(){},
  });
  return nodes.get(id);
 };
 const ctx=vm.createContext({
  window:{APD_refreshPanelTabs(){},obtenerSessionToken(){return 'bearer';}},
  document:{getElementById:el,createElement(tag){return {tag,textContent:'',appendChild(){},setAttribute(){},addEventListener(){}};}},
  localStorage:{getItem(){return 'bearer';}},
  console:{error(...x){events.push(['error',String(x[0])]);},warn(...x){events.push(['warn',String(x[0])]);}},
  alert(text){events.push(['alert',text]);},Promise,
  obtenerToken(){return state.token;},
  actualizarNav(){events.push(['nav']);},
  mostrarSeccion(x){events.push(['section',x]);},
  setPanelLoading(x){events.push(['loading',x]);},
  async obtenerDocentePorId(){events.push(['profile']);return {id:state.token,ultimo_login:'2026-11-01T08:00:00Z'};},
  async obtenerPreferenciasPorUserId(){events.push(['prefs']);return {user_id:state.token};},
  async obtenerMiPlan(){events.push(['plan']);return {plan:{code:'PLUS'},access_active:state.planActive};},
  async obtenerMisAlertas(){events.push(['alerts']);return alerts.promise;},
  adaptarPreferencias(x){return x;},
  renderDashboard(data){events.push(['render-profile',data.alertas,data.planInfo.access_active]);},
  renderAlertasAPD(items){events.push(['render-carousel',items.length]);},
  renderEstadisticasPanel(count,when,error=false){events.push(['stats',count,error]);},
  cargarPrefsEnFormulario(){events.push(['form']);},
  renderPlanUI(){events.push(['plan-ui']);},
  async cargarHistoricoPanel(){events.push(['history']);return {};},
  async adminCheckAccess(){events.push(['admin']);return false;},
  bindAdminEvents(){events.push(['admin-bind']);},
  workerFetchJson(path,config){events.push(['worker',path,config]);return Promise.resolve({});},
  planActual:{}, dashboardRequestVersion:0,dashboardLoadedOwner:null,
  alertasState:{items:[],index:0},
  buildPlanFallback(){return {plan:{code:'PLUS'},access_active:null};},
  esc(x){return String(x);},fmtFecha(x){return String(x)},setHTML(id,html){el(id).textContent=html;},
  setText(id,value){el(id).textContent=String(value);},
 });
 const block=extract('function sincronizarOfertasPanel(alertasPanel) {','function renderDashboard(data) {');
 vm.runInContext(block,ctx);
 return {ctx,alerts,events,state,nodes};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('perfil y preferencias quedan visibles sin esperar respuesta de alertas',async()=>{
 const f=env();let finished=false;
 const promise=f.ctx.cargarDashboard().then(()=>finished=true);
 await tick();await promise;
 assert.equal(finished,true);
 assert.ok(f.events.some(e=>e[0]==='render-profile'));
 assert.ok(f.events.some(e=>e[0]==='loading'&&e[1]===false));
 assert.equal(f.events.filter(e=>e[0]==='render-carousel').length,0);
 f.alerts.resolve([{idoferta:'a-1',cargo:'Preceptor'}]);await tick();
 assert.ok(f.events.some(e=>e[0]==='render-carousel'&&e[1]===1));
 assert.ok(f.events.some(e=>e[0]==='worker'&&e[1]==='/api/sync-offers'));
});
test('fallo de alertas no significa cero ofertas ni ejecuta sync',async()=>{
 const f=env();await f.ctx.cargarDashboard();
 f.alerts.reject(Error('Worker 502'));await tick();
 assert.ok(f.events.some(e=>e[0]==='stats'&&e[1]===null&&e[2]===true));
 assert.equal(f.events.filter(e=>e[0]==='worker').length,0);
 assert.equal(f.events.filter(e=>e[0]==='render-carousel').length,0);
 assert.match(f.nodes.get('panel-alertas').textContent,/No pudimos verificar/);
});
test('cuenta con plan vencido muestra paywall, no sincroniza ni cambia plan',async()=>{
 const f=env();f.state.planActive=false;await f.ctx.cargarDashboard();
 f.alerts.resolve([{idoferta:'a-1'}]);await tick();
 assert.ok(f.events.some(e=>e[0]==='render-carousel'&&e[1]===0));
 assert.equal(f.events.filter(e=>e[0]==='worker').length,0);
 assert.ok(f.events.some(e=>e[0]==='stats'&&e[1]===null));
});
test('cuenta sin coincidencias verificadas muestra cero real y permite sync',async()=>{
 const f=env();await f.ctx.cargarDashboard();
 f.alerts.resolve([]);await tick();
 assert.ok(f.events.some(e=>e[0]==='render-carousel'&&e[1]===0));
 assert.ok(f.events.some(e=>e[0]==='stats'&&e[1]===0&&e[2]===false));
 assert.ok(f.events.some(e=>e[0]==='worker'&&e[1]==='/api/sync-offers'));
});
test('respuesta tardía de la primera cuenta no se muestra en la segunda',async()=>{
 const a=deferred(),b=deferred(),f=env();let n=0;
 f.ctx.obtenerMisAlertas=()=>{n++;return n===1?a.promise:b.promise;};
 await f.ctx.cargarDashboard();
 f.state.token='userB';
 await f.ctx.cargarDashboard();
 a.resolve([{idoferta:'antiguo'}]);await tick();
 assert.equal(f.events.filter(e=>e[0]==='render-carousel').length,0);
 b.resolve([{idoferta:'nuevo'}]);await tick();
 assert.equal(f.events.filter(e=>e[0]==='render-carousel').length,1);
 assert.equal(f.events.filter(e=>e[0]==='worker').length,1);
});
test('un segundo refresh no permite que el primero sobrescriba alertas',async()=>{
 const a=deferred(),b=deferred(),f=env();let n=0;
 f.ctx.obtenerMisAlertas=()=>++n===1?a.promise:b.promise;
 await f.ctx.cargarDashboard();await f.ctx.cargarDashboard();
 b.resolve([{idoferta:'nuevo'}]);await tick();
 a.resolve([{idoferta:'viejo'}]);await tick();
 assert.equal(f.events.filter(e=>e[0]==='render-carousel').length,1);
});
test('no inventar métricas de lectura y no ocultar todo el panel durante la carga',()=>{
 const render=extract('function renderDashboard(data) {','function renderPlanUI(planInfo) {');
 assert.doesNotMatch(render,/"Vistas"|"Sin ver"|alertas_no_leidas/);
 assert.match(render,/renderEstadisticasPanel/);
 const load=extract('function setPanelLoading(activo) {','function parseFechaAPD(');
 assert.doesNotMatch(load,/classList\.toggle\("hidden", activo\)/);
 assert.match(load,/aria-busy/);
});
test('la autorización administrativa descarta solicitudes de otra sesión',()=>{
 const fn=extract('async function adminCheckAccess(','async function adminLoadResumen(');
 assert.match(fn,/getAdminToken\(\) !== expectedToken/);
 assert.match(fn,/window\.APD_adminAccessConfirmed/);
 const erase=extract('function borrarToken() {','function actualizarNav(');
 assert.match(erase,/dashboardRequestVersion\+\+/);
 assert.match(erase,/alertasState\.items = \[\]/);
});
test('histórico y estadísticas no equiparan falta de capturas con cero ofertas',()=>{
 const history=extract('async function cargarHistoricoPanel(','function sincronizarOfertasPanel(');
 assert.match(history,/obtenerToken\(\) !== userId/);
 const msg=extract('function renderHistoricoAPD(data) {','async function cargarHistoricoPanel(');
 assert.match(msg,/El historial necesita capturas recientes/);
});

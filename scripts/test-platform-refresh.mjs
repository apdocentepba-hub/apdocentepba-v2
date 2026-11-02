import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
const tabs=readFileSync(new URL('../panel_tabs_patch.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../platform_refresh_v1.css',import.meta.url),'utf8');
function block(start,end){
  const from=app.indexOf(start),to=app.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,'Sección esperada: '+start);
  return app.slice(from,to);
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function fixture(){
  const alerts=deferred();
  const events=[], nodes=new Map();
  function node(id){
    if(!nodes.has(id))nodes.set(id,{classList:{add(){},toggle(){},remove(){}},setAttribute(){},textContent:''});
    return nodes.get(id);
  }
  const globals={
    window:{APD_refreshPanelTabs(){},cargarExtrasProvincia:null},
    document:{getElementById:node},
    localStorage:{getItem(){return 'session';}},
    Promise,
    alert(){throw Error('No debe mostrar alerta en carga saludable');},
    console:{log(){},warn(){},error(...v){events.push(['error',String(v[0])]);}},
    obtenerToken(){return 'user-uuid-demo';},
    actualizarNav(){events.push(['nav']);},
    mostrarSeccion(id){events.push(['section',id]);},
    setPanelLoading(active){events.push(['loading',active]);},
    async obtenerDocentePorId(){events.push(['profile_requested']);return {id:'user-uuid-demo',nombre:'Cuenta',email:'example.invalid'};},
    async obtenerPreferenciasPorUserId(){events.push(['prefs_requested']);return {user_id:'user-uuid-demo'};},
    async obtenerMiPlan(){events.push(['plan_requested']);return {plan:{code:'PLUS'},access_active:true};},
    async obtenerMisAlertas(){events.push(['alerts_requested']);return alerts.promise;},
    adaptarPreferencias(x){return x;},
    buildPlanFallback(){return {verification_failed:true};},
    renderDashboard(data){events.push(['profile_rendered',data.alertas]);},
    renderAlertasAPD(items){events.push(['carousel_updated',items.length]);},
    renderResumenEstadistico(total){events.push(['stats',total]);},
    workerFetchJson(path){events.push(['background',path]);return Promise.resolve({});},
    cargarPrefsEnFormulario(){events.push(['form']);},
    renderPlanUI(){events.push(['plan']);},
    async cargarHistoricoPanel(){events.push(['historico']);},
    async adminCheckAccess(){events.push(['admin']);return false;},
    bindAdminEvents(){events.push(['admin_events']);},
    planActual:{},
    alertasState:{items:[],index:0},
    dashboardLoadSequence:0,
    dashboardLoadedOwner:null
  };
  const context=vm.createContext(globals);
  vm.runInContext(block('async function cargarDashboard() {','function renderResumenEstadistico('),context);
  return {context,alerts,events,nodes};
}
test('el perfil se pinta antes de que se resuelva la consulta de alertas',async()=>{
  const f=fixture();
  let finished=false;
  const pending=f.context.cargarDashboard().then(()=>{finished=true;});
  await new Promise(r=>setImmediate(r));
  assert.equal(finished,true,'La carga principal no debe aguardar las alertas');
  assert.ok(f.events.some(e=>e[0]==='profile_rendered'));
  assert.ok(!f.events.some(e=>e[0]==='carousel_updated'));
  assert.ok(f.events.some(e=>e[0]==='loading'&&e[1]===false));
  f.alerts.resolve([{id:123}]);
  await pending;
  await new Promise(r=>setImmediate(r));
  assert.ok(f.events.some(e=>e[0]==='carousel_updated'&&e[1]===1));
  assert.ok(f.events.some(e=>e[0]==='stats'&&e[1]===1));
});
test('la carga no invoca sync antes de tener alertas verificadas',async()=>{
  const f=fixture();
  await f.context.cargarDashboard();
  assert.ok(!f.events.some(e=>e[0]==='background'&&e[1]==='/api/sync-offers'));
  f.alerts.resolve([]);
  await new Promise(r=>setImmediate(r));
  assert.ok(f.events.some(e=>e[0]==='background'&&e[1]==='/api/sync-offers'));
});
test('la carga no bloquea el contenido ya visible con hidden',()=>{
  const code=block('function setPanelLoading(activo) {','function parseFechaAPD(');
  assert.doesNotMatch(code,/panel-content.*classList\.toggle\("hidden"/);
  assert.match(code,/aria-busy/);
  assert.match(code,/panel-loading/);
});
test('las pestañas de administrador exigen autorización del servidor',()=>{
  assert.match(tabs,/window\.APD_adminAccessConfirmed===true/);
  assert.match(app,/adminApiGet\("\/api\/admin\/me"\)/);
  assert.match(app,/getAdminToken\(\) !== expectedToken/);
  assert.match(app,/window\.APD_adminAccessConfirmed = false/);
});
test('el cambio de sesión invalida la carga pendiente y limpia datos previos',()=>{
  assert.match(app,/dashboardLoadedOwner !== token/);
  assert.match(app,/sequence !== dashboardLoadSequence \|\| obtenerToken\(\) !== token/);
  assert.match(app,/function borrarToken\(\)[\s\S]*?dashboardLoadSequence\+\+/);
  assert.match(app,/alertasState\.items = \[\]/);
});
test('el rediseño no modifica el carrusel de alertas',()=>{
  assert.match(page,/platform_refresh_v1\.css\?v=1/);
  assert.match(app,/function renderAlertasAPD\(/);
  assert.match(app,/function moverAlerta\(/);
  assert.match(app,/function renderWindowPreview\(/);
  const activeCss=css.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(activeCss,/\.alerta-[a-z]|#panel-alertas/i);
});
test('no inventa vistas y no inventa cantidades durante la carga',()=>{
  const code=block('function renderResumenEstadistico(count) {','function renderDashboard(');
  assert.match(code,/Ofertas vigentes encontradas/);
  assert.doesNotMatch(code,/Sin ver|Vistas|Math\.random/);
  assert.match(code,/No mostramos cifras estimadas/);
});

test('fallo de red no se disfraza de cero ofertas ni sincroniza una lista vacía',async()=>{
  const f=fixture();
  await f.context.cargarDashboard();
  f.alerts.reject(new Error('servicio temporalmente inaccesible'));
  await new Promise(r=>setImmediate(r));
  assert.match(f.nodes.get('panel-alertas').textContent,/No pudimos verificar tus alertas vigentes/);
  assert.ok(f.events.some(e=>e[0]==='stats'&&e[1]===null));
  assert.ok(!f.events.some(e=>e[0]==='background'&&e[1]==='/api/sync-offers'));
  assert.ok(!f.events.some(e=>e[0]==='carousel_updated'));
});
test('las pestañas privadas desaparecen cuando no está abierto el panel docente',()=>{
  assert.match(tabs,/tabs\?\.classList\.toggle\('hidden',!panelVisible\)/);
  assert.match(css,/body \.apd-top-tabs\.hidden\{display:none!important\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../apd_comparador_panel.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../apd_comparador_panel.css',import.meta.url),'utf8');

test('comparator remains inside the existing authenticated alert card',()=>{
 assert.match(html,/<div id="panel-alertas"/);
 assert.match(html,/id="apd-comparador-panel"[^>]*hidden/);
 assert.match(html,/apd_comparador_panel\.css/);
 assert.doesNotMatch(html,/<script type="module" src="apd_comparador_panel\.mjs/);
 assert.match(html,/import\('\.\/apd_comparador_panel\.mjs\?v=(?:20261109-(?:decision1|mi-jornada1|mi-jornada2|mi-jornada3|mi-jornada4|mi-jornada5)|20261110-home[1234]|20261111-workgeo1|20261111-qa2|20261112-dothour1|20261112-account-home1|20261112-georef-safe1|20261112-schoolref1|20261112-mobility1|20261112-mobility2|20261113-auto1|20261114-signals1|20261124-jornada|20261124-grilla|20261124-modulos|20261124-simulator1|20261124-economics1|20261124-favorites1|20261124-recommend1|20261124-history1|20261124-vacancy1|20261124-account-sync1|20261124-favorite-sync1|20261124-optimizer1|20261124-calendar1|20261124-schedulefix1|20261124-filterux1|20261124-career1)'\)/);
 assert.match(html,/new MutationObserver\(sync\)/);
 assert.match(html,/observer\.observe\(panel,\{childList:true,subtree:false\}\)/);
});
test('comparison happens locally; no storage, network, tokens, or data exports',()=>{
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|Authorization|navigator\.geolocation|indexedDB/i);
 assert.match(ui,/import \{compareOffers\} from '\.\/scripts\/apd-comparador-criterios\.mjs\?v=20261109-decision1'/);
 assert.match(ui,/state\.selected\.clear\(\)/);
});
test('access gated by active authenticated plan and reset when session changes',()=>{
 assert.match(html,/typeof dashboardLoadedOwner==='string'/);
 assert.match(html,/owner!==previousOwner/);
 assert.match(html,/window\.APD_comparatorReset\?\.\(\)/);
 assert.match(html,/planActual\?\.access_active===true/);
 assert.match(html,/window\.APD_comparatorRefresh\(\{offers,index,enabled:true,planInfo:planActual,favoriteMode:accountFavoritesReleaseEnabled,favoriteClient:accountFavoriteClient,historyContext:\{/);
 assert.match(html,/isCurrent:\(\)=>dashboardLoadedOwner===owner&&obtenerToken\(\)===owner&&readBearer\(\)===bearer&&planActual\?\.access_active===true/);
 assert.match(ui,/if\(!entitled\|\|!enabled\)clearPersonalHistory\(\)/);
 assert.match(ui,/hasInsignePlannerAccess\(planInfo\)/);
 assert.match(ui,/if\(!entitled\)clearPrivatePlanner\(\)/);
 assert.match(ui,/state\.privatePlannerAllowed\?loadPrivatePlanner\(\)/);
 assert.doesNotMatch(app,/APD_comparatorRefresh|apd_comparador_panel/);
});
test('selection never uses array index or missing ID as official identity',()=>{
 assert.match(ui,/offer\?\.source_offer_key/);
 assert.match(ui,/offer\?\.iddetalle/);
 assert.match(ui,/btn\.disabled=!key/);
 assert.match(ui,/const max=5/);
 assert.match(ui,/if\(state\.selected\.size>=max\)/);
 assert.doesNotMatch(ui,/getCurrentPosition\(/);
});
test('new UI is responsive and all data labels are DOM text, not raw HTML',()=>{
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(ui,/el\.textContent=String\(text\)/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.match(ui,/root\.replaceChildren\(\)/);
 assert.match(ui,/aria-pressed/);
});


test('comparison is findable and shows side-by-side differences without PID inference',()=>{
 assert.match(ui,/function focusComparison\(\)/);
 assert.match(ui,/Ver comparación \('/);
 assert.match(ui,/beforeCount===1&&state\.selected\.size===2/);
 assert.match(ui,/dialog\.showModal/);
 assert.match(ui,/document\.body\.appendChild\(dialog\)/);
 assert.match(ui,/closeComparisonDialog\(\)/);
 assert.match(ui,/Comparación lado a lado/);
 assert.match(ui,/class.*apd-comparator-table-scroll|apd-comparator-table-scroll/);
 assert.match(ui,/apd-comparator-diff/);
 assert.match(ui,/Sin información PID/);
 assert.match(css,/#apd-comparador-panel\{scroll-margin-top/);
 assert.match(css,/\.apd-comparator-table-scroll\{/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/#panel-alertas \.alerta-row\{/);
});

test('decision table reads only already visible applicant summaries with strict isolation',()=>{
 assert.match(ui,/function captureVisibleApplicants\(\)/);
 assert.match(ui,/function readApplicantSummaries\(offers\)/);
 assert.match(ui,/document\.querySelector\('#panel-alertas \.alerta-main-card #alerta-postulantes-meta'\)/);
 assert.match(ui,/observedApplicants\.clear\(\)/);
 assert.match(ui,/applicantObserver\?\.disconnect\(\)/);
 assert.match(ui,/Postulantes visibles/);
 assert.match(ui,/Días y horarios/);
 assert.match(ui,/Diferencia de puntos/);
 assert.match(ui,/Mostrar todos los datos/);
 assert.match(ui,/Consultá la ficha para cargar/);
 const read=ui.split('function captureVisibleApplicants() {')[1]
  ?.split('function refresh(')[0];
 assert.ok(read);
 assert.doesNotMatch(read,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|Authorization/);
 assert.doesNotMatch(app,/APD_readCachedApplicantsForComparison/);
});

test('ABC school-to-school distance is visibly distinct from the saved home distance',()=>{
 assert.ok(ui.includes("Desde escuela de referencia ('+schoolOrigin+')"));
 assert.ok(ui.includes("'0 km (misma escuela)'"));
 assert.ok(ui.includes("schoolOrigin=state.anchor"));
 assert.ok(ui.includes("Desde mi domicilio"));
 assert.ok(!ui.includes("['Distancia desde referencia'"));
});

test('Insigne mobility feature is gated by official ABC schools and never reads device GPS',()=>{
 assert.match(ui,/createMobilitySection/);
 assert.match(ui,/state.privatePlannerAllowed&&state.geoRequested&&!state.geoWorking/);
 assert.doesNotMatch(ui,/navigator.geolocation|getCurrentPosition/);
 const mobility=fs.readFileSync(new URL('./apd-mobility-ui.mjs',import.meta.url),'utf8');
 const api=fs.readFileSync(new URL('./apd-multimodal-transport.mjs',import.meta.url),'utf8');
 assert.match(api,/verifiedMobilityPair/);
 assert.match(api,/school.exact_key_match!==true/);
 assert.match(api,/home\?\.source!=='GEOREF_AR_V2'/);
 assert.match(api,/mapsDirectionsUrl/);
 assert.match(api,/Valhalla \/ OpenStreetMap/);
 assert.match(mobility,/Transporte público/);
 assert.match(mobility,/Calcular km en auto/);
 assert.match(mobility,/Calcular km a pie/);
 assert.match(mobility,/Ver líneas de colectivo cercanas/);
 assert.match(mobility,/fetchAmbaBusLinesNear/);
 assert.doesNotMatch(mobility,/localStorage|sessionStorage|navigator\.geolocation|innerHTML/);
});

test('home privacy copy explains account persistence and tab-only deletion',()=>{
 const planner=fs.readFileSync(new URL('./apd-mi-jornada-ui.mjs',import.meta.url),'utf8');
 assert.match(planner,/Georef Argentina recibe la dirección/);
 assert.match(planner,/al servidor /);
 assert.match(planner,/de AlertasAPD para guardarlas en tu cuenta/);
 assert.match(planner,/Borrar datos de esta pestaña no elimina el domicilio/);
 assert.match(planner,/ingresá a Datos personales/);
 assert.doesNotMatch(planner,/ni enviamos el domicilio al servidor/);
 assert.match(planner,/await bridge\.persist\(/);
});

test('saved and verified account home enables automatic ABC lookup and inline mobility',()=>{
 assert.match(ui,/function hasSavedVerifiedHome\(\)/);
 assert.match(ui,/window\.APD_accountHome\?\.ready\?\.\(\)/);
 assert.match(ui,/function maybeAutoVerifySchools\(\)/);
 assert.match(ui,/queueMicrotask\(\(\)=>/);
 assert.match(ui,/verifySchoolDistances\(\{automatic:true\}\)/);
 assert.match(ui,/state\.autoGeoSignature===signature/);
 assert.match(ui,/mobility\.classList\.add\('apd-mobility-inline'\)/);
 assert.match(ui,/maybeAutoVerifySchools\(\);/);
 assert.match(ui,/if\(state\.privatePlannerAllowed\)/);
 assert.doesNotMatch(ui,/navigator\.geolocation|getCurrentPosition/);
});

test('filtro horario conserva solo ofertas verificables que encajan con toda la jornada', async()=>{
 const {runInNewContext}=await import('node:vm');
 const {checkScheduleOverlap}=await import('./apd-mi-jornada-comparador.mjs');
 const window={};
 let profile={jobs:[{school:'Escuela A',days:[1],start:'08:00',end:'12:00'}],travelGapMinutes:30};
 const start=ui.indexOf('window.APD_filterAlertsBySchedule=');
 const end=ui.indexOf('window.APD_renderAlertScheduleControls=',start);
 assert.ok(start>=0&&end>start);
 runInNewContext(ui.slice(start,end),{
  window,checkScheduleOverlap,loadPrivatePlanner:()=>profile,hasInsignePlannerAccess:Boolean
 });
 const offers=[
  {horario:'MARTES 08:00 A 09:00'},
  {horario:'LUNES 09:00 A 11:00'},
  {horario:'LUNES 12:10 A 13:00'},
  {dias_horarios:'LUNES 09:00 A 11:00',horario:'MARTES 09:00 A 11:00'},
  {horario:'A confirmar'}
 ];
 assert.deepEqual(window.APD_filterAlertsBySchedule(offers,true),offers.slice(0,1));
 assert.equal(window.APD_filterAlertsBySchedule(offers,false),null);
 profile={jobs:[]};
 assert.equal(window.APD_filterAlertsBySchedule(offers,true),null);
});

test('la grilla semanal se monta en Mi cuenta aunque no haya ofertas',()=>{
  assert.match(html,/<div class="panel-card span-4"><div class="card-lbl">[^<]*Mi cuenta<\/div><div id="panel-datos-docente">[\s\S]*?<\/div><div id="apd-perfil-horarios"><\/div><section id="apd-perfil-carrera" hidden><\/section><\/div>/);
  assert.equal((html.match(/id="apd-perfil-horarios"/g)||[]).length,1);
  assert.doesNotMatch(app,/<div id="apd-perfil-horarios"/);
  assert.match(html,/app_v2\.js\?v=20&rev=20261124-perfil/);
 assert.match(app,/APD_renderProfileSchedule\?\.\(planInfo\)/);
 assert.match(html,/offers\.length\|\|document\.getElementById\('apd-perfil-horarios'\)/);
 assert.match(ui,/if\(!hasInsignePlannerAccess\(planInfo\)\)\{\s*profileScheduleClient=null;\s*host\.replaceChildren/);
});

test('account overview renders a real text summary and preserves independent actions',async()=>{
 const source=fs.readFileSync(new URL('../account_profile_patch.js',import.meta.url),'utf8');
 const {runInNewContext}=await import('node:vm');
 const box={innerHTML:''};
 const window={renderDashboard:()=>{},obtenerAuthBearer:()=>''};
 runInNewContext(source,{window,document:{getElementById:id=>id==='panel-datos-docente'?box:null,querySelectorAll:()=>[]},localStorage:{getItem:()=>''},console});
 window.renderDashboard({docente:{nombre:'<Test>',apellido:'Docente',email:'example@example.invalid'}});
 assert.match(box.innerHTML,/apd-account-hero/);
 assert.match(box.innerHTML,/&lt;Test&gt;/);
 assert.doesNotMatch(box.innerHTML,/<Test>/);
 assert.match(box.innerHTML,/Editar mis datos/);
 assert.doesNotMatch(box.innerHTML,/id="mi-cuenta-email"/);
 assert.match(box.innerHTML,/<details id="apd-marketing-settings"/);
 assert.match(box.innerHTML,/id="btn-toggle-password"/);
 assert.match(css,/#panel-docente \.panel-card:has\(> #panel-datos-docente\)/);
});

test('account sync release gate enabled after verified backend promotion; opaque client only',()=>{
 assert.match(html,/const accountScheduleReleaseEnabled=true;/);
 assert.match(html,/if\(accountScheduleReleaseEnabled&&!accountScheduleClient&&!scheduleLoading\)/);
 assert.match(html,/window\.APD_renderProfileSchedule\?\.\(planActual,accountScheduleClient,accountScheduleReleaseEnabled\)/);
 assert.match(ui,/createWeeklyScheduleForm\(\{accountClient:profileScheduleClient,accountRequired:profileScheduleRequired,onChanged:/);
 assert.match(ui,/profileScheduleClient=null;/);
});

test('permanent favorites enabled after authenticated live QA',()=>{
 assert.match(html,/const accountFavoritesReleaseEnabled=true;/);
 assert.match(html,/if\(accountFavoritesReleaseEnabled&&!accountFavoriteClient&&!favoriteLoading\)/);
 assert.match(html,/accountFavoriteClient\?\.reset\(\)/);
});

test('account clients use the secure session bearer rather than the user ID',()=>{
 assert.match(html,/window\.obtenerAuthBearer\(\)/);
 assert.equal((html.match(/getToken:\(\)=>[^\n]*\?bearer:null/g)||[]).length,3);
 assert.doesNotMatch(html,/getToken:\(\)=>[^\n]*\?obtenerToken\(\):null/);
});

test('schedule compatibility switch exposes active state and edit shortcut',()=>{
 assert.match(ui,/toggle\.setAttribute\('role','switch'\)/);
 assert.match(ui,/toggle\.setAttribute\('aria-checked',String\(hasJobs&&scheduleFilterActive\)\)/);
 assert.match(ui,/toggle\.disabled=!hasJobs/);
 assert.match(ui,/window\.APD_setAlertScheduleFilter\?\.\(!active\)/);
 assert.match(css,/\.apd-schedule-switch\[aria-checked=true\]/);
});

test('career profile remains release-gated and separate from existing module form',()=>{
 assert.match(html,/const accountCareerReleaseEnabled=false;/);
 assert.match(html,/id="apd-perfil-horarios"><\/div><section id="apd-perfil-carrera" hidden>/);
 assert.match(html,/if\(accountCareerReleaseEnabled&&careerCoordinator\)/);
});

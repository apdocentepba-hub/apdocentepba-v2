// Standalone headless Chromium E2E. Only localhost requests; all offers synthetic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const chromeCmd=['google-chrome','google-chrome-stable','chromium','chromium-browser']
 .find(bin=>spawnSync('which',[bin],{stdio:'ignore'}).status===0);
assert.ok(chromeCmd,'Chromium browser required');
const origin=process.cwd();
const output=path.resolve('tmp/apd-comparator-browser');
mkdirSync(output,{recursive:true});
const profile=mkdtempSync(path.join(tmpdir(),'apd-compare-chrome-'));
const indexSource=readFileSync('index.html','utf8');
const bootstrap=[...indexSource.matchAll(/<script>([\s\S]*?)<\/script>/g)]
 .find(match=>match[1].includes('new MutationObserver(sync)'))?.[1];
assert.ok(bootstrap,'actual dashboard observer bootstrap must be present');
const html=`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/apd_comparador_panel.css">
<style>body{margin:0;padding:16px;font:14px Arial,sans-serif;background:#f5f9ff}
#fixture{max-width:1050px;margin:auto;padding:16px;border-radius:12px;background:white}
#panel-alertas .alerta-actions{display:flex;gap:8px}
.btn{border:1px solid #99b1db;border-radius:9px;padding:8px;background:white}
</style></head><body><div id="fixture">
<h2>Panel de Alertas APD — laboratorio</h2>
<div id="panel-alertas"><article class="alerta-main-card"><div class="alerta-actions"></div></article></div>
<section id="apd-comparador-panel" class="apd-comparator-panel" hidden></section>
</div>
<script>
let dashboardLoadedOwner=null;
let planActual={access_active:false};
window.alertasState={items:[],index:0};
window.__testToken=null;
function obtenerToken(){return window.__testToken;}
window.__wfsRequests=[];
window.__homeGeoRequests=[];
window.__mobilityExternalRequests=[];
window.__geoNetworkDown=false;
window.__holdWFS=false;
window.__heldWFS=[];
window.__realFetch=window.fetch.bind(window);
window.fetch=async (target,opts={})=>{
 const u=new URL(String(target),location.href);
 if(u.hostname==='apis.datos.gob.ar'){
  window.__homeGeoRequests.push({url:u.toString(),method:opts.method,credentials:opts.credentials});
  const places=[
   {calle:{nombre:'RONDEAU'},altura:{valor:319},
    localidad_censal:{nombre:'Wilde'},departamento:{nombre:'Avellaneda'},
    provincia:{nombre:'Buenos Aires'},ubicacion:{lat:-34.7,lon:-58.32}},
   {calle:{nombre:'RONDEAU'},altura:{valor:319},
    localidad_censal:{nombre:'Bahía Blanca'},departamento:{nombre:'Bahía Blanca'},
    provincia:{nombre:'Buenos Aires'},ubicacion:{lat:-38.7,lon:-62.3}}
  ];
  // Real Georef uses 'localidad=Wilde' (not 'localidad_censal=Wilde').
  // Its matching row reports both localidad Wilde and census area Avellaneda.
  const matches=u.searchParams.has('localidad')?[{
   ...places[0],calle:{nombre:'CNL JOSE RONDEAU'},
   localidad:{nombre:'Wilde'},localidad_censal:{nombre:'Avellaneda'}
  }]:u.searchParams.has('departamento')?[{
    ...places[0],localidad_censal:{nombre:'Avellaneda'}
   }]:places;
  const bytes=new TextEncoder().encode(JSON.stringify({
   direcciones:matches,cantidad:matches.length
  }));
  return {ok:true,status:200,headers:{get:()=>String(bytes.byteLength)},
   arrayBuffer:async()=>bytes.buffer};
 }
 if(['valhalla1.openstreetmap.de','services1.arcgis.com'].includes(u.hostname)){
  window.__mobilityExternalRequests.push({host:u.hostname,path:u.pathname,
   method:opts.method,credentials:opts.credentials});
  let payload;
  if(u.hostname==='valhalla1.openstreetmap.de'){
   payload={trip:{summary:{length:12.4,time:1520}}};
  }else{
   const layer=Number(u.pathname.match(/\/(\d+)\/query$/)?.[1]);
   payload={features:layer===2?[{attributes:{LINEA:'33'}}]:[]};
  }
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  return {ok:true,status:200,headers:{get:()=>String(bytes.byteLength)},
   arrayBuffer:async()=>bytes.buffer};
 }
 if(u.hostname!=='mapaescolar.abc.gob.ar')return window.__realFetch(target,opts);
 window.__wfsRequests.push({
  origin:u.origin,filter:u.searchParams.get('CQL_FILTER'),
  credentials:opts.credentials,method:opts.method
 });
 if(window.__geoNetworkDown)throw Error('WFS simulated failure');
 const expression=u.searchParams.get('CQL_FILTER')||'';
 const code=expression.startsWith("clave='")?expression.slice(7,-1):'';
 const points={
  '0005MS0004':[-34.69,-58.33],
  '0085MS0043':[-34.72,-58.35],
  '0005MS0099':[-34.71,-58.34]
 };
 const coords=points[code];
 const features=coords?[{type:'Feature',properties:{
  clave:code,nombre:'Escuela de prueba '+code,
  cue:'060000000',calle:'Calle de prueba',nro:'100',
  latitud:coords[0],longitud:coords[1]
 }}]:[];
 const bytes=new TextEncoder().encode(JSON.stringify({type:'FeatureCollection',features}));
 const reply={ok:true,status:200,headers:{get:()=>String(bytes.byteLength)},
  arrayBuffer:async()=>bytes.buffer};
 if(window.__holdWFS){
  return new Promise(resolve=>window.__heldWFS.push(()=>resolve(reply)));
 }
 return reply;
};
</script>
<script>${bootstrap}</script></body></html>`;
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const paths={
  '/':{type:'text/html',body:html},
  '/apd_comparador_panel.mjs':{type:'text/javascript',body:readFileSync('apd_comparador_panel.mjs')},
  '/apd_offer_school_map_overlay.mjs':{type:'text/javascript',body:readFileSync('apd_offer_school_map_overlay.mjs')},
  '/scripts/apd-comparador-criterios.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-comparador-criterios.mjs')},
  '/scripts/apd-comparador-datos-evaluacion.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-comparador-datos-evaluacion.mjs')},
  '/scripts/apd-mi-jornada-comparador.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-mi-jornada-comparador.mjs')},
  '/scripts/apd-home-georef.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-home-georef.mjs')},
  '/scripts/apd-mi-jornada-ui.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-mi-jornada-ui.mjs')},
  '/scripts/apd-account-home-write-policy.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-account-home-write-policy.mjs')},
  '/scripts/apd-insigne-planner-entitlement.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-insigne-planner-entitlement.mjs')},
  '/scripts/apd-school-geodistance.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-school-geodistance.mjs')},
  '/scripts/apd-multimodal-transport.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-multimodal-transport.mjs')},
  '/scripts/apd-mobility-ui.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-mobility-ui.mjs')},
  '/scripts/apd-amba-bus-routes.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-amba-bus-routes.mjs')},
  '/apd_comparador_panel.css':{type:'text/css',body:readFileSync('apd_comparador_panel.css')}
 };
 if(!paths[pathname]){res.writeHead(404);res.end('Missing');return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',paths[pathname].type+'; charset=utf-8');
 res.end(paths[pathname].body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=spawn(chromeCmd,[
 '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
 '--disable-background-networking','--no-first-run',
 '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:['ignore','ignore','pipe']});
// Preserve only bounded diagnostic output; never print session data or tokens.
let browserStderr='';
browser.stderr?.on('data',chunk=>{
 browserStderr=(browserStderr+String(chunk)).slice(-1600);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map();
async function debugPort(){
 for(let i=0;i<300;i++){
  const file=path.join(profile,'DevToolsActivePort');
  if(existsSync(file))return Number(readFileSync(file,'utf8').split('\n')[0]);
  if(browser.exitCode!==null)throw Error('Chrome unexpectedly closed: '+browserStderr.slice(-500));
  await sleep(100);
 }
 throw Error('Chrome debugging unavailable after 30 s: '+browserStderr.slice(-700));
}
function cdp(method,params={}){
 const id=++seq;
 return new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},13000);
  pending.set(id,{resolve,reject,t});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function js(expression){
 const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
 if(r.exceptionDetails)throw Error('Browser JS: '+JSON.stringify(r.exceptionDetails));
 return r.result.value;
}
async function until(code){
 for(let n=0;n<100;n++) {
  if(await js(code))return;
  await sleep(100);
 }
 throw Error('Page did not load expected comparator module');
}
async function screenshot(name){
 const shot=await cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
 writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
}
const synthetic=Array.from({length:6},(_,i)=>({
 iddetalle:8000+i,idoferta:5000+i,escuela:i%2?'0085MS0043':'0005MS0004',
 distrito:i%2?'QUILMES':'AVELLANEDA',turno:i%2?'Tarde':'Mañana',
 descripcioncargo:i===1?'<img src=x onerror=alert(1)>':'MATEMÁTICA '+i,
 finoferta:i===0?'2035-12-10T10:00:00Z':`2035-12-${String(10+i).padStart(2,'0')}T10:00:00-03:00`,
 pid_compatible:i<2?true:undefined,
 pid_puntaje_total_final:i===0?'38,10':i===1?'45,00':undefined,
 pid_listado:i<2?'oficial':undefined,
 dias_horarios:i===0?'Lunes a Viernes: 7:20HSA 11:50HS':i===1?'Lunes a Viernes: 7:20 a 11:50\u200b':'',
 cursodivision:i===0?'0':i===1?'A':'2 B',
 hsmodulos:i<2?'4':'',revista:i===0?'Suplencia':i===1?'Provisional':'',
 supl_desde:i<2?'2035-11-10T00:00:00Z':'',
 supl_hasta:i===0?'2036-01-01T00:00:00Z':i===1?'2036-02-01T00:00:00Z':'',
 estado:'PUBLICADA'
}));
const results=[];
try{
 const cp=await debugPort();
 const targets=await(await fetch('http://127.0.0.1:'+cp+'/json/list')).json();
 ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
 ws.addEventListener('message',ev=>{
  const msg=JSON.parse(ev.data);if(!msg.id)return;
  const p=pending.get(msg.id);if(!p)return;
  pending.delete(msg.id);clearTimeout(p.t);
  msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result||{});
 });
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 await cdp('Page.enable');await cdp('Runtime.enable');
 for(const width of [390,1280]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  await until('document.readyState==="complete"');
  assert.equal(await js('document.getElementById("apd-comparador-panel").hidden'),true);
  assert.equal(await js('typeof window.APD_comparatorRefresh'),'undefined',
   'Anonymous pages must not load comparator modules');
  assert.equal(await js('typeof window.APD_offerSchoolMapRefresh'),'undefined',
   'Anonymous pages must not load school mapping modules');
  await js(`(()=>{
   window.__offers=${JSON.stringify(synthetic)};
   dashboardLoadedOwner='SYNTHETIC_USER_A';
   window.__testToken='SYNTHETIC_USER_A';
   planActual={ok:true,access_active:true,plan:{code:'INSIGNE'},
    subscription:{plan_code:'INSIGNE',status:'active',source:'mercadopago_checkout'}};
   window.alertasState={items:window.__offers,index:0};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('typeof window.APD_comparatorRefresh==="function" && !document.getElementById("apd-comparador-panel").hidden');
  await until('typeof window.APD_offerSchoolMapRefresh==="function" && !!document.getElementById("apd-map-school-link")');
  assert.equal(await js('document.getElementById("apd-comparador-panel").hidden'),false);
  assert.equal(await js('!!document.querySelector("#apd-comparar-oferta")'),true);
  assert.equal(await js('!!document.querySelector("#apd-comparador-panel .apd-work-planner")'),true,
   'Active Insigne must see private work planner');
  assert.equal(await js('document.querySelector("#apd-comparador-panel .apd-work-planner").open'),false,
   'Optional editor starts collapsed on mobile and desktop');
  assert.equal(await js(`getComputedStyle(document.querySelector(
   '#apd-comparador-panel .apd-work-summary')).minHeight`),'44px');
  // Simulated downgrade of SAME account; basic comparator remains available.
  await js(`(()=>{
   sessionStorage.setItem('apd_comparador_jornada_solo_pestana_v1',
    JSON.stringify({domicile:'DATO PRIVADO FICTICIO',jobs:[]}));
   planActual={ok:true,access_active:true,plan:{code:'PLUS'},
    subscription:{plan_code:'PLUS',status:'active',source:'mercadopago_checkout'}};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('!!document.querySelector("#apd-comparador-panel .apd-comparator-insigne-locked")');
  assert.equal(await js('!!document.querySelector("#apd-comparador-panel .apd-work-planner")'),false,
   'Plus may compare offers but cannot open private work planner');
  assert.equal(await js('sessionStorage.getItem("apd_comparador_jornada_solo_pestana_v1")'),null,
   'Downgrade must wipe domicile from the same browser tab');
  assert.equal(await js('!!document.querySelector("#apd-comparar-oferta")'),true);
  await js(`(()=>{
   planActual={ok:true,access_active:true,plan:{code:'INSIGNE'},
    subscription:{plan_code:'INSIGNE',status:'active',source:'mercadopago_checkout'}};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('!!document.querySelector("#apd-comparador-panel .apd-work-planner")');
  for(let i=0;i<5;i++){
   await js(`(()=>{
    window.alertasState.index=${i};
    document.getElementById('panel-alertas').innerHTML='<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
    return true;
   })()`);
   await until('!!document.getElementById("apd-comparar-oferta")');
   // Simulate the already-rendered summary from the existing card, no GET.
   if(i<2)await js(`(()=>{
    const count=${i===0?25:16};
    const first=${JSON.stringify(i===0?'42,60':'39,00')};
    const holder=document.createElement('div');
    holder.id='alerta-postulantes-meta';
    holder.className='alerta-meta-card';
    const fields=[['Postulantes',String(count)],['Puntaje del primero',first],['Listado del primero','oficial']];
    const grid=document.createElement('div');
    grid.className='alerta-meta-grid';
    for(const [label,value] of fields){
     const item=document.createElement('div');
     item.className='alerta-meta-item';
     const k=document.createElement('span');k.className='alerta-meta-k';k.textContent=label;
     const v=document.createElement('strong');v.className='alerta-meta-v';v.textContent=value;
     item.append(k,v);grid.appendChild(item);
    }
    holder.appendChild(grid);
    document.querySelector('.alerta-main-card').appendChild(holder);
    return true;
   })()`);
   await js('document.getElementById("apd-comparar-oferta").click();true');
   if(i===1){
    await until('!!document.querySelector(".apd-comparator-side-by-side")');
    assert.equal(await js('document.querySelectorAll("#apd-comparador-panel .apd-comparator-table thead th").length'),3);
    assert.equal(await js('document.getElementById("apd-ver-comparacion")?.textContent'),
     'Ver comparación (2)');
    assert.equal(await js('document.querySelectorAll("#apd-ver-comparacion").length'),1,
     'Only one current compare-jump control should exist');
    assert.ok(await js('document.querySelectorAll(".apd-comparator-diff").length>0'),
     'Differences between districts and turns should be highlighted');
    assert.match(await js('document.querySelector(".apd-comparator-side-by-side")?.textContent||""'),
     /Comparación lado a lado/);
    assert.match(await js('document.querySelector(".apd-comparator-side-by-side")?.textContent||""'),
     /Coincide según el panel/);
    assert.equal(await js('document.querySelector(".apd-comparator-head h3")?.tabIndex'),-1);
    // A real user must see a modal, even if the original panel is clipped.
    await until('document.getElementById("apd-comparison-dialog")?.open===true');
    assert.equal(await js('document.querySelectorAll("#apd-comparison-dialog .apd-comparator-table thead th").length'),3);
    assert.ok(await js('document.getElementById("apd-comparison-dialog").getBoundingClientRect().width<=innerWidth'));
    assert.match(await js('document.getElementById("apd-comparison-dialog")?.textContent||""'),/Comparación de 2 ofertas/);
    const bodyText=await js('document.getElementById("apd-comparison-dialog")?.textContent||""');
    assert.match(bodyText,/Diferencias detectadas/);
    assert.equal(await js('document.querySelectorAll("#apd-comparison-dialog .apd-comparator-dialog-geobutton").length'),1,
     'Insigne must be able to request official locations directly from the comparison modal');
    assert.equal(await js('document.querySelector("#apd-comparison-dialog .apd-comparator-dialog-geobutton")?.closest(".apd-comparator-modal-head")!==null'),true,
     'ABC location action stays in the visible header during table scrolling');
    assert.match(bodyText,/Todavía no consultaste la ubicación oficial/,
     'A missing consultation must not be misrepresented as an ABC verification failure');
    const scrollLayout=await js(`(()=>{
     const dialog=document.getElementById('apd-comparison-dialog');
     const body=dialog.querySelector('.apd-comparator-modal-body');
     return {
      dialogOverflow:getComputedStyle(dialog).overflowY,
      bodyOverflow:getComputedStyle(body).overflowY,
      background:getComputedStyle(document.documentElement).overflowY,
      bodyVisible:body.clientHeight>100,
      insideViewport:dialog.getBoundingClientRect().bottom<=innerHeight+2,
      editorInitiallyCollapsed:!dialog.querySelector('.apd-work-planner').open
     };
    })()`);
    assert.equal(scrollLayout.dialogOverflow,'hidden',
     'Dialog must not create a second vertical scrollbar');
    assert.equal(scrollLayout.bodyOverflow,'auto',
     'Comparison content must remain scrollable within a single region');
    assert.equal(scrollLayout.background,'hidden',
     'Underlying page must not scroll while modal is visible');
    assert.equal(scrollLayout.bodyVisible,true);
    assert.equal(scrollLayout.insideViewport,true,
     'Dialog must remain entirely visible on mobile and desktop');
    assert.equal(scrollLayout.editorInitiallyCollapsed,true);
    const pairFacts=await js(`(()=>{
     const panel=document.getElementById('apd-comparison-dialog');
     const box=panel.querySelector('.apd-comparator-schedule-pairs');
     return {present:!!box,open:box?.open,
      summary:box?.querySelector('summary')?.textContent,
      entries:[...(box?.querySelectorAll('li')||[])].map(e=>e.textContent)};
    })()`);
    assert.equal(pairFacts.present,true,'Pairwise offer schedule comparisons must be available');
    assert.equal(pairFacts.open,true,'Overlapping schedules must be visible without extra clicks');
    assert.match(pairFacts.summary,/1 a revisar de 1 pares/);
    assert.match(pairFacts.entries[0],/Cruce de días, horas y vigencias informadas/);
    assert.match(pairFacts.entries[0],/07:20 a 11:50/);
    const facts=await js(`(()=>{
     const dialog=document.getElementById('apd-comparison-dialog');
     const summary=dialog.querySelector('.apd-comparator-difference-summary').textContent;
     const byLabel=label=>[...dialog.querySelectorAll('.apd-comparator-table tbody tr')]
      .find(row=>row.querySelector('th')?.textContent===label);
     const schedule=byLabel('Días y horarios');
     const course=byLabel('Curso / división');
     return {
      summary,scheduleState:schedule?.dataset.comparisonStatus,
      courseState:course?.dataset.comparisonStatus,
      scheduleValues:[...schedule.querySelectorAll('td')].map(x=>x.textContent),
      courseValues:[...course.querySelectorAll('td')].map(x=>x.textContent),
      courseVisible:getComputedStyle(course).display!=='none'
     };
    })()`);
    assert.equal(facts.scheduleState,'same',
     'Semantically identical ABC HSA/plain horario should not be marked different');
    assert.equal(facts.courseState,'unverified',
     '0 versus A is incomplete course/division data, not a demonstrated difference');
    assert.equal(facts.courseVisible,true,'Incomplete row must remain visible');
    assert.deepEqual(facts.scheduleValues,[
     'Lunes a viernes: 07:20 a 11:50','Lunes a viernes: 07:20 a 11:50']);
    assert.match(facts.summary,/Datos incompletos o no comparables: Curso \/ división/);
    assert.doesNotMatch(facts.summary,/Diferencias detectadas:[^.]*Días y horarios/,
     'Equivalent schedules must be removed from the differences list');
    assert.equal(await js('!!document.querySelector("#apd-comparison-dialog .apd-work-planner")'),true,
     'Optional domicile and current job editor must be available');
    assert.equal(await js('document.querySelector("#apd-comparison-dialog .apd-work-planner").open'),false,
     'The dialog must initially prioritize the offers, not the optional personal-data editor');
    await js(`(()=>{
     const dialog=document.getElementById('apd-comparison-dialog');
     const details=dialog.querySelector('.apd-work-planner');details.open=true;
     [...details.querySelectorAll('button')].find(x=>x.textContent.includes('Agregar escuela')).click();
     const form=details.querySelector('form');
     form.querySelector('input[type="text"]').value='Wilde, Avellaneda';
     const job=details.querySelector('.apd-work-shift');
     const chips=[...job.querySelectorAll('.apd-work-day')];
     if(chips.length!==7||chips.some(x=>x.getBoundingClientRect().height<43))
      throw Error('Seven touch-friendly weekday controls required');
     if(details.scrollWidth>details.clientWidth+2)
      throw Error('Private planner must not overflow the dialog');
     job.querySelector('input[type="text"]').value='Escuela actual';
     for(const c of job.querySelectorAll('input[type="checkbox"]'))c.checked=Number(c.value)<=5;
     job.querySelectorAll('input[type="time"]')[0].value='07:20';
     job.querySelectorAll('input[type="time"]')[1].value='11:50';
     form.requestSubmit();
     return true;
    })()`);
    await until(`(()=>{
     const rows=[...document.querySelectorAll('#apd-comparison-dialog tbody tr')];
     return rows.find(x=>x.querySelector('th')?.textContent==='Cruce con mi jornada actual')
      ?.textContent.includes('Superposición de horarios')??false;
    })()`);
    assert.equal(await js(`(()=>{
     const saved=sessionStorage.getItem('apd_comparador_jornada_solo_pestana_v1');
     return !!saved&&saved.includes('Escuela actual')&&saved.includes('Wilde, Avellaneda');
    })()`),true,'Optional profile stored only in current tab');
    // Travel caution: ten free minutes between shifts is not a proven trip.
    await js(`(()=>{
      const dialog=document.getElementById('apd-comparison-dialog');
      const details=dialog.querySelector('.apd-work-planner');details.open=true;
      const gap=details.querySelector('select.apd-work-input');
      if(!gap||gap.value!=='30')throw Error('Default travel margin missing');
      const shift=details.querySelector('.apd-work-shift');
      shift.querySelectorAll('input[type="time"]')[0].value='06:00';
      shift.querySelectorAll('input[type="time"]')[1].value='07:10';
      details.querySelector('form').requestSubmit();
      return true;
    })()`);
    await until(`(()=>{
      const rows=[...document.querySelectorAll('#apd-comparison-dialog tbody tr')];
      const row=rows.find(x=>x.querySelector('th')?.textContent==='Cruce con mi jornada actual');
      return row?.textContent.includes('traslado a revisar')??false;
    })()`);
    assert.match(await js(`[...document.querySelectorAll('#apd-comparison-dialog tbody tr')]
      .find(x=>x.querySelector('th')?.textContent==='Cruce con mi jornada actual').textContent`),
      /10 min entre horarios/, 'Only the clock gap must be shown');
    assert.equal(await js(`JSON.parse(sessionStorage.getItem(
      'apd_comparador_jornada_solo_pestana_v1')).travelGapMinutes`),30);
    await js(`(()=>{
      const dialog=document.getElementById('apd-comparison-dialog');
      const details=dialog.querySelector('.apd-work-planner');details.open=true;
      [...details.querySelectorAll('button')].find(x=>x.textContent.includes('Borrar mis datos')).click();
      return true;
    })()`);
    await until('!sessionStorage.getItem("apd_comparador_jornada_solo_pestana_v1")');
    assert.equal(await js(`(()=>{
     const details=document.querySelector('#apd-comparison-dialog .apd-work-planner');
     return !details.open &&
       [...details.querySelectorAll('input[type="text"]')].every(x=>x.value==='') &&
       details.querySelectorAll('.apd-work-shift').length===0;
    })()`),true,'Deleting the profile must clear all visible DOM values');
    assert.equal(await js(`!![...document.querySelectorAll('#apd-comparison-dialog tbody tr')]
      .find(x=>x.querySelector('th')?.textContent==='Cruce con mi jornada actual')`),false,
     'Clearing profile must remove evaluation row');
    assert.match(bodyText,/Días y horarios/);
    assert.match(bodyText,/Postulantes visibles/);
    assert.match(bodyText,/42,60/);
    assert.match(bodyText,/38,10/);
    assert.match(bodyText,/-4,50/);
    assert.match(bodyText,/25/);
    assert.match(bodyText,/16/);
    assert.equal(await js('document.querySelector("#apd-comparison-dialog .apd-comparator-focus.apd-comparator-show-all")'),null);
    await js('document.querySelector("#apd-comparison-dialog .apd-comparator-expand").click();true');
    assert.equal(await js('!!document.querySelector("#apd-comparison-dialog .apd-comparator-show-all")'),true);
    const firstDeadline=await js('document.querySelector("#apd-comparison-dialog .apd-comparator-table tbody tr:nth-child(5) td")?.textContent||""');
    assert.match(firstDeadline,/10:00/,'ABC finoferta Z must remain 10:00 local, not 07:00');
    await js('document.getElementById("apd-comparison-close").click();true');
    await until('!document.getElementById("apd-comparison-dialog")');
    // Emulate production CSS hiding the underlying results card.
    await js('document.getElementById("apd-comparador-panel").style.display="none";document.getElementById("apd-ver-comparacion").click();true');
    await until('document.getElementById("apd-comparison-dialog")?.open===true');
    assert.ok(await js('document.querySelectorAll("#apd-comparison-dialog .apd-comparator-table tbody tr").length>=16'));
    await js('document.getElementById("apd-comparador-panel").style.display="";document.getElementById("apd-comparison-close").click();true');
    await until('!document.getElementById("apd-comparison-dialog")');
   }
  }
  const state=await js(`({
   total:document.querySelector('.apd-comparator-count')?.textContent,
   items:document.querySelectorAll('.apd-comparator-item').length,
   forgedImage:!!document.querySelector('.apd-comparator-item img'),
   escapeVisible:document.querySelector('#apd-comparador-panel')?.textContent.includes('<img src=x'),
   overflow:document.documentElement.scrollWidth,viewport:innerWidth,
   hasOfficialMap:!!document.querySelector('.apd-comparator-map-link'),
   comparisonColumns:document.querySelectorAll('#apd-comparador-panel .apd-comparator-table thead th').length,
   comparisonRows:document.querySelectorAll('#apd-comparador-panel .apd-comparator-table tbody tr').length,
   seeComparison:document.getElementById('apd-ver-comparacion')?.textContent
  })`);
  assert.equal(state.total,'5 de 5 ofertas seleccionadas');
  assert.equal(state.items,5);
  assert.equal(state.comparisonColumns,6);
  assert.equal(await js('document.querySelectorAll("#apd-comparador-panel .apd-comparator-schedule-item").length'),10,
   'All five offers must be evaluated in ten pairs');
  assert.match(await js('document.querySelector("#apd-comparador-panel .apd-comparator-schedule-list li")?.textContent||""'),
   /Cruce de días, horas y vigencias informadas/,
   'Highest priority collisions must appear first, above insufficient-data pairs');
  assert.ok(state.comparisonRows>=6);
  assert.equal(state.seeComparison,'Ver comparación (5)');
  assert.equal(await js('document.querySelectorAll("#apd-ver-comparacion").length'),1);
  assert.equal(state.forgedImage,false);
  assert.equal(state.escapeVisible,true);
  assert.equal(await js('window.__wfsRequests.length'),0,
   'No WFS requests may occur before the explicit button is clicked');
  assert.equal(await js('window.APD_offerSchoolMapReady'),true,
   'Verified exact-key map overlay should be loaded without touching the core app');
  assert.equal(state.hasOfficialMap,true,
   'Comparator map links must use the integrated verified-school map');
  assert.equal(await js('!!document.querySelector(".apd-comparator-map-link")'),true);
  assert.match(await js('document.querySelector(".apd-comparator-map-link").href'),
   /mapa-escuelas-pba\.html\?clave=0005MS0004/);
  assert.ok((await js('document.querySelector("#apd-map-school-link")?.href||""'))
   .includes('mapa-escuelas-pba.html?clave='),
   'The carousel itself also has the exact-school map link');
  const geoAvailable=await js('!!document.querySelector(".apd-comparator-geobutton")');
  assert.equal(geoAvailable,true,'Optional official distance action should appear');
  // The teacher from the screenshot is already inside the modal: verify
  // the opt-in works there and returns to the comparison automatically.
  await js('document.getElementById("apd-ver-comparacion").click();true');
  await until('document.querySelector("#apd-comparison-dialog .apd-comparator-dialog-geobutton")');
  await js('document.querySelector("#apd-comparison-dialog .apd-comparator-dialog-geobutton").click();true');
  await until('document.querySelector(".apd-comparator-geo-status")?.textContent.includes("2 de 2") && document.getElementById("apd-comparison-dialog")?.open===true');
  assert.equal(await js('document.querySelector("#apd-comparison-dialog .apd-comparator-dialog-geobutton")'),null,
   'Once location data is requested, the first-time lookup button disappears');
  await js('document.getElementById("apd-comparison-close").click();true');
  await until('!document.getElementById("apd-comparison-dialog")');
  const geographic=await js(`({
   pairCount:document.querySelectorAll(".apd-comparator-pairs li").length,
   distanceRows:document.querySelectorAll(".apd-comparator-distance").length,
   requests:window.__wfsRequests,
   pairText:document.querySelector(".apd-comparator-pairs")?.textContent||"",
   origin:document.querySelectorAll(".apd-comparator-tools select")[3]?.value||""
  })`);
  assert.equal(geographic.pairCount,1);
  assert.equal(geographic.distanceRows,5);
  assert.equal(geographic.requests.length,2);
  assert.ok(geographic.requests.every(r=>r.origin==='https://mapaescolar.abc.gob.ar' &&
    r.credentials==='omit' && r.method==='GET'));
  assert.match(geographic.pairText,/km en línea recta/);
  assert.match(geographic.origin,/^[0-9]{4}MS[0-9]{4}$/);
  // E2E of explicit address lookup with two homonymous streets and one selected home.
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.open=true;
   const field=planner.querySelector('input.apd-work-input[type="text"]');
   field.value='Rondeau 319';
   field.dispatchEvent(new Event('input',{bubbles:true}));
   planner.querySelector('.apd-home-lookup').click();
   return true;
  })()`);
  await until('document.querySelectorAll("#apd-comparador-panel .apd-home-candidate").length===2');
  const homeSuggestions=await js(`[...document.querySelectorAll(
   '#apd-comparador-panel .apd-home-candidate')].map(x=>x.textContent)`);
  assert.match(homeSuggestions[0],/Wilde, Avellaneda, Buenos Aires/);
  assert.match(homeSuggestions[1],/Bahía Blanca/);
  const homeRequests=await js('window.__homeGeoRequests');
  assert.equal(homeRequests.length,1);
  assert.equal(homeRequests[0].method,'GET');
  assert.equal(homeRequests[0].credentials,'omit');
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.querySelector('.apd-home-candidate').click();
   planner.querySelector('form').requestSubmit();
   return true;
  })()`);
  const blockedHome=await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   const stored=JSON.parse(sessionStorage.getItem('apd_comparador_jornada_solo_pestana_v1')||'{}');
   return {message:planner.querySelector('.apd-work-status').textContent,
    homeStored:!!stored.homeLocation,
    checkboxVisible:!planner.querySelector('.apd-home-review-row').hidden};
  })()`);
  assert.match(blockedHome.message,/Revisá el punto en Maps/);
  assert.equal(blockedHome.homeStored,false,
   'Unverified fallback home must not be silently persisted');
  assert.equal(blockedHome.checkboxVisible,true);
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.querySelector('.apd-home-review-check').click();
   planner.querySelector('form').requestSubmit();
   return true;
  })()`);
  await until('document.querySelectorAll(".apd-comparator-home-distance").length===5');
  const homeFacts=await js(`(()=>{
   const value=JSON.parse(sessionStorage.getItem('apd_comparador_jornada_solo_pestana_v1'));
   return {selected:value?.homeLocation,domicile:value?.domicile,
    distances:[...document.querySelectorAll('.apd-comparator-home-distance')]
      .map(x=>x.textContent)};
  })()`);
  assert.equal(homeFacts.selected?.source,'GEOREF_AR_V2');
  assert.equal(homeFacts.selected?.scope,'pais');
  assert.equal(homeFacts.selected?.reviewed,true);
  assert.equal(homeFacts.selected?.lat,-34.7);
  assert.equal(homeFacts.selected?.lon,-58.32);
  assert.match(homeFacts.domicile,/RONDEAU 319, Wilde/);
  assert.ok(homeFacts.distances.every(x=>/km en línea recta/.test(x)));
  assert.equal(await js('document.querySelectorAll(".apd-comparator-home-map").length'),5);
  // Mobility actions must never call routing or bus-layer APIs automatically.
  await js('document.getElementById("apd-ver-comparacion").click();true');
  await until('document.querySelectorAll("#apd-comparison-dialog .apd-mobility-card").length===2');
  const mobility=await js(`(()=>({
   routes:[...document.querySelectorAll('#apd-comparison-dialog .apd-mobility-card .apd-mobility-map-link')]
     .slice(0,4).map(a=>({mode:new URL(a.href).searchParams.get('travelmode'),
       origin:new URL(a.href).searchParams.get('origin'),
       target:new URL(a.href).searchParams.get('destination')})),
   count:document.querySelectorAll('#apd-comparison-dialog .apd-mobility-card').length,
   externalCalls:window.__mobilityExternalRequests.length
  }))()`);
  assert.equal(mobility.count,2);
  assert.deepEqual(new Set(mobility.routes.map(x=>x.mode)),
   new Set(['driving','bicycling','transit','walking']));
  assert.ok(mobility.routes.every(x=>x.origin==='-34.7,-58.32'));
  assert.ok(mobility.routes.every(x=>x.target==='-34.69,-58.33'));
  assert.equal(mobility.externalCalls,0,'No routes or bus layers without a click');
  await js(`(()=>{
   const card=document.querySelector('#apd-comparison-dialog .apd-mobility-card');
   [...card.querySelectorAll('button')].find(b=>b.textContent.includes('Calcular km en auto')).click();
   return true;
  })()`);
  await until('document.querySelector(".apd-mobility-estimate")?.textContent.includes("12.4 km")');
  assert.match(await js('document.querySelector(".apd-mobility-estimate").textContent'),/25 min aproximados/);
  assert.equal(await js('window.__mobilityExternalRequests.length'),1,
   'Only a single user-triggered road query should be sent');
  await js(`(()=>{
   const area=document.querySelector('#apd-comparison-dialog .apd-mobility-home-stops');
   area.open=true;
   [...area.querySelectorAll('button')].find(b=>b.textContent.includes('Ver líneas')).click();
   return true;
  })()`);
  await until('document.querySelector(".apd-mobility-home-stops .apd-mobility-stops li")?.textContent.includes("Línea 33")');
  assert.match(await js('document.querySelector(".apd-mobility-home-stops .apd-mobility-stops li").textContent'),
   /Jurisdicción Nacional.*sin parada confirmada/i);
  assert.equal(await js('window.__mobilityExternalRequests.length'),5,
   'Four jurisdiction layers queried only after explicit bus-route click');
  await js('document.getElementById("apd-comparison-close").click();true');
  await until('!document.getElementById("apd-comparison-dialog")');
  // Opted-in autocomplete: no request until the user enables the switch,
  // then a single debounced lookup after typing a complete street+height.
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.open=true;
   const field=planner.querySelector('input.apd-work-input[type="text"]');
   const toggle=planner.querySelector('.apd-home-auto-toggle');
   if(toggle.checked)throw Error('Automatic suggestions must be opt-in');
   toggle.checked=true;
   toggle.dispatchEvent(new Event('change',{bubbles:true}));
   field.value='Rondeau 319';
   field.dispatchEvent(new Event('input',{bubbles:true}));
   return true;
  })()`);
  await until('window.__homeGeoRequests.length===2 && document.querySelectorAll("#apd-comparador-panel .apd-home-candidate").length===2');
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.querySelector('.apd-home-candidate').click();
   planner.querySelector('.apd-home-review-check').click();
   planner.querySelector('form').requestSubmit();
   return true;
  })()`);
  await until('document.querySelectorAll(".apd-comparator-home-distance").length===5');
  // Reproduce the actual user screenshot input, with NO commas.
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.open=true;
   const field=planner.querySelector('input.apd-work-input[type="text"]');
   field.value='rondeau 319 wilde';
   field.dispatchEvent(new Event('input',{bubbles:true}));
   planner.querySelector('.apd-home-lookup').click();
   return true;
  })()`);
  await until('window.__homeGeoRequests.length===3 && document.querySelectorAll("#apd-comparador-panel .apd-home-candidate").length===1');
  const correctedAddress=await js('document.querySelector("#apd-comparador-panel .apd-home-candidate").textContent');
  assert.match(correctedAddress,/CNL JOSE RONDEAU 319, Wilde, Avellaneda, Buenos Aires/);
  const selectedParams=await js(`(()=>{
   const p=new URL(window.__homeGeoRequests[2].url).searchParams;
   return {direccion:p.get('direccion'),localidad:p.get('localidad'),
    censal:p.get('localidad_censal'),provincia:p.get('provincia')};
  })()`);
  assert.deepEqual(selectedParams,{direccion:'rondeau 319',localidad:'wilde',
   censal:null,provincia:null});
  assert.doesNotMatch(await js('document.querySelector("#apd-comparador-panel .apd-home-status").textContent'),
   /alternativas de otras zonas|no devolvió coincidencias/i);
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.querySelector('.apd-home-candidate').click();
   planner.querySelector('form').requestSubmit();
   return true;
  })()`);
  await until('document.querySelectorAll(".apd-comparator-home-distance").length===5');
  const realScope=await js(`JSON.parse(sessionStorage.getItem(
   'apd_comparador_jornada_solo_pestana_v1'))?.homeLocation?.scope`);
  assert.equal(realScope,'exacta','A locality-filtered result should be exact in scope');
  assert.equal(await js('document.querySelectorAll("#apd-comparador-panel .apd-home-candidate").length'),0);
  assert.match(await js('document.querySelector(".apd-comparator-home-distance").textContent'),
   /km en línea recta/);
  assert.ok(state.overflow<=state.viewport+6,'Horizontal overflow '+JSON.stringify(state));
  await screenshot('comparator-'+width+'-five-selected');
  // The optional workplace key must cause no request until the teacher
  // explicitly presses 'Consultar distancias oficiales'.
  const beforeWorkLookups=await js('window.__wfsRequests.length');
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   planner.open=true;
   [...planner.querySelectorAll('button')].find(x=>x.textContent.includes('Agregar escuela')).click();
   const row=planner.querySelector('.apd-work-shift');
   const fields=row.querySelectorAll('input[type="text"]');
   fields[0].value='Escuela laboral sintética';
   fields[1].value='0005MS0099';
   for(const check of row.querySelectorAll('.apd-work-day input'))
    check.checked=Number(check.value)<=5;
   const hours=row.querySelectorAll('input[type="time"]');
   hours[0].value='07:20';hours[1].value='11:50';
   if(planner.scrollWidth>planner.clientWidth+2)
    throw Error('Work-school key field must not overflow '+innerWidth+'px');
   planner.querySelector('form').requestSubmit();
   return true;
  })()`);
  await until('document.querySelectorAll(".apd-comparator-home-distance").length===0');
  assert.equal(await js('window.__wfsRequests.length'),beforeWorkLookups,
   'Saving a work key must not trigger automatic network requests');
  await js('document.querySelector(".apd-comparator-geobutton").click();true');
  await until('document.querySelector(".apd-comparator-geo-status")?.textContent.includes("1 de 1 escuelas de tus jornadas")');
  assert.equal(await js('document.querySelectorAll(".apd-comparator-work-distance").length'),5);
  assert.match(await js('document.querySelector(".apd-comparator-work-distance").textContent'),
   /0005MS0099.*km en línea recta/);
  await js('document.getElementById("apd-ver-comparacion").click();true');
  await until('document.querySelector("#apd-comparison-dialog .apd-comparator-table")');
  const workComparison=await js(`(()=>{
   const row=[...document.querySelectorAll('#apd-comparison-dialog tbody tr')]
    .find(x=>x.querySelector('th')?.textContent==='Desde mis escuelas actuales');
   return {found:!!row,text:row?.textContent||''};
  })()`);
  assert.equal(workComparison.found,true,'Official workplace distances must appear in the comparison table');
  assert.match(workComparison.text,/0005MS0099.*km en línea recta/);
  await js('document.getElementById("apd-comparison-close").click();true');
  await until('!document.getElementById("apd-comparison-dialog")');
  assert.equal(await js('window.__wfsRequests.length')-beforeWorkLookups,3,
   'Two selected offers plus one workplace require three bounded WFS queries');
  assert.equal(await js('JSON.parse(sessionStorage.getItem("apd_comparador_jornada_solo_pestana_v1")).jobs[0].schoolKey'),
   '0005MS0099');
  // Clear private profile so subsequent account-switch QA uses the two offers.
  await js(`(()=>{
   const planner=document.querySelector('#apd-comparador-panel .apd-work-planner');
   [...planner.querySelectorAll('button')].find(x=>x.textContent.includes('Borrar mis datos')).click();
   return true;
  })()`);
  await until('document.querySelectorAll(".apd-comparator-work-distance").length===0');
  assert.equal(await js('sessionStorage.getItem("apd_comparador_jornada_solo_pestana_v1")'),null);
    // E2E: the real comparison UI must surface BOTH separate weekly collisions,
  // not just unit-test the parser or silently keep the first interval.
  await js(`(()=>{
   window.__offers=window.__offers.map((offer,i)=>{
    if(i===0)return {...offer,dias_horarios:'Lunes: 08:00 a 10:00; Miércoles: 14:00 a 17:00'};
    if(i===1)return {...offer,dias_horarios:'Lunes: 09:00 a 11:00; Miércoles: 15:00 a 18:00'};
    if(i===2)return {...offer,dias_horarios:'',
     lunes:'07:20 hs a 11:50 hs',martes:'07:20 hs a 11:50 hs',
     miercoles:'14:00 hs a 18:30 hs',jueves:'14:00 hs a 18:30 hs',
     viernes:'08:00 hs a 12:00 hs',sabado:'08:00 hs a 12:00 hs',
     domingo:'08:00 a 12:00'};
    return offer;
   });
   window.alertasState={items:window.__offers,index:0};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  // Wait for the real dashboard MutationObserver to propagate the new ABC
  // records. A pre-existing count of five is NOT evidence of refreshed rows.
  await until(`(()=>{
   const table=document.querySelector('#apd-comparador-panel .apd-comparator-table');
   const row=[...(table?.querySelectorAll('tbody tr')||[])]
    .find(x=>x.querySelector('th')?.textContent==='Días y horarios');
   return row?.textContent.includes('Miércoles: 14:00 a 17:00')??false;
  })()`);
  await js('document.getElementById("apd-ver-comparacion").click();true');
  await until('document.getElementById("apd-comparison-dialog")?.open===true');
  // Column numbers follow the visible expiry sort, not original source indexes.
  const multiBlockText=await js(`[...document.querySelectorAll(
   '#apd-comparison-dialog .apd-comparator-schedule-item')]
   .find(x=>x.textContent.includes('Lunes, 09:00 a 10:00'))?.textContent||''`);
  assert.match(multiBlockText,/Lunes, 09:00 a 10:00/);
  assert.match(multiBlockText,/Miércoles, 15:00 a 17:00/);
  // Browser-level regression: ABC weekday columns cannot be truncated before
  // the comparator assesses a Sunday conflict.
  const weeklyFallback=await js(`(()=>{
   const dialog=document.getElementById('apd-comparison-dialog');
   const row=[...dialog.querySelectorAll('.apd-comparator-table tbody tr')]
    .find(x=>x.querySelector('th')?.textContent==='Días y horarios');
   return [...row.querySelectorAll('td')].map(x=>x.textContent)
    .find(x=>x.includes('Domingo: 08:00 a 12:00'))||'';
  })()`);
  // The visual table canonicalizes HS abbreviations, so its formatted value
  // may be shorter than 180. Verify the underlying comparator preserved the
  // entire *unformatted* ABC schedule before that presentation step.
  const rawFallbackSize=await js(`(async()=>{
   const core=await import('/scripts/apd-comparador-criterios.mjs?v=20261109-decision1');
   const offer={...window.__offers[2],source_offer_key:'D_8002'};
   return core.compareOffers({offers:[offer],now:'2035-11-01T07:00:00Z'})
    .items[0].horario.length;
  })()`);
  assert.ok(rawFallbackSize>180,'Complete weekly schedule must survive the data extraction');
  assert.match(weeklyFallback,/Domingo: 08:00 a 12:00/);
  await js('document.getElementById("apd-comparison-close").click();true');
  await until('!document.getElementById("apd-comparison-dialog")');

  // Exact timing pattern reported by a real Insigne user:
  // '07:30 a 11:50' versus '7:30 A 12'. The latter is noon, not missing data.
  await js(`(()=>{
   window.__offers=window.__offers.map((offer,i)=>{
    if(i===0)return {...offer,dias_horarios:'Lunes a viernes: 07:30 a 11:50',
     supl_desde:'2035-11-06',supl_hasta:'2035-11-20'};
    if(i===1)return {...offer,dias_horarios:'Lunes a Viernes: 7:30 A 12',
     supl_desde:'2035-11-10',supl_hasta:'2035-11-17'};
    return offer;
   });
   window.alertasState={items:window.__offers,index:0};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until(`(()=>{
   const table=document.querySelector('#apd-comparador-panel .apd-comparator-table');
   const row=[...(table?.querySelectorAll('tbody tr')||[])]
    .find(x=>x.querySelector('th')?.textContent==='Días y horarios');
   return row?.textContent.includes('12:00')??false;
  })()`);
  await js('document.getElementById("apd-ver-comparacion").click();true');
  await until('document.getElementById("apd-comparison-dialog")?.open===true');
  const actualScreenshotCheck=await js(`(()=>{
   const dialog=document.getElementById('apd-comparison-dialog');
   const row=[...dialog.querySelectorAll('.apd-comparator-table tbody tr')]
    .find(x=>x.querySelector('th')?.textContent==='Días y horarios');
   return {status:row?.dataset.comparisonStatus,
    cells:[...(row?.querySelectorAll('td')||[])].map(x=>x.textContent),
    match:[...dialog.querySelectorAll('.apd-comparator-schedule-item')]
     .map(x=>x.textContent).find(x=>x.includes('07:30 a 11:50'))||''};
  })()`);
  // The table compares all five selected offers; three have incomplete
  // schedules, so its overall criterion must stay unverified. The actual
  // two-offer collision is independently verified in the pair list below.
  assert.equal(actualScreenshotCheck.status,'unverified');
  assert.ok(actualScreenshotCheck.cells.some(x=>x.includes('07:30 a 12:00')));
  assert.match(actualScreenshotCheck.match,/Cruce de días, horas y vigencias informadas/);
  await js('document.getElementById("apd-comparison-close").click();true');
  await until('!document.getElementById("apd-comparison-dialog")');
  // Second real screenshot: complete Avellaneda morning versus Costa weekday
  // afternoon blocks spelled "14 A 18.30", which must be comparable.
  await js(`(()=>{
   const afternoon=['Lunes','Martes','Miércoles','Jueves','Viernes']
    .map(day=>day+': 14 A 18.30').join('; ');
   window.__offers=window.__offers.map((offer,i)=>({
    ...offer,dias_horarios:i===1?afternoon:'Lunes a Viernes: 07:30 a 12:00',
    supl_desde:'2035-11-10',supl_hasta:'2035-12-10'
   }));
   window.alertasState={items:window.__offers,index:0};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until(`(()=>{
   const table=document.querySelector('#apd-comparador-panel .apd-comparator-table');
   const row=[...(table?.querySelectorAll('tbody tr')||[])]
    .find(x=>x.querySelector('th')?.textContent==='Días y horarios');
   return row?.textContent.includes('Viernes: 14:00 a 18:30')??false;
  })()`);
  await js('document.getElementById("apd-ver-comparacion").click();true');
  await until('document.getElementById("apd-comparison-dialog")?.open===true');
  const costaScreenshotCheck=await js(`(()=>{
   const dialog=document.getElementById('apd-comparison-dialog');
   const row=[...dialog.querySelectorAll('.apd-comparator-table tbody tr')]
    .find(x=>x.querySelector('th')?.textContent==='Días y horarios');
   return {status:row?.dataset.comparisonStatus,
    cells:[...(row?.querySelectorAll('td')||[])].map(x=>x.textContent),
    noCollision:[...dialog.querySelectorAll('.apd-comparator-schedule-item')]
     .some(x=>x.textContent.includes('Sin cruces de días y horas declarados'))};
  })()`);
  assert.equal(costaScreenshotCheck.status,'different',
   'Complete morning and afternoon blocks must highlight an actual difference');
  assert.ok(costaScreenshotCheck.cells.some(x=>x.includes('Lunes: 14:00 a 18:30')));
  assert.equal(costaScreenshotCheck.noCollision,true,
   'Morning and afternoon offers do not collide; this never certifies travel');
  await js('document.getElementById("apd-comparison-close").click();true');
  await until('!document.getElementById("apd-comparison-dialog")');
  await js(`(()=>{
    window.alertasState.index=5;
    document.getElementById('panel-alertas').innerHTML='<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
    return true;
   })()`);
  await until('!!document.getElementById("apd-comparar-oferta")');
  await js('document.getElementById("apd-comparar-oferta").click();true');
  assert.equal(await js('document.querySelectorAll(".apd-comparator-item").length'),5);
  assert.match(await js('document.querySelector("#apd-comparator-status").textContent'),/hasta cinco ofertas/);
  // A pending opted-in autocomplete must not send Georef after revocation,
  // even if its old form remains mounted and its timer has not fired.
  const georefBeforeRevoke=await js('window.__homeGeoRequests.length');
  await js(`(async()=>{
   const form=document.querySelector('#apd-comparador-panel .apd-work-planner');
   form.open=true;
   const field=form.querySelector('input.apd-work-input[type="text"]');
   const toggle=form.querySelector('.apd-home-auto-toggle');
   toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));
   field.value='Rondeau 319';
   field.dispatchEvent(new Event('input',{bubbles:true}));
   const {clearPrivatePlanner}=await import('/scripts/apd-mi-jornada-ui.mjs?v=20261112-georef-safe1');
   clearPrivatePlanner();
   return true;
  })()`);
  await sleep(900);
  assert.equal(await js('window.__homeGeoRequests.length'),georefBeforeRevoke,
   'Revoked autocomplete timer must not leak the address');
  await js(`(()=>{
   const form=document.querySelector('#apd-comparador-panel .apd-work-planner');
   form.querySelector('.apd-home-lookup').click();
   form.querySelector('form').requestSubmit();
   return true;
  })()`);
  assert.equal(await js('window.__homeGeoRequests.length'),georefBeforeRevoke,
   'Revoked form must not request Georef');
  assert.equal(await js('sessionStorage.getItem("apd_comparador_jornada_solo_pestana_v1")'),null,
   'Revoked form must not restore private data');
  // Simulate a WFS provider finishing AFTER the original user is gone.
  // The async result must never repaint the next account's data.
  await js(`(()=>{
   window.__holdWFS=true;
   document.querySelector('.apd-comparator-geobutton').click();
   return true;
  })()`);
  await until('window.__heldWFS.length===2');
  await js(`sessionStorage.setItem('apd_comparador_jornada_solo_pestana_v1',JSON.stringify({domicile:'Domicilio ficticio',jobs:[]}));true`);
  await js(`(()=>{
   dashboardLoadedOwner='SYNTHETIC_USER_B';
   window.__testToken='SYNTHETIC_USER_B';
   window.alertasState={items:window.__offers.slice(0,2),index:0};
   document.getElementById('panel-alertas').innerHTML='<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('document.querySelector(".apd-comparator-count")?.textContent==="0 de 5 ofertas seleccionadas"');
  assert.equal(await js('sessionStorage.getItem("apd_comparador_jornada_solo_pestana_v1")'),null,
   'Switching account must erase locally stored domicile and timetable');
  assert.equal(await js('!!document.querySelector(".apd-comparator-pairs")'),false,
   'Changing accounts clears all school coordinate results');
  await js(`(()=>{
   window.__holdWFS=false;
   window.__heldWFS.splice(0).forEach(resolve=>resolve());
   return true;
  })()`);
  await sleep(130);
  assert.equal(await js('!!document.querySelector(".apd-comparator-pairs")'),false,
   'A late WFS response cannot repopulate a different account');
  assert.equal(await js('document.querySelector(".apd-comparator-count")?.textContent'),
   '0 de 5 ofertas seleccionadas');
  await js('document.getElementById("apd-comparar-oferta").click();true');
  await js(`(()=>{
   dashboardLoadedOwner=null;
   window.__testToken=null;
   window.alertasState={items:[],index:0};
   document.getElementById('panel-alertas').textContent='';
   return true;
  })()`);
  await until('document.getElementById("apd-comparador-panel").hidden');
  assert.equal(await js('document.querySelector(".apd-comparator-item")'),null);
  // Regression: selecting two closed/expired offers must not leave a silent empty comparison.
  await js(`(()=>{
   dashboardLoadedOwner='SYNTHETIC_USER_EXPIRED';
   window.__testToken='SYNTHETIC_USER_EXPIRED';
   planActual={access_active:true};
   window.alertasState={items:[
    {...window.__offers[0],finoferta:'01/01/2020 10:00'},
    {...window.__offers[1],estado:'ANULADA'}
   ],index:0};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('!!document.getElementById("apd-comparar-oferta") && !document.getElementById("apd-comparador-panel").hidden');
  await js('document.getElementById("apd-comparar-oferta").click();true');
  await js(`(()=>{
   window.alertasState.index=1;
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('!!document.getElementById("apd-comparar-oferta")');
  await js('document.getElementById("apd-comparar-oferta").click();true');
  await until('!!document.querySelector(".apd-comparator-unavailable")');
  assert.equal(await js('document.querySelector(".apd-comparator-count")?.textContent'),
   '2 de 5 ofertas seleccionadas');
  assert.equal(await js('!!document.querySelector(".apd-comparator-side-by-side")'),false);
  assert.match(await js('document.querySelector(".apd-comparator-unavailable")?.textContent||""'),
   /0 de 2 ofertas seleccionadas/);
  assert.match(await js('document.querySelector(".apd-comparator-unavailable")?.textContent||""'),
   /plazo de cierre vencido/);
  assert.match(await js('document.querySelector(".apd-comparator-unavailable")?.textContent||""'),
   /estado oficial cerrado o anulado/);
  await until('document.getElementById("apd-comparison-dialog")?.open===true');
  assert.match(await js('document.getElementById("apd-comparison-dialog")?.textContent||""'),
   /No hay dos ofertas comparables/);
  assert.equal(await js('document.querySelector("#apd-comparison-dialog .apd-comparator-side-by-side")'),null);
  await js('document.getElementById("apd-comparison-close").click();true');
  await until('!document.getElementById("apd-comparison-dialog")');
  results.push({width,private_gating:true,up_to_five:true,xss_escaped:true,
   session_reset:true,limit_enforced:true,responsive:true});
 }
 console.log('APD_COMPARATOR_REAL_BROWSER '+JSON.stringify({success:true,results,network:'localhost_only',auth:'synthetic'}));
}finally{
 for(const p of pending.values()){clearTimeout(p.t);p.reject(Error('Browser stopping'));}
 pending.clear();ws?.close();browser.kill('SIGTERM');
 await new Promise(resolve=>server.close(resolve));
 await sleep(200);rmSync(profile,{recursive:true,force:true});
}

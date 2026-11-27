import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
const chrome=['google-chrome','chromium','chromium-browser'].find(x=>spawnSync('which',[x]).status===0);
assert.ok(chrome,'Chromium required');
const page=`<!doctype html><meta charset="utf-8"><div id="host"></div><pre id="result">RUNNING</pre><script type="module">
import {mountCareerEditor} from '/scripts/apd-career-editor-ui.mjs';
import {createCareerPanelCoordinator} from '/scripts/apd-career-panel-coordinator.mjs';
import {createCareerClient} from '/scripts/apd-career-account-client.mjs';
import {careerAccountRequest} from '/scripts/apd-career-account-core.mjs';
import {createSchoolCatalog} from '/scripts/apd-career-school-catalog.mjs';
import {mountOwnScheduleRecovery} from '/scripts/apd-career-schedule-readonly.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('timeout');};
const rows=new Map();let token='A',lost=false,puts=0;
const p={schema:1,seniorityYears:10,positions:[{id:'c1',schoolKey:'0005MS0004',school:'Escuela de ensayo',role:'Matemática',level:'Secundaria',kind:'modulo',status:'titular',quantity:2,modules:['T1-1'],blocks:[{day:1,start:'14:00',end:'16:00'}]}]};
rows.set('A',{profile:p,revision:1});
const deps={authenticate:async req=>({id:req.headers.get('authorization').slice(7)}),entitled:async()=>true,read:async id=>rows.get(id)||null,compareAndSet:async(id,data)=>{puts++;if((rows.get(id)?.revision||0)!==data.revision)return null;const record={profile:data.profile,revision:data.revision+1};rows.set(id,record);return record;}};
const client=createCareerClient({base:'https://fixture.invalid/',getToken:()=>token,fetcher:async(url,opts)=>{const r=await careerAccountRequest(new Request(url,opts),deps);if(lost&&opts.method==='PUT'){lost=false;throw Error('Conexión interrumpida');}return new Response(JSON.stringify(r.body),{status:r.status});}});
const host=document.querySelector('#host'),status=()=>host.querySelector('[role=status]').textContent,save=()=>host.querySelector('button[type=submit]'),years=()=>host.querySelector('input[type=number]'),button=t=>[...host.querySelectorAll('button')].find(n=>n.textContent===t);
const edit=v=>{years().value=v;years().dispatchEvent(new Event('input',{bubbles:true}));};
const submit=()=>host.querySelector('form').requestSubmit();
try{
 let dispose=mountCareerEditor(host,{client,legacyModules:['M1-2','T1-1'],isCurrent:()=>true});
 await until(()=>status().includes('recuperada'));
 check(years().value==='10','seniority readback');check(host.textContent.includes('C1 · Matemática'),'color legend');check(host.textContent.includes('1 módulos anteriores sin asignar'),'legacy preserved');check(puts===0,'no automatic write');
 edit('11');button('Recuperar carrera').click();check(years().value==='11','draft retained');check(status().includes('cambios sin guardar'),'explicit warning');
 lost=true;submit();await until(()=>status().includes('borrador se conserva'));
 check(save().disabled,'ambiguous revision blocked');check(rows.get('A').profile.seniorityYears===11,'server committed despite lost response');
 button('Comprobar último guardado').click();await until(()=>status().includes('se confirmó'));
 check(!save().disabled&&years().value==='11','confirmed readback');
 edit('12');rows.set('A',{profile:{...p,seniorityYears:13},revision:3});
 submit();await until(()=>status().includes('borrador se conserva'));
 button('Comprobar último guardado').click();await until(()=>status().includes('No se confirmó ese guardado'));
 check(save().disabled&&years().value==='12'&&rows.get('A').profile.seniorityYears===13,'conflict preserves local draft and server revision');
 button('Descartar borrador y recuperar').click();await until(()=>status().includes('recuperada'));check(years().value==='13','explicit discard');
 dispose();token='B';mountCareerEditor(host,{client,legacyModules:[],isCurrent:()=>true});await until(()=>status().includes('Todavía no'));
 check(years().value===''&&!host.textContent.includes('Matemática'),'other account isolated');check(puts===2,'no hidden writes');
 host.replaceChildren();token='A';
 const coordinator=createCareerPanelCoordinator();
 let modules=['M1-2','T1-1'];
 const past=new Date(Date.now()-60000).toISOString(),future=new Date(Date.now()+600000).toISOString();
 const plan={ok:true,access_active:true,subscription:{plan_code:'COMPLETO',status:'active',source:'fixture',started_at:past,current_period_ends_at:future},plan:{code:'COMPLETO'}};
 const scheduleClient={peek:()=>({modules,revision:1})};
 const opts={enabled:true,host,plan,client,scheduleClient,isCurrent:()=>true};
 coordinator.sync({...opts,enabled:false});check(host.hidden&&!host.firstElementChild,'release gate closed');
 for(const started_at of [null,future]){coordinator.sync({...opts,plan:{...plan,subscription:{...plan.subscription,started_at}}});check(host.hidden&&!host.firstElementChild,'future or missing start denied');}
 coordinator.sync(opts);await until(()=>status().includes('recuperada'));
 edit('14');const before=host.firstElementChild;
 modules=['M1-2','T1-1','T2-2'];coordinator.sync(opts);
 check(host.firstElementChild===before&&years().value==='14','same-session refresh keeps draft');
 check(host.textContent.includes('2 módulos anteriores sin asignar'),'legacy updates without remount');
 coordinator.sync({...opts,plan:{access_active:false}});check(host.hidden&&!host.firstElementChild,'revoked plan clears editor');
 token='B';coordinator.sync(opts);await until(()=>status().includes('Todavía no'));
 check(years().value===''&&!host.textContent.includes('Matemática'),'coordinator isolates accounts');
 check(puts===2,'no writes during refresh or account change');
 coordinator.reset();token='A';
 const schoolCatalog=createSchoolCatalog({schema:1,source:'DGCYE_PBA',datasetId:'4becb4b7-0a21-4fef-8f2c-30df7f345a01',resourceId:'3951210e-7e0e-4fed-bbf1-0183e704c9ae',sha256:'a'.repeat(64),catalogModified:'2026-11-18',schools:[{schoolKey:'0005DC0709',name:'Centro de Educación de Adultos 709/05',district:'Avellaneda',level:'Adultos',area:'Urbana',classification:'0',surveyPeriod:'2026'}]});
 const school=schoolCatalog.exact('0005DC0709');
 check(school?.district==='Avellaneda'&&school.classification==='0','synthetic school fixture');
 coordinator.sync({...opts,schoolCatalog});await until(()=>status().includes('recuperada'));
 const search=host.querySelector('input[type=search]');check(!!search,'school catalog integrated');
 search.value='centro de educacion de adultos 709/05';search.dispatchEvent(new Event('input',{bubbles:true}));
 const resultButton=[...host.querySelectorAll('.apd-career-school-results button')].find(node=>node.textContent.includes(school.schoolKey));check(!!resultButton,'school found by accent-insensitive query');
 resultButton.click();
 check(host.textContent.includes('Desfavorabilidad: 0'),'explicit zero displayed, not unknown');
 check([...host.querySelectorAll('input')].some(i=>i.value===school.schoolKey),'official key populated');
 submit();await until(()=>status().includes('guardada en tu cuenta'));
 check(rows.get('A').profile.positions[0].schoolKey===school.schoolKey,'school choice saved');
 check(rows.get('A').profile.positions[0].school===school.name,'canonical school name saved');
 check(!Object.hasOwn(rows.get('A').profile.positions[0],'classification'),'classification not stored as personal data or legal confirmation');
 coordinator.reset();
 // Recovery UI: explicit own-account GET, no premium gate or write path.
 let reads=0,owner='A',resolveRead;
 const recovery=()=>mountOwnScheduleRecovery(host,{captureSession:()=>{const captured=owner;return ()=>owner===captured;},isCurrent:()=>true,readOwn:()=>{reads++;return new Promise(resolve=>{resolveRead=resolve;});}});
 host.hidden=false;let reader=recovery();
 check(reads===0,'recovery does not auto read');
 check(host.querySelectorAll('button').length===1&&!host.querySelector('form,input'),'read-only controls');
 host.querySelector('button').click();resolveRead({revision:1,modules:['M1-2','T0-1']});
 await until(()=>host.textContent.includes('2 módulos recuperados'));
 check(host.textContent.includes('Martes · Mañana · Módulo 1'),'recovered own timetable');
 check(host.textContent.includes('Lunes · Tarde · Prehora'),'module labels');
 owner='B';reader.refresh();check(!host.firstElementChild,'account change clears read-only data');
 reader=recovery();host.querySelector('button').click();owner='A';resolveRead({revision:1,modules:['T5-7']});
 await until(()=>!host.firstElementChild);check(!host.textContent.includes('Domingo'),'late old-account response discarded');
 reader=recovery();host.querySelector('button').click();resolveRead({revision:0,modules:['M1-1']});
 await until(()=>host.textContent.includes('No se pudieron recuperar'));
 check(!host.querySelector('li'),'invalid data rejected');reader.dispose();
 check(puts===3&&reads===3,'recovery did not write');
 document.querySelector('#result').textContent='APD_CAREER_CHROMIUM_PASS';
}catch(e){document.querySelector('#result').textContent='FAIL: '+e.message;}
await fetch('/__career_result',{method:'POST',body:document.querySelector('#result').textContent});
</script>`;
let report;
const resultPromise=new Promise(resolve=>{report=resolve;});
const server=createServer(async (req,res)=>{
 if(req.method==='POST'&&req.url==='/__career_result'){
  let result='';
  for await(const chunk of req){
   result+=chunk;
   if(result.length>2000){res.writeHead(413);return res.end();}
  }
  res.writeHead(204);res.end();
  report(result);
  return;
 }
 if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page);}
 if(/^\/scripts\/apd-(career-[a-z-]+|account-schedule-core|insigne-planner-entitlement)\.mjs$/.test(req.url)){try{const content=readFileSync('.'+req.url);res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(content);}catch{}}
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=mkdtempSync(join(tmpdir(),'apd-career-browser-'));
const child=spawn(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--no-first-run','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port+'/'
],{stdio:['ignore','ignore','pipe']});
let stderr='';
child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-1500);});
const closed=once(child,'close');
let timer;
try{
 const result=await Promise.race([
  resultPromise,
  closed.then(([code])=>{throw Error('Chromium closed before reporting ('+code+'): '+stderr);}),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Chromium did not report within 45 seconds: '+stderr)),45000);})
 ]);
 assert.equal(result,'APD_CAREER_CHROMIUM_PASS');console.log(result);
}finally{
 clearTimeout(timer);
 child.kill('SIGKILL');
 await closed.catch(()=>{});
 server.close();
 rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}

/* APDocentePBA 2.1 release UI adapter.
 * Reads existing panel DOM and reuses panel_tabs_patch.js functions. Does NOT
 * touch the APD carousel, auth storage, plans, Worker API, or subscriptions.
 * Rollback by removing two apd_ui_v21 assets from index.html.
 */
(function(){
'use strict';
if(window.__APD_UI_V21__)return;
window.__APD_UI_V21__=true;
const $=id=>document.getElementById(id);
const p=$('panel-docente');
if(!p)return;
let rafPending=false,observed=false,checkedToken='',adminNonce=0;
let sidebar,dialog,helpResult;
const TOPICS={
 email:{name:'No llegan los emails',steps:[
 'Verificá que el plan esté vigente y que tengas distrito, cargo y nivel configurados.',
 'Revisá por separado “Alertas activas” y el canal “Email” en Preferencias.',
 'Comprobá spam y correo no deseado. Sin logs no podemos afirmar que se envió un mensaje.',
 'Si persiste, revisaremos la entrega en el proveedor sin cambiar datos de terceros.'
 ],tab:'preferencias'},
 offers:{name:'No aparecen ofertas',steps:[
 'Revisá que los filtros de distrito, cargo, nivel y turno no sean demasiado restrictivos.',
 'Si la API falla debe informarse como error y no como cero ofertas.',
 'Contrastá la vigencia y el cierre de cada publicación con el APD oficial de ABC.'
 ],tab:'alertas'},
 slow:{name:'El panel tarda o falla',steps:[
 'Actualizá la pantalla si quedó una solicitud pendiente; tus preferencias no deben alterarse.',
 'Distinguí “Sin coincidencias” de un error temporal del Worker.',
 'Las mejoras de carga progresiva están en validación y se medirán con una cuenta autorizada.'
 ],tab:'inicio'},
 plan:{name:'Plan vencido o beneficios',steps:[
 'La vigencia, las cuotas y los canales se verifican desde el Worker.',
 'Un fallo de conexión no debe mostrar un plan ficticio ni recortar tus filtros.',
 'Si tu plan está vencido, consultá sus opciones de reactivación antes de editar preferencias.'
 ],tab:'plan'},
 history:{name:'Estadísticas o datos antiguos',steps:[
 'El barrido provincial y las capturas históricas se almacenan por separado.',
 'El último corte provincial auditado fue el 1/11/2026. Esa fecha no es una consulta en vivo.',
 'No se calculan tendencias de 30 días sin capturas recientes confiables.'
 ],tab:'mercado'}
};
function element(tag,cls,label){
 const x=document.createElement(tag);if(cls)x.className=cls;if(label!==undefined)x.textContent=label;return x;
}
function goto(tab){
 if(typeof window.APD_activatePanelTab==='function') window.APD_activatePanelTab(tab,true);
}
function helpDialog(){
 if(dialog)return;
 dialog=element('dialog','apd-v21-help-dialog');dialog.id='apd-v21-help';
 const h=element('div','apd-v21-help-header');
 const head=element('div');head.append(element('h2','','Ayuda para tus alertas'),element('p','','Soluciones guiadas y fuentes oficiales, sin datos personales.'));
 const close=element('button','apd-v21-help-close','Cerrar ✕');close.type='button';close.setAttribute('aria-label','Cerrar ayuda');close.addEventListener('click',()=>dialog.close());
 h.append(head,close);
 const body=element('div','apd-v21-help-body');
 const choices=element('div','apd-v21-help-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','Elegir problema');
 for(const [key,topic] of Object.entries(TOPICS)){
  const b=element('button','',topic.name);b.type='button';b.dataset.topic=key;b.setAttribute('aria-pressed','false');
  b.addEventListener('click',()=>topicView(key));choices.appendChild(b);
 }
 helpResult=element('div','apd-v21-help-result');helpResult.setAttribute('role','status');helpResult.setAttribute('aria-live','polite');
 const defaultText=element('p','', 'Elegí una dificultad para conocer los controles y el siguiente paso.');
 helpResult.appendChild(defaultText);
 body.append(choices,helpResult);
 const official=element('p','','Para consultar o postularte, utilizá siempre el APD oficial de ABC: ');
 const url=element('a','', 'Abrir APD oficial ↗');url.href='https://misservicios.abc.gob.ar/actos.publicos.digitales/';url.rel='noopener noreferrer';url.target='_blank';
 official.appendChild(url);body.appendChild(official);
 dialog.append(h,body);
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 document.body.appendChild(dialog);
}
function topicView(key){
 const t=TOPICS[key];if(!t)return;
 for(const b of dialog.querySelectorAll('[data-topic]'))b.setAttribute('aria-pressed',String(b.dataset.topic===key));
 helpResult.replaceChildren();
 helpResult.appendChild(element('strong','',t.name));
 const ol=element('ol');
 for(const value of t.steps)ol.appendChild(element('li','',value));
 const action=element('button','apd-v21-help-close','Ir a '+(t.tab==='mercado'?'Estadísticas':t.tab==='inicio'?'Resumen':t.tab==='preferencias'?'Preferencias':t.tab==='plan'?'Mi plan':'Alertas')+' →');
 action.type='button';action.addEventListener('click',()=>{dialog.close();goto(t.tab);});
 helpResult.append(ol,action);
}
function openHelp(){helpDialog();if(!dialog.open)dialog.showModal();}
function ensureSidebar(){
 if(sidebar)return;
 sidebar=element('aside','apd-v21-sidebar');sidebar.id='apd-ui-v21-sidebar';sidebar.hidden=true;
 sidebar.setAttribute('aria-label','Menú principal de APDocentePBA');
 const brand=element('a','apd-v21-sidebar-brand');brand.href='#';brand.addEventListener('click',e=>{e.preventDefault();goto('inicio');});
 brand.append(element('span','', '🔔'));
 const brandLabel=element('div','');brandLabel.append(element('strong','', 'APDocentePBA'),element('small','', 'Tu espacio docente PBA'));brand.append(brandLabel);
 const foot=element('div','apd-v21-sidebar-footer');
 const button=element('button','', 'ⓘ Ayuda y solución de problemas');button.id='apd-v21-open-help';button.type='button';button.addEventListener('click',openHelp);
 foot.append(button,element('p','', 'Los trámites y postulaciones se realizan en los portales oficiales de ABC.'));
 sidebar.append(brand,foot);
 const header=document.querySelector('.header');
 if(header)header.insertAdjacentElement('afterend',sidebar);else document.body.prepend(sidebar);
}
function attachTabs(){
 ensureSidebar();
 const tabs=$('apd-top-tabs');if(!tabs)return false;
 if(tabs.parentElement!==sidebar)sidebar.insertBefore(tabs,sidebar.querySelector('.apd-v21-sidebar-footer'));
 const labels={inicio:'▦  Resumen',alertas:'🔔  Alertas',perfil:'▤  Listados',repo:'🧰  Herramientas',plan:'◈  Mi plan',mercado:'▥  Estadísticas',preferencias:'⚙  Preferencias',admin:'🔒  Administración'};
 for(const btn of tabs.querySelectorAll('[data-top-tab-key]')){
  const code=btn.dataset.topTabKey;
  if(labels[code]&&btn.textContent!==labels[code])btn.textContent=labels[code];
 }
 return true;
}
function ensureChecklist(){
 const g=document.querySelector('#panel-tab-pane-inicio .panel-tab-grid');if(!g||$('apd-v21-activation'))return;
 const card=element('section','panel-card span-12 apd-v21-check');card.id='apd-v21-activation';
 const title=element('h3','', 'Comprobá tu configuración antes de esperar avisos');
 const description=element('p','','Lista manual orientativa; marcar una casilla no verifica el Worker ni envía notificaciones.');
 const counter=element('p','', '0 de 3 pasos marcados (en esta pantalla)');
 counter.id='apd-v21-activation-count';counter.setAttribute('role','status');counter.setAttribute('aria-live','polite');
 const row=element('div','apd-v21-checkrow');
 const parts=[
  ['Configuré distrito, cargo y nivel','Los filtros pueden limitar las coincidencias.'],
  ['Verifiqué el email y las alertas','Se habilitan por separado y dependen del plan.'],
  ['Consulté el APD oficial','La postulación se realiza en ABC.']
 ];
 for(const [title,detail]of parts){
  const l=element('label');const input=document.createElement('input');input.type='checkbox';input.name='apd-v21-check-manual';
  const t=element('span');t.append(element('strong','',title),element('small','',detail));l.append(input,t);row.appendChild(l);
  input.addEventListener('change',()=>{const n=row.querySelectorAll('input:checked').length;counter.textContent=n+' de 3 pasos marcados (en esta pantalla)';});
 }
 const actions=element('div','apd-v21-check-actions');
 const prefs=element('button','primary','Revisar preferencias');prefs.type='button';prefs.addEventListener('click',()=>goto('preferencias'));
 const help=element('button','','¿No llegan avisos?');help.type='button';help.addEventListener('click',openHelp);
 const abc=element('a','','Abrir APD oficial ↗');abc.href='https://misservicios.abc.gob.ar/actos.publicos.digitales/';abc.rel='noopener noreferrer';abc.target='_blank';
 actions.append(prefs,help,abc);
 card.append(title,description,counter,row,actions);
 const hero=$('apd-panel-benefits')||$('apd-panel-showcase');
 if(hero?.parentElement===g)hero.insertAdjacentElement('afterend',card);else g.appendChild(card);
}
function panelVisible(){return !p.classList.contains('hidden');}
function requestAdmin(){
 const token=String(window.obtenerAuthBearer?.()||'');
 if(!token){checkedToken='';document.body.classList.remove('apd-ui-v21-admin');window.APD_adminAccessConfirmed=false;return;}
 if(token===checkedToken)return;
 checkedToken=token;const nonce=++adminNonce;
 window.APD_adminAccessConfirmed=false;
 document.body.classList.remove('apd-ui-v21-admin');
 window.APD_refreshPanelTabs?.();
 if(typeof window.adminApiGet!=='function')return;
 Promise.resolve().then(()=>window.adminApiGet('/api/admin/me')).then(res=>{
  if(nonce!==adminNonce||String(window.obtenerAuthBearer?.()||'')!==token||!panelVisible())return;
  const authorized=res?.user?.es_admin===true;
  window.APD_adminAccessConfirmed=authorized;
  document.body.classList.toggle('apd-ui-v21-admin',authorized);
  window.APD_refreshPanelTabs?.();
 }).catch(()=>{if(nonce===adminNonce){window.APD_adminAccessConfirmed=false;document.body.classList.remove('apd-ui-v21-admin');window.APD_refreshPanelTabs?.();}});
}
function refresh(){
 rafPending=false;
 const visible=panelVisible();
 document.body.classList.toggle('apd-ui-v21-live',visible);
 if(!visible){
  if(sidebar)sidebar.hidden=true;
  document.body.classList.remove('apd-ui-v21-admin');
  window.APD_adminAccessConfirmed=false;
  checkedToken='';adminNonce++;
  if(dialog?.open)dialog.close();
  return;
 }
 ensureSidebar();sidebar.hidden=false;attachTabs();ensureChecklist();requestAdmin();
}
function schedule(){if(rafPending)return;rafPending=true;requestAnimationFrame(refresh);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
new MutationObserver(schedule).observe(p,{attributes:true,attributeFilter:['class']});
window.addEventListener('pageshow',schedule);
setTimeout(schedule,240);setTimeout(schedule,1200);
})();

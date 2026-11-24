import {HISTORY_WINDOWS,projectPersonalHistory} from './apd-personal-history.mjs?v=20261124-history1';
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;};
const date=v=>v?new Date(v).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}):'Sin fecha verificable';
export function mountPersonalHistory(host,{fetchSummary,isCurrent}){
 let generation=0,controller=null;
 const root=el('section',undefined,'apd-history-personal');
 root.append(el('h3','Tus oportunidades anteriores'),el('p','Según tus preferencias guardadas y las capturas disponibles. No es un historial de postulaciones ni una lista de ofertas activas.','apd-comparator-hint'));
 const form=el('form',undefined,'apd-history-tools'),label=el('label','Período '),select=el('select');
 select.setAttribute('aria-label','Período histórico');
 for(const days of HISTORY_WINDOWS){const op=el('option',days+' días');op.value=String(days);select.append(op);}select.value='30';label.append(select);
 const submit=el('button','Consultar historial','btn btn-secondary');submit.type='submit';form.append(label,submit);
 const status=el('p','Elegí un período y consultá tus oportunidades anteriores.','apd-comparator-hint');status.setAttribute('role','status');
 const output=el('div',undefined,'apd-history-results');root.append(form,status,output);host.replaceChildren(root);host.hidden=false;
 const current=()=>root.isConnected&&isCurrent();
 const cancel=()=>{generation++;controller?.abort();controller=null;output.replaceChildren();submit.disabled=false;};
 select.addEventListener('change',()=>{cancel();status.textContent='Período cambiado. Consultá nuevamente.';});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!current())return;
  cancel();const seq=generation,days=Number(select.value);controller=new AbortController();const requestController=controller;
  submit.disabled=true;status.textContent='Consultando capturas…';
  const timer=setTimeout(()=>requestController.abort(),15000);
  try{
   const raw=await fetchSummary(days,requestController.signal);
   if(seq!==generation||!current())return;
   const data=projectPersonalHistory(raw,days);
   status.textContent=data.empty?'El servidor no informó capturas coincidentes en este período.':data.total.toLocaleString('es-AR')+' ofertas únicas informadas por el histórico.';
   if(data.message)output.append(el('p',data.message));
   output.append(el('p','Última captura informada: '+date(data.latest),'apd-comparator-hint'));
   output.append(el('p','Cobertura parcial: el servidor devuelve hasta seis oportunidades recientes; no representa todas las publicaciones del período. Una respuesta vacía no confirma ausencia de publicaciones.','apd-comparator-hint'));
   for(const row of data.rows){
    const card=el('article',undefined,'apd-history-row');
    card.append(el('strong',[row.cargo||'Cargo sin descripción',row.area].filter(Boolean).join(' · ')),
     el('p',[row.district,row.school,row.turn].filter(Boolean).join(' · '),'apd-comparator-hint'),
     el('p',row.status,'apd-favorite-status'),
     el('p','Estado en captura: '+(row.capturedState||'Sin informar')+' · '+date(row.capturedAt),'apd-comparator-hint'));
    output.append(card);
   }
   output.append(el('p','No permite calcular chances de adjudicación. Para verificar oportunidades vigentes, consultá Alertas o ABC.','apd-comparator-hint'));
  }catch{if(seq===generation&&current())status.textContent='No se pudo verificar el historial. Reintentá; una falla no equivale a cero ofertas.';}
  finally{clearTimeout(timer);if(seq===generation&&current()){controller=null;submit.disabled=false;}}
 });
 return ()=>{cancel();root.remove();host.hidden=true;};
}

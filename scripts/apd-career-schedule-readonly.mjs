/** Recovery-only UI for account-owned timetable. Never changes entitlement, storage or planner state. */
import {validateModuleSchedule,validateScheduleRow} from './apd-account-schedule-core.mjs';
const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export function mountOwnScheduleRecovery(host,{readOwn,captureSession,isCurrent}){
 const root=document.createElement('section');
 const title=document.createElement('h3');title.textContent='Horarios guardados en tu cuenta';
 const help=document.createElement('p');help.textContent='Podés consultar tus horarios anteriores. Editarlos y comparar ofertas requiere un plan habilitado.';
 const load=document.createElement('button');load.type='button';load.textContent='Recuperar mis horarios';
 const status=document.createElement('p');status.setAttribute('role','status');
 const list=document.createElement('ul');root.append(title,help,load,status,list);
 const session=captureSession();
 let disposed=false,busy=false;
 const current=()=>!disposed&&root.isConnected&&session()&&isCurrent()===true;
 const dispose=()=>{disposed=true;list.replaceChildren();status.textContent='';root.remove();};
 load.addEventListener('click',async()=>{
  if(!current()){dispose();return;}
  if(busy)return;
  busy=true;load.disabled=true;list.replaceChildren();status.textContent='Recuperando…';
  try{
   const result=await readOwn();
   if(!current()){dispose();return;}
   const record=result?.revision===0&&Array.isArray(result.modules)&&result.modules.length===0
    ?{modules:[],revision:0}:validateScheduleRow(result);
   const modules=validateModuleSchedule(record.modules);
   for(const id of modules){
    const item=document.createElement('li');
    const [slot,day]=id.split('-');
    item.textContent=days[Number(day)-1]+' · '+(slot[0]==='M'?'Mañana':'Tarde')+' · '+(slot[1]==='0'?'Prehora':'Módulo '+slot[1]);
    list.append(item);
   }
   status.textContent=modules.length?modules.length+' módulos recuperados. Solo lectura.':'No tenés módulos guardados.';
  }catch{
   if(!current()){dispose();return;}
   list.replaceChildren();status.textContent='No se pudieron recuperar los horarios. Volvé a intentar.';
  }finally{busy=false;if(current())load.disabled=false;}
 });
 host.replaceChildren(root);
 return Object.freeze({dispose,refresh(){if(!current())dispose();}});
}

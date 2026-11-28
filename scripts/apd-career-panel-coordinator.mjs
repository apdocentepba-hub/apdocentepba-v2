/** Account host coordinator. Never remount on a same-session carousel refresh. */
import {mountCareerEditor} from './apd-career-editor-ui.mjs';
import {hasInsignePlannerAccess} from './apd-insigne-planner-entitlement.mjs';
export function hasCareerPanelAccess(plan,now=Date.now()){
 if(!hasInsignePlannerAccess(plan,now))return false;
 const sub=plan.subscription;
 if(!['COMPLETO','TRIAL_14D'].includes(String(sub.plan_code||'').trim().toUpperCase()))return true;
 return typeof sub.started_at==='string'&&Number.isFinite(Date.parse(sub.started_at))&&Date.parse(sub.started_at)<=now;
}
export function createCareerPanelCoordinator(){
 let mounted=null;
 function reset(){mounted?.dispose();if(mounted)mounted.host.hidden=true;mounted=null;}
 function sync({enabled,host,plan,client,scheduleClient,schoolCatalog=null,isCurrent,getPlan=()=>plan,onConfirmed=()=>{}}){
  if(!enabled||!host||!hasCareerPanelAccess(plan)||!client||!scheduleClient||!isCurrent()){
   reset();if(host){host.hidden=true;host.replaceChildren();}return;
  }
  const current=client.captureSession();
  if(mounted&&(mounted.host!==host||mounted.client!==client||!mounted.current()||!host.contains(mounted.root)))reset();
  const schedule=scheduleClient.peek();
  if(!schedule){if(!mounted){host.hidden=false;host.textContent='Recuperá primero tus horarios guardados para declarar tus cargos.';}return;}
  if(mounted){
   const signature=JSON.stringify(schedule.modules);
   if(signature!==mounted.signature){mounted.signature=signature;mounted.dispose.updateLegacy(schedule.modules);}
   return;
  }
  host.hidden=false;
  const valid=()=>current()&&isCurrent()&&hasCareerPanelAccess(getPlan());
  const dispose=mountCareerEditor(host,{client,legacyModules:schedule.modules,schoolCatalog,isCurrent:valid,onConfirmed:record=>{if(valid())onConfirmed(record);}});
  mounted={host,client,current:valid,dispose,signature:JSON.stringify(schedule.modules),root:host.firstElementChild};
 }
 return Object.freeze({sync,reset});
}

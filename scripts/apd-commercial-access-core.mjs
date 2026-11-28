// Composable server-side resolver. Dependencies are the existing Worker functions.
export function commercialAccessCore({resolveAccess,offer,legacyChoose,legacyActive,normalizePlan,normalizeSub,legacyFallback}) {
 const norm=v=>String(v??'').trim().toUpperCase();
 const newCodes=new Set(['FREE','COMPLETO','TRIAL_14D']);
 const legacyCodes=new Set(['TRIAL_7D','BASIC','PLUS','PREMIUM','PRO','INSIGNE','SIGNATURE','PLUS_ANUAL','PREMIUM_ANUAL','PRO_ANUAL','INSIGNE_ANUAL','SIGNATURE_ANUAL','BASIC_ANUAL']);
 const validStatuses=new Set(['ACTIVE','AUTHORIZED','APPROVED']);
 function preset(code){
  code=norm(code);if(!newCodes.has(code))return null;
  const spec=code==='FREE'?offer.free:code==='COMPLETO'?offer.complete:offer.trial;
  const complete=code!=='FREE';
  return {code,nombre:code==='FREE'?'Gratis':code==='COMPLETO'?'Completo':'Prueba de Completo',
   descripcion:complete?'Todas las herramientas de gestión docente':'Alertas básicas permanentes',
   price_ars:spec.price_ars,trial_days:code==='TRIAL_14D'?14:0,
   max_distritos:spec.max_distritos,max_distritos_normales:spec.max_distritos,
   max_distritos_emergencia:0,max_cargos:spec.max_cargos,is_active:true,public_visible:code!=='TRIAL_14D',
   sort_order:code==='FREE'?10:20,mercadopago_plan_id:null,
   feature_flags:{email:true,telegram:true,whatsapp:complete,provincia:complete,insights_plus:complete,
    telegram_coming_soon:false,whatsapp_coming_soon:false,emergency_districts:false}};
 }
 function state(row,now){
  return resolveAccess({authenticated:true,historyVerified:true,subscription:row,now});
 }
 function intervalStart(row,now){
  const raw=row?.started_at;
  if(typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(raw))return 'invalid';
  const start=Date.parse(raw),end=Date.parse(norm(row.plan_code)==='TRIAL_14D'?row.trial_ends_at:row.current_period_ends_at);
  if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return 'invalid';
  return start<=now?'started':'future';
 }
 function choose(rows,now){
  if(!Array.isArray(rows)||!Number.isFinite(now))throw Error('Unverified subscription history');
  for(const row of rows)if(!row||!newCodes.has(norm(row.plan_code))&&!legacyCodes.has(norm(row.plan_code)))throw Error('Unknown subscription code');
  const old=legacyChoose(rows.filter(r=>legacyCodes.has(norm(r.plan_code))));
  const paid=[],trial=[],courtesy=[];
  for(const row of rows.filter(r=>['COMPLETO','TRIAL_14D'].includes(norm(r.plan_code)))){
   const status=norm(row.status);
   // Pending checkout never masks the previous valid trial/contract.
   if(!validStatuses.has(status))continue;
   const result=state(row,now);
   if(result.tier==='UNVERIFIED')throw Error('Unverified subscription expiry');
   if(result.complete){
    const interval=intervalStart(row,now);
    if(interval==='invalid')throw Error('Unverified subscription start');
    if(interval==='future')continue;
    if(norm(row.plan_code)==='COMPLETO'&&row.source==='legacy_transition_30d'){
     const start=Date.parse(row.started_at),end=Date.parse(row.current_period_ends_at);
     if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Unverified courtesy period');
     if(start<=now)courtesy.push(row);
    }else (result.trial?trial:paid).push(row);
   }
  }
  // Only the server-created one-time migration grant supersedes finite legacy access.
  // An indefinite or recurring legacy right is never shortened or replaced here.
  if(courtesy.length>1)throw Error('Duplicate legacy transition grant');
  if(courtesy.length===1&&(!old||!legacyActive({subscription:old})||(!old.mercadopago_preapproval_id&&Number.isFinite(Date.parse(old.current_period_ends_at||old.trial_ends_at))&&Date.parse(old.current_period_ends_at||old.trial_ends_at)<=Date.parse(courtesy[0].current_period_ends_at)))){
   // A later, already-started paid period must not be masked by a courtesy grant.
   const longerPaid=paid.filter(row=>Number.isFinite(Date.parse(row.started_at))&&Date.parse(row.started_at)<=now&&Date.parse(row.current_period_ends_at)>Date.parse(courtesy[0].current_period_ends_at)).sort((a,b)=>Date.parse(b.current_period_ends_at)-Date.parse(a.current_period_ends_at));
   return longerPaid[0]||courtesy[0];
  }
  if(old&&legacyActive({subscription:old}))return old;
  // A confirmed paid period takes precedence over a free trial.
  // Row order is not entitlement priority; prefer the longest currently started period.
  paid.sort((a,b)=>Date.parse(b.current_period_ends_at)-Date.parse(a.current_period_ends_at));
  trial.sort((a,b)=>Date.parse(b.trial_ends_at)-Date.parse(a.trial_ends_at));
  return paid[0]||trial[0]||null;
 }
 function ready(catalog){
  if(!Array.isArray(catalog))throw Error('Unverified catalog');
  const relevant=catalog.filter(r=>newCodes.has(norm(r?.code)));
  if(!relevant.length)return false;
  if(relevant.length!==3||new Set(relevant.map(r=>norm(r.code))).size!==3)throw Error('Incomplete commercial catalog');
  if(relevant.every(r=>r.is_active===false))return false;
  if(!relevant.every(r=>r.is_active===true))throw Error('Partial commercial activation');
  for(const row of relevant){
   const p=preset(row.code);
   if(Number(row.price_ars)!==p.price_ars||Number(row.trial_days)!==p.trial_days||Number(row.max_distritos)!==p.max_distritos||Number(row.max_cargos)!==p.max_cargos)throw Error('Commercial catalog mismatch');
  }
  return true;
 }
 function resolve({catalog,rows,account,now}){
  if(!ready(catalog))return {delegateLegacy:true};
  if(!account?.id||account.activo!==true)throw Error('Account not active');
  if(!Array.isArray(rows)||rows.some(r=>r.user_id!==account.id))throw Error('Unverified subscription ownership');
  const row=choose(rows,now);
  if(row){
   const code=norm(row.plan_code);
   const existing=catalog.find(p=>norm(p.code)===code);
   if(newCodes.has(code)&&!existing)throw Error('Missing commercial catalog row');
   return {plan:normalizePlan(existing||legacyFallback(code)),subscription:normalizeSub(row)};
  }
  return {plan:normalizePlan(catalog.find(p=>norm(p.code)==='FREE')),
   subscription:{id:null,user_id:account.id,plan_code:'FREE',status:'ACTIVE',source:'apd_free_verified',started_at:null,trial_ends_at:null,current_period_ends_at:null,mercadopago_preapproval_id:null}};
 }
 function isActive(resolved,now){
  const sub=resolved?.subscription||resolved||{};
  const code=norm(sub.plan_code);
  if(!newCodes.has(code))return legacyActive(resolved);
  const planCode=norm(resolved?.plan?.code||code);
  if(planCode!==code)return false;
  if(code==='FREE')return sub.source==='apd_free_verified'&&norm(sub.status)==='ACTIVE'&&!!sub.user_id;
  if(intervalStart(sub,now)!=='started')return false;
  return state(sub,now).complete===true;
 }
 function completeAccess(resolved,now){
  const code=norm(resolved?.subscription?.plan_code);
  const planCode=norm(resolved?.plan?.code||code);
  if(code==='COMPLETO'||code==='TRIAL_14D')return planCode===code&&isActive(resolved,now);
  return ['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(code)&&['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(planCode)&&legacyActive(resolved)&&validStatuses.has(norm(resolved?.subscription?.status));
 }
 return {preset,choose,ready,resolve,isActive,completeAccess};
}

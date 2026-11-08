/**
 * APDocentePBA private PostgREST adapter — LAB CANDIDATE ONLY.
 *
 * No default fetch, no production service credentials, no network until
 * a trusted server explicitly injects fetchImpl and a private project key.
 * Not imported by worker.js, mobile or any production route.
 *
 * Only the server-side SQL operations are implemented: atomic claim,
 * narrow outbox/device/preferences lookup, cancel and unsent retry. The auth key remains
 * a server-bound secret, NEVER a browser/mobile bearer or notification.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const HOST=/^[a-z0-9-]+\.supabase\.co$/;
const SECRET=/^sb_secret_[A-Za-z0-9_-]{20,}$/;
const MAX_RESPONSE_BYTES=16_384;
function validUrl(raw){
 if(typeof raw!=='string')throw Error('postgrest_configuration_invalid');
 let u;
 try{u=new URL(raw);}catch{throw Error('postgrest_configuration_invalid');}
 if(u.protocol!=='https:'||!HOST.test(u.hostname)||u.port||
    u.username||u.password||u.pathname!=='/'||u.search||u.hash)
  throw Error('postgrest_configuration_invalid');
 return u.origin;
}
function validIds(eventKey,leaseId){
 if(!HEX.test(eventKey||'')||!UUID.test(leaseId||''))
  throw Error('invalid_lease_reference');
}
// Preferences are always server-owned. Translate legacy user_preferences
// columns into the exact *_apd structure used by current Worker match rules.
// Unknown schema/typed values fail closed rather than dropping user filters.
function normPreference(value){
 if(value===null||value===undefined)return '';
 if(typeof value!=='string'||value.length>180)
  throw Error('postgrest_invalid_preferences');
 return value.toUpperCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\p{L}\p{N}\s/().,-]/gu,' ')
  .replace(/\s+/g,' ').trim();
}
function preferenceList(value){
 if(value===null||value===undefined)return [];
 if(!Array.isArray(value)||value.length>30)
  throw Error('postgrest_invalid_preferences');
 const normalized=value.map(normPreference).filter(Boolean);
 return [...new Set(normalized)];
}

function expectOne(data){
 if(!Array.isArray(data)||data.length>1)throw Error('postgrest_ambiguous_result');
 return data[0]||null;
}
export function createMobilePushPostgrestAdapterLab({
 projectUrl,secretKey,fetchImpl,timeoutMs=3000
}={}){
 const origin=validUrl(projectUrl);
 if(typeof secretKey!=='string'||!SECRET.test(secretKey)||
    typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||
    timeoutMs<100||timeoutMs>5000)
  throw Error('postgrest_configuration_invalid');

 async function request(path,{method='GET',body=null,query=null}={}){
  const url=new URL('/rest/v1/'+path,origin);
  if(query){
   for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
  }
  const headers={
   apikey:secretKey,Accept:'application/json',
   'Cache-Control':'no-store'
  };
  if(body!==null)headers['Content-Type']='application/json';
  let response;
  try{
   response=await fetchImpl(url.toString(),{
    method,headers,redirect:'manual',credentials:'omit',
    cache:'no-store',referrerPolicy:'no-referrer',
    signal:AbortSignal.timeout(timeoutMs),
    ...(body!==null?{body:JSON.stringify(body)}:{})
   });
  }catch{throw Error('postgrest_unavailable');}
  if(!response||!Number.isInteger(response.status)||
     response.status<200||response.status>=300||!response.ok)
   throw Error('postgrest_unavailable');
  const mime=response.headers?.get('content-type')||'';
  if(!/^application\/(?:json|[\w.-]+\+json)(?:\s*;|\s*$)/i.test(mime))
   throw Error('postgrest_invalid_response');
  let payload;
  try{
   const raw=await response.text();
   if(new TextEncoder().encode(raw).length>MAX_RESPONSE_BYTES)
    throw Error('oversized');
   payload=JSON.parse(raw);
  }catch{throw Error('postgrest_invalid_response');}
  return payload;
 }

 return Object.freeze({
  async claim({limit,leaseSeconds}={}){
   if(!Number.isInteger(limit)||limit<1||limit>10||
      !Number.isInteger(leaseSeconds)||leaseSeconds<10||leaseSeconds>120)
    throw Error('invalid_claim_bounds');
   const data=await request('rpc/apd_mobile_claim_push',{
    method:'POST',body:{p_limit:limit,p_lease_seconds:leaseSeconds}
   });
   if(!Array.isArray(data)||data.length>limit)
    throw Error('postgrest_ambiguous_result');
   return data;
  },
  async readActiveLease({eventKey,leaseId}={}){
   validIds(eventKey,leaseId);
   const data=await request('apd_mobile_push_outbox',{
    query:{
     select:'event_key,user_id,device_id,source_offer_key,status,lease_id,leased_until',
     event_key:'eq.'+eventKey,lease_id:'eq.'+leaseId,
     status:'eq.leased',limit:2
    }
   });
   return expectOne(data);
  },
  async readOwnedDevice({userId,deviceId}={}){
   if(!UUID.test(userId||'')||!UUID.test(deviceId||''))
    throw Error('invalid_user_device_reference');
   const data=await request('apd_mobile_push_devices',{
    query:{
     select:'id,user_id,platform,transport,enabled,opted_in,revoked_at',
     id:'eq.'+deviceId,user_id:'eq.'+userId,limit:2
    }
   });
   const row=expectOne(data);
   if(!row)return null;
   if(row.id!==deviceId||row.user_id!==userId||
      !['android','ios'].includes(row.platform)||
      !['expo','fcm','apns'].includes(row.transport)||
      typeof row.enabled!=='boolean'||typeof row.opted_in!=='boolean'||
      !(row.revoked_at===null||typeof row.revoked_at==='string'))
    throw Error('postgrest_invalid_device');
   // The candidate DB schema requires a non-null encrypted token for every
   // device row, even a revoked one. It is deliberately never SELECTed.
   return {
    id:row.id,user_id:row.user_id,platform:row.platform,
    transport:row.transport,enabled:row.enabled,opted_in:row.opted_in,
    token_available:true,token_revoked:row.revoked_at!==null
   };
  },
  async readUserPreferences({userId}={}){
   if(!UUID.test(userId||''))throw Error('invalid_user_preferences_reference');
   const data=await request('user_preferences',{
    query:{
     select:'user_id,distrito_principal,otros_distritos,cargos,materias,niveles,turnos,alertas_activas',
     user_id:'eq.'+userId,limit:2
    }
   });
   const row=expectOne(data);
   if(!row)return null;
   if(row.user_id!==userId||typeof row.alertas_activas!=='boolean')
    throw Error('postgrest_invalid_preferences');
   const distrito=normPreference(row.distrito_principal);
   const otros=preferenceList(row.otros_distritos);
   const cargos=preferenceList(row.cargos);
   const materias=preferenceList(row.materias);
   const niveles=preferenceList(row.niveles);
   const turnos=preferenceList(row.turnos);
   // An active mobile alert with no district OR no subject/cargo filter may
   // turn into province-wide broadcasts. The candidate fails closed.
   if(row.alertas_activas===true&&
      (!distrito&&!otros.length||!cargos.length&&!materias.length))
    throw Error('postgrest_preferences_not_scoped');
   return Object.freeze({
    user_id:userId,alertas_activas:row.alertas_activas,
    distrito_principal_apd:distrito,otros_distritos_apd:otros,
    cargos_apd:cargos,materias_apd:materias,
    niveles,turnos
   });
  },
  async readAccountActive({userId}={}){
   if(!UUID.test(userId||''))throw Error('invalid_account_reference');
   const rows=await request('users',{query:{
    select:'id,activo',id:'eq.'+userId,limit:2
   }});
   const row=expectOne(rows);
   if(!row)return null;
   if(row.id!==userId||typeof row.activo!=='boolean')
    throw Error('postgrest_invalid_account');
   // Never query account email, sessions, password, names or phone.
   return Object.freeze({user_id:userId,active:row.activo});
  },
  async readSubscriptionCandidates({userId}={}){
   if(!UUID.test(userId||''))throw Error('invalid_subscription_reference');
   const rows=await request('user_subscriptions',{query:{
    select:'id,user_id,plan_code,status,created_at,trial_ends_at,current_period_ends_at',
    user_id:'eq.'+userId,order:'created_at.desc',limit:6
   }});
   if(!Array.isArray(rows)||rows.length>=6)
    throw Error('postgrest_subscription_set_ambiguous');
   const uuids=new Set();
   return Object.freeze(rows.map(row=>{
    if(!row||!UUID.test(row.id||'')||uuids.has(row.id)||
       row.user_id!==userId||typeof row.plan_code!=='string'||
       row.plan_code.length<1||row.plan_code.length>40||
       typeof row.status!=='string'||row.status.length<1||
       row.status.length>40||typeof row.created_at!=='string'||
       row.created_at.length>60||
       ![row.trial_ends_at,row.current_period_ends_at]
        .every(v=>v===null||typeof v==='string'&&v.length<=60))
     throw Error('postgrest_invalid_subscription');
    uuids.add(row.id);
    return Object.freeze({
     id:row.id,user_id:userId,
     plan_code:row.plan_code,status:row.status,
     created_at:row.created_at,trial_ends_at:row.trial_ends_at,
     current_period_ends_at:row.current_period_ends_at
    });
   }));
  },
  async readCatalogPlan({planCode}={}){
   if(typeof planCode!=='string'||
      !['TRIAL_7D','PLUS','PREMIUM','INSIGNE'].includes(planCode))
    throw Error('invalid_catalog_plan_reference');
   const rows=await request('subscription_plans',{query:{
    select:'code,is_active',code:'eq.'+planCode,limit:2
   }});
   const row=expectOne(rows);
   if(!row)return null;
   if(row.code!==planCode||typeof row.is_active!=='boolean')
    throw Error('postgrest_invalid_catalog_plan');
   return Object.freeze({code:planCode,is_active:row.is_active});
  },
  async listExpoPendingReceiptChecks({nowMs=Date.now(),limit=10}={}){
   if(!Number.isFinite(nowMs)||nowMs<0||
      !Number.isInteger(limit)||limit<1||limit>20)
    throw Error('invalid_receipt_poll_window');
   // Expo receipts should be looked up after approx 15 minutes and expire
   // around 24 hours. Search ONLY in the still-plausible age window.
   const oldest=new Date(nowMs-23*3600_000).toISOString();
   const newest=new Date(nowMs-15*60_000).toISOString();
   const data=await request('apd_mobile_expo_receipt_correlation',{
    query:{
     select:'event_key,dispatch_id,ticket_id,ticket_recorded_at,tracking_state',
     tracking_state:'eq.awaiting_receipt',
     and:'(ticket_recorded_at.gte.'+oldest+
       ',ticket_recorded_at.lte.'+newest+')',
     order:'ticket_recorded_at.asc',limit:limit+1
    }
   });
   if(!Array.isArray(data)||data.length>limit)
    throw Error('receipt_poll_window_ambiguous');
   const seen=new Set();
   return Object.freeze(data.map(row=>{
    const stamp=typeof row?.ticket_recorded_at==='string'?
     Date.parse(row.ticket_recorded_at):NaN;
    if(!HEX.test(row?.event_key||'')||!UUID.test(row?.dispatch_id||'')||
       typeof row?.ticket_id!=='string'||
       !/^[A-Za-z0-9_-]{8,200}$/.test(row.ticket_id)||
       row.tracking_state!=='awaiting_receipt'||
       !Number.isFinite(stamp)||stamp<nowMs-23*3600_000||
       stamp>nowMs-15*60_000||seen.has(row.ticket_id))
     throw Error('invalid_private_receipt_candidate');
    seen.add(row.ticket_id);
    return Object.freeze({
     eventKey:row.event_key,dispatchId:row.dispatch_id,
     ticketId:row.ticket_id
    });
   }));
  },
  async retireResolvedExpoTickets({limit=10,minAgeDays=90}={}){
   if(!Number.isInteger(limit)||limit<1||limit>20||
      !Number.isInteger(minAgeDays)||minAgeDays<90||minAgeDays>3650)
    throw Error('invalid_expo_retention_bounds');
   // This is redaction-only. The SQL RPC preserves SHA256 tombstones and
   // excludes unknown, revoked and late audited receipts.
   const retired=await request('rpc/apd_mobile_expo_retire_terminal_tickets',{
    method:'POST',body:{
     p_limit:limit,p_min_age_days:minAgeDays
    }
   });
   if(!Number.isInteger(retired)||retired<0||retired>limit)
    throw Error('invalid_expo_retention_result');
   return retired;
  },
  async expireMissingExpoReceipts({limit=20}={}){
   if(!Number.isInteger(limit)||limit<1||limit>20)
    throw Error('invalid_expo_expiry_bounds');
   const total=await request('rpc/apd_mobile_expo_expire_missing_receipts',{
    method:'POST',body:{p_limit:limit}
   });
   if(!Number.isInteger(total)||total<0||total>limit)
    throw Error('invalid_expo_expiry_result');
   // This SQL RPC only marks unknown results as uncertain, never sent.
   return total;
  },
  async recordLateExpoObservation({
   eventKey,dispatchId,ticketId,outcome
  }={}){
   if(!HEX.test(eventKey||'')||!UUID.test(dispatchId||'')||
      typeof ticketId!=='string'||!/^[A-Za-z0-9_-]{8,200}$/.test(ticketId))
    throw Error('invalid_expo_late_reference');
   if(!['provider_accepted','provider_rejected',
        'invalid_device','uncertain'].includes(outcome))
    throw Error('invalid_expo_late_observation');
   const stored=await request('rpc/apd_mobile_expo_record_late_observation',{
    method:'POST',body:{
     p_event_key:eventKey,p_dispatch_id:dispatchId,
     p_ticket_id:ticketId,p_outcome:outcome
    }
   });
   if(typeof stored!=='boolean')
    throw Error('invalid_expo_late_observation_response');
   return stored;
  },
  async recordExpoTicket({eventKey,dispatchId,ticketId}={}){
   if(!HEX.test(eventKey||'')||!UUID.test(dispatchId||'')||
      typeof ticketId!=='string'||!/^[A-Za-z0-9_-]{8,200}$/.test(ticketId))
    throw Error('invalid_expo_receipt_identity');
   const recorded=await request('rpc/apd_mobile_expo_record_ticket',{
    method:'POST',body:{
     p_event_key:eventKey,p_dispatch_id:dispatchId,p_ticket_id:ticketId
    }
   });
   if(typeof recorded!=='boolean')throw Error('postgrest_invalid_expo_ticket_result');
   return recorded;
  },
  async recordExpoReceiptAudit({eventKey,dispatchId,ticketId,outcome}={}){
   if(!HEX.test(eventKey||'')||!UUID.test(dispatchId||'')||
      typeof ticketId!=='string'||!/^[A-Za-z0-9_-]{8,200}$/.test(ticketId))
    throw Error('invalid_expo_receipt_identity');
   if(!['pending','provider_accepted','provider_rejected',
        'invalid_device','uncertain'].includes(outcome))
    throw Error('invalid_expo_receipt_outcome');
   // This records ONLY a service-only audit result, NEVER a delivered flag.
   const stored=await request('rpc/apd_mobile_expo_record_receipt',{
    method:'POST',body:{
     p_event_key:eventKey,p_dispatch_id:dispatchId,
     p_ticket_id:ticketId,p_outcome:outcome
    }
   });
   if(typeof stored!=='boolean')throw Error('postgrest_invalid_expo_receipt_result');
   return stored;
  },
  async prepareDispatch({eventKey,leaseId}={}){
   validIds(eventKey,leaseId);
   const ticket=await request('rpc/apd_mobile_prepare_dispatch',{
    method:'POST',body:{p_event_key:eventKey,p_lease_id:leaseId}
   });
   if(ticket===null)return null;
   if(typeof ticket!=='string'||!UUID.test(ticket))
    throw Error('postgrest_invalid_dispatch_authorization');
   return ticket;
  },
  async resolveWithoutProvider({eventKey,dispatchId,outcome}={}){
   if(!HEX.test(eventKey||'')||!UUID.test(dispatchId||''))
    throw Error('invalid_dispatch_reference');
   // This LAB has NO provider; a simulated success cannot mark delivery.
   // The SQL function's 'accepted' outcome is reserved for a future
   // server-side provider adapter with verified receipt.
   if(outcome!=='uncertain'&&outcome!=='rejected')
    throw Error('provider_acceptance_unsupported_in_lab');
   const result=await request('rpc/apd_mobile_resolve_dispatch',{
    method:'POST',body:{
     p_event_key:eventKey,p_dispatch_id:dispatchId,p_outcome:outcome
    }
   });
   if(typeof result!=='boolean')
    throw Error('postgrest_invalid_dispatch_response');
   return result;
  },
  async quarantineStaleDispatch({limit=20}={}){
   if(!Number.isInteger(limit)||limit<1||limit>100)
    throw Error('invalid_quarantine_bounds');
   const n=await request('rpc/apd_mobile_quarantine_stale_dispatch',{
    method:'POST',body:{p_limit:limit}
   });
   if(!Number.isInteger(n)||n<0||n>limit)
    throw Error('postgrest_invalid_quarantine_result');
   return n;
  },
  async cancel({eventKey,leaseId}={}){
   validIds(eventKey,leaseId);
   const value=await request('rpc/apd_mobile_cancel_push',{
    method:'POST',body:{p_event_key:eventKey,p_lease_id:leaseId}
   });
   if(typeof value!=='boolean')throw Error('postgrest_invalid_response');
   return value;
  },
  async retry({eventKey,leaseId,sent}={}){
   validIds(eventKey,leaseId);
   if(sent!==false)throw Error('send_unsupported_in_lab');
   const value=await request('rpc/apd_mobile_finish_push',{
    method:'POST',body:{p_event_key:eventKey,p_lease_id:leaseId,p_sent:false}
   });
   if(typeof value!=='boolean')throw Error('postgrest_invalid_response');
   return value;
  }
 });
}

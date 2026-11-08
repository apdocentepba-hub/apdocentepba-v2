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

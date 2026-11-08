/**
 * APD Android: exact-key ABC Solr public read-only audit.
 * No auth, no cookies, no persistent offers, no names or IDs in results.
 * Fully bounded to 1 public sample, then 1 or 2 exact-key lookups.
 * NOT a scanner, scheduler, production Worker or notification sender.
 */
import {SOLR_SELECT} from './apd-abc-cursor-full-readonly.mjs';
import {createAbcCurrentOfferVerifierLab} from './mobile-push-abc-current-offer-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const KEY=/^[DO]_[0-9]{1,18}$/;
const MAX_BYTES=48_000;
function sourceKey(doc){
 const digits=v=>String(v??'').replace(/[^0-9]/g,'');
 const detail=digits(doc?.iddetalle||doc?.id||'');
 if(detail)return 'D_'+detail;
 const offer=digits(doc?.idoferta||'');
 return offer?'O_'+offer:'';
}
function safeError(err){
 // No request URL, offer identity, Solr payload or user field in errors.
 if(err?.message==='source_unavailable')return 'source_unavailable';
 if(err?.message==='invalid_source_response')return 'invalid_source_response';
 return 'source_contract_not_verified';
}
async function limitedGet({url,fetchImpl,timeoutMs}){
 if(url.origin!=='https://servicios3.abc.gob.ar'||
    url.pathname!=='/valoracion.docente/api/apd.oferta.encabezado/select')
  throw Error('source_unavailable');
 let res;
 try{
  res=await fetchImpl(url.toString(),{
   method:'GET',redirect:'manual',cache:'no-store',
   credentials:'omit',referrerPolicy:'no-referrer',
   headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(timeoutMs)
  });
 }catch{throw Error('source_unavailable');}
 if(!res||res.status!==200||!res.ok)
  throw Error('source_unavailable');
 if(!/^(application\/json|text\/plain)(\s*;|$)/i.test(res.headers?.get('content-type')||''))
  throw Error('invalid_source_response');
 try{
  const body=await res.arrayBuffer();
  if(body.byteLength>MAX_BYTES)throw Error('size');
  const data=JSON.parse(new TextDecoder('iso-8859-1').decode(body));
  if(data?.responseHeader?.status!==0||
     data?.responseHeader?.partialResults===true||
     !Number.isSafeInteger(data?.response?.numFound)||
     data.response.numFound<0||
     !Array.isArray(data?.response?.docs)||
     data.response.docs.length>1)
   throw Error('schema');
  return data;
 }catch{throw Error('invalid_source_response');}
}
/**
 * The audit only returns tiny boolean counters, not source records.
 * A missing public offer sample is NOT proof of API or key compatibility.
 * Source errors and lookup mismatches remain explicit unknown states.
 */
export async function auditMobileAbcExactLookupReadOnlyLab({
 fetchImpl,now=()=>Date.now(),timeoutMs=5000
}={}){
 if(typeof fetchImpl!=='function'||typeof now!=='function'||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
  throw Error('invalid_audit_dependencies');
 const status={
  schema_version:1,source:'ABC Solr public encabezado',
  mode:'read_only_minimal',credentials_used:false,
  personal_data_requested:false,offer_ids_logged:false,
  production_modified:false,provider_calls:0,
  source_reachable:false,sample_available:false,
  source_key_supported:false,exact_key_lookup_verified:false,
  source_contract_verified:false,reads:0
 };
 // rows=1: prefer a published sample, but do not require one to exist.
 const url=new URL(SOLR_SELECT);
 url.searchParams.set('q','estado:"Publicada"');
 url.searchParams.set('rows','1');
 url.searchParams.set('wt','json');
 url.searchParams.set('fl','id,iddetalle,idoferta,estado,finoferta,descdistrito,descripcioncargo,descripcionarea,turno,descnivelmodalidad');
 try{
  status.reads++;
  const payload=await limitedGet({url,fetchImpl,timeoutMs});
  status.source_reachable=true;
  const doc=payload.response.docs[0];
  if(!doc||typeof doc!=='object')return status;
  status.sample_available=true;
  const key=sourceKey(doc);
  if(!KEY.test(key))return status;
  status.source_key_supported=true;
  let lookups=0;
  const verifier=createAbcCurrentOfferVerifierLab({
   fetchImpl:async(url,opts)=>{
    // Every attempt is logged only as an aggregate count; URL never printed.
    lookups++;
    if(lookups>2)throw Error('read_limit_exceeded');
    status.reads++;
    return fetchImpl(url,opts);
   },
   now,timeoutMs:Math.min(timeoutMs,5000),
   preferences:{
    getForUser:async()=>({user_id:USER,alertas_activas:true})
   },
   // Strictly synthetic mismatch; no user preferences or server matching.
   matchWithCurrentPreferences:async()=>({match:false})
  });
  const checked=await verifier.verify({userId:USER,sourceOfferKey:key});
  if(checked&&checked.source_offer_key===key&&
     checked.matched_user_id===USER&&
     checked.compatible===false&&
     checked.source_current===true){
   status.exact_key_lookup_verified=true;
   status.source_contract_verified=true;
  }
  return status;
 }catch(err){
  status.failure_class=safeError(err);
  return status;
 }
}

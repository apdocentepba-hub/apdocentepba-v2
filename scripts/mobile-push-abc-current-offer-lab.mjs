/**
 * APDocentePBA — direct ABC current-offer read and compatibility proof.
 * LAB CONTRACT ONLY. No default fetch, no public route, no DB, no sender.
 * This MUST be injected server-side into repository.offers.verify.
 *
 * Source-key format and fields checked against worker.js (2026-11-08):
 * D_<iddetalle or Solr id> / O_<idoferta>, estado, finoferta,
 * descdistrito, descripcioncargo/descripcionarea, turno, descnivelmodalidad.
 * Actual matching still requires the production APD matching engine,
 * injected as matchWithCurrentPreferences. Never trust a stored match flag.
 */
const ABC_SELECT='https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select';
const UID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[DO]_[0-9]{1,18}$/;
const FIELDS='id,iddetalle,idoferta,estado,finoferta,descdistrito,descripcioncargo,cargo,descripcionarea,materia,asignatura,descripcionmateria,turno,descnivelmodalidad';
const CLOSED=new Set(['ANULADA','ANULADO','DESIGNADA','DESIGNADO','CERRADA','CERRADO','DESIERTA','DESIERTO','FINALIZADA','FINALIZADO']);
const SAFE_SIZE=48_000;
const normalize=value=>typeof value==='string'?
 value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase():'';
const digits=value=>String(value??'').replace(/[^0-9]/g,'');
function canonicalWorkerKey(doc){
 const detail=digits(doc?.iddetalle||doc?.id||'');
 if(detail)return 'D_'+detail;
 const offer=digits(doc?.idoferta||'');
 return offer?'O_'+offer:'';
}
function validCalendar(year,month,day){
 if(year<2020||year>2100||month<1||month>12||day<1||day>31)return false;
 const d=new Date(Date.UTC(year,month-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()+1===month&&d.getUTCDate()===day;
}
/** Strict close time; Buenos Aires without timezone is explicitly UTC-03. */
export function parseAbcCloseInstantLab(value){
 if(typeof value!=='string')return null;
 const s=value.trim();
 let m=s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$/i);
 let year,month,day,hour,min,sec,zone;
 if(m){
  year=+m[1];month=+m[2];day=+m[3];
  hour=+m[4];min=+m[5];sec=+(m[6]||0);zone=m[7]||'-03:00';
 }else{
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[, ]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(!m)return null;
  day=+m[1];month=+m[2];year=+m[3];
  hour=+m[4];min=+m[5];sec=+(m[6]||0);zone='-03:00';
 }
 if(!validCalendar(year,month,day)||hour>23||min>59||sec>59)return null;
 let offset=0;
 if(zone.toUpperCase()!=='Z'){
  const o=zone.match(/^([+-])(\d{2}):(\d{2})$/);
  if(!o)return null;
  const oh=+o[2],om=+o[3];
  if(oh>14||om>59||(oh===14&&om!==0))return null;
  offset=(o[1]==='+'?1:-1)*(oh*60+om);
 }
 const utc=Date.UTC(year,month-1,day,hour,min,sec)-offset*60_000;
 return Number.isFinite(utc)?utc:null;
}
async function fetchUniqueOffer({sourceOfferKey,fetchImpl,timeoutMs}){
 const [,type,value]=sourceOfferKey.match(/^([DO])_([0-9]{1,18})$/)||[];
 if(!type)throw Error('abc_invalid_source_key');
 const filters=type==='D'?['iddetalle','id']:['idoferta'];
 for(const field of filters){
  const u=new URL(ABC_SELECT);
  u.searchParams.set('q',field+':"'+value+'"');
  u.searchParams.set('wt','json');
  u.searchParams.set('rows','2');
  u.searchParams.set('fl',FIELDS);
  let resp;
  try{
   resp=await fetchImpl(u.toString(),{
    method:'GET',redirect:'manual',cache:'no-store',
    credentials:'omit',referrerPolicy:'no-referrer',
    headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(timeoutMs)
   });
  }catch{throw Error('abc_source_unavailable');}
  if(!resp||resp.status!==200||resp.ok!==true)
   throw Error('abc_source_unavailable');
  if(!/^(application\/json|text\/plain)(\s*;|$)/i.test(resp.headers?.get('content-type')||''))
   throw Error('abc_source_invalid_response');
  let payload;
  try{
   const binary=await resp.arrayBuffer();
   if(binary.byteLength>SAFE_SIZE)throw Error('too_large');
   payload=JSON.parse(new TextDecoder('iso-8859-1').decode(binary));
  }catch{throw Error('abc_source_invalid_response');}
  const total=payload?.response?.numFound;
  const docs=payload?.response?.docs;
  if(payload?.responseHeader?.status!==0||
     payload?.responseHeader?.partialResults===true||
     !Number.isSafeInteger(total)||total<0||total>1||
     !Array.isArray(docs)||docs.length!==total)
   throw Error('abc_source_ambiguous_or_partial');
  if(total===0)continue;
  const doc=docs[0];
  if(!doc||typeof doc!=='object'||canonicalWorkerKey(doc)!==sourceOfferKey)
   throw Error('abc_source_key_mismatch');
  return doc;
 }
 // The index may be temporarily inconsistent; absence is not proof of closure.
 return null;
}
/**
 * Preferences and compatibility are server-owned dependencies:
 * preferences.getForUser({userId}) => active preference row;
 * matchWithCurrentPreferences({offer,preferences,userId}) =>
 *   {match:true|false} from the current APDocentePBA matching engine.
 * No boolean supplied by a client or ABC response is accepted as matching.
 */
export function createAbcCurrentOfferVerifierLab({
 fetchImpl,preferences,matchWithCurrentPreferences,now=()=>Date.now(),
 timeoutMs=4000
}={}){
 if(typeof fetchImpl!=='function'||
    typeof preferences?.getForUser!=='function'||
    typeof matchWithCurrentPreferences!=='function'||
    typeof now!=='function'||!Number.isInteger(timeoutMs)||
    timeoutMs<100||timeoutMs>5000)
  throw Error('abc_verifier_dependencies_invalid');
 return Object.freeze({
  async verify({userId,sourceOfferKey}={}){
   if(!UID.test(userId||'')||!KEY.test(sourceOfferKey||''))
    throw Error('abc_verifier_identity_invalid');
   const start=Number(now());
   if(!Number.isFinite(start))throw Error('abc_clock_invalid');
   const doc=await fetchUniqueOffer({sourceOfferKey,fetchImpl,timeoutMs});
   if(!doc)return null;
   const state=normalize(doc.estado);
   if(state!=='PUBLICADA'&&!CLOSED.has(state))return null;
   const expiry=parseAbcCloseInstantLab(doc.finoferta);
   if(expiry===null)return null;
   // Even a closed offer is read from the official source; the preflight
   // explicitly rejects it before any provider call.
   if(state!=='PUBLICADA'||expiry<=start){
    return Object.freeze({
     source_offer_key:sourceOfferKey,matched_user_id:userId,
     compatible:false,published:false,currently_available:false,
     source_current:true,estado:state,verified_at:new Date(start).toISOString(),
     expires_at:new Date(expiry).toISOString()
    });
   }
   // This is NOT a new matching algorithm: the production APD engine is
   // required via injection; unknown/disabled preferences => fail closed.
   const prefs=await preferences.getForUser({userId});
   if(!prefs||prefs.user_id!==userId||prefs.alertas_activas!==true)
    return null;
   const match=await matchWithCurrentPreferences({offer:doc,preferences:prefs,userId});
   if(!match||typeof match!=='object'||typeof match.match!=='boolean')
    return null;
   const verifiedAt=Number(now());
   if(!Number.isFinite(verifiedAt)||verifiedAt<start||verifiedAt-start>timeoutMs*4)
    return null;
   return Object.freeze({
    source_offer_key:sourceOfferKey,matched_user_id:userId,
    compatible:match.match,published:true,
    currently_available:true,source_current:true,estado:'PUBLICADA',
    verified_at:new Date(verifiedAt).toISOString(),
    expires_at:new Date(expiry).toISOString()
   });
  }
 });
}

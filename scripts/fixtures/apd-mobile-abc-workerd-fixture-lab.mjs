/**
 * Synthetic official ABC verification fixture for workerd runtime.
 * The only HTTP handler is the fixture; no public endpoints or provider.
 * Fetch is INJECTED, never the global Worker fetch API.
 */
import {
 createAbcCurrentOfferVerifierLab
} from '../mobile-push-abc-current-offer-lab.mjs';
const USER='11111111-1111-4111-8111-111111111111';
const NOW=Date.parse('2026-11-08T10:00:00Z');
const MODES=new Set([
 'ready','closed','expired','unknown','ambiguous','wrong-key',
 'outage','match-no','preferences-off','fallback','bad-date'
]);
const json=(body,status=200)=>Response.json(body,{status,headers:{
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});
const record=()=>({
 id:'SOLR-999',iddetalle:'123',idoferta:'567',
 estado:'Publicada',finoferta:'08/11/2026 09:00',
 descdistrito:'AVELLANEDA',descripcioncargo:'PRECEPTOR',
 descripcionarea:'',turno:'M',descnivelmodalidad:'SECUNDARIA'
});
const apiResponse=(number,docs)=>Response.json({
 responseHeader:{status:0},response:{numFound:number,docs}
});
export default {
 async fetch(request){
  const url=new URL(request.url);
  const mode=url.pathname.replace(/^\/+/,'');
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  if(!MODES.has(mode))return json({error:'not_found'},404);
  const counts={source:0,prefs:0,matcher:0};
  const sourceFetch=async(input,options)=>{
   const target=new URL(input);
   counts.source++;
   if(target.origin!=='https://servicios3.abc.gob.ar'||
      target.pathname!=='/valoracion.docente/api/apd.oferta.encabezado/select'||
      options.method!=='GET'||options.credentials!=='omit'||
      options.redirect!=='manual'||options.cache!=='no-store')
    throw Error('UNTRUSTED_SOURCE');
   if(mode==='outage')throw Error('FICTIONAL_ABC_IS_DOWN');
   if(mode==='ambiguous')return apiResponse(2,[record(),record()]);
   if(mode==='unknown')return apiResponse(0,[]);
   const doc=record();
   if(mode==='closed')doc.estado='Cerrada';
   if(mode==='expired')doc.finoferta='08/11/2026 06:59';
   if(mode==='wrong-key')doc.iddetalle='999';
   if(mode==='bad-date')doc.finoferta='08/11/2026';
   if(mode==='fallback'){
    if(target.searchParams.get('q')==='iddetalle:"123"')
     return apiResponse(0,[]);
    delete doc.iddetalle;
    doc.id='SOLR-123';
   }
   return apiResponse(1,[doc]);
  };
  const verifier=createAbcCurrentOfferVerifierLab({
   fetchImpl:sourceFetch,now:()=>NOW,
   preferences:{
    getForUser:async({userId})=>{
     counts.prefs++;
     if(userId!==USER)throw Error('INVALID_USER');
     return {user_id:USER,alertas_activas:mode!=='preferences-off',
      distrito_principal:'AVELLANEDA',cargos:['PRECEPTOR']};
    }
   },
   matchWithCurrentPreferences:async({offer,preferences,userId})=>{
    counts.matcher++;
    if(offer.descripcioncargo!=='PRECEPTOR'||userId!==USER||
       preferences.user_id!==USER)
     throw Error('UNKNOWN_OFFICIAL_MATCH');
    return {match:mode!=='match-no'};
   }
  });
  let state='unknown';
  try{
   const result=await verifier.verify({userId:USER,sourceOfferKey:'D_123'});
   if(result){
    if(result.published!==true||result.currently_available!==true)
     state='cancel';
    else state=result.compatible===true?'ready':'cancel';
   }
  }catch{state='retry';}
  return json({state,counts,provider_calls:0});
 }
};

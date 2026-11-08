/**
 * Workerd fixture with the APD matcher generated directly from worker.js.
 * Neither generated matcher nor fixture is deployed or used for real push.
 * All inputs are fictional, all ABC lookups use an injected local stub.
 */
import {createAbcCurrentOfferVerifierLab}
 from '../mobile-push-abc-current-offer-lab.mjs';
import {matchWithCurrentPreferences}
 from './generated-apd-matcher-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const NOW=Date.parse('2026-11-08T10:00:00Z');
const CASES=new Set([
 'ready','district','cargo','turno','nivel','disabled',
 'closed','expired','duplicate','source-down','not-found'
]);
const json=(value,status=200)=>Response.json(value,{
 status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const offer=()=>({
 id:'SOLR-999',iddetalle:'123',idoferta:'456',
 estado:'Publicada',finoferta:'08/11/2026 09:00',
 descdistrito:'AVELLANEDA',descripcioncargo:'PRECEPTOR',
 turno:'M',descnivelmodalidad:'SECUNDARIA'
});
const preference=()=>({
 user_id:USER,alertas_activas:true,
 distrito_principal_apd:'AVELLANEDA',otros_distritos_apd:[],
 cargos_apd:['PRECEPTOR'],materias_apd:[],
 turnos:['MAÑANA'],niveles:['SECUNDARIA']
});
export default {
 async fetch(request){
  const url=new URL(request.url);
  const mode=url.pathname.replace(/^\/+/,'');
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  if(!CASES.has(mode))return json({error:'not_found'},404);
  const counts={abc:0,prefs:0,matcher:0};
  const sourceFetch=async(url,opts)=>{
   const u=new URL(url);
   counts.abc++;
   if(u.origin!=='https://servicios3.abc.gob.ar'||
      u.searchParams.get('q')!=='iddetalle:"123"'||
      opts.method!=='GET'||opts.redirect!=='manual')
    throw Error('ABC_FIXTURE_ROUTE_FORBIDDEN');
   if(mode==='source-down')throw Error('SYNTHETIC_OFFLINE');
   if(mode==='not-found')
    return json({responseHeader:{status:0},response:{numFound:0,docs:[]}});
   const doc=offer();
   if(mode==='district')doc.descdistrito='QUILMES';
   if(mode==='cargo')doc.descripcioncargo='MAESTRO';
   if(mode==='turno')doc.turno='TT';
   if(mode==='nivel')doc.descnivelmodalidad='PRIMARIA';
   if(mode==='closed')doc.estado='Cerrada';
   if(mode==='expired')doc.finoferta='08/11/2026 06:59';
   const docs=mode==='duplicate'?[doc,doc]:[doc];
   return json({responseHeader:{status:0},response:{
    numFound:docs.length,docs
   }});
  };
  const verifier=createAbcCurrentOfferVerifierLab({
   fetchImpl:sourceFetch,now:()=>NOW,
   preferences:{async getForUser({userId}){
    counts.prefs++;
    if(userId!==USER)throw Error('UNTRUSTED_USER');
    const p=preference();
    if(mode==='disabled')p.alertas_activas=false;
    return p;
   }},
   matchWithCurrentPreferences:({offer,preferences,userId})=>{
    counts.matcher++;
    if(userId!==USER||preferences.user_id!==USER)
     throw Error('USER_NOT_AUTHENTICATED');
    return matchWithCurrentPreferences({offer,preferences});
   }
  });
  let action='retry';
  try{
   const verified=await verifier.verify({
    userId:USER,sourceOfferKey:'D_123'
   });
   if(verified)
    action=verified.published===true&&
      verified.currently_available===true&&
      verified.compatible===true?'ready':'cancel';
  }catch{action='retry';}
  return json({action,counts,provider_calls:0});
 }
};

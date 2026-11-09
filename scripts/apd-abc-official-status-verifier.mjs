// ABC APD: target ONE previously observed detail ID, read-only, OFF by default.
// This verifies a current Solr state, NOT a state transition or notification.
// No recipients, user data, persistence, background task or Worker integration.
const ENDPOINT='https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select';
const FIELDS='iddetalle,idoferta,estado,descdistrito';
const SORT='ult_movimiento desc,iddetalle asc';
const MAX_RESPONSE=32768;
const CLASSIFY=Object.freeze({
 PUBLICADA:'published',
 ANULADA:'officially_annulled',
 DESIERTA:'other_terminal',
 DESIGNADA:'other_terminal',
 RENUNCIADA:'other_terminal'
});
const normalize=s=>String(s??'').trim().normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase();
const validDistrict=s=>typeof s==='string'&&
 /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ. ]{1,99}$/.test(s)&&!s.includes('  ');
const validKey=s=>typeof s==='string'&&/^D_[0-9]{1,18}$/.test(s);

async function readBounded(response){
 if(!response||!response.ok||response.redirected)
  throw Error('ABC targeted status request refused');
 const type=String(response.headers?.get?.('content-type')||'');
 if(!/^(application\/json|application\/[a-z0-9.+-]+\+json|text\/plain)(;|$)/i.test(type))
  throw Error('ABC status is not JSON');
 if(typeof response.body?.getReader!=='function')
  throw Error('ABC status response has no bounded stream');
 const reader=response.body.getReader();
 const chunks=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>MAX_RESPONSE)throw Error('ABC targeted status too large');
   chunks.push(value);
  }
 }catch{
  await reader.cancel().catch(()=>{});
  throw Error('ABC targeted status stream incomplete or too large');
 }
 let data;
 try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw Error('ABC targeted status invalid JSON');}
 return data;
}

export function createABCOfficialStatusVerifier({
 enabled=false,fetchImpl=globalThis.fetch,timeoutMs=10000,maxChecks=10
}={}){
 if(enabled!==true)throw Error('ABC official status verifier disabled');
 if(typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>15000||
    !Number.isSafeInteger(maxChecks)||maxChecks<1||maxChecks>20)
  throw Error('Invalid ABC status transport');
 // This is only a per-instance guard; staging still needs server-side quotas.
 let remaining=maxChecks;
 return Object.freeze({
  async inspect({district,sourceOfferKey}={}){
   if(!validDistrict(district)||!validKey(sourceOfferKey))
    throw Error('Unapproved district or unstable offer identity');
   if(remaining<=0)throw Error('ABC targeted status lookup budget exceeded');
   remaining--;
   const detail=sourceOfferKey.slice(2);
   // O_ identifiers are NOT yet proven unique by ABC, so unsupported.
   const q='descdistrito:"'+district+'" AND iddetalle:'+detail;
   const url=new URL(ENDPOINT);
   for(const [key,value] of Object.entries({
    q,sort:SORT,rows:'2',start:'0',wt:'json',fl:FIELDS
   }))url.searchParams.set(key,value);
   let firstState=null;
   for(let pass=1;pass<=2;pass++){
    let response;
    try{
     response=await fetchImpl(url.toString(),{
      method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(timeoutMs)
     });
    }catch{throw Error('ABC targeted status request failed or timed out');}
    const packet=await readBounded(response);
    const p=packet?.responseHeader?.params;
    const r=packet?.response;
    if(packet?.responseHeader?.status!==0||p?.q!==q||p?.sort!==SORT||
       p?.rows!=='2'||p?.start!=='0'||p?.wt!=='json'||p?.fl!==FIELDS||
       !Number.isSafeInteger(r?.numFound)||r?.numFound!==1||
       r?.start!==0||!Array.isArray(r.docs)||r.docs.length!==1)
     throw Error('ABC targeted lookup missing, ambiguous or mismatched');
    const doc=r.docs[0];
    if(!doc||typeof doc!=='object'||Array.isArray(doc)||
       Object.keys(doc).some(k=>!FIELDS.split(',').includes(k))||
       String(doc.iddetalle)!==detail||
       normalize(doc.descdistrito)!==normalize(district)||
       typeof doc.estado!=='string'||!doc.estado.trim())
     throw Error('ABC targeted status identity or fields invalid');
    const state=normalize(doc.estado);
    if(!Object.hasOwn(CLASSIFY,state))
     throw Error('ABC targeted status not yet classified');
    if(firstState!==null&&firstState!==state)
     throw Error('ABC targeted status changed between reads');
    firstState=state;
   }
   return Object.freeze({
    verified:true,
    scope:district,
    source:'ABC_public_detail_lookup',
    officialState:firstState,
    classification:CLASSIFY[firstState],
    checks:2,
    candidateOnly:true,
    historicTransitionProven:false,
    notificationAllowed:false,
    recordsStored:0,
    eventsCreated:0
   });
  }
 });
}

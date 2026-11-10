/**
 * APDocentePBA — comparador transparente, laboratorio sin conexión ni envíos.
 * Consumes at most five already-user-authorized offers (never queries ABC/DB).
 * It is NOT an eligibility, ranking, position, or appointment probability engine.
 * Geo references must come from a trusted upstream exact ABC WFS key join.
 */
const CLOSED=new Set(['ANULADA','ANULADO','CANCELADA','CANCELADO','DESIERTA','DESIERTO','DESIGNADA','DESIGNADO','CERRADA','CERRADO']);
const VALID_SORT=new Set(['cierre','distancia','preferencias']);
const KEY=/^[A-Za-z0-9_.:|-]{1,160}$/;
const SCHOOL=/^[0-9]{4}[A-Z]{2}[0-9]{4}$/;
const nf=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const asString=v=>String(v??'').trim().slice(0,180);
const numericScore=v=>{
 if(v===null||v===undefined||String(v).trim()==='')return null;
 const normalized=String(v).trim().replace(/\s/g,'').replace(',', '.');
 const n=Number(normalized);
 return Number.isFinite(n)&&n>=0&&n<=1000?n:null;
};
const displayABCDate=v=>{
 const s=asString(v);
 const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
 return iso?iso[3]+'/'+iso[2]+'/'+iso[1]:s;
};
const offerText=(offer,...keys)=>asString(keys.map(k=>offer?.[k]).find(v=>v!==null&&v!==undefined&&String(v).trim()!=='')??'');

// Keep a complete weekly schedule: ordinary offer labels are capped at 180
// characters, but seven independent weekday blocks can exceed that.
// Never truncate a schedule into an apparently complete (but false) subset.
const MAX_SCHEDULE_LENGTH=900;
const SCHEDULE_TOO_LONG='Horario demasiado extenso para comparar; verificá ABC';
const weekdays=[
 ['lunes','Lunes'],['martes','Martes'],['miercoles','Miércoles'],
 ['jueves','Jueves'],['viernes','Viernes'],['sabado','Sábado'],
 ['domingo','Domingo']
];
const safeSchedule=value=>{
 const raw=String(value??'').trim();
 return raw.length>MAX_SCHEDULE_LENGTH?SCHEDULE_TOO_LONG:raw;
};
export function extractOfferSchedule(offer){
 if(!offer||typeof offer!=='object'||Array.isArray(offer))return '';
 for(const key of ['dias_horarios','horario']){
  const raw=String(offer[key]??'').trim();
  if(raw&&!/^(?:sin datos?|no informado|n\/a)$/i.test(raw))
   return safeSchedule(raw);
 }
 const blocks=[];
 for(const [key,name] of weekdays){
  const value=String(offer[key]??'').trim();
  if(!value)continue;
  // A weekday-specific ABC property states the day; it is not guessed from
  // a time or a free-text turno. Preserve already-explicit day prefixes.
  const hasDayPrefix=/^(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s*:|\s+(?:a|al|hasta)\s+)/i.test(value);
  blocks.push(hasDayPrefix?value:name+': '+value);
 }
 return safeSchedule(blocks.join('; '));
}

function validDate(year,month,day){
 if(!Number.isInteger(year)||year<2000||year>2100||month<1||month>12||day<1||day>31)return false;
 const d=new Date(Date.UTC(year,month-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()+1===month&&d.getUTCDate()===day;
}
export function parseClosure(value,{abcWallTime=false}={}){
 const x=asString(value);
 const local=x.match(/^(\d{2})\/(\d{2})\/(20\d{2})\s+(\d{1,2}):(\d{2})$/);
 if(local){
  const [day,month,year,hour,min]=local.slice(1).map(Number);
  return validDate(year,month,day)&&hour<=23&&min<=59
    ?Date.UTC(year,month-1,day,hour+3,min):null;
 }
 const iso=x.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/i);
 if(!iso)return null;
 const [,y,m,d,h,minute,second,offset,oh,om]=iso;
 if(!validDate(+y,+m,+d)||+h>23||+minute>59||+(second||0)>59||
    +(oh||0)>14||+(om||0)>59||(+oh===14&&+om>0))return null;
 // ABC APD stores the local deadline clock as an ISO string suffixed by Z.
 // That suffix does not represent a UTC instant for the ABC finoferta field.
 // Apply this interpretation only when the caller explicitly marks that source.
 if(abcWallTime&&offset.toUpperCase()==='Z')
  return Date.UTC(+y,+m-1,+d,+h+3,+minute,+(second||0));
 const result=Date.parse(x);
 return Number.isFinite(result)?result:null;
}
function validGeoPoint(point){
 return point&&Number.isFinite(Number(point.lat))&&Number.isFinite(Number(point.lon))&&
  Number(point.lat)>=-42&&Number(point.lat)<=-33&&
  Number(point.lon)>=-64&&Number(point.lon)<=-55;
}
function earthKm(a,b){
 const rad=v=>v*Math.PI/180;
 const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);
 const c=2*Math.asin(Math.min(1,Math.sqrt(
  Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2
 )));
 return 6371.0088*c;
}
function cmpNumMissingLast(a,b){
 const av=typeof a==='number'&&Number.isFinite(a)?a:Infinity;
 const bv=typeof b==='number'&&Number.isFinite(b)?b:Infinity;
 if(av===bv)return 0;
 if(av===Infinity)return 1;
 if(bv===Infinity)return -1;
 return av-bv;
}
export function compareOffers({
 offers=[],now=new Date(),sortBy='cierre',
 preferredDistricts=[],preferredTurns=[],
 referenceLocation=null,verifiedGeoByKey={},applicantSummaries={}
}={}){
 if(!Array.isArray(offers)||offers.length>5)throw Error('select_at_most_five_offers');
 if(!VALID_SORT.has(sortBy))throw Error('unsupported_sort');
 if(!Array.isArray(preferredDistricts)||!Array.isArray(preferredTurns))throw Error('invalid_preferences');
 const clock=now instanceof Date?now.getTime():new Date(now).getTime();
 if(!Number.isFinite(clock))throw Error('invalid_clock');
 const location=validGeoPoint(referenceLocation)?{
  lat:Number(referenceLocation.lat),lon:Number(referenceLocation.lon)
 }:null;
 const districts=new Set(preferredDistricts.filter(x=>typeof x==='string').map(nf));
 const turns=new Set(preferredTurns.filter(x=>typeof x==='string').map(nf));
 if(!applicantSummaries||typeof applicantSummaries!=='object'||Array.isArray(applicantSummaries))throw Error('invalid_applicant_summaries');
 const seen=new Set(),items=[],excluded=[];
 for(const offer of offers){
  const key=asString(offer?.source_offer_key);
  if(!KEY.test(key)||seen.has(key)){
   excluded.push({reason:seen.has(key)?'duplicate_key':'missing_or_invalid_key'});
   continue;
  }
  seen.add(key);
  const state=nf(offer?.estado);
  const abcDeadline=asString(offer?.finoferta);
  const rawDeadline=abcDeadline||asString(offer?.finoferta_label||offer?.fecha_cierre);
  // Treat only ABC's original finoferta as wall time, never every ISO/Z value.
  const closedAt=parseClosure(rawDeadline,{abcWallTime:!!abcDeadline});
  if(CLOSED.has(state)||closedAt!==null&&closedAt<=clock){
   excluded.push({source_offer_key:key,reason:CLOSED.has(state)?'official_status_closed':'confirmed_deadline_passed'});
   continue;
  }
  const clave=asString(offer?.escuela).toUpperCase();
  const geo=Object.hasOwn(verifiedGeoByKey,clave)?verifiedGeoByKey[clave]:null;
  const hasVerifiedGeo=!!location&&SCHOOL.test(clave)&&
   geo?.source==='ABC_WFS'&&geo?.exact_key_match===true&&
   geo?.clave===clave&&validGeoPoint(geo);
  const distanceKm=hasVerifiedGeo?
   Math.round(earthKm(location,{lat:Number(geo.lat),lon:Number(geo.lon)})*10)/10:null;
  const pidVerified=offer?.pid_verified===true&&typeof offer?.pid_match==='boolean';
  // Panel PID is shown as a reference, never as confirmation of eligibility.
  const pidFromPanel=typeof offer?.pid_compatible==='boolean'?offer.pid_compatible:null;
  const pidScore=pidFromPanel===true?
   numericScore(offer?.pid_puntaje_total_final??offer?.pid_puntaje_total):null;
  const summary=Object.hasOwn(applicantSummaries,key)?applicantSummaries[key]:null;
  const cached=summary?.verified_from_current_card===true&&
   Number.isSafeInteger(summary.total_postulantes)&&summary.total_postulantes>=0;
  const competitionVerified=cached||
   (offer?.competition_verified===true&&
    Number.isSafeInteger(offer?.postulantes_count)&&offer.postulantes_count>=0);
  const competitorCount=cached?summary.total_postulantes:
   competitionVerified?offer.postulantes_count:null;
  const firstScore=cached?numericScore(summary.puntaje_primero):null;
  const myListing=nf(offer?.pid_listado);
  const firstListing=cached?nf(summary.listado_origen_primero):'';
  const listingComparable=!!myListing&&!!firstListing&&myListing===firstListing;
  const applicantGap=listingComparable&&pidScore!==null&&firstScore!==null&&
   competitorCount>0?Math.round((pidScore-firstScore)*100)/100:null;
  const districtMatch=districts.size?districts.has(nf(offer?.distrito)):null;
  const turnMatch=turns.size?turns.has(nf(offer?.turno)):null;
  const remainingHours=closedAt!==null?
   Math.round((closedAt-clock)/3600000*10)/10:null;
  const remarks=[];
  if(districtMatch===true)remarks.push('Distrito seleccionado');
  if(turnMatch===true)remarks.push('Turno seleccionado');
  if(remainingHours!==null)remarks.push('Cierre verificado: '+remainingHours+' h restantes');
  else remarks.push('Fecha de cierre sin hora comprobable: revisar ABC');
  if(distanceKm!==null)remarks.push('Distancia en línea recta: '+distanceKm+' km (WFS oficial)');
  if(pidVerified)remarks.push(offer.pid_match?'Coincidencia PID indicada':'PID indicado como no coincidente');
  const row={
   source_offer_key:key,
   escuela:asString(offer?.escuela),
   distrito:asString(offer?.distrito),
   cargo:asString(offer?.cargo||offer?.descripcioncargo),
   turno:asString(offer?.turno),
   cierre_ms:closedAt,
   horas_hasta_cierre:remainingHours,
   distancia_km:distanceKm,
   district_preferred:districtMatch,
   turn_preferred:turnMatch,
   pid_match_verified:pidVerified?offer.pid_match:null,
   pid_compatible_panel:pidFromPanel,
   pid_puntaje_panel:pidScore,
   pid_listado:offerText(offer,'pid_listado'),
   postulantes_observados:competitorCount,
   puntaje_primero_observado:firstScore,
   listado_primero_observado:cached?asString(summary.listado_origen_primero):'',
   diferencia_puntaje_comparable:applicantGap,
   competencia_en_cache:cached,
   horario:extractOfferSchedule(offer),
   modulos:offerText(offer,'hsmodulos','modulos'),
   revista:offerText(offer,'revista','supl_revista'),
   jornada:offerText(offer,'jornada'),
   curso_division:offerText(offer,'cursodivision','curso_division'),
   supl_desde:displayABCDate(offerText(offer,'supl_desde_label','supl_desde','desde')),
   supl_hasta:displayABCDate(offerText(offer,'supl_hasta_label','supl_hasta','hasta')),
   explicacion:remarks,
   enlace_solo_abc:true
  };
  items.push(row);
 }
 function preferenceScore(row){
  return Number(row.district_preferred===true)+Number(row.turn_preferred===true);
 }
 items.sort((a,b)=>{
  let priority=0;
  if(sortBy==='cierre')priority=cmpNumMissingLast(a.cierre_ms,b.cierre_ms);
  else if(sortBy==='distancia')priority=cmpNumMissingLast(a.distancia_km,b.distancia_km);
  else priority=preferenceScore(b)-preferenceScore(a);
  if(priority!==0)return priority;
  const next=cmpNumMissingLast(a.cierre_ms,b.cierre_ms);
  if(next!==0)return next;
  return a.source_offer_key.localeCompare(b.source_offer_key,'es');
 });
 return Object.freeze({
  items,excluded,sortBy,
  comparisons_verified:true,
  eligibility_or_appointment_probability:null,
  disclaimer:'Comparación orientativa de datos observados. Verificar postulación, cierre y requisitos en ABC.'
 });
}

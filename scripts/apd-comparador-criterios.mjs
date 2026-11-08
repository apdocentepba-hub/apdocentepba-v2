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
function validDate(year,month,day){
 if(!Number.isInteger(year)||year<2000||year>2100||month<1||month>12||day<1||day>31)return false;
 const d=new Date(Date.UTC(year,month-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()+1===month&&d.getUTCDate()===day;
}
export function parseClosure(value){
 const x=asString(value);
 const local=x.match(/^(\d{2})\/(\d{2})\/(20\d{2})\s+(\d{1,2}):(\d{2})$/);
 if(local){
  const [day,month,year,hour,min]=local.slice(1).map(Number);
  return validDate(year,month,day)&&hour<=23&&min<=59
    ?Date.UTC(year,month-1,day,hour+3,min):null;
 }
 const iso=x.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/i);
 if(!iso)return null;
 const [,y,m,d,h,minute,second,,tz,oh,om]=iso;
 if(!validDate(+y,+m,+d)||+h>23||+minute>59||+(second||0)>59||
    +(oh||0)>14||+(om||0)>59||(+oh===14&&+om>0))return null;
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
 return av-bv;
}
export function compareOffers({
 offers=[],now=new Date(),sortBy='cierre',
 preferredDistricts=[],preferredTurns=[],
 referenceLocation=null,verifiedGeoByKey={}
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
 const seen=new Set(),items=[],excluded=[];
 for(const offer of offers){
  const key=asString(offer?.source_offer_key);
  if(!KEY.test(key)||seen.has(key)){
   excluded.push({reason:seen.has(key)?'duplicate_key':'missing_or_invalid_key'});
   continue;
  }
  seen.add(key);
  const state=nf(offer?.estado);
  const closedAt=parseClosure(offer?.finoferta??offer?.fecha_cierre);
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
  const competitionVerified=offer?.competition_verified===true&&
   Number.isInteger(offer?.postulantes_count)&&offer.postulantes_count>=0;
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
   postulantes_observados:competitionVerified?offer.postulantes_count:null,
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

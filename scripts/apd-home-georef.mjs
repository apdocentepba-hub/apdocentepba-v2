/**
 * Insigne: opt-in household address lookup against the public Argentine
 * Georef API. Never uses browser GPS or APD backend. Never makes requests
 * until the teacher explicitly clicks "Buscar direcciones".
 * Coordinates are approximate to the street block, NOT a home GPS position.
 */
const GEOREF_URL='https://apis.datos.gob.ar/georef/api/v2.0/direcciones';
const MAX_BYTES=180000;
const num=(v)=>v===null||v===undefined||String(v).trim()===''?NaN:Number(v);
const validPoint=p=>p&&Number.isFinite(num(p.lat))&&Number.isFinite(num(p.lon))&&
 num(p.lat)>=-56&&num(p.lat)<=-21&&num(p.lon)>=-74&&num(p.lon)<=-53;
const short=v=>String(v??'').trim().slice(0,180);
const MAX_QUERY_LENGTH=180;
const isProvince=s=>/^(?:provincia de )?(?:buenos aires|c[oó]rdoba|santa fe|entre r[ií]os|mendoza|tucum[aá]n|salta|jujuy|chaco|corrientes|misiones|san juan|san luis|santiago del estero|la pampa|la rioja|catamarca|formosa|neuqu[eé]n|r[ií]o negro|chubut|santa cruz|tierra del fuego|ciudad aut[oó]noma de buenos aires|ciudad de buenos aires|caba|capital federal)$/i.test(s);
/**
 * Parse user-supplied comma-delimited geographic hints without guessing a
 * locality from IP address, browser GPS or the user's account.
 * e.g. "Rondeau 319, Wilde, Avellaneda, Buenos Aires".
 */
export function parseHomeAddressQuery(raw){
 const q=String(raw??'').trim();
 if(q.length<5||q.length>MAX_QUERY_LENGTH||/[<>\r\n]/.test(q))
  throw Error('Ingresá calle y altura (máximo 180 caracteres)');
 const parts=q.split(',').map(p=>p.trim()).filter(Boolean);
 if(!parts.length||parts.length>4)throw Error('Dirección demasiado ambigua');
 // Floor, apartment and postal numbers are not house numbers. Ignore them
 // after the first comma or after an explicit unit/floor marker.
 const street=parts[0].replace(/\s+(?:piso|p\.?|dpto\.?|dto\.?|depto\.?|unidad|oficina)\s*[\s\S]*$/i,'').trim();
 const matches=[...street.matchAll(/\b([1-9]\d{0,4})\b/g)];
 const height=matches.length?Number(matches.at(-1)[1]):null;
 if(!height||!/\p{L}/u.test(street))
  throw Error('Ingresá calle y altura');
 const suffix=parts.slice(1).filter(x=>!/^(?:[a-z])?\d{4}(?:[a-z]{3})?$/i.test(x));
 const filters={};
 if(suffix.length&&isProvince(suffix.at(-1))){
  filters.provincia=suffix.pop().replace(/^provincia de /i,'');
 }
 if(suffix.length>2)throw Error('Indicá localidad, partido y provincia separados por comas');
 if(suffix.length===2){
  filters.localidad_censal=suffix[0];
  filters.departamento=suffix[1];
 }else if(suffix.length===1){
  filters.localidad_censal=suffix[0];
 }
 return {street,height,filters,original:q};
}
export function sanitizeHomeLocation(raw){
 if(raw===null||raw===undefined)return null;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.source!=='GEOREF_AR_V2')
  throw Error('Domicilio georreferenciado inválido');
 if(!validPoint(raw))throw Error('Coordenadas de domicilio inválidas');
 const label=short(raw.label);
 if(label.length<8||/[\r\n<>]/.test(label))throw Error('Dirección seleccionada inválida');
 const height=Number(raw.height);
 if(!Number.isSafeInteger(height)||height<1||height>99999)throw Error('Altura inválida');
 const scope=raw.scope;
 if(scope!==undefined&&!['exacta','partido','provincia','pais'].includes(scope))
  throw Error('Origen de georreferencia inválido');
 if(raw.reviewed!==undefined&&raw.reviewed!==true)
  throw Error('Confirmación de punto geográfico inválida');
 return {source:'GEOREF_AR_V2',label,height,lat:num(raw.lat),lon:num(raw.lon),
  ...(scope!==undefined?{scope}:{}),
  ...(raw.reviewed===true?{reviewed:true}:{})};
}
export function parseGeorefCandidates(payload,originalQuery){
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.direcciones))return [];
 let parsed;
 try{parsed=parseHomeAddressQuery(originalQuery)}catch{return []}
 const height=parsed.height;
 const unique=new Set(),out=[];
 for(const item of payload.direcciones.slice(0,30)){
  const street=short(item?.calle?.nombre);
  const h=Number(item?.altura?.valor);
  const province=short(item?.provincia?.nombre);
  const district=short(item?.departamento?.nombre);
  const locality=short(item?.localidad_censal?.nombre||item?.localidad?.nombre);
  const pos=item?.ubicacion;
  if(!street||!province||!Number.isSafeInteger(h)||h!==height||
     !validPoint(pos))continue;
  const label=[street+' '+h,locality,district,province]
   .filter(Boolean).filter((v,i,a)=>a.findIndex(x=>x.toLowerCase()===v.toLowerCase())===i)
   .join(', ').slice(0,180);
  const candidate=sanitizeHomeLocation({
   source:'GEOREF_AR_V2',label,height:h,lat:pos.lat,lon:pos.lon
  });
  const id=label.toLowerCase()+'|'+candidate.lat+'|'+candidate.lon;
  if(unique.has(id))continue;
  unique.add(id);out.push(candidate);
  if(out.length>=8)break;
 }
 return out;
}
/**
 * The official Georef data can have a valid street+house number inside a
 * department while a user-provided localidad_censal name returns no rows.
 * Relax only as needed. A fallback result is a CANDIDATE, never an
 * automatically verified home: the user must explicitly select it.
 */
export async function lookupHomeAddressesDetailed(query,{fetchImpl=fetch,signal}={}){
 const parsed=parseHomeAddressQuery(query);
 const filters=parsed.filters;
 const initialScope=filters.localidad_censal?'exacta':
  filters.departamento?'partido':filters.provincia?'provincia':'pais';
 const stages=[
  {scope:initialScope,filters},
  ...(filters.localidad_censal?[{scope:filters.departamento?'partido':
   filters.provincia?'provincia':'pais',filters:{
   ...(filters.provincia?{provincia:filters.provincia}:{}),
   ...(filters.departamento?{departamento:filters.departamento}:{})
  }}]:[]),
  ...(filters.departamento?[{scope:filters.provincia?'provincia':'pais',filters:{
   ...(filters.provincia?{provincia:filters.provincia}:{})
  }}]:[]),
  ...(filters.provincia?[{scope:'pais',filters:{}}]:[])
 ];
 const unique=new Set();
 // Combined timeout is shared by all attempts. Never keep making requests
 // after logout, a new input, a network failure or the overall time limit.
 const timeout=AbortSignal.timeout(16000);
 const combined=signal?AbortSignal.any([signal,timeout]):timeout;
 let attempted=0;
 for(const stage of stages){
  const id=JSON.stringify(stage.filters);
  if(unique.has(id))continue;
  unique.add(id);
  if(combined.aborted)throw Error('Consulta cancelada');
  const url=new URL(GEOREF_URL);
  url.search=new URLSearchParams({direccion:parsed.street,max:'30',...stage.filters});
  attempted++;
  const response=await fetchImpl(url.toString(),{
   method:'GET',mode:'cors',credentials:'omit',redirect:'error',
   headers:{Accept:'application/json'},signal:combined
  });
  if(!response?.ok)throw Error('El servicio Georef no respondió');
  const advertised=Number(response.headers?.get?.('content-length')||0);
  if(!Number.isFinite(advertised)||advertised>MAX_BYTES)throw Error('Respuesta demasiado extensa');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_BYTES)throw Error('Respuesta demasiado extensa');
  const payload=JSON.parse(new TextDecoder().decode(bytes));
  const candidates=parseGeorefCandidates(payload,parsed.original);
  if(candidates.length)return {candidates:candidates.map(candidate=>({
   ...candidate,scope:stage.scope
  })),scope:stage.scope,attempted};
 }
 return {candidates:[],scope:'sin_resultados',attempted};
}
export async function lookupHomeAddresses(query,options){
 const found=await lookupHomeAddressesDetailed(query,options);
 return found.candidates;
}
export function straightLineHomeSchoolKm(home,school){
 try{
  const point=sanitizeHomeLocation(home);
  if(!point||school?.source!=='ABC_WFS'||school?.exact_key_match!==true||
     !/^[0-9]{4}[A-Z]{2}[0-9]{4}$/.test(school?.clave||'')||
     !validPoint(school))return null;
  const rad=x=>x*Math.PI/180;
  const dlat=rad(num(school.lat)-point.lat),dlon=rad(num(school.lon)-point.lon);
  const hav=Math.sin(dlat/2)**2+Math.cos(rad(point.lat))*
   Math.cos(rad(num(school.lat)))*Math.sin(dlon/2)**2;
  return Math.round(6371.0088*2*Math.asin(Math.min(1,Math.sqrt(hav)))*10)/10;
 }catch{return null;}
}

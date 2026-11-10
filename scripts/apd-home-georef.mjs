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
export function sanitizeHomeLocation(raw){
 if(raw===null||raw===undefined)return null;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.source!=='GEOREF_AR_V2')
  throw Error('Domicilio georreferenciado inválido');
 if(!validPoint(raw))throw Error('Coordenadas de domicilio inválidas');
 const label=short(raw.label);
 if(label.length<8||/[\r\n<>]/.test(label))throw Error('Dirección seleccionada inválida');
 const height=Number(raw.height);
 if(!Number.isSafeInteger(height)||height<1||height>99999)throw Error('Altura inválida');
 return {source:'GEOREF_AR_V2',label,height,lat:num(raw.lat),lon:num(raw.lon)};
}
export function parseGeorefCandidates(payload,originalQuery){
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.direcciones))return [];
 const query=short(originalQuery);
 // A numbered street name ("25 de Mayo") is valid: the last number is the
 // house number for a common street + height entry.
 const nums=[...query.matchAll(/\b([1-9]\d{0,4})\b/g)];
 const height=nums.length?Number(nums.at(-1)[1]):null;
 if(!height)return [];
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
export async function lookupHomeAddresses(query,{fetchImpl=fetch,signal}={}){
 const q=short(query);
 if(q.length<5||q.length>180||!/[\p{L}]/u.test(q)||
    !/\b[1-9]\d{0,4}\b/.test(q))throw Error('Ingresá calle y altura');
 const url=new URL(GEOREF_URL);
 url.search=new URLSearchParams({direccion:q,max:'10'});
 const timeout=AbortSignal.timeout(9500);
 const combined=signal?AbortSignal.any([signal,timeout]):timeout;
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
 return parseGeorefCandidates(payload,q);
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

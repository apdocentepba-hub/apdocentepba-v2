/* Optional address/intersection reference. Only an explicit button click sends
 * the user's query to the public Argentine Georef service. No persistence,
 * analytics, autocomplete, GPS permissions or account/backend calls.
 * Official source: https://www.argentina.gob.ar/georef/
 */
const ENDPOINT='https://apis.datos.gob.ar/georef/api/direcciones';
const inPBA=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&
 lat>=-42&&lat<=-33&&lon>=-64&&lon<=-55;
const clean=v=>String(v??'').trim().replace(/\s+/g,' ').slice(0,140);
function normalized(v){
 return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
}
function referenceParts(value){
 const input=clean(value);
 const match=input.match(/^(.{5,105}),\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{3,55})$/u);
 if(!match)return null;
 const street=clean(match[1]),department=clean(match[2]);
 if(!(/[0-9]{1,5}/.test(street)||/\s+(?:y|esq\.?)\s+/i.test(street)))return null;
 return {street,department};
}
export function validateReferenceQuery(value){
 return !!referenceParts(value);
}
export function parseGeorefReferences(data,{department=''}={}) {
 if(!data||!Array.isArray(data.direcciones)||data.direcciones.length>5)return [];
 const seen=new Set(),results=[];
 for(const item of data.direcciones){
  const lat=Number(item?.ubicacion?.lat),lon=Number(item?.ubicacion?.lon);
  const name=clean(item?.nomenclatura);
  const province=clean(item?.provincia?.nombre).toUpperCase();
  const actualDepartment=clean(item?.departamento?.nombre);
  if(!inPBA(lat,lon)||!name||province!=='BUENOS AIRES'||
   (department&&normalized(actualDepartment)!==normalized(department)))continue;
  const id=lat.toFixed(6)+'|'+lon.toFixed(6);
  if(seen.has(id))continue;
  seen.add(id);
  results.push(Object.freeze({lat,lon,label:name,source:'GEOREF_AR'}));
 }
 return results;
}
export async function findAddressReference(query,{fetchImpl=fetch,signal}={}) {
 const parts=referenceParts(query);
 if(!parts)throw Error('reference_needs_street_and_number_or_intersection_and_district');
 const url=new URL(ENDPOINT);
 // Restrict to the explicitly supplied partido. Georef otherwise returns
 // unrelated streets of the same name throughout the province.
 url.search=new URLSearchParams({direccion:parts.street,departamento:parts.department,
  provincia:'Buenos Aires',max:'5'});
 const timeout=AbortSignal.timeout(10000);
 const combined=signal?AbortSignal.any([signal,timeout]):timeout;
 const response=await fetchImpl(url.toString(),{
  method:'GET',mode:'cors',credentials:'omit',redirect:'error',signal:combined,
  headers:{Accept:'application/json'}
 });
 if(!response?.ok)throw Error('georef_unavailable');
 const size=Number(response.headers?.get?.('content-length')||0);
 if(!Number.isFinite(size)||size>120000)throw Error('georef_response_too_large');
 const body=await response.arrayBuffer();
 if(body.byteLength>120000)throw Error('georef_response_too_large');
 let data;
 try{data=JSON.parse(new TextDecoder().decode(body));}
 catch{throw Error('georef_response_invalid');}
 return parseGeorefReferences(data,{department:parts.department});
}

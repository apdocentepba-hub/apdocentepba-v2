/* Optional address/intersection reference. Only an explicit button click sends
 * the user's query to the public Argentine Georef service. No persistence,
 * analytics, autocomplete, GPS permissions or account/backend calls.
 * Official source: https://www.argentina.gob.ar/georef/
 */
const ENDPOINT='https://apis.datos.gob.ar/georef/api/direcciones';
const inPBA=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&
 lat>=-42&&lat<=-33&&lon>=-64&&lon<=-55;
const clean=v=>String(v??'').trim().replace(/\s+/g,' ').slice(0,140);
export function validateReferenceQuery(value){
 const query=clean(value);
 // Street number or an intersection, never a name or neighborhood alone.
 return query.length>=8&&query.length<=140&&
  (/[0-9]{1,5}/.test(query)||/\s+(?:y|esq\.?)\s+/i.test(query));
}
export function parseGeorefReferences(data) {
 if(!data||!Array.isArray(data.direcciones)||data.direcciones.length>5)return [];
 const seen=new Set(),results=[];
 for(const item of data.direcciones){
  const lat=Number(item?.ubicacion?.lat),lon=Number(item?.ubicacion?.lon);
  const name=clean(item?.nomenclatura);
  const province=clean(item?.provincia?.nombre).toUpperCase();
  if(!inPBA(lat,lon)||!name||(province&&province!=='BUENOS AIRES'))continue;
  const id=lat.toFixed(6)+'|'+lon.toFixed(6);
  if(seen.has(id))continue;
  seen.add(id);
  results.push(Object.freeze({lat,lon,label:name,source:'GEOREF_AR'}));
 }
 return results;
}
export async function findAddressReference(query,{fetchImpl=fetch,signal}={}) {
 if(!validateReferenceQuery(query))throw Error('reference_needs_street_and_number_or_intersection');
 const url=new URL(ENDPOINT);
 url.search=new URLSearchParams({direccion:clean(query),provincia:'Buenos Aires',max:'5'});
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
 return parseGeorefReferences(data);
}

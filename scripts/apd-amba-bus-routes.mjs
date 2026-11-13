/**
 * Opt-in mapped bus routes crossing a 400m radius around a point in AMBA.
 * Public ArcGIS feature layer updated May 2026. Not real-time, NOT bus stops,
 * not a guarantee a line has service or stops within the buffer.
 * Four independent jurisdictional layers; no API key or user account.
 */
const HOST='https://services1.arcgis.com/gKFHG0iKXPnKkg1l/ArcGIS/rest/services/Transporte_BuenosAires/FeatureServer';
const LAYERS=Object.freeze([
 {id:0,scope:'CABA'},
 {id:1,scope:'Provincial'},
 {id:2,scope:'Nacional'},
 {id:3,scope:'Municipal'}
]);
const M=400;
export function buildAmbaBusLayerUrl(point,layer){
 const lat=Number(point?.lat),lon=Number(point?.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||
  lat < -42||lat > -33||lon < -64||lon > -55||
  !LAYERS.some(x=>x.id===layer))return null;
 return HOST+'/'+layer+'/query?'+new URLSearchParams({
  where:'1=1',
  geometry:lon+','+lat,
  geometryType:'esriGeometryPoint',
  inSR:'4326',
  spatialRel:'esriSpatialRelIntersects',
  distance:String(M),
  units:'esriSRUnit_Meter',
  // Query distinct route numbers, not every duplicated branch/direction.
  outFields:'LINEA',
  returnDistinctValues:'true',
  returnGeometry:'false',
  resultRecordCount:'2000',
  f:'json'
 }).toString();
}
export function parseAmbaBusLineFeatures(json,scope){
 if(!Array.isArray(json?.features)||json.error||json.exceededTransferLimit)
  throw Error('La capa no pudo confirmar todas las líneas cercanas');
 const lines=new Map();
 // Do not silently discard valid routes from a large provider response.
 if(json.features.length>2000)throw Error('La capa superó el máximo previsto de registros');
 for(const {attributes:a} of json.features){
  const value=a?.LINEA??a?.linea;
  const line=String(value??'').trim();
  if(!/^[0-9]{1,3}[A-Z]?$/.test(line)||!Number(line.replace(/[A-Z]$/,'')))continue;
  const key=scope+':'+line;
  if(!lines.has(key))lines.set(key,{
   line,scope,source:'ARCGIS_AMBA_ROUTE_LAYER',
   serviceVerified:false,stopVerified:false
  });
 }
 return [...lines.values()];
}
const readBounded=async(res)=>{
 if(!res.ok)throw Error('Servicio cartográfico HTTP '+res.status);
 const length=Number(res.headers?.get?.('content-length')||0);
 if(!Number.isFinite(length)||length>250_000)throw Error('Respuesta cartográfica demasiado extensa');
 const content=await res.arrayBuffer();
 if(content.byteLength>250_000)throw Error('Respuesta cartográfica demasiado extensa');
 return JSON.parse(new TextDecoder().decode(content));
};
export async function fetchAmbaBusLinesNear(point,{fetchImpl=fetch,signal}={}){
 if(!buildAmbaBusLayerUrl(point,0))throw Error('Ubicación fuera de la zona');
 // Jurisdiction layers are independent: check them concurrently and disclose
 // missing coverage instead of hiding all successful results when one fails.
 const results=await Promise.all(LAYERS.map(async layer=>{
  const url=buildAmbaBusLayerUrl(point,layer.id);
  const timeout=AbortSignal.timeout(14000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
   const response=await fetchImpl(url,{
    method:'GET',mode:'cors',credentials:'omit',redirect:'error',
    headers:{Accept:'application/json'},
    signal:combined
   });
   const data=await readBounded(response);
   return {layer,lines:parseAmbaBusLineFeatures(data,layer.scope)};
  }catch(error){
   if(signal?.aborted)throw error;
   return {layer,error:true};
  }
 }));
 const healthy=results.filter(item=>!item.error);
 const unavailable=results.filter(item=>item.error);
 if(!healthy.length)throw Error('No respondió ninguna capa de colectivos del AMBA');
 const seen=new Map();
 for(const item of healthy){
  for(const line of item.lines)seen.set(line.line+':'+line.scope,line);
 }
 const numeric=line=>Number(line.line.replace(/[A-Z]$/,''));
 const all=[...seen.values()]
  .sort((a,b)=>numeric(a)-numeric(b)||a.scope.localeCompare(b.scope));
 return Object.freeze({
  lines:all.slice(0,80),
  totalLines:all.length,
  checkedScopes:healthy.map(item=>item.layer.scope),
  unavailableScopes:unavailable.map(item=>item.layer.scope),
  complete:unavailable.length===0
 });
}

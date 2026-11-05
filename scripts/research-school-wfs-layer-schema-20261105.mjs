/* Public WFS schema and stable identifiers — read-only and bounded. */
import assert from 'node:assert/strict';
const host='https://mapaescolar.abc.gob.ar';
const root=host+'/me/wfs';
let requests=0;
async function get(url){
 const u=new URL(url);assert.equal(u.origin,host);assert.ok(++requests<=5,'request cap');
 const r=await fetch(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(17000),headers:{Accept:'application/json,application/xml,text/xml,*/*','user-agent':'Mozilla/5.0'}});
 const b=await r.arrayBuffer();assert.ok(b.byteLength<2_500_000,'response too big');
 return {status:r.status,text:new TextDecoder('utf-8').decode(b),type:r.headers.get('content-type')};
}
const cap=await get(root+'?service=WFS&version=2.0.0&request=GetCapabilities');
const xml=cap.text;
const ftBlock=[...xml.matchAll(/<(?:\w+:)?FeatureType(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?FeatureType>/gi)];
const featureTypes=ftBlock.map(m=>{
 const block=m[1];
 return {
  name:block.match(/<(?:\w+:)?Name(?:\s[^>]*)?>([^<]+)<\/(?:\w+:)?Name>/i)?.[1]||'',
  title:block.match(/<(?:\w+:)?Title(?:\s[^>]*)?>([^<]+)<\/(?:\w+:)?Title>/i)?.[1]||''
 };
});
const candidates=featureTypes.filter(x=>/unidad|estableci|educativ|escuela|local|ue|predio/i.test(x.name+' '+x.title));
const probes=[];
for(const item of candidates.slice(0,2)){
 const u=new URL(root);u.search=new URLSearchParams({service:'WFS',request:'GetFeature',version:'2.0.0',typeNames:item.name,count:'2',outputFormat:'application/json'});
 try{
  const r=await get(u);
  const j=JSON.parse(r.text);
  const first=j.features?.[0]?.properties||{};
  const second=j.features?.[1]?.properties||{};
  const keys=Object.keys(first);
  const identifierKeys=keys.filter(k=>/cue|clave|cod|escuela|establecimiento|distrito|nivel|nombre|lat|long|geo|direccion|domicil/i.test(k)).slice(0,35);
  probes.push({type:item.name,http:r.status,feature_count:j.features?.length??null,property_keys:keys.slice(0,50),candidate_identifiers:Object.fromEntries(identifierKeys.map(k=>[k,String(first[k]).slice(0,90)])),another_key_sample:Object.fromEntries(identifierKeys.slice(0,10).map(k=>[k,String(second[k]).slice(0,80)])),geometry_type:j.features?.[0]?.geometry?.type||null});
 }catch(e){probes.push({type:item.name,error:String(e.message||e).slice(0,200)})}
}
console.log('APD_MAPA_ESCOLAR_WFS_LAYER_PROBE '+JSON.stringify({timestamp:new Date().toISOString(),http:cap.status,mime:cap.type,capabilities_bytes:xml.length,xml_header:xml.slice(0,400),feature_type_count:featureTypes.length,feature_types:featureTypes.slice(0,35),candidate_count:candidates.length,probed:probes,requests,read_only:true}));

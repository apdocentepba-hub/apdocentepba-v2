/* Proof of concept: five distinct school codes from six published public APD offers,
 * joined with official PBA school WFS by exact code "clave".
 * GET only. No accounts, credentials, private data, database mutation.
 */
import assert from 'node:assert/strict';
const origin='https://mapaescolar.abc.gob.ar';
const endpoint=origin+'/me/wfs';
const offerToSchool={
 'D_4396000':'0005MS0007',
 'D_4396004':'0005MS0007',
 'D_4396014':'0005MS0026',
 'D_4396087':'0005MS0001',
 'D_4396314':'0005MS0035',
 'D_4396441':'0045MS0027'
};
const codes=[...new Set(Object.values(offerToSchool))];
const features=[];
const errors=[];
for (const code of codes) {
 assert.match(code,/^\d{4}MS\d{4}$/);
 const u=new URL(endpoint);
 u.search=new URLSearchParams({
   service:'WFS',request:'GetFeature',version:'2.0.0',
   typeNames:'me:nivel_secundario_gestion_estatal',
   count:'20',outputFormat:'application/json',CQL_FILTER:"clave='"+code+"'"
 });
 assert.equal(u.origin,origin);
 try {
   const r=await fetch(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(17000),headers:{accept:'application/json','user-agent':'Mozilla/5.0'}});
   assert.equal(r.status,200,'GeoService HTTP '+r.status);
   const a=await r.arrayBuffer();assert.ok(a.byteLength<1000000,'Oversized WFS JSON');
   const json=JSON.parse(new TextDecoder('utf-8').decode(a));
   assert.ok(Array.isArray(json.features),'WFS features missing');
   const matches=json.features.filter(f=>String(f.properties?.clave)===code);
   if(matches.length!==1){
     errors.push({clave:code,returned:json.features.length,exact_matches:matches.length,
       error:'missing or nonunique official feature'});continue;
   }
   const f=matches[0], p=f.properties||{};
   const lat=Number(p.latitud),lon=Number(p.longitud);
   assert.ok(Number.isFinite(lat)&&Number.isFinite(lon),'Missing coordinates');
   assert.ok(lat>=-42&&lat<=-33&&lon>=-64&&lon<=-56,'Coordinates outside PBA');
   features.push({
    clave:code,escuela:p.nombre,distrito:p.distrito,localidad:p.localidad,
    cue:p.cue,calle:p.calle,nro:p.nro,
    latitude:lat,longitude:lon,geometry_type:f.geometry?.type,
    matched_offer_ids:Object.entries(offerToSchool).filter(([,school])=>school===code).map(([id])=>id)
   });
 }catch(e){errors.push({clave:code,error:String(e.message||e)})}
}
console.log('APD_SCHOOL_WFS_OFFICIAL_EXACT_JOIN '+JSON.stringify({
  at:new Date().toISOString(),source:'public_ABC_APD+public_mapaescolar_WFS',
  requested_offers:Object.keys(offerToSchool).length,distinct_school_keys:codes.length,
  school_matches:features.length,mapped_offers:features.reduce((n,f)=>n+f.matched_offer_ids.length,0),
  matched:features,errors,complete:features.length===codes.length&&!errors.length,
  method:'exact_school_clave_read_only',no_user_session:true,no_writes:true
}));
if(errors.length)process.exitCode=2;

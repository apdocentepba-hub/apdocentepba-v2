// Public, bounded GET checks: no logins, credentials, personal data or writes.
// Report official service availability and browser CORS eligibility; do not gate
// unrelated production workflows on an external service.
const host='https://mapaescolar.abc.gob.ar';
const cases=[
 {code:'0005MS0004',layer:'me:nivel_secundario_gestion_estatal'},
 {code:'0005MT0006',layer:'me:modalidad_tecnico_profesional_secundaria_gestion_estatal'}
];
let allOkay=true;
for (const entry of cases){
 const u=new URL(host+'/me/wfs');
 u.search=new URLSearchParams({
  service:'WFS',version:'2.0.0',request:'GetFeature',
  typeNames:entry.layer,count:'5',outputFormat:'application/json',
  CQL_FILTER:"clave='"+entry.code+"'"
 });
 const record={clave:entry.code,origin:host,request:'GET',no_personal_data:true};
 try{
  const res=await fetch(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Accept:'application/json',Origin:'https://alertasapd.com.ar'}});
  record.http=res.status;
  const allow=res.headers.get('access-control-allow-origin')||'';
  record.browser_cors_allowed=allow==='*'||allow==='https://alertasapd.com.ar';
  const bytes=await res.arrayBuffer();
  if(!res.ok||bytes.byteLength>300000)throw Error('status_or_response_limit');
  const json=JSON.parse(new TextDecoder().decode(bytes));
  if(!Array.isArray(json.features)||json.features.length>5)throw Error('invalid_feature_list');
  const matches=json.features.filter(x=>x?.properties?.clave===entry.code);
  record.exact_matches=matches.length;
  const p=matches[0]?.properties||{};
  record.has_cue=!!(p.cue||p.cueanexo);
  record.has_name=!!p.nombre;
  record.has_address=!!p.calle;
  const lat=Number(p.latitud),lon=Number(p.longitud);
  record.has_valid_coordinates=Number.isFinite(lat)&&Number.isFinite(lon)&&
    lat>=-42&&lat<=-33&&lon>=-64&&lon<=-55;
  record.ok=matches.length===1&&record.has_valid_coordinates;
 }catch{
  record.ok=false;
  record.error='unavailable_or_invalid_public_response';
 }
 allOkay&&=record.ok&&record.browser_cors_allowed;
 console.log('APD_WFS_PUBLIC_SMOKE '+JSON.stringify(record));
}
if(!allOkay)process.exitCode=2;

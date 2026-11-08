// Bounded public evidence probes using real provincial keys observed in the public offer scanner.
// No names, coordinates, user records, or tokens are printed. GET only.
const tests=[
 {code:'0005PP0060',layers:['me:nivel_primario_gestion_estatal']},
 {code:'0005JI0917',layers:['me:nivel_inicial_gestion_estatal']},
 {code:'0005EE0503',layers:[
  'me:modalidad_especial_primaria_gestion_estatal',
  'me:modalidad_especial_inicial_gestion_estatal',
  'me:modalidad_especial_formacion_integral_gestion_estatal']},
 {code:'0085IS0024',layers:['me:nivel_superior_gestion_estatal']},
 {code:'0085MA0001',layers:['me:modalidad_tecnico_profesional_secundaria_gestion_estatal']},
 {code:'0005AP0001',layers:['me:mejaam_primaria_gestion_estatal']}
];
const endpoint='https://mapaescolar.abc.gob.ar/me/wfs';
const reports=[];
for(const entry of tests){
 const found=[];
 for(const layer of entry.layers) {
  const url=new URL(endpoint);
  url.search=new URLSearchParams({
   service:'WFS',request:'GetFeature',version:'2.0.0',
   typeNames:layer,outputFormat:'application/json',count:'5',
   CQL_FILTER:"clave='"+entry.code+"'"
  });
  const info={layer,status:null,exact_matches:0,valid_location:false,cors:false};
  try{
   const res=await fetch(url,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(8500),headers:{Accept:'application/json',Origin:'https://alertasapd.com.ar'}});
   info.status=res.status;
   const allow=res.headers.get('access-control-allow-origin')||'';
   info.cors=allow==='*'||allow==='https://alertasapd.com.ar';
   const bytes=await res.arrayBuffer();
   if(!res.ok||bytes.byteLength>250000)throw Error('provider_rejected_or_large');
   const data=JSON.parse(new TextDecoder().decode(bytes));
   if(!Array.isArray(data.features)||data.features.length>5)throw Error('invalid_features');
   const matches=data.features.filter(f=>String(f?.properties?.clave||'')===entry.code);
   info.exact_matches=matches.length;
   if(matches.length===1){
    const p=matches[0].properties;
    const lat=Number(p.latitud),lon=Number(p.longitud);
    info.valid_location=Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-42&&lat<=-33&&lon>=-64&&lon<=-55;
    info.has_cue=!!(p.cue||p.cueanexo);
    info.has_name=!!p.nombre;info.has_address=!!p.calle;
    if(info.valid_location)found.push(layer);
   }
  }catch{info.error='provider_unavailable_or_invalid';}
  reports.push({clave:entry.code,...info});
 }
 console.log('APD_WFS_MODALITY_EVIDENCE '+JSON.stringify({
  clave:entry.code,valid_layers:found,unique_layer:found.length===1?found[0]:null
 }));
}
console.log('APD_WFS_MODALITY_DIAGNOSTIC '+JSON.stringify({
 read_only:true,query_count:reports.length,observations:reports
}));

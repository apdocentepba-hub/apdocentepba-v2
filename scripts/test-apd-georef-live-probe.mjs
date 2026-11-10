/**
 * One-off public API connectivity probe for the opt-in Insigne address chooser.
 * This script never reads teacher records, secrets, GPS, or the APD database.
 * It sends only two fixed, illustrative addresses to Argentina's Georef.
 * Do not treat this as a substitute for a real user's address selection.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
const BASE='https://apis.datos.gob.ar/georef/api/v2.0/direcciones';
const MAX_BODY=180000;
const checks=[
 {key:'official_example',params:{direccion:'Urquiza 400',provincia:'Santa Fe',departamento:'Rosario',max:'5'}},
 {key:'wilde_example',params:{direccion:'Rondeau 319',provincia:'Buenos Aires',departamento:'Avellaneda',localidad_censal:'Wilde',max:'30'}},
 {key:'avellaneda_fallback',params:{direccion:'Rondeau 319',provincia:'Buenos Aires',departamento:'Avellaneda',max:'30'}},
 {key:'buenos_aires_fallback',params:{direccion:'Rondeau 319',provincia:'Buenos Aires',max:'30'}},
 {key:'nationwide_fallback',params:{direccion:'Rondeau 319',max:'30'}},
 {key:'wilde_alternative_text',params:{direccion:'Rondeau al 319',provincia:'Buenos Aires',departamento:'Avellaneda',max:'30'}}
];
async function probe({key,params}){
 const url=new URL(BASE);
 url.search=new URLSearchParams(params);
 const info={key,endpoint:url.origin+url.pathname,status:null,content_type:'',
  cors_allow_origin:null,result_count:null,structure_valid:false,
  any_valid_height:false,any_geocoordinates:false,area_names:[],error:null};
 try{
  const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},
   credentials:'omit',signal:AbortSignal.timeout(12000),redirect:'error'});
  info.status=response.status;
  info.content_type=response.headers.get('content-type')||'';
  info.cors_allow_origin=response.headers.get('access-control-allow-origin');
  const advertised=Number(response.headers.get('content-length')||0);
  if(!response.ok)throw Error('HTTP '+response.status);
  if(advertised>MAX_BODY)throw Error('body_over_limit');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_BODY)throw Error('body_over_limit');
  const data=JSON.parse(new TextDecoder().decode(bytes));
  info.structure_valid=Array.isArray(data?.direcciones)&&
   Number.isInteger(data.cantidad);
  if(!info.structure_valid)throw Error('unexpected_api_schema');
  info.result_count=data.cantidad;
  // Only public administrative labels, NOT address coordinates or user data.
  info.area_names=data.direcciones.slice(0,3).map(item=>({
   localidad:String(item?.localidad_censal?.nombre||'').slice(0,55),
   partido:String(item?.departamento?.nombre||'').slice(0,55),
   provincia:String(item?.provincia?.nombre||'').slice(0,55)
  }));
  info.any_valid_height=data.direcciones.some(item=>
   Number.isInteger(item?.altura?.valor)&&item.altura.valor===Number(params.direccion.match(/\d+$/)?.[0]));
  info.any_geocoordinates=data.direcciones.some(item=>{
   const lat=item?.ubicacion?.lat,lon=item?.ubicacion?.lon;
   return Number.isFinite(lat)&&Number.isFinite(lon)&&
    lat>=-56&&lat<=-21&&lon>=-74&&lon<=-53;
  });
 }catch(error){info.error=String(error?.cause?.code||error?.name||error?.message||'unknown');}
 return info;
}
const outputs=[];
for(const check of checks)outputs.push(await probe(check));
mkdirSync('tmp',{recursive:true});
writeFileSync('tmp/apd-georef-public-probe.json',JSON.stringify({
 checked_at:new Date().toISOString(),
 status:'exploratory_public_live_test_no_apd_credentials',
 checks:outputs
},null,2));
for(const record of outputs)console.log('GEOREF_PUBLIC_PROBE',JSON.stringify(record));
const ok=outputs[0]?.status===200&&outputs[0].structure_valid;
if(!ok)throw Error('No se pudo verificar Georef en vivo desde GitHub Actions');
if(!outputs.every(x=>x.cors_allow_origin==='*'||x.cors_allow_origin==='https://alertasapd.com.ar'))
 console.warn('CORS_NO_CONFIRMADO: revisar permisos de navegador antes de publicar');
console.log('GEOREF_LIVE_PROBE_FINISHED: no se envió ningún dato de usuarios de APD');

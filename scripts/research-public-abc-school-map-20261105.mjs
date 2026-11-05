/* Read-only discovery: published ABC offers + public PBA school map datasets.
 * No accounts, credentials, private data, database writes, or email.
 */
const nodes=[
 {type:'catalog_ckan',url:'https://catalogo.datos.gba.gov.ar/api/3/action/package_show?id=establecimientos-educativos'},
 {type:'catalog_csv_resource',url:'https://catalogo.datos.gba.gov.ar/dataset/4becb4b7-0a21-4fef-8f2c-30df7f345a01/archivo/3951210e-7e0e-4fed-bbf1-0183e704c9ae'},
 {type:'pba_map_wms',url:'https://mapaescolar.abc.gob.ar/me/wms?service=WMS&version=1.3.0&request=GetCapabilities'},
 {type:'pba_map_wfs',url:'https://mapaescolar.abc.gob.ar/me/wfs?service=WFS&version=2.0.0&request=GetCapabilities'}
];
const ABC='https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select';
const offerIds=['4396000','4396004','4396014','4396087','4396314','4396441'];
for(const id of offerIds){
 const u=new URL(ABC);
 u.search=new URLSearchParams({q:'iddetalle:'+id,rows:'2',start:'0',wt:'json',fl:'iddetalle,idoferta,escuela,domiciliodesempeno,idsuna,ige,numdistrito,descdistrito,descnivelmodalidad,nivelmodalidad,cargo,descripcioncargo,turno,estado'});
 nodes.push({type:'abc_offer_'+id,url:u.toString()});
}
const allowed=new Set(['catalogo.datos.gba.gov.ar','mapaescolar.abc.gob.ar','servicios3.abc.gob.ar']);
const result=[];
for(const item of nodes){
 const u=new URL(item.url);
 if(!allowed.has(u.hostname)||u.protocol!=='https:')throw Error('Disallowed source');
 const started=Date.now();
 try{
  const r=await fetch(u,{method:'GET',signal:AbortSignal.timeout(16000),redirect:'error',headers:{Accept:'application/json,application/xml,text/xml,text/html,*/*', 'user-agent':'Mozilla/5.0','referer':'http://servicios2.abc.gob.ar/' }});
  let text=await r.text();
  if(text.length>6_000_000)throw Error('Source response is too large');
  const basic={type:item.type,http:r.status,bytes:text.length,elapsed_ms:Date.now()-started,mime:r.headers.get('content-type')};
  if(item.type==='catalog_ckan' && r.ok){
   const j=JSON.parse(text),res=j.result?.resources||[];
   basic.resources=res.map(x=>({name:x.name,format:x.format,url:x.url,modified:x.last_modified||x.metadata_modified||null})).filter(x=>/csv|geojson|zip/i.test(x.format||''));basic.success=j.success;
  }else if(item.type==='catalog_csv_resource'){
   basic.links=[...text.matchAll(/href\s*=\s*["']([^"']+\.(?:csv|zip|geojson)[^"']*)/gi)].slice(0,6).map(m=>m[1]);
   basic.has_download_button=/descargar|download/i.test(text);
  }else if(item.type==='pba_map_wms'||item.type==='pba_map_wfs'){
   basic.wms_xml=/<WMS_Capabilities|<WMT_MS_Capabilities/i.test(text);
   basic.wfs_xml=/<WFS_Capabilities/i.test(text);
   basic.xml_title=text.match(/<Title>([^<]{3,100})<\/Title>/i)?.[1]||null;
   basic.error_hint=text.match(/<ServiceException[^>]*>([^<]{1,130})/i)?.[1]||null;
  }else if(item.type.startsWith('abc_offer_')&&r.ok){
   // ABC returns Latin-1 text; standard fields used here are ASCII or safely decoded below.
   let json;try{json=JSON.parse(text)}catch{json=JSON.parse(new TextDecoder('iso-8859-1').decode(new TextEncoder().encode(text)));}
   const d=(json.response?.docs||[]).find(x=>String(x.iddetalle)===item.type.slice(-7));
   basic.found=Boolean(d);basic.abc_record=d?{
    iddetalle:d.iddetalle,
    escuela:d.escuela,
    has_dom:!!d.domiciliodesempeno,
    domicilio:d.domiciliodesempeno||null,
    idsuna:d.idsuna||null,ige:d.ige||null,
    district:d.descdistrito,nivel:d.descnivelmodalidad,
    cargo:d.descripcioncargo,turno:d.turno,estado:d.estado
   }:null;
  }else basic.error_snippet=text.slice(0,180);
  result.push(basic);
 }catch(e){result.push({type:item.type,error:String(e.message||e),elapsed_ms:Date.now()-started})}
}
console.log('APD_MAPA_ESCOLAR_DISCOVERY '+JSON.stringify({at:new Date().toISOString(),read_only:true,no_user_data:true,results:result}));

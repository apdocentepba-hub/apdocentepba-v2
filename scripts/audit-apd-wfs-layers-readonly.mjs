// Public ABC Mapa Escolar WFS capabilities inventory. Zero credentials, GET only.
// Descriptive investigation: not a runtime dependency nor a production API.
const endpoint='https://mapaescolar.abc.gob.ar/me/wfs';
const url=new URL(endpoint);
url.search=new URLSearchParams({service:'WFS',version:'2.0.0',request:'GetCapabilities'});
const report={source:endpoint,read_only:true,anonymous:true};
try {
 const res=await fetch(url,{method:'GET',redirect:'error',
  signal:AbortSignal.timeout(14000),headers:{Accept:'application/xml,text/xml,*/*'}});
 report.http=res.status;
 const bytes=await res.arrayBuffer();
 if(!res.ok||bytes.byteLength>3_500_000)throw Error('invalid_capabilities_response');
 const xml=new TextDecoder().decode(bytes);
 if(!/WFS_Capabilities/.test(xml))throw Error('not_a_wfs_capabilities_document');
 const blocks=[...xml.matchAll(/<(?:\w+:)?FeatureType(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?FeatureType>/gi)];
 const types=blocks.map(m=>{
  const b=m[1];
  return {
   name:b.match(/<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/i)?.[1]||'',
   title:b.match(/<(?:\w+:)?Title>([^<]+)<\/(?:\w+:)?Title>/i)?.[1]||''
  };
 });
 const interesting=types.filter(t=>/nivel|primaria|primario|inicial|tecnic|agrari|especial|adult|secund|superior|jardin|gesti[oó]n/i.test(t.name+' '+t.title));
 report.layer_count=types.length;
 report.interesting_layers=interesting.slice(0,80);
 report.layer_names_truncated=interesting.length>80;
 report.ok=true;
} catch (e) {
 report.ok=false;
 report.reason=String(e?.message||'provider_unavailable').replace(/[^a-zA-Z0-9_]/g,'_').slice(0,80);
}
console.log('APD_WFS_CAPABILITIES_READONLY '+JSON.stringify(report));
if(!report.ok)process.exitCode=2;

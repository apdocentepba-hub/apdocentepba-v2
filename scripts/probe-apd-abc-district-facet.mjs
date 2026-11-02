/* Prueba de una sola consulta pública de agregados Solr (sin descargar ofertas). */
import assert from "node:assert/strict";
const url=new URL("https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select");
for(const [k,v] of Object.entries({q:'estado:"Publicada"',wt:"json",rows:"0",start:"0",facet:"true","facet.field":"descdistrito","facet.limit":"-1","facet.mincount":"1"}))url.searchParams.set(k,v);
const ctrl=new AbortController();
const timer=setTimeout(()=>ctrl.abort(),16000);
try{
 const res=await fetch(url,{method:"GET",redirect:"error",credentials:"omit",cache:"no-store",signal:ctrl.signal,headers:{Accept:"application/json"}});
 assert.equal(res.status,200,"ABC returned HTTP "+res.status);
 const raw=new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());assert.ok(raw.length<200000,"Unexpectedly large facet response");
 const json=JSON.parse(raw);
 assert.ok(Number.isSafeInteger(json?.response?.numFound));
 assert.deepEqual(json.response.docs,[]);
 const field=json?.facet_counts?.facet_fields?.descdistrito;
 const shape=Array.isArray(field)?"array":typeof field;
 if(!Array.isArray(field)){console.log(JSON.stringify({supports_district_facet:false,numFound:json.response.numFound,facet_field_shape:shape},null,2));process.exitCode=2;}
 else {
  assert.equal(field.length%2,0,"Solr facet pairs must be even");
  const counts=[];
  for(let i=0;i<field.length;i+=2){
   assert.equal(typeof field[i],"string");
   assert.ok(Number.isSafeInteger(field[i+1])&&field[i+1]>=0);
   counts.push(field[i+1]);
  }
  console.log(JSON.stringify({supports_district_facet:true,numFound:json.response.numFound,buckets:counts.length,sum_of_bucket_counts:counts.reduce((a,x)=>a+x,0),documents_downloaded:json.response.docs.length},null,2));
 }
} finally {clearTimeout(timer);}

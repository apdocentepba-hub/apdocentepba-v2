/* Public ABC offer-close schema sampling. Read-only, max 2 GETs,
 * no user accounts, no offers' titles/IDs, no emails or personal data.
 */
import assert from "node:assert/strict";
import {parseApdDeadlineInstant,apdOfferDeadlineStatus} from "./lib/apd-offer-close-guard.mjs";
const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const districts=["QUILMES","TIGRE"];
const results=[];
for(const district of districts){
 const q='descdistrito:"'+district+'" AND estado:"Publicada"';
 const params=new URLSearchParams({q,rows:"100",start:"0",wt:"json",sort:"ult_movimiento desc"});
 const url=new URL(endpoint+"?"+params.toString());
 assert.equal(url.origin,"https://servicios3.abc.gob.ar");
 const res=await fetch(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(20000),
  headers:{"accept":"application/json, text/javascript, */*; q=0.01",
    "user-agent":"Mozilla/5.0","referer":"http://servicios2.abc.gob.ar/",
    "origin":"http://servicios2.abc.gob.ar"}});
 assert.equal(res.status,200,"ABC unavailable: "+district);
 const buffer=await res.arrayBuffer();
 assert.ok(buffer.byteLength<4*1024*1024,"ABC response too large");
 const data=JSON.parse(new TextDecoder("iso-8859-1").decode(buffer));
 const docs=data?.response?.docs;
 assert.ok(Array.isArray(docs));
 const counts={eligible:0,expired:0,missing_deadline:0,hour_unverified:0,invalid_or_unknown:0,iso_utc:0,iso_offset:0,iso_local:0,dmy_time:0,date_only:0,other:0};
 const examples=[];
 for(const doc of docs){
  assert.equal(String(doc.estado).toUpperCase(),"PUBLICADA");
  const close=String(doc.finoferta||"").trim();
  const parsed=parseApdDeadlineInstant(close);
  if(/Z$/i.test(close))counts.iso_utc++;
  else if(/[+-]\d\d:\d\d$/.test(close))counts.iso_offset++;
  else if(/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(close))counts.iso_local++;
  else if(/^\d\d?\/\d\d?\/\d{4}[,\s]+\d\d?:\d\d/.test(close))counts.dmy_time++;
  else if(/^\d{4}-\d\d-\d\d$/.test(close)||/^\d\d?\/\d\d?\/\d{4}$/.test(close))counts.date_only++;
  else counts.other++;
  const status=apdOfferDeadlineStatus(doc);
  if(status.eligible)counts.eligible++;
  else if(status.reason==="deadline_reached")counts.expired++;
  else if(status.reason==="missing_deadline")counts.missing_deadline++;
  else if(status.reason==="hour_unverified")counts.hour_unverified++;
  else counts.invalid_or_unknown++;
  if(examples.length<4 && !examples.includes(close)) examples.push(close);
 }
 results.push({district,sampled_docs:docs.length,num_found:Number(data.response.numFound||0),format_counts:counts,
  public_deadline_samples:examples,samples_only:true});
}
console.log("APD_PUBLIC_ABC_CLOSE_FORMAT_PROBE "+JSON.stringify({
 source:"official_public_ABC_APD_Solr",read_only:true,account_data:false,requests:districts.length,
 districts:results,no_sends:true,no_writes:true
}));

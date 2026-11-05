import assert from 'node:assert/strict';
const endpoint='https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select';
const districts=['AVELLANEDA','GENERAL SAN MARTIN','PARTIDO DE LA COSTA'];
const tracked=new Set(['4396000','4396004','4396014','4396087','4396314','4396441']);
const normalize=s=>String(s??'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function cargo(doc){
 const s=normalize([doc.descripcioncargo,doc.descripcionarea,doc.cargo].join(' '));
 if(/PRECEPTOR|\bPR\b/.test(s))return 'PR';
 if(/CICLO SUPERIOR|\bMCS\b/.test(s))return 'MCS';
 if(/MATEM|\bMTM\b/.test(s))return 'MTM';
 if(/\bELI\b/.test(s))return 'ELI';
 if(/\bPLI\b/.test(s))return 'PLI';
 return 'OTHER';
}
let requests=0;
async function get(d,start){
 assert.ok(++requests<=30,'Request cap');
 const u=new URL(endpoint);
 u.search=new URLSearchParams({q:'descdistrito:"'+d+'" AND estado:"Publicada"',wt:'json',start:String(start),rows:'200',fl:'iddetalle,descdistrito,descripcioncargo,descripcionarea,cargo,descnivelmodalidad,turno,estado'});
 const r=await fetch(u,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'accept':'application/json, text/javascript, */*; q=0.01','user-agent':'Mozilla/5.0','referer':'http://servicios2.abc.gob.ar/','origin':'http://servicios2.abc.gob.ar'}});
 assert.equal(r.status,200,'ABC HTTP '+r.status);
 const a=await r.arrayBuffer();
 assert.ok(a.byteLength<5000000,'Response size');
 const j=JSON.parse(new TextDecoder('iso-8859-1').decode(a));
 assert.ok(Array.isArray(j.response?.docs),'ABC format');
 return j.response;
}
const all=[];
const summary=[];
for(const d of districts){
 let docs=[],total=null;
 for(let p=0;p<12;p++){
  const r=await get(d,docs.length);
  if(total===null)total=Number(r.numFound);
  else assert.equal(Number(r.numFound),total,'ABC changed during pagination');
  docs.push(...r.docs);
  if(docs.length>=total)break;
  assert.ok(r.docs.length>0,'Incomplete list');
 }
 assert.equal(docs.length,total,'ABC pagination overflow');
 all.push(...docs);summary.push({district:d,published:total});
}
const known=new Set(['PR','MTM','MCS','ELI','PLI']);
const matches=all.filter(d=>known.has(cargo(d))&&/SECUND|PRIMAR|TECNIC/.test(normalize(d.descnivelmodalidad)));
const extra=matches.filter(d=>!tracked.has(String(d.iddetalle||'')));
console.log('APD_ABC_KNOWN_PREFERENCES '+JSON.stringify({timestamp:new Date().toISOString(),source:endpoint,requests,districts:summary,total_published:all.length,known_codes:[...known],selected_codes_matching_offers:matches.length,tracked_six_in_selected:matches.filter(d=>tracked.has(String(d.iddetalle||''))).length,other_matching_public_offer_ids:extra.map(d=>String(d.iddetalle)),others_count:extra.length,by_code:Object.fromEntries([...known].map(c=>[c,matches.filter(d=>cargo(d)===c).length])),unknown_sixth_preference:'not_counted',read_only:true}));

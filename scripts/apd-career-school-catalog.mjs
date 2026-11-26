/** Public, reviewed local snapshot only. Never infer payroll percentages. */
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const key=s=>typeof s==='string'&&/^[0-9]{4}[A-Z]{2}[0-9]{4}$/.test(s);
const text=(v,n)=>v===null||typeof v==='string'&&v.length>0&&v.length<=n&&!/[<>\x00-\x1f]/.test(v);
export function createSchoolCatalog(snapshot){
 if(snapshot?.schema!==1||snapshot.source!=='DGCYE_PBA'||snapshot.datasetId!=='4becb4b7-0a21-4fef-8f2c-30df7f345a01'||! /^[0-9a-f-]{36}$/.test(snapshot.resourceId||'')||! /^[0-9a-f]{64}$/.test(snapshot.sha256||'')||!/^20\d{2}-\d{2}-\d{2}$/.test(snapshot.catalogModified||'')||!Array.isArray(snapshot.schools)||snapshot.schools.length>100000)throw Error('Padrón inválido');
 const d=new Date(snapshot.catalogModified+'T00:00:00Z');
 if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==snapshot.catalogModified)throw Error('Fecha inválida');
 const map=new Map();
 for(const r of snapshot.schools){
  if(!key(r?.schoolKey)||map.has(r.schoolKey)||!r.name||!r.district||!text(r.name,180)||!text(r.district,180)||!text(r.level,180)||!text(r.area,180)||!text(r.classification,60)||!text(r.surveyPeriod,100))throw Error('Fila del padrón inválida');
  map.set(r.schoolKey,Object.freeze({schoolKey:r.schoolKey,name:r.name,district:r.district,level:r.level,area:r.area,classification:r.classification,surveyPeriod:r.surveyPeriod,catalogModified:snapshot.catalogModified}));
 }
 return Object.freeze({
  exact:k=>map.get(k)||null,
  search(query,district=''){
   const q=normalize(query);if(q.length<2||q.length>120)return [];
   const terms=q.split(/\s+/),districtNorm=normalize(district);
   const results=[];
   for(const r of map.values()){
    if(districtNorm&&normalize(r.district)!==districtNorm)continue;
    if(terms.every(t=>normalize([r.schoolKey,r.name,r.district,r.level].join(' ')).includes(t)))results.push(r);
    if(results.length>=20)break;
   }
   return results;
  }
 });
}

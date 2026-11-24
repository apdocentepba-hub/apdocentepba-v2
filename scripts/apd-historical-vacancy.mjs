/** Descriptive historical offer outcomes, NOT applicant-level probabilities. */
export function validateVacancySnapshot(data){
 if(!data||data.schema!==1||data.scope!=='partial'||data.minimum!==30||!Number.isSafeInteger(data.total)||data.total<0||!Array.isArray(data.rows))throw Error('Muestra inválida');
 const seen=new Set(),districts=new Map();
 const rows=data.rows.map(row=>{
  if(!['district','cargo'].includes(row.kind)||typeof row.district!=='string'||!row.district.trim()||typeof row.cargo!=='string'||(row.kind==='cargo')!==!!row.cargo||[row.total,row.desiertas,row.designadas].some(v=>!Number.isSafeInteger(v)||v<0))throw Error('Grupo inválido');
  const key=JSON.stringify([row.kind,row.district,row.cargo]),n=row.desiertas+row.designadas;
  if(seen.has(key)||n<30||n>row.total)throw Error('Grupo duplicado o insuficiente');seen.add(key);
  const normalized={...row,n,other:row.total-n,share:row.desiertas/n*100};
  if(row.kind==='district')districts.set(row.district,normalized);
  return normalized;
 });
 if([...districts.values()].reduce((a,x)=>a+x.total,0)>data.total)throw Error('Total inconsistente');
 for(const d of districts.values()){
  const subsets=rows.filter(x=>x.kind==='cargo'&&x.district===d.district);
  for(const key of ['total','desiertas','designadas'])if(subsets.reduce((a,x)=>a+x[key],0)>d[key])throw Error('Subgrupos inconsistentes');
 }
 if(rows.some(x=>!districts.has(x.district)))throw Error('Distrito no incluido');
 return {...data,rows};
}
export function vacancyGroups(data,{district='',query='',sort='count'}={}){
 if(!['count','share','sample'].includes(sort))throw Error('Orden inválido');
 const normalized=validateVacancySnapshot(data);
 const fold=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
 const needle=fold(query);
 return normalized.rows.filter(r=>district?r.kind==='cargo'&&r.district===district:r.kind==='district')
 .filter(r=>!needle||fold(district?r.cargo:r.district).includes(needle))
 .sort((a,b)=>(sort==='share'?b.share-a.share:sort==='sample'?b.n-a.n:b.desiertas-a.desiertas)||b.n-a.n||a.cargo.localeCompare(b.cargo,'es')||a.district.localeCompare(b.district,'es'));
}

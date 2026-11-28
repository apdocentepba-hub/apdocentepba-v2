// APD-012 candidate: raw ABC offers only, not generic dates or historical views.
import assert from 'node:assert/strict';
export function abcOfferDeadlineAudit(offer,now=Date.now()){
 if(!Number.isFinite(now)||!offer||typeof offer!=='object')return false;
 const states=['estado','estado_oferta','estado_actual'].map(k=>String(offer[k]??'').trim().toUpperCase()).filter(Boolean);
 if(!states.length||states.some(s=>s!=='PUBLICADA'))return false;
 const raw=String(offer.finoferta||offer.fecha_cierre||'').trim();
 // ABC finoferta uses Argentina wall clock even with the legacy Z suffix.
 // Explicit numeric offsets are interpreted literally. No date-only guesses.
 let m=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/i);
 let y,mo,d,h,mi,s,ms=0,offset='Z';
 if(m){[,y,mo,d,h,mi,s]=m;ms=Number((m[7]||'').padEnd(3,'0').slice(0,3));offset=m[8]||'Z';}
 else{
  m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(!m)return false;
  [,d,mo,y,h,mi,s]=m;
 }
 [y,mo,d,h,mi,s]=[y,mo,d,h,mi,s||0].map(Number);
 if(y<2000||y>2100||mo<1||mo>12||d<1||d>31||h>23||mi>59||s>59)return false;
 const local=Date.UTC(y,mo-1,d,h,mi,s,ms),date=new Date(local);
 if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==mo||date.getUTCDate()!==d)return false;
 let shift=180;
 if(offset.toUpperCase()!=='Z'){
  const oh=Number(offset.slice(1,3)),om=Number(offset.slice(4,6));
  if(oh>14||om>59||(oh===14&&om>0))return false;
  shift=(offset[0]==='+'?-1:1)*(oh*60+om);
 }
 return local+shift*60000>now;
}
export function stageAbcExpiryAudit(source){
 const names=['ofertaVigente','ofertaEsVisibleParaAlerta'];
 assert.ok(!source.includes('apdAbcOfferDeadlineAuditV1'),'Already staged');
 const parts=names.map(name=>{
  const anchor='function '+name+'(oferta) {';
  assert.equal(source.split(anchor).length,2,name);
  const from=source.indexOf(anchor),to=source.indexOf('\n__name('+name+',',from);
  assert.ok(to>from,name);
  const old=source.slice(from,to);assert.ok(old.endsWith('\n}'),name);
  assert.match(old,/ANULADA/);
  return {old,next:anchor+'\n  return apdAbcOfferDeadlineAuditV1(oferta,Date.now());\n}'};
 });
 const prefix=abcOfferDeadlineAudit.toString().replace('function abcOfferDeadlineAudit(','function apdAbcOfferDeadlineAuditV1(')+'\n';
 let candidate=source;
 for(const p of parts)candidate=candidate.replace(p.old,()=>p.next);
 candidate=prefix+candidate;
 let reverse=candidate.slice(prefix.length);
 for(const p of parts)reverse=reverse.replace(p.next,()=>p.old);
 assert.equal(reverse,source);
 return {candidate,functions:names,unrelatedBytesPreserved:true,deployable:false};
}

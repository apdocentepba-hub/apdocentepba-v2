import assert from 'node:assert/strict';
// Protect PID fields in channel enrichment and nested raw payloads, not merely top-level display.
export function redactNestedPid(value,depth=0){
 if(value===null||typeof value!=='object')return value;
 if(depth>20)return null;
 if(Array.isArray(value))return value.map(v=>redactNestedPid(v,depth+1));
 return Object.fromEntries(Object.entries(value).filter(([k])=>!/^pid(?:_|$)/i.test(k)).map(([k,v])=>[k,redactNestedPid(v,depth+1)]));
}
export function stageCommercialPidEnrichment(source){
 const original=source,changes=[];
 const within=(name,change)=>{
  const matches=[...source.matchAll(new RegExp('^(?:async )?function '+name+'\\([^\\n]*\\) \\{','gm'))];
  assert.equal(matches.length,1,'PID enrichment owner '+name);
  const a=matches[0].index,b=source.indexOf('\n__name('+name+',',a);assert.ok(b>a);
  const old=source.slice(a,b),next=change(old);assert.notEqual(old,next);
  source=source.slice(0,a)+next+source.slice(b);changes.push({old,next});
 };
 within('enrichAlertForRichChannels',fn=>{
  const matches=[...fn.matchAll(/if\s*\(\s*planCode\s*!==\s*["']INSIGNE["']\s*\)\s*\{/g)];
  assert.equal(matches.length,1,'Rich channel PID strip guard');
  assert.match(fn,/stripPidFromPayload\(enriched\)/);
  return fn.replace(matches[0][0],()=> 'if (!canShowPidForPlan(resolved)) {');
 });
 within('stripPidFromPayload',fn=>{
  const match=[...fn.matchAll(/const p = normalizeOfferPayload\(payload \|\| \{\}\);/g)];
  assert.equal(match.length,1,'PID redaction input');
  return fn.replace(match[0][0],()=> 'const p = apdRedactNestedPidV1(normalizeOfferPayload(payload || {}));');
 });
 let reversed=source;for(const c of changes.toReversed())reversed=reversed.replace(c.next,()=>c.old);
 assert.equal(reversed,original,'Unrelated source changed');
 return {candidate:redactNestedPid.toString().replaceAll('redactNestedPid','apdRedactNestedPidV1')+'\n'+source,richChannelGuard:true,nestedRedaction:true,unrelatedBytesPreserved:true,deployable:false};
}

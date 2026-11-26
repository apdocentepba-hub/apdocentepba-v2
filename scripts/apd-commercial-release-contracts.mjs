// Read-only check of exact already uploaded version. No deployment, no registration, no checkout.
import crypto from 'node:crypto';
export function activeVersion(result){
 const live=(result?.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
 if(live.length!==1||Number(live[0].percentage)!==100||!live[0].version_id)throw Error('Ambiguous active deployment');
 return live[0].version_id;
}
export function inspectCrons(result){
 const a=Array.isArray(result)?result:result?.schedules||result?.crons;
 if(!Array.isArray(a))throw Error('Missing schedules');
 const actual=a.map(x=>typeof x==='string'?x:x.cron).sort();
 if(JSON.stringify(actual)!==JSON.stringify(['0 01 * * *','0 17 * * *','0 21 * * *','1-59/2 * * * *'].sort()))throw Error('Cron drift');
 return actual;
}
export const OLD='39270d55-e179-4c69-96a7-c1658d617a03';
export const NEXT='762b5116-9f47-4a7a-a464-f694fd96dce1';
export const OLD_HASH='a8f35eaed5b003bf8f8a9c7ade63684e0f145d13814496be9050224c39ae08a8';
export const NEXT_HASH='65006ce5607cd348bff9fd7a606381b7c4fda1af2f9e27f7b473faad99f162ac';
export const worker='ancient-wildflower-cd37';
export const base='https://'+worker+'.apdocentepba.workers.dev';
export const preview='https://'+NEXT.slice(0,8)+'-'+worker+'.apdocentepba.workers.dev';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function verifyVersion(d,id,sha,size){
 if(d.id!==id||d.modules?.length!==1||d.main_module!==d.modules[0].name||typeof d.modules[0].content_base64!=='string')throw Error('Version/module mismatch');
 const bytes=Buffer.from(d.modules[0].content_base64,'base64');
 if(bytes.length!==size||hash(bytes)!==sha)throw Error('Version fingerprint drift');
 if(d.bindings?.length!==29||new Set(d.bindings.map(b=>b.name)).size!==29)throw Error('Binding count drift');
}
export function compareBindings(old,next){
 const map=new Map(next.bindings.map(b=>[b.name+':'+b.type,b]));
 for(const b of old.bindings){
  const n=map.get(b.name+':'+b.type);
  if(!n)throw Error('Missing binding');
  if(b.type==='kv_namespace'&&String(b.namespace_id||b.id||'')!==String(n.namespace_id||n.id||''))throw Error('KV target drift');
  if(b.type==='plain_text'&&b.text!==n.text)throw Error('Scalar binding drift');
 }
 if(old.compatibility_date!==next.compatibility_date||JSON.stringify((old.compatibility_flags||[]).slice().sort())!==JSON.stringify((next.compatibility_flags||[]).slice().sort()))throw Error('Runtime drift');
}
export function compareCatalog(a,b){
 const clean=x=>{
  if(!Array.isArray(x?.planes)||!x.planes.length)throw Error('Invalid catalog');
  const out=x.planes.map(p=>({code:String(p.code||''),price:String(p.price_ars??''),trial:String(p.trial_days??''),districts:String(p.max_distritos??''),charges:String(p.max_cargos??'')}));
  if(out.some(p=>!p.code||['FREE','COMPLETO','TRIAL_14D'].includes(p.code))||new Set(out.map(p=>p.code)).size!==out.length||x.commercial_enrollment_open===true)throw Error('New plans visible or enrollment open');
  return out.sort((x,y)=>x.code.localeCompare(y.code));
 };
 if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error('Legacy catalog changed');
 return a.planes.length;
}
export async function smoke(getHttp){
 const result={};
 for(const [path,status] of [['/api/version',200],['/api/planes',200],['/api/mi-plan',401],['/api/account/profile',401],['/api/account/preferences',401],['/api/account/application-diary',401],['/api/mis-alertas',401],['/api/historico-resumen',401]]){
  const a=await getHttp(base,path), b=await getHttp(preview,path);
  if(a.status!==status||b.status!==status)throw Error('HTTP contract '+path+' expected '+status+' actual '+a.status+'/'+b.status);
  if(path==='/api/planes')result.legacyPlans=compareCatalog(a.data,b.data);
 }
 return {...result,checks:8};
}

/* Local-only, opt-in-through-disposable-candidate timing collector.
 * Zero identifiers, zero endpoint URLs, zero alert details, zero network.
 * This module is copied into a NOT-DEPLOYED app_v2.js candidate by CI.
 */
export function createApdPanelTimingMeter({
 now=()=>performance.now(),
 nextPaint=done=>requestAnimationFrame(()=>requestAnimationFrame(done)),
 cap=30
}={}){
 if(!Number.isInteger(cap)||cap<1||cap>100)throw Error("Invalid local sample cap");
 const active=new Map();
 const samples=[];
 let sequence=0;
 const duration=(a,b)=>Math.max(0,Math.round((b-a)*10)/10);
 function begin(){
  const id=++sequence;
  active.set(id,{start:now(),profile:null,api:null});
  if(active.size>cap){
   const first=active.keys().next().value;
   active.delete(first);
  }
  return id;
 }
 function markProfile(id){
  const run=active.get(id);
  if(run&&run.profile===null)run.profile=now();
 }
 function markApi(id,status){
  const run=active.get(id);
  if(run&&run.api===null){
   run.api=now();
   run.apiStatus=status==="success"?"success":"error";
  }
 }
 function finish(id,outcome){
  const run=active.get(id);
  if(!run)return;
  // Never hold references to sessions, user IDs or alert payloads.
  const allowed=["rendered","no_matches","plan_inactive","api_error","profile_error"];
  if(!allowed.includes(outcome))throw Error("Invalid timing outcome");
  active.delete(id);
  nextPaint(()=>{
   const end=now();
   samples.push({
    outcome,
    api_ms:run.api===null?null:duration(run.start,run.api),
    profile_ms:run.profile===null?null:duration(run.start,run.profile),
    rendered_ms:duration(run.start,end)
   });
   if(samples.length>cap)samples.shift();
  });
 }
 function discard(id){active.delete(id);}
 const percentile=(values,fraction)=>{
  if(!values.length)return null;
  const arr=[...values].sort((a,b)=>a-b);
  return arr[Math.max(0,Math.ceil(arr.length*fraction)-1)];
 };
 function snapshot(){
  // Read-only numeric samples; never return active run objects.
  return samples.map(s=>({...s}));
 }
 function summary(){
  const items=snapshot();
  const result={sample_count:items.length,outcomes:{},metrics:{}};
  for(const s of items)result.outcomes[s.outcome]=(result.outcomes[s.outcome]||0)+1;
  for(const key of ["api_ms","profile_ms","rendered_ms"]){
   const values=items.map(x=>x[key]).filter(Number.isFinite);
   result.metrics[key]={n:values.length,p50:percentile(values,0.5),
    p95:percentile(values,0.95)};
  }
  return result;
 }
 return Object.freeze({begin,markApi,markProfile,finish,discard,snapshot,summary});
}

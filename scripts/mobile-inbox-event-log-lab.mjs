/**
 * APDocentePBA — account-scoped inbox event-log candidate, LAB ONLY.
 * In-memory, synthetic IDs, no real account, DB, push, ABC, network or PII.
 * The real HTTP handler passes ONLY the verified server session actor.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF=/^DEMO-AVISO-00[1-4]$/;
const MAX_CURSOR=100000, MAX_LIMIT=20;
const allow=Object.freeze(Object.fromEntries(
 Array.from({length:4},(_,i)=>[
  'DEMO-AVISO-00'+(i+1),'DEMO-APD-00'+(i+1)
 ])
));
const owns=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const keys=(value,fields)=>value!==null&&typeof value==='object'&&
 !Array.isArray(value)&&Object.keys(value).length===fields.length&&
 fields.every(field=>owns(value,field));
const validUser=x=>typeof x==='string'&&UUID.test(x);
const validActor=x=>keys(x,['userId','sessionVerified'])&&
 x.sessionVerified===true&&validUser(x.userId);
const validEvent=x=>keys(x,['id','offerId','revision','status'])&&
 REF.test(x.id)&&allow[x.id]===x.offerId&&
 Number.isSafeInteger(x.revision)&&x.revision>=1&&x.revision<=MAX_CURSOR&&
 (x.status==='active'||x.status==='cancelled');
const snapshot=x=>({...x});
export function createMobileInboxEventLogLab(){
 const accounts=new Map();
 const get=id=>{
  let a=accounts.get(id);
  if(!a){a={cursor:0,events:[],current:new Map()};accounts.set(id,a);}
  return a;
 };
 const checkActor=actor=>{
  if(!validActor(actor))throw Error('inbox_session_not_verified');
  return get(actor.userId);
 };
 const append=(a,row)=>{
  if(a.cursor>=MAX_CURSOR)throw Error('inbox_log_capacity');
  a.cursor++;
  const e=Object.freeze({cursor:a.cursor,...row});
  a.events.push(e);
  return e;
 };
 return Object.freeze({
  /**
   * This function is NOT in the HTTP API. It represents a trusted
   * server-side event source feeding a synthetic account inbox.
   */
  injectServerEvent({userId,event}={}){
   if(!validUser(userId)||!validEvent(event))
    throw Error('invalid_server_inbox_event');
   const a=get(userId),old=a.current.get(event.id);
   if(old&&(old.status==='cancelled'||event.revision<=old.revision))
    return false;
   const read=event.status==='cancelled'?true:(old?.read===true);
   const next={...event,read};
   append(a,{kind:'event',...next});
   a.current.set(event.id,next);
   return true;
  },
  listPage({actor,after=0,limit=5}={}){
   const a=checkActor(actor);
   if(!Number.isSafeInteger(after)||after<0||after>MAX_CURSOR||
      after>a.cursor||!Number.isSafeInteger(limit)||limit<1||
      limit>MAX_LIMIT)throw Error('invalid_inbox_page');
   const events=a.events.slice(after,after+limit).map(snapshot);
   const nextCursor=events.length?events[events.length-1].cursor:after;
   return Object.freeze({
    version:1,fromCursor:after,nextCursor,
    hasMore:nextCursor<a.cursor,events
   });
  },
  acknowledgeRead({actor,id,revision}={}){
   const a=checkActor(actor);
   if(typeof id!=='string'||!REF.test(id)||!Number.isSafeInteger(revision)||
      revision<1||revision>MAX_CURSOR)throw Error('invalid_inbox_read');
   const current=a.current.get(id);
   if(!current)return {accepted:false,reason:'not_found'};
   if(current.revision!==revision)return {accepted:false,reason:'stale_revision'};
   if(current.status==='cancelled')
    return {accepted:false,reason:'cancelled'};
   if(current.read===true)
    return {accepted:true,alreadyRead:true,cursor:a.cursor,read:true};
   const next={...current,read:true};
   append(a,{kind:'read',...next});
   a.current.set(id,next);
   return {accepted:true,alreadyRead:false,cursor:a.cursor,read:true};
  },
  stats({actor}={}){
   const a=checkActor(actor);
   return {cursor:a.cursor,items:a.current.size};
  }
 });
}

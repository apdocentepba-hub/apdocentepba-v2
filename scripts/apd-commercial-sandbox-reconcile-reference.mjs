// Local sandbox evidence only: GET requests, never create payments/refunds or change DB.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const origin='https://api.mercadopago.com';
const referenceOK=v=>typeof v==='string'&&/^apd-sandbox-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const id=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?String(v):typeof v==='string'&&/^[1-9][0-9]{0,29}$/.test(v)?v:null;
const testUser=(u,expected)=>id(u?.id)===expected&&u?.site_id==='MLA'&&Array.isArray(u.tags)&&u.tags.includes('test_user');
const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)?Date.parse(v):NaN;
const exactAmount=(v,n)=>v===n||(typeof v==='string'&&new RegExp('^'+n+'(?:\\.0{1,2})?$').test(v));
export async function reconcileSandboxReference({token,intent,ready,phase,previous=null,transport=fetch,now=Date.now}){
 const ref=intent?.reference,seller=id(intent?.sellerId),buyer=id(intent?.buyerId),pref=ready?.preferenceId;
 const at=now(),created=time(intent?.createdAt);
 if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token)||!referenceOK(ref)||!seller||!buyer||seller===buyer||intent.status!=='intent'||ready?.reference!==ref||ready?.status!=='ready_test_only'||ready?.verifiedTestSeller!==true||ready?.verifiedTestBuyer!==true||ready?.paymentCreated!==false||ready?.amountArs!==2000||ready?.databaseWrites!==0||typeof pref!=='string'||!/^[A-Za-z0-9-]{8,180}$/.test(pref)||!Number.isFinite(at)||!Number.isFinite(created)||created>at||at-created>30*86400000||!['approved','refunded'].includes(phase))throw Error('Invalid or expired private sandbox receipt');
 const priorValid=previous?.schema==='apd_sandbox_observation_v1'&&previous.reference===ref&&previous.preferenceId===pref&&previous.sellerId===seller&&previous.buyerId===buyer&&previous.status==='approved'&&previous.liveMode===false&&previous.amountArs===2000&&previous.refundedArs===0&&id(previous.paymentId)&&Number.isFinite(time(previous.observedAt))&&time(previous.observedAt)>=created&&time(previous.observedAt)<=at;
 if(phase==='refunded'&&!priorValid)throw Error('Prior matching approval observation required');
 const get=async endpoint=>{
  const u=new URL(endpoint,origin);
  if(u.origin!==origin)throw Error('Unexpected provider endpoint');
  let res;try{res=await transport(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}});}catch{throw Error('Provider read unavailable');}
  if(!res.ok)throw Error('Provider read rejected');
  try{return await res.json();}catch{throw Error('Invalid provider read');}
 };
 if(!testUser(await get('/users/me'),seller))throw Error('Seller not verified');
 if(!testUser(await get('/users/'+buyer),buyer))throw Error('Buyer not verified');
 const p=await get('/checkout/preferences/'+pref);
 const item=p?.items?.[0];
 if(p?.id!==pref||id(p.collector_id)!==seller||p.external_reference!==ref||p.notification_url!=='https://apd-sandbox.invalid/webhook'||!Array.isArray(p.items)||p.items.length!==1||item?.id!=='APD-QA-COMPLETO'||item.currency_id!=='ARS'||item.quantity!==1||!exactAmount(item.unit_price,2000))throw Error('Preference does not match private receipt');
 const query=new URL('/v1/payments/search',origin);
 for(const [k,v] of Object.entries({sort:'date_created',criteria:'desc',external_reference:ref,range:'date_created',begin_date:'NOW-30DAYS',end_date:'NOW','collector.id':seller,'payer.id':buyer,limit:'2',offset:'0'}))query.searchParams.set(k,v);
 const results=await get(query.href);
 // Current reference documents paging/results; its sample also wraps that object in an array.
 const page=Array.isArray(results)&&results.length===1?results[0]:results;
 if(!page||page.paging?.offset!==0||!Number.isSafeInteger(page.paging?.total)||!Array.isArray(page.results)||page.paging.total!==page.results.length)throw Error('Incomplete or ambiguous payment search');
 if(page.paging.total!==1)throw Error('Expected exactly one payment; manual reconciliation required');
 const hit=page.results[0],paymentId=id(hit?.id);
 const matches=q=>id(q?.id)===paymentId&&q.external_reference===ref&&id(q.collector_id)===seller&&id(q.payer?.id)===buyer&&q.currency_id==='ARS'&&exactAmount(q.transaction_amount,2000);
 if(!paymentId||!matches(hit))throw Error('Search result does not match checkout');
 if(phase==='refunded'&&paymentId!==id(previous.paymentId))throw Error('Refund refers to a different payment');
 const q=await get('/v1/payments/'+paymentId);
 const approved=time(q?.date_approved),updated=time(q?.date_last_updated);
 const refund=phase==='approved'?0:2000;
 if(!matches(q)||q.live_mode!==false||q.status!==phase||!exactAmount(q.transaction_amount_refunded,refund)||!Number.isFinite(approved)||approved<created-60000||approved>at+60000||!Number.isFinite(updated)||updated<approved||updated>at+60000||(phase==='refunded'&&approved!==time(previous.approvedAt)))throw Error('Exact payment lifecycle not verified');
 return {schema:'apd_sandbox_observation_v1',reference:ref,preferenceId:pref,sellerId:seller,buyerId:buyer,paymentId,status:phase,liveMode:false,amountArs:2000,refundedArs:refund,approvedAt:q.date_approved,observedAt:new Date(at).toISOString(),providerWrites:0,databaseWrites:0,webhookDeliveryVerified:false};
}
export function privateEvidence(directory,reference){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||!referenceOK(reference))throw Error('Private receipt directory required');
 const root=fs.realpathSync(directory),cwd=fs.realpathSync(process.cwd());
 if(root===cwd||root.startsWith(cwd+path.sep)||!fs.statSync(root).isDirectory())throw Error('Private directory outside working directory required');
 const filename=suffix=>path.join(root,reference+'.'+suffix+'.json');
 const read=suffix=>{const f=filename(suffix),s=fs.lstatSync(f);if(!s.isFile()||s.size>65536)throw Error('Invalid private receipt');return JSON.parse(fs.readFileSync(f,'utf8'));};
 const write=(suffix,value)=>{const fd=fs.openSync(filename(suffix),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
 return {read,write};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const e=process.env,phase=e.APD_MP_SANDBOX_PHASE;
  if(!['approved','refunded'].includes(phase))throw Error('Explicit phase required');
  const store=privateEvidence(e.APD_MP_SANDBOX_RECEIPT_DIR,e.APD_MP_SANDBOX_REFERENCE);
  const result=await reconcileSandboxReference({token:e.APD_MP_SANDBOX_ACCESS_TOKEN,intent:store.read('intent'),ready:store.read('ready'),phase,previous:phase==='refunded'?store.read('approved'):null});
  store.write(phase,result);
  console.log('APD_SANDBOX_RECONCILED '+JSON.stringify({phase:result.status,liveMode:false,amountArs:2000,refundedArs:result.refundedArs,providerWrites:0,databaseWrites:0,webhookDeliveryVerified:false,privateEvidenceWritten:true}));
 }catch{console.error('Sandbox evidence not verified. No provider or database writes attempted.');process.exitCode=1;}
}

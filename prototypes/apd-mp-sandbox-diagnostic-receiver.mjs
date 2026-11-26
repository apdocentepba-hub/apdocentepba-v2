// Work 2026-11-26: 0/12 with stub, then 12/12 in Cloudflare preview and deployed endpoint.
// Independent Worker: apd-mp-sandbox-receiver.apdocentepba.workers.dev
// No bindings, tokens or databases. No financial verification or authenticated webhook evidence.
// Diagnostic POST expires 2026-11-28 00:00 UTC. Logs contain only digest and receipt metadata.
// Diagnostic transport receiver only: no token, fetch, database, entitlement or payment creation.
// A successful receipt does NOT authenticate Mercado Pago or verify any financial state.
const EXPIRES_AT='2026-11-28T00:00:00.000Z';
function reply(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function handle(req,emit=console.info){
 const u=new URL(req.url);
 if(u.pathname==='/health'&&req.method==='GET')return reply({service:'apd-mp-sandbox-receiver',purpose:'untrusted_test_notification_diagnostics',version:1,expiresAt:EXPIRES_AT,productionBindings:0,providerAuthenticated:false,paymentVerified:false,activation:false});
 if(u.pathname!=='/webhook')return reply({error:'not_found'},404);
 if(req.method!=='POST')return reply({error:'post_required'},405);
 if(Date.now()>=Date.parse(EXPIRES_AT))return reply({error:'diagnostic_window_closed'},410);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply({error:'json_required'},415);
 if(Number(req.headers.get('content-length')||0)>4096)return reply({error:'too_large'},413);
 let raw='',size=0; const chunks=[]; const reader=req.body?.getReader();
 if(!reader)return reply({error:'body_required'},400);
 try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply({error:'too_large'},413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes); }catch{return reply({error:'invalid_body'},400);}
 let b;try{b=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(b?.live_mode===true)return reply({error:'live_mode_forbidden'},403);
 const id=typeof b?.data?.id==='number'&&Number.isSafeInteger(b.data.id)?String(b.data.id):b?.data?.id;
 if(b?.live_mode!==false||b?.type!=='payment'||typeof id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(id))return reply({error:'explicit_test_payment_notification_required'},400);
 const query=u.searchParams.getAll('data.id');if(query.length>1||(query.length===1&&query[0]!==id))return reply({error:'contradictory_id'},400);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,'0')).join('');
 const receipt={event:'APD_SANDBOX_UNTRUSTED_RECEIPT',receiptId:crypto.randomUUID(),receivedAt:new Date().toISOString(),bodySha256:hash,bodyBytes:size,claimedLiveMode:false,providerAuthenticated:false,paymentVerified:false,activation:false};
 emit(receipt);return reply({received:true,diagnosticOnly:true,receiptId:receipt.receiptId,providerAuthenticated:false,paymentVerified:false,activation:false});
}
const sample={type:'payment',live_mode:false,data:{id:'123456'}};
/** @type {Array<[string,string,string,any,number]>} */
const cases=[
 ['health','GET','/health',null,200],
 ['webhook requires POST','GET','/webhook',null,405],
 ['test notification','POST','/webhook',sample,200],
 ['reject live mode','POST','/webhook',{...sample,live_mode:true},403],
 ['require explicit test mode','POST','/webhook',{type:'payment',data:{id:'123'}},400],
 ['reject invalid ID','POST','/webhook',{...sample,data:{id:'not-an-id'}},400],
 ['reject other topics','POST','/webhook',{...sample,type:'merchant_order'},400],
 ['reject malformed JSON','POST','/webhook','{',400],
 ['reject large body','POST','/webhook','x'.repeat(4100),413],
 ['reject contradictory ID','POST','/webhook?data.id=999',sample,400],
 ['no checkout endpoint','POST','/api/checkout',sample,404],
 ['unknown path','GET','/not-found',null,404]
];
async function selftest(){const results=[];for(const [name,method,path,body,expected] of cases){const req=new Request('https://sandbox.example'+path,{method,...(body===null?{}:{headers:{'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)})});const res=await handle(req,()=>{});results.push({name,expected,actual:res.status,pass:res.status===expected});}return Response.json({suite:'diagnostic-receiver-only',passed:results.filter(r=>r.pass).length,total:results.length,providerPaymentTested:false,results});}
export default {async fetch(req){if(new URL(req.url).pathname==='/selftest'&&req.method==='GET')return selftest();return handle(req);}};

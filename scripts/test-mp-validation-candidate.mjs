import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto, createHmac } from "node:crypto";

const production=fs.readFileSync("worker-live/worker_hotfix.js","utf8");
const source=fs.readFileSync("tmp/mp-validation-candidate/worker_hotfix.js","utf8");
assert.notEqual(source,production,"candidate must be isolated from the canonical live capture");
const bounded=(name,following)=>{
  const start=source.indexOf("async function "+name+"(");
  const end=source.indexOf(following,start);
  assert.ok(start>=0&&end>start,"Missing "+name+" extraction");
  return source.slice(start,end);
};
const verifier=bounded("apdVerifyMercadoPagoWebhookV1","\nasync function handleMercadoPagoWebhook(");
const webhook=bounded("handleMercadoPagoWebhook","\n__name(handleMercadoPagoWebhook,");
const settle=bounded("applyMercadoPagoPayment","\n__name(applyMercadoPagoPayment,");
const check=new Function("crypto","TextEncoder","URL",verifier+"\nreturn apdVerifyMercadoPagoWebhookV1")(
  webcrypto,TextEncoder,URL
);
const sign=(dataId,requestId,ts,secret)=>{
  const message="id:"+dataId.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";";
  return createHmac("sha256",secret).update(message).digest("hex");
};
const secret="synthetic-test-only";
const ts="1742505638683", reqId="synthetic-request-id", id="789321";
const notification=(options={})=>{
 const selected=options.id||id,requestId=options.requestId===undefined?reqId:options.requestId;
 const signature=options.signature===undefined?sign(selected,requestId,ts,secret):options.signature;
 return new Request("https://example.invalid/api/mercadopago/webhook?data.id="+selected,{
  method:"POST",
  headers:{"content-type":"application/json","x-request-id":requestId,"x-signature":"ts="+ts+",v1="+signature},
  body:JSON.stringify({type:"payment",data:{id:selected}})
 });
};

test("signed notification accepted and altered signature rejected",async()=>{
 const req=notification();const payload={type:"payment",data:{id}};
 assert.equal(await check(req,payload,{MERCADOPAGO_WEBHOOK_SECRET:secret}),true);
 assert.equal(await check(notification({signature:"0".repeat(64)}),payload,{MERCADOPAGO_WEBHOOK_SECRET:secret}),false);
 assert.equal(await check(req,payload,{}),false,"missing secret must fail closed");
 assert.equal(await check(notification({requestId:"changed-request"}),payload,{MERCADOPAGO_WEBHOOK_SECRET:secret}),true);
 const tampered=new Request("https://example.invalid/api/mercadopago/webhook?data.id=789322",{method:"POST",headers:{"x-request-id":reqId,"x-signature":"ts="+ts+",v1="+sign(id,reqId,ts,secret)}});
 assert.equal(await check(tampered,payload,{MERCADOPAGO_WEBHOOK_SECRET:secret}),false);
});

test("unauthenticated webhook never writes logs or processes payments",async()=>{
 let inserts=0,syncs=0;
 const run=new Function("crypto","TextEncoder","URL","supabaseInsert","syncMercadoPagoWebhook","json","console",
   verifier+"\n"+webhook+"\nreturn handleMercadoPagoWebhook")(
     webcrypto,TextEncoder,URL,async()=>{inserts++;return[]},async()=>{syncs++;return {processed:true}},(body,status=200)=>({status,body}),console
   );
 const response=await run(notification({signature:"a".repeat(64)}),{MERCADOPAGO_WEBHOOK_SECRET:secret});
 assert.equal(response.status,401);
 assert.equal(inserts,0);
 assert.equal(syncs,0);
 const legit=await run(notification(),{MERCADOPAGO_WEBHOOK_SECRET:secret});
 assert.equal(legit.status,200);
 assert.equal(inserts,1);
 assert.equal(syncs,1);
});

test("checkout lookup and reference are mandatory before any subscription write",async()=>{
 let session=null;
 let writes=[];
 const settleFn=new Function("findCheckoutSessionByExternalReference","parseMercadoPagoExternalReference",
   "canonicalPlanCode","mapMercadoPagoSubscriptionStatus","mapMercadoPagoCheckoutStatus",
   "addDaysIso","clampInt","supabasePatch","supabaseInsert","findSubscriptionByExternalReference","encodeURIComponent","Date","console",
   settle+"\nreturn applyMercadoPagoPayment")(
    async()=>session,
    ref=>{const [user_id,plan_code]=ref.split(":");return{user_id,plan_code}},
    code=>String(code||"").toUpperCase(),
    status=>status==="APPROVED"?"ACTIVE":"PENDING",
    status=>status==="APPROVED"?"approved":"pending",
    (date,days)=>new Date(new Date(date).getTime()+days*86400000).toISOString(),
    (_v,_min,_max,fallback)=>fallback,
    async(_env,table,_filter,payload)=>{writes.push({method:"patch",table,payload})},
    async(_env,table,payload)=>{writes.push({method:"insert",table,payload})},
    async()=>null,
    encodeURIComponent,Date,console
   );
 const approved={id:789321,external_reference:"user1:PLUS:123",status:"approved",date_approved:"2026-10-24T12:00:00.000Z",payer:{email:"test@example.invalid"}};
 assert.equal((await settleFn({},approved)).reason,"checkout_session_not_found");
 assert.equal(writes.length,0);
 session={id:"existing-session",user_id:"other-user",plan_code:"PLUS",provider_payload:{}};
 assert.equal((await settleFn({},approved)).reason,"checkout_reference_mismatch");
 assert.equal(writes.length,0);
 session={id:"existing-session",user_id:"user1",plan_code:"PLUS",provider_payload:{}};
 const good=await settleFn({},approved);
 assert.equal(good.processed,true);
 assert.equal(good.subscription_status,"ACTIVE");
 assert.equal(writes.filter(x=>x.table==="user_subscriptions").length,1);
 assert.equal(writes.filter(x=>x.table==="user_subscriptions")[0].payload.user_id,"user1");
 assert.equal(writes.filter(x=>x.table==="user_subscriptions")[0].payload.plan_code,"PLUS");
});

test("production Worker cannot be changed by candidate builder",()=>{
 assert.doesNotMatch(production,/async function apdVerifyMercadoPagoWebhookV1\(/);
 assert.match(source,/MERCADOPAGO_WEBHOOK_SECRET/);
 assert.match(source,/checkout_session_not_found/);
 assert.match(source,/checkout_reference_mismatch/);
});

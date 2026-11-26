import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {commercialRpc} from './apd-commercial-stage-checkout.mjs';
import {verifyVersion,activeVersion,inspectCrons,NEXT,NEXT_HASH,worker} from './apd-commercial-release-contracts.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN;
async function get(path){const res=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('CF metadata HTTP '+res.status);const d=await res.json();assert.equal(d.success,true);return d.result;}
const accounts=await get('/accounts?per_page=50');
const account=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:null);
assert.ok(account&&accounts.some(a=>a.id===account));
const root='/accounts/'+encodeURIComponent(account)+'/workers/';
assert.equal(activeVersion(await get(root+'scripts/'+worker+'/deployments')),NEXT);
const d=await get(root+'workers/'+worker+'/versions/'+NEXT+'?include=modules');
verifyVersion(d,NEXT,NEXT_HASH,902908);
inspectCrons(await get(root+'scripts/'+worker+'/schedules'));
const binding=d.bindings.find(x=>x.name==='SUPABASE_URL');
const url=new URL(binding.text);
const shape={https:url.protocol==='https:',root:url.pathname==='/',noAuth:!url.username&&!url.password,noQuery:!url.search&&!url.hash,expectedProject:url.hostname==='vvgkinkvojqwfuqaxijh.supabase.co',keyBinding:d.bindings.some(x=>x.name==='SUPABASE_SERVICE_ROLE_KEY'&&x.type==='secret_text')};
console.log('APD_RPC_BINDING_SHAPE '+JSON.stringify(shape));
const source=Buffer.from(d.modules[0].content_base64,'base64').toString('utf8');
const helper=commercialRpc.toString().replace(/^async function commercialRpc\(/,'async function apdCommercialRpcV1(');
assert.ok(source.includes(helper),'Live RPC function differs');
let calls=0;
const script=helper+`
export default {async fetch(request,env){
 const results={};
 const fake={SUPABASE_URL:env.FIXTURE_URL,SUPABASE_SERVICE_ROLE_KEY:'fixture-only'};
 const args={p_user_id:'00000000-0000-4000-8000-000000000071'};
 for(const [label,run] of [['default',()=>apdCommercialRpcV1(fake,'apd_reserve_complete_checkout',args)],['bound',()=>apdCommercialRpcV1(fake,'apd_reserve_complete_checkout',args,(...a)=>globalThis.fetch(...a))]]){
  try{const r=await run();results[label]={ok:r?.ok===true};}
  catch(e){results[label]={ok:false,error:e?.name==='TypeError'?'TypeError':e?.name==='TimeoutError'?'TimeoutError':'Error',illegalInvocation:/illegal invocation/i.test(String(e?.message)),invalidEndpoint:/Invalid database endpoint/i.test(String(e?.message))};}
 }
 return Response.json(results);
}};`;
const mf=new Miniflare({modules:true,script,compatibilityDate:d.compatibility_date,compatibilityFlags:d.compatibility_flags||[],bindings:{FIXTURE_URL:'https://fixture.invalid'},outboundService:async req=>{
 calls++;
 assert.equal(new URL(req.url).hostname,'fixture.invalid');assert.equal(new URL(req.url).pathname,'/rest/v1/rpc/apd_reserve_complete_checkout');assert.equal(req.method,'POST');assert.equal(req.headers.get('authorization'),'Bearer fixture-only');
 return new Response(JSON.stringify({ok:true,mode:'create'}),{headers:{'content-type':'application/json'}});
}});
try{const res=await mf.dispatchFetch('http://localhost/diagnose');assert.equal(res.status,200);const result=await res.json();console.log('APD_NATIVE_RPC_RESULT '+JSON.stringify({result,fixtureCalls:calls,productionWrites:0,providerCalls:0}));if(!result.default.ok||!Object.values(shape).every(Boolean))process.exitCode=1;}finally{await mf.dispose();}

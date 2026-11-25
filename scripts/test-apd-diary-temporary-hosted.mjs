// Run only against the temporary account created by the QA deployment job.
import {verifyHostedDiary} from './test-apd-diary-hosted.mjs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export function temporaryTransport({base,key,fetcher=fetch}){
 const url=new URL(base);
 // Never use the production subdomain or the ordinary QA account.
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||
    !/^apd-diary-qa-[a-f0-9]{12}\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)||
    url.hostname.endsWith('.apdocentepba.workers.dev'))throw Error('Expected randomized isolated Cloudflare preview origin');
 if(!/^[a-f0-9]{64}$/.test(key||''))throw Error('Invalid QA access key');
 const endpoint=url.origin+'/api/account/application-diary';
 return {
  base:url.origin,
  fetcher:async(input,init={})=>{
   const u=new URL(input);
   if(u.href!==endpoint||!['GET','PUT','OPTIONS'].includes(init.method||'GET'))throw Error('QA transport destination rejected');
   const headers=new Headers(init.headers);
   headers.set('X-APD-QA-Key',key);
   return fetcher(u.href,{...init,headers,redirect:'error'});
  }
 };
}
async function selfTest(){
 const base='https://apd-diary-qa-012345abcdef.fixture-preview.workers.dev',key='a'.repeat(64);
 let calls=0;
 const t=temporaryTransport({base,key,fetcher:async(url,init)=>{
  calls++;assert.equal(url,base+'/api/account/application-diary');
  assert.equal(init.headers.get('X-APD-QA-Key'),key);
  assert.equal(init.headers.get('Authorization'),'Bearer fixture');
  assert.equal(init.redirect,'error');
  return new Response(null,{status:204});
 }});
 await t.fetcher(base+'/api/account/application-diary',{method:'GET',headers:{Authorization:'Bearer fixture'}});
 for(const target of [base+'/api/login','https://alertasapd.com.ar/api/account/application-diary',base+'/api/account/application-diary?x=1'])
  await assert.rejects(t.fetcher(target,{method:'GET'}));
 for(const bad of ['https://apd-diary-qa-012345abcdef.apdocentepba.workers.dev','https://alertasapd.com.ar','https://apd-diary-qa.apdocentepba.workers.dev',base+'.invalid'])
  assert.throws(()=>temporaryTransport({base:bad,key}));
 assert.equal(calls,1);
 console.log('APD_DIARY_TEMPORARY_TRANSPORT_PASS');
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 try{
  if(process.argv.includes('--self-test'))await selfTest();
  else{
   const t=temporaryTransport({base:process.env.APD_DIARY_QA_URL,key:process.env.APD_DIARY_QA_ACCESS_KEY});
   const endpoint=t.base+'/api/account/application-diary';
   const stage=r=>{const s=r.headers.get('X-APD-QA-Stage');return ['guard','configuration','application'].includes(s)?s:'edge';};
   const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   let ready=false;
   for(let i=0;i<20;i++){
    const outer=await fetch(endpoint,{redirect:'error',signal:AbortSignal.timeout(10000)});
    const outerStage=stage(outer);
    await outer.body?.cancel();
    console.log('APD_QA_WORKER_OUTER '+JSON.stringify({status:outer.status,stage:outerStage,attempt:i+1}));
    if(outerStage==='edge'){await delay(1500);continue;}
    assert.equal(outerStage,'guard','Preview configuration or outer guard failed');
    assert.equal(outer.status,404,'Preview must reject missing outer QA key');
    const inner=await t.fetcher(endpoint,{method:'GET',headers:{Origin:'https://alertasapd.com.ar'},signal:AbortSignal.timeout(10000)});
    const innerStage=stage(inner);
    await inner.body?.cancel();
    console.log('APD_QA_WORKER_INNER '+JSON.stringify({status:inner.status,stage:innerStage}));
    assert.equal(innerStage,'application','Authenticated QA probe did not reach application');
    assert.equal(inner.status,401,'Application must reject missing account session');
    ready=true;break;
   }
   assert.ok(ready,'Preview route did not become ready');

   await verifyHostedDiary({...t,tokens:[process.env.APD_DIARY_QA_SESSION_A,process.env.APD_DIARY_QA_SESSION_A_NEW,process.env.APD_DIARY_QA_SESSION_B]});
   console.log('APD_DIARY_TEMPORARY_HOSTED_PASS');
  }
 }catch(e){console.error(e.message);process.exitCode=1;}
}

import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const allowed=new Map([
 ['sessions',new Set(['GET'])],['users',new Set(['GET'])],
 ['subscription_plans',new Set(['GET'])],['user_subscriptions',new Set(['GET'])],
 ['apd_ofertas_global_current',new Set(['GET'])],
 ['user_application_diary',new Set(['GET','POST','PATCH'])],
 ['rpc/apd_application_diary_cas',new Set(['POST'])]
]);
const max=65536;
function equals(a,b){
 if(typeof a!=='string')return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function reply(res,status){
 res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({error:'QA gateway rejected request'}));
}
export function createGateway({secret,upstream='http://127.0.0.1:3301',fetcher=fetch}){
 if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw Error('QA secret must be random 32-byte hex');
 const target=new URL(upstream);
 if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.pathname!=='/'||
    target.username||target.password||target.search||target.hash)throw Error('Only loopback fixture database is allowed');
 return createServer(async(req,res)=>{
  try{
   if(!equals(req.headers.authorization,'Bearer '+secret)||
     (req.headers.apikey!==undefined&&!equals(req.headers.apikey,secret)))return reply(res,401);
   if(!req.url?.startsWith('/rest/v1/')||req.url.startsWith('//')||req.url.length>8192)return reply(res,400);
   const path=req.url.slice('/rest/v1/'.length).split('?')[0];
   if(!allowed.get(path)?.has(req.method))return reply(res,403);
   const url=new URL('/'+req.url.slice('/rest/v1/'.length),target);
   if(url.origin!==target.origin||url.pathname!=='/'+path)return reply(res,400);
   const chunks=[];let size=0;
   for await(const chunk of req){
    size+=chunk.length;
    if(size>max){reply(res,413);return;}
    chunks.push(chunk);
   }
   if(req.method==='GET'&&size)return reply(res,400);
   const headers=new Headers();
   for(const name of ['content-type','accept','prefer','range','range-unit']){
    if(typeof req.headers[name]==='string')headers.set(name,req.headers[name]);
   }
   const out=await fetcher(url,{method:req.method,headers,redirect:'manual',
    body:req.method==='GET'?undefined:Buffer.concat(chunks),signal:AbortSignal.timeout(10000)});
   if(out.status>=300&&out.status<400)return reply(res,502);
   const bytes=Buffer.from(await out.arrayBuffer());
   if(bytes.length>1048576)return reply(res,502);
   const responseHeaders={'cache-control':'no-store'};
   for(const name of ['content-type','content-range','range-unit','preference-applied']){
    if(out.headers.has(name))responseHeaders[name]=out.headers.get(name);
   }
   res.writeHead(out.status,responseHeaders);res.end(bytes);
  }catch{if(!res.headersSent)reply(res,502);else res.end();}
 });
}
async function selfTest(){
 const secret='a'.repeat(64),seen=[];
 const server=createGateway({secret,fetcher:async(url,init)=>{
  seen.push({url:url.href,method:init.method,headers:Object.fromEntries(init.headers)});
  return new Response('[]',{headers:{'content-type':'application/json'}});
 }});
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
 const root='http://127.0.0.1:'+server.address().port;
 const auth={Authorization:'Bearer '+secret,apikey:secret};
 try{
  assert.equal((await fetch(root+'/rest/v1/sessions')).status,401);
  assert.equal((await fetch(root+'/rest/v1/sessions',{headers:{...auth,apikey:'bad'}})).status,401);
  assert.equal((await fetch(root+'/rest/v1/users',{method:'DELETE',headers:auth})).status,403);
  assert.equal((await fetch(root+'/rest/v1/unknown',{headers:auth})).status,403);
  assert.equal((await fetch(root+'/rest/v1/%73essions',{headers:auth})).status,403);
  assert.equal((await fetch(root+'/rest/v1/user_application_diary',{method:'POST',headers:auth,body:'x'.repeat(max+1)})).status,413);
  assert.equal(seen.length,0);
  assert.equal((await fetch(root+'/rest/v1/sessions?token=eq.synthetic',{headers:auth})).status,200);
  assert.equal(seen[0].url,'http://127.0.0.1:3301/sessions?token=eq.synthetic');
  assert.equal(seen[0].headers.authorization,undefined);
  assert.equal(seen[0].headers.apikey,undefined);
  assert.equal((await fetch(root+'/rest/v1/user_application_diary',{method:'POST',headers:{...auth,Prefer:'return=representation'},body:'{}'})).status,200);
  assert.equal(seen[1].headers.prefer,'return=representation');
  assert.throws(()=>createGateway({secret,upstream:'https://production.example.invalid'}));
  console.log('APD_DIARY_QA_DB_GATEWAY_PASS');
 }finally{await new Promise(resolve=>server.close(resolve));}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 if(process.argv.includes('--self-test'))await selfTest();
 else{
  const server=createGateway({secret:process.env.APD_DIARY_QA_DB_KEY});
  server.listen(3302,'127.0.0.1',()=>console.log('APD_DIARY_QA_DB_GATEWAY_READY'));
 }
}

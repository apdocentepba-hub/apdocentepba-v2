/** One-shot real preview test; reserved accounts only, no billing, no tokens logged. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const run=process.env.GITHUB_RUN_ID;
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_HEAD_REF!=='qa/favorites-live-20261124'||!/^\d+$/.test(run||''))throw Error('Invalid QA context');
const host='https://apd-favorites-pr315-ancient-wildflower-cd37.apdocentepba.workers.dev';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const accounts=[],attempted=new Map();
const keys=['D_4386280','D_4414283'];
async function call(path,{method='GET',body,token,expected=200}={}){
 const res=await fetch(host+path,{method,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{Origin:'https://alertasapd.com.ar',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(res.status!==expected)throw Error('HTTP '+res.status+' expected '+expected+' at '+path.split('?')[0]);
 const data=await res.json();if(expected===200&&data?.ok!==true)throw Error('Unconfirmed response');return data;
}
const read=async(a,q='')=>(await call('/api/account/favorites'+q,{token:a.token})).favorites;
const put=async(a,action,key,revision,expected=200)=>(await call('/api/account/favorites',{method:'PUT',token:a.token,body:{action,key,revision},expected})).favorites;
let phase='preflight',failed=false,cleanupFailed=false;
try{
 await call('/api/account/favorites',{expected:401});
 phase='register';
 for(const label of ['a','b']){
  const email='apd-favorites-qa-'+label+'@example.invalid',password=randomBytes(32).toString('hex');
  await call('/api/register',{method:'POST',body:{nombre:'APD QA '+label,apellido:'QA315-'+run,email,password,celular:''}});
  const login=await call('/api/login',{method:'POST',body:{email,password}});
  assert.equal(login.user.email,email);assert.ok(login.user.id&&typeof login.session_token==='string'&&login.session_token.length>=24);
  accounts.push({label,email,id:login.user.id,token:login.session_token});
 }
 console.log('APD_FAVORITES_QA_REGISTERED two reserved identities; run '+run);
 phase='grant';
 const end=Date.now()+180000;
 let ready=false;
 while(Date.now()<end){
  const plans=await Promise.all(accounts.map(a=>call('/api/mi-plan',{token:a.token})));
  if(plans.every((p,i)=>p.user_id===accounts[i].id&&p.access_active===true&&p.subscription?.plan_code==='INSIGNE'&&p.subscription?.source==='manual_favorites_qa')){ready=true;break;}
  await sleep(3000);
 }
 assert.equal(ready,true);
 phase='identity';
 for(const a of accounts){
  const p=await call('/api/account/profile',{token:a.token});assert.equal(p.user.id,a.id);assert.equal(p.user.email,a.email);assert.equal(p.user.activo,true);
  assert.deepEqual(await read(a),{keys:[],revision:0});
 }
 phase='mutate';
 for(const [i,a] of accounts.entries()){
  attempted.set(a.id,keys[i]);
  assert.deepEqual(await put(a,'add',keys[i],0),{keys:[keys[i]],revision:1});
  assert.deepEqual(await read(a),{keys:[keys[i]],revision:1});
 }
 const [a,b]=accounts;
 await put(a,'add',keys[1],0,409);
 assert.deepEqual(await read(a,'?user_id='+encodeURIComponent(b.id)),{keys:[keys[0]],revision:1});
 assert.deepEqual(await read(b,'?user_id='+encodeURIComponent(a.id)),{keys:[keys[1]],revision:1});
 await put(a,'add','D_nonexistent_qa315',1,422);
 assert.deepEqual(await read(a),{keys:[keys[0]],revision:1});
}catch(e){failed=true;console.error('QA failed at '+phase+' '+(String(e?.message||'').startsWith('HTTP ')?e.message:'assertion failed'));}
finally{
 for(const a of accounts){
  if(!attempted.has(a.id))continue;
  try{
   const row=await read(a),key=attempted.get(a.id);
   if(row.keys.length){assert.deepEqual(row,{keys:[key],revision:1});await put(a,'remove',key,1);}
   assert.deepEqual((await read(a)).keys,[]);
  }catch{cleanupFailed=true;}
 }
}
if(failed||cleanupFailed){console.error('APD_FAVORITES_REAL_QA_FAIL cleanup='+!cleanupFailed);process.exitCode=1;}
else console.log('APD_FAVORITES_REAL_QA_PASS two real sessions, readback, owner isolation, stale CAS, missing key rejection, empty favorites; operator must revoke all QA access');

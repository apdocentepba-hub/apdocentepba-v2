/** One-shot authorized live QA, no customer data, no credential logging. */
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {authenticatedScheduleSmoke} from './check-apd-account-schedule-authenticated.mjs';
const host='https://apd-schedule-pr304-ancient-wildflower-cd37.apdocentepba.workers.dev';
const run=process.env.GITHUB_RUN_ID;
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_HEAD_REF!=='qa/schedule-live-20261124'||!/^\d+$/.test(run||''))throw Error('Wrong QA execution context');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,{method='GET',body,token}={}){
 const res=await fetch(host+path,{method,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{Origin:'https://alertasapd.com.ar',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,data:await res.json()};
}
let phase='preflight';
try{
 const check=await request('/api/account/schedule');
 assert.equal(check.status,401);
 const accounts=[];
 phase='register';
 for(const label of ['A','B']){
  const email='apd-schedule-qa-'+label.toLowerCase()+'@example.invalid';
  const password=randomBytes(32).toString('hex');
  const registered=await request('/api/register',{method:'POST',body:{nombre:'APD QA '+label,apellido:'QA304-'+run,email,password,celular:''}});
  if(registered.status!==200||registered.data?.ok!==true)throw Error('Registration refused '+registered.status);
  phase='login';
  const login=await request('/api/login',{method:'POST',body:{email,password}});
  if(login.status!==200||login.data?.ok!==true||login.data.user?.email!==email||typeof login.data.session_token!=='string'||login.data.session_token.length<24)throw Error('Dedicated login not confirmed');
  accounts.push({label,id:login.data.user.id,token:login.data.session_token});
  phase='register';
 }
 console.log('APD_LIVE_QA_REGISTERED two reserved accounts; run '+run);
 phase='grant';
 // Operator grants only these two confirmed, newly registered users a short nonbilling entitlement.
 const deadline=Date.now()+180000;
 let ready=false;
 while(Date.now()<deadline){
  const plans=await Promise.all(accounts.map(a=>request('/api/mi-plan',{token:a.token})));
  if(plans.every((p,i)=>p.status===200&&p.data.user_id===accounts[i].id&&p.data.access_active===true&&p.data.subscription?.plan_code==='INSIGNE'&&p.data.subscription?.source==='manual_schedule_qa')){ready=true;break;}
  await delay(3000);
 }
 if(!ready)throw Error('Temporary QA grant not confirmed');
 phase='smoke';
 const proof=await authenticatedScheduleSmoke({accounts});
 console.log('APD_LIVE_QA_PASS '+JSON.stringify(proof));
 // Logout endpoint not assumed; operator deactivates fixture sessions and users separately.
}catch{console.error('APD_LIVE_QA_FAIL phase='+phase+'; operator must deactivate dedicated QA accounts');process.exitCode=1;}

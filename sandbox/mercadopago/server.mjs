import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createLabHandler,UID} from './lab.mjs';
const exec=promisify(execFile);
const pgEnv={PATH:process.env.PATH,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'apd_commercial_full_qa',PGUSER:'postgres',PGPASSWORD:'fixture_only',PGOPTIONS:'-c statement_timeout=8000'};
export function createDatabase(){
 const query=async(sql,service=true)=>{
  const {stdout}=await exec('psql',['-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-c',"SET standard_conforming_strings=on; "+(service?'SET ROLE service_role; ':'')+sql],{env:pgEnv,timeout:10000,maxBuffer:1024*1024});
  return stdout.trim();
 };
 const literal=value=>{if(typeof value==='string'&&value.length<=2000&&!value.includes('\0'))return "'"+value.replaceAll("'","''")+"'";if(typeof value==='number'&&Number.isFinite(value))return String(value);throw Error('Invalid RPC argument');};
 const signatures={apd_reserve_complete_checkout:['p_user_id'],apd_finalize_complete_checkout:['p_user_id','p_reference','p_url','p_preference_id'],apd_apply_complete_approval:['p_payment_id','p_reference','p_status','p_amount','p_currency','p_approved_at'],apd_review_complete_payment:['p_payment_id','p_reference','p_disposition']};
 return {
  async verify(){if(await query("SELECT current_database()||':'||current_user",false)!=='apd_commercial_full_qa:postgres'||await query("SELECT count(*) FROM public.apd_commercial_qa_guard WHERE marker='disposable-full-module'",false)!=='1')throw Error('Wrong disposable database');},
  async rpc(name,args){const keys=signatures[name];if(!keys||Object.keys(args).length!==keys.length||keys.some(k=>!(k in args))||args.p_user_id&&args.p_user_id!==UID||args.p_reference&&!args.p_reference.startsWith(UID+':COMPLETO:'))throw Error('Wrong fixture RPC');return JSON.parse(await query('SELECT public.'+name+'('+keys.map(k=>literal(args[k])).join(',')+');'));},
  async reference(){return await query("SELECT external_reference FROM public.mercadopago_checkout_sessions WHERE user_id='"+UID+"' AND plan_code='COMPLETO' ORDER BY created_at DESC LIMIT 1;");},
  async status(){const result=await query("SELECT jsonb_build_object('plan',CASE WHEN EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id='"+UID+"' AND plan_code='COMPLETO' AND upper(status)='ACTIVE' AND current_period_ends_at>clock_timestamp()) THEN 'COMPLETO' ELSE 'FREE' END,'paymentId',(SELECT payment_id FROM public.apd_complete_payment_ledger l JOIN public.mercadopago_checkout_sessions s ON s.id=l.checkout_id WHERE s.user_id='"+UID+"' ORDER BY l.approved_at DESC LIMIT 1));");return JSON.parse(result);}
 };
}
export function createProvider(token){
 return async(path,method='GET',body,extra={})=>{
  if(!token||!((method==='GET'&&(path==='/users/me'||/^\/v1\/payments\/\d{1,30}$/.test(path)))||(method==='POST'&&(path==='/checkout/preferences'||/^\/v1\/payments\/\d{1,30}\/refunds$/.test(path)))))throw Error('Provider operation unavailable');
  const response=await fetch('https://api.mercadopago.com'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...extra},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Sandbox provider rejected operation');return response.json();
 };
}
async function start(){
 if(process.env.SUPABASE_URL||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.MERCADOPAGO_ACCESS_TOKEN)throw Error('Production configuration forbidden');
 const db=createDatabase();await db.verify();
 const origin=process.env.RENDER_EXTERNAL_URL||process.env.APD_LAB_PUBLIC_ORIGIN;
 if(!origin||new URL(origin).protocol!=='https:')throw Error('Explicit HTTPS laboratory origin required');
 const token=process.env.APD_MP_SANDBOX_ACCESS_TOKEN||'';
 const handler=createLabHandler({db,provider:createProvider(token),providerReady:!!token,operatorKey:process.env.APD_LAB_OPERATOR_KEY||'',webhookSecret:process.env.APD_MP_SANDBOX_WEBHOOK_SECRET||'',sellerId:process.env.APD_MP_SANDBOX_SELLER_ID||'',publicOrigin:origin});
 let inFlight=0;
 const server=http.createServer(async(req,res)=>{
  if(inFlight>=8){res.writeHead(429);res.end();return;}inFlight++;
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   const out=await handler(request);res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'application/json'});res.end('{"ok":false}');}finally{inFlight--;}
 });
 server.requestTimeout=20000;server.headersTimeout=15000;
 server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('APD_LAB_READY paymentsConfigured='+Boolean(token)));
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start().catch(()=>{console.error('APD_LAB_START_FAILED');process.exitCode=1;});

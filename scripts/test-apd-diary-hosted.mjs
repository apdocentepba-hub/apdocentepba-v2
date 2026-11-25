import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createApplicationDiaryClient} from './apd-application-diary-client.mjs';

const key='D_121';
const path='/api/account/application-diary';
const frontendOrigin='https://alertasapd.com.ar';

function check(value,message){
 if(!value)throw Error(message);
}

export async function verifyHostedDiary({base,tokens,fetcher=fetch}){
 const [first,second,other]=tokens;
 check(tokens.length===3&&tokens.every(token=>typeof token==='string'&&token.trim())&&new Set(tokens).size===3,
  'Se requieren tres sesiones de ensayo distintas.');
 const endpoint=new URL(path,base).href;
 const browserFetch=(url,init)=>fetcher(url,{...init,headers:{...init.headers,Origin:frontendOrigin}});
 const forAccount=token=>createApplicationDiaryClient({base,fetcher:browserFetch,getToken:()=>token});
 const a=forAccount(first),aAgain=forAccount(second),b=forAccount(other);
 const anonymous=await browserFetch(endpoint,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
 check(anonymous.status===401,'La lectura anónima debería devolver 401.');
 const preflight=await browserFetch(endpoint,{
  method:'OPTIONS',redirect:'error',signal:AbortSignal.timeout(15000),headers:{
   'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'
  }
 });
 check(preflight.ok&&preflight.headers.get('Access-Control-Allow-Origin')===frontendOrigin,
  'El Worker no permite el origen de la pantalla.');
 const [initial,reopened,otherInitial]=await Promise.all([a.reload(),aAgain.reload(),b.reload()]);
 check([initial,reopened,otherInitial].every(row=>row.entries.length===0),
  'Las tres sesiones deben corresponder a dos cuentas de ensayo con registros vacíos.');
 check(initial.revision===reopened.revision,'Las dos sesiones de la primera cuenta difieren antes de escribir.');

 let wrote=false;
 try{
  wrote=true;
  const saved=await a.mutate({action:'set',key,status:'postulada',revision:initial.revision});
  check(saved.revision===initial.revision+1,'El guardado no incrementó la revisión.');
  check(isDeepStrictEqual(await aAgain.reload(),saved),'La sesión nueva no recuperó el guardado.');
  check(isDeepStrictEqual(await b.reload(),otherInitial),'La segunda cuenta no quedó aislada.');
  const put=(token,status)=>browserFetch(endpoint,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({action:'set',key,status,revision:saved.revision})
  });
  const responses=await Promise.all([put(first,'en_evaluacion'),put(second,'retirada')]);
  check(responses.map(response=>response.status).sort().join(',')==='200,409',
   'Las ediciones simultáneas no devolvieron una aceptación y un conflicto.');
  const winner=(await responses.find(response=>response.ok).json()).diary;
  check(isDeepStrictEqual(await aAgain.reload(),winner),'La lectura posterior no coincide con la escritura aceptada.');
 }finally{
  if(wrote){
   const current=await a.reload();
   if(current.entries.some(entry=>entry.key===key)){
    await a.mutate({action:'remove',key,revision:current.revision});
   }
   check(!(await aAgain.reload()).entries.some(entry=>entry.key===key),'No se pudo verificar el retiro del registro de ensayo.');
  }
 }
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 try{
  const url=new URL(process.env.APD_DIARY_QA_URL||'');
  if(url.origin!=='https://apd-diary-qa.apdocentepba.workers.dev'||url.href!==url.origin+'/')
   throw Error('Se requiere la URL del Worker dedicado apd-diary-qa.apdocentepba.workers.dev.');
  await verifyHostedDiary({
   base:url.origin,
   tokens:[process.env.APD_DIARY_QA_SESSION_A,process.env.APD_DIARY_QA_SESSION_A_NEW,process.env.APD_DIARY_QA_SESSION_B]
  });
  console.log('APD_DIARY_HOSTED_PASS');
 }catch(error){
  console.error(error.message);
  process.exitCode=1;
 }
}

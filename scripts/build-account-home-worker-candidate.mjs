/**
 * Offline Worker release candidate: never modifies the deployed Worker.
 * Applies one guarded insertion onto the tracked verified source baseline.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'worker-live/worker_hotfix.js'),'utf8');
const model=fs.readFileSync(path.join(root,'scripts/apd-account-home-core.mjs'),'utf8')
 .replace('export function sanitizeAccountHome(', 'function sanitizeAccountHome(');
const handler="\n// Authenticated home reference. Session identity comes only from the Worker.\n// Personal work schedules remain tab-private and are never sent here.\n__APD_ACCOUNT_HOME_CORE__\nasync function handleAccountHomeSecureV1(request,env) {\n if(!['GET','PUT','DELETE'].includes(request.method))\n  return json2({ok:false,message:'Método no permitido'},405);\n const auth=await getSessionUserByBearer(env,request);\n if(!auth?.id)return json2({ok:false,message:'No autenticado'},401);\n const filter='user_home_reference?user_id=eq.'+encodeURIComponent(auth.id)+\n  '&select=user_id,address_text,georef,updated_at&limit=1';\n if(request.method==='GET'){\n  try {\n   const rows=await supabaseSelect(env,filter);\n   if(!Array.isArray(rows))throw Error('invalid_rows');\n   const row=rows[0]||null;\n   return json2({ok:true,home:row?{address_text:row.address_text,\n    georef:row.georef??null,updated_at:row.updated_at}:null});\n  }catch(_){return json2({ok:false,message:'No se pudo recuperar el domicilio'},503)}\n }\n if(request.method==='DELETE'){\n  try {\n   const response=await supabaseFetchWithRetry(env,\n    env.SUPABASE_URL+'/rest/v1/user_home_reference?user_id=eq.'+\n     encodeURIComponent(auth.id),{\n     method:'DELETE',\n     headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,\n      Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}\n    });\n   if(!response?.ok)throw Error('delete_failed');\n   return json2({ok:true,home:null});\n  }catch(_){return json2({ok:false,message:'No se pudo borrar el domicilio'},503)}\n }\n try{\n  const raw=await request.text();\n  if(raw.length>2500)return json2({ok:false,message:'Datos demasiado extensos'},413);\n  const payload=JSON.parse(raw);\n  const clean=sanitizeAccountHome(payload);\n  // Only the server-validated id is written. Ignore any supplied user_id.\n  await supabaseUpsert(env,'user_home_reference',[{\n   user_id:auth.id,address_text:clean.address_text,georef:clean.georef,\n   updated_at:new Date().toISOString()\n  }],'user_id');\n  return json2({ok:true,home:clean});\n }catch(error){\n  if(/inválid|Ingresá|inconsistente|Confirmá|Alcance|Ubicación/.test(String(error?.message||'')))\n   return json2({ok:false,message:String(error.message)},400);\n  return json2({ok:false,message:'No se pudo guardar el domicilio'},503);\n }\n}\n";
const handlerText=handler.replace('__APD_ACCOUNT_HOME_CORE__',model);
const marker='async function handleAccountPreferencesSecureV1(request, env) {';
if(source.split(marker).length!==2)throw Error('Worker baseline changed: handler');
let result=source.replace(marker,handlerText+'\n'+marker);
const route='    if (path === API_URL_PREFIX3 + "/account/preferences") {';
if(result.split(route).length!==2)throw Error('Worker baseline changed: router');
result=result.replace(route,
 '    if (path === API_URL_PREFIX3 + "/account/home") {\n'+
 '      return await handleAccountHomeSecureV1(request, env);\n'+
 '    }\n'+route);
const target=path.join(root,'tmp/apd-account-home/worker-home-candidate.mjs');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,result);
console.log(JSON.stringify({ok:true,output:path.relative(root,target),
 schema:'docs/sql/APD_ACCOUNT_HOME_REFERENCE_CANDIDATE_20261112.sql',
 route:'/api/account/home',methods:['GET','PUT','DELETE'],
 scope:'offline_candidate_no_deploy'}));

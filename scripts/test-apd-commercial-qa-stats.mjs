import test from 'node:test';
import assert from 'node:assert/strict';
import {isApdTestAccount,summarizeApdAccounts,readApdAccountSummaryRows,stageCommercialQaStats} from './apd-commercial-stage-qa-stats.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const qa={id:'qa',nombre:'APD QA a',apellido:'QA322-45460186399',email:'apd-diary-qa-a@example.invalid',activo:false,es_admin:false};
test('separate explicit disabled test accounts, real accounts and admins',()=>{
 const rows=[qa,{id:'real1',nombre:'Docente',activo:true,es_admin:false},{...qa,id:'real2',email:'teacher@example.org'},{...qa,id:'admin',es_admin:true},{...qa,id:'active',activo:true}];
 assert.equal(isApdTestAccount(qa),true);
 assert.deepEqual(summarizeApdAccounts(rows),{usuarios_total:3,usuarios_activos:2,admins_total:1,qa_total:1});
 assert.equal(isApdTestAccount({...qa,apellido:'Otro'}),false);
});
test('pagination cannot silently truncate or accept duplicated users',async()=>{
 const data=Array.from({length:1001},(_,i)=>({id:String(i)}));let calls=0;
 const rows=await readApdAccountSummaryRows({},async(_env,query)=>{calls++;const offset=Number(query.split('offset=')[1]);return data.slice(offset,offset+150);});
 assert.equal(rows.length,1001);assert.ok(calls>7);
 await assert.rejects(readApdAccountSummaryRows({},async()=>[{id:'duplicate'}]));
 await assert.rejects(readApdAccountSummaryRows({},async()=>null));
});
const fixture=[
'async function handleAdminResumen(request, env) {\n  const auth = await requireAdmin(env, request);\n  if (!auth.ok) return auth.response;\n  const [\n    usuariosTotalRes,\n    usuariosActivosRes,\n    adminsRes,\n    sesionesActivasRes\n  ]=await Promise.all([\n    supabaseSelect(env, "users?select=id").catch(() => []),\n    supabaseSelect(env, "users?activo=eq.true&select=id").catch(() => []),\n    supabaseSelect(env, "users?es_admin=eq.true&select=id").catch(() => []),\n    []\n  ]);\n  return adminJson({resumen:{\n      usuarios_total: usuariosTotalRes.length || 0,\n      usuarios_activos: usuariosActivosRes.length || 0,\n      admins_total: adminsRes.length || 0,\n      sesiones_activas: sesionesActivasRes.length\n  }});\n}\n__name(handleAdminResumen,"fixture");',
'async function handleAdminUsuarios(request, env) {\n  const auth = await requireAdmin(env, request);\n  if (!auth.ok) return auth.response;\n  const rows=[];\n  const total = rows?.length || 0;\n  const activos = (rows || []).filter((x) => x.activo === true).length;\n  const admins = (rows || []).filter((x) => x.es_admin === true).length;\n  return adminJson({\n    ok: true,\n    total,\n    activos,\n    admins,\n    items: rows || []\n  });\n}\n__name(handleAdminUsuarios,"fixture");'].join('\n');
test('stage admin-only endpoints with unchanged auth guard and reversible source',()=>{const r=stageCommercialQaStats(fixture);assert.equal(r.adminEndpoints,2);assert.equal(r.unrelatedBytesPreserved,true);verifyTrialCandidateSyntax(r.candidate);assert.throws(()=>stageCommercialQaStats(fixture.replace('if (!auth.ok) return auth.response;','')));});

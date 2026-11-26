import assert from 'node:assert/strict';
// Require all existing QA markers; never classify accounts by disabled status alone.
export function isApdTestAccount(row){
 return row?.es_admin!==true&&row?.activo===false&&/^APD QA [ab]$/i.test(String(row?.nombre||'').trim())&&/^QA\d+-\d+$/i.test(String(row?.apellido||'').trim())&&/^apd-(?:diary-qa|favorites-(?:qa|retry)|schedule-qa)-[ab]@example\.invalid$/i.test(String(row?.email||'').trim());
}
export function summarizeApdAccounts(rows){
 if(!Array.isArray(rows))throw Error('Unverified user statistics');
 const qa=rows.filter(isApdTestAccount),admins=rows.filter(r=>r.es_admin===true),regular=rows.filter(r=>r.es_admin!==true&&!isApdTestAccount(r));
 return {usuarios_total:regular.length,usuarios_activos:regular.filter(r=>r.activo===true).length,admins_total:admins.length,qa_total:qa.length};
}
export async function readApdAccountSummaryRows(env,select){
 const rows=[],seen=new Set();
 for(let offset=0;offset<100000;){
  const page=await select(env,'users?select=id,nombre,apellido,email,activo,es_admin&order=id.asc&limit=200&offset='+offset);
  if(!Array.isArray(page))throw Error('Unverified user statistics');
  if(!page.length)return rows;
  for(const row of page){
   if(!row?.id||seen.has(row.id))throw Error('Inconsistent user statistics pagination');
   seen.add(row.id);rows.push(row);
  }
  offset+=page.length;
 }
 throw Error('User statistics exceed safe pagination bound');
}
export function stageCommercialQaStats(source){
 const original=source,changes=[];
 const within=(name,change)=>{
  const matches=[...source.matchAll(new RegExp('^async function '+name+'\\([^\\n]*\\) \\{','gm'))];
  assert.equal(matches.length,1,'Admin stats owner '+name);
  const a=matches[0].index,b=source.indexOf('\n__name('+name+',',a);assert.ok(b>a);
  const old=source.slice(a,b),next=change(old);assert.notEqual(old,next);
  source=source.slice(0,a)+next+source.slice(b);changes.push({old,next});
 };
 const swap=(s,a,b)=>{assert.equal(s.split(a).length,2,'Admin stats anchor '+a);return s.replace(a,()=>b);};
 within('handleAdminResumen',fn=>{
  assert.match(fn,/if \(!auth\.ok\) return auth\.response;/);
  fn=swap(fn,'usuariosTotalRes,\n    usuariosActivosRes,\n    adminsRes,','accountRows,');
  fn=swap(fn,'supabaseSelect(env, "users?select=id").catch(() => []),\n    supabaseSelect(env, "users?activo=eq.true&select=id").catch(() => []),\n    supabaseSelect(env, "users?es_admin=eq.true&select=id").catch(() => []),','apdReadAccountSummaryRowsV1(env,supabaseSelect),');
  return swap(fn,'usuarios_total: usuariosTotalRes.length || 0,\n      usuarios_activos: usuariosActivosRes.length || 0,\n      admins_total: adminsRes.length || 0,','...apdSummarizeAccountsV1(accountRows),');
 });
 within('handleAdminUsuarios',fn=>{
  assert.match(fn,/if \(!auth\.ok\) return auth\.response;/);
  fn=swap(fn,'const total = rows?.length || 0;\n  const activos = (rows || []).filter((x) => x.activo === true).length;\n  const admins = (rows || []).filter((x) => x.es_admin === true).length;', 'if(!Array.isArray(rows))throw Error("Unverified account list");\n  const counts=apdSummarizeAccountsV1(await apdReadAccountSummaryRowsV1(env,supabaseSelect));\n  const includeQa=new URL(request.url).searchParams.get("include_qa")==="1";\n  const visible=rows.filter(r=>includeQa||!apdIsTestAccountV1(r));');
  return swap(fn,'total,\n    activos,\n    admins,\n    items: rows || []','total:counts.usuarios_total,\n    activos:counts.usuarios_activos,\n    admins:counts.admins_total,\n    qa_total:counts.qa_total,\n    include_qa:includeQa,\n    items:visible');
 });
 let reversed=source;for(const c of changes.toReversed())reversed=reversed.replace(c.next,()=>c.old);
 assert.equal(reversed,original,'Unrelated source changed');
 const prefix=isApdTestAccount.toString().replaceAll('isApdTestAccount','apdIsTestAccountV1')+'\n'+summarizeApdAccounts.toString().replaceAll('summarizeApdAccounts','apdSummarizeAccountsV1').replaceAll('isApdTestAccount','apdIsTestAccountV1')+'\n'+readApdAccountSummaryRows.toString().replace('readApdAccountSummaryRows','apdReadAccountSummaryRowsV1')+'\n';
 return {candidate:prefix+source,adminEndpoints:2,unrelatedBytesPreserved:true,deployable:false};
}

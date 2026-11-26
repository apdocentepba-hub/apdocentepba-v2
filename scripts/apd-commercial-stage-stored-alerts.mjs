import assert from 'node:assert/strict';
// Called before rendering or enrichment, not before storing the user's preferences.
export async function filterCommercialStoredRows(env,userId,rows,deps){
 if(!Array.isArray(rows)||!rows.length)return [];
 const resolved=await deps.resolve(env,userId);
 const code=String(resolved?.subscription?.plan_code||'').trim().toUpperCase();
 if(!resolved)throw Error('Unverified alert entitlement');
 if(!['FREE','TRIAL_14D','COMPLETO'].includes(code))return rows;
 if(!deps.active(resolved))return [];
 const saved=await deps.preferences(env,userId);
 const prefs=deps.project(saved,resolved,true);
 if(!prefs?.alertas_activas)return [];
 const canonical=deps.canonical(prefs,await deps.catalog(env));
 if(!deps.districts(canonical).length||![...(canonical.cargos||[]),...(canonical.cargos_apd||[]),...(canonical.materias||[]),...(canonical.materias_apd||[])].length)return [];
 return rows.filter(row=>{
  let offer=row?.offer_payload||row;
  // Stored normalization may wrap the original official document more than once.
  for(let i=0;i<4&&offer?.raw&&typeof offer.raw==='object';i++)offer=offer.raw;
  return offer&&deps.match(offer,canonical)?.match===true;
 });
}
export function stageCommercialStoredAlerts(source){
 const original=source,changes=[];
 const within=(name,change)=>{
  const m=[...source.matchAll(new RegExp('^([ ]*)async function '+name+'\\([^\\n]*\\) \\{','gm'))];
  assert.equal(m.length,1,'Stored alert anchor '+name);
  const start=m[0].index,end=source.indexOf('\n'+m[0][1]+'__name('+name+',',start);
  assert.ok(end>start,'Missing stored alert boundary '+name);
  const fn=source.slice(start,end),next=change(fn);
  assert.notEqual(next,fn,'No scoped change '+name);
  source=source.slice(0,start)+next+source.slice(end);changes.push({fn,next});
 };
 const exact=(fn,a,b)=>{assert.equal(fn.split(a).length,2,'Stored alert expression changed');return fn.replace(a,()=>b);};
 within('getUserPrefs',fn=>exact(fn,'return rows?.[0] ? adaptarPreferenciasRow2(rows[0]) : null;',
 'const saved=rows?.[0] ? adaptarPreferenciasRow2(rows[0]) : null;\n  const resolved=await resolverPlanUsuario(env,userId);\n  return apdEffectiveCommercialPrefsV1(saved,resolved,isPlanActivo(resolved));'));
 for(const name of ['loadStoredEmailAlerts','loadTelegramStoredAlerts','waLoadStoredAlerts']){
  within(name,fn=>exact(fn,'return (Array.isArray(rows) ? rows : []).map((row) => ({','return (await apdFilterStoredCommercialV1(env2,userId,rows)).map((row) => ({'));
 }
 within('fetchStoredOffers',fn=>exact(fn,'return (Array.isArray(rows) ? rows : []).map((row) => ({','return (await apdFilterStoredCommercialV1(env,userId,rows)).map((row) => ({'));
 // Inventory current active reads rather than assume the older direct-mail route exists.
 const decl=[...original.matchAll(/^[ ]*(?:async )?function ([A-Za-z_$][\w$]*)\(/gm)];
 const reads=[...original.matchAll(/user_offer_state\?[^\n\x60"']*is_active=eq\.true[^\n\x60"']*/g)].map(m=>decl.findLast(d=>d.index<m.index)?.[1]||'unknown');
 const expected=['loadStoredEmailAlerts','loadTelegramStoredAlerts','waLoadStoredAlerts','fetchStoredOffers'];
 const other=reads.filter(n=>!expected.includes(n));
 console.log('APD_COMMERCIAL_STORED_INVENTORY '+JSON.stringify({owners:reads}));
 assert.ok(expected.every(n=>reads.filter(r=>r===n).length===1),'Unverified reader coverage');
 assert.ok(other.length<=1&&other.every(n=>n==='sendPendingEmailDigests'),'Unknown stored-alert read; inspect owner');
 if(other.length){
  within('sendPendingEmailDigests',fn=>{
   // Filter the actual result of the scoped database read, irrespective of downstream variable naming.
   const query=/\bawait supabaseSelect\(\s*env,\s*\x60user_offer_state\?user_id=eq\.\$\{encodeURIComponent\(user\.id\)\}&is_active=eq\.true&select=[^\x60\n]+\x60\s*\)/g;
   const matches=[...fn.matchAll(query)];
   assert.equal(matches.length,1,'Pending digest query shape changed');
   const old=matches[0][0];
   return exact(fn,old,'await apdFilterStoredCommercialV1(env,user.id, '+old+')');
  });
 }
 const prefix=filterCommercialStoredRows.toString().replace(/^async function filterCommercialStoredRows\(/,'async function apdFilterStoredRowsCoreV1(')+'\n'+
 'async function apdFilterStoredCommercialV1(env,userId,rows){return await apdFilterStoredRowsCoreV1(env,userId,rows,{resolve:resolverPlanUsuario,active:isPlanActivo,preferences:obtenerPreferenciasUsuario,project:apdEffectiveCommercialPrefsV1,canonical:canonizarPreferenciasConCatalogo,catalog:cargarCatalogos,districts:distritosPrefsAPD,match:coincideOfertaConPreferenciasAPD});}\n';
 assert.ok(!original.includes('apdFilterStoredCommercialV1'),'Already staged');
 let reversed=source;
 for(const c of changes.toReversed())reversed=reversed.replace(c.next,()=>c.fn);
 assert.equal(reversed,original,'Unrelated source changed');
 return {candidate:prefix+source,storedReaders:4+other.length,preferenceReader:true,unrelatedBytesPreserved:true,deployable:false};
}

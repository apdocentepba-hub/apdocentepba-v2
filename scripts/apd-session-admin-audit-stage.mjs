// APD-005 / APD-011: exact-source offline patch, never deploys.
import assert from 'node:assert/strict';
export function sessionIsCurrent(row,now){
 const expiry=typeof row?.expires_at==='string'?Date.parse(row.expires_at):NaN;
 return row?.activo===true&&Number.isFinite(now)&&Number.isFinite(expiry)&&expiry>now;
}
export function publicSessionRow(row,now){
 return {user_id:row.user_id,metodo:row.metodo,created_at:row.created_at,expires_at:row.expires_at,activo:sessionIsCurrent(row,now)};
}
export function stageSessionAdminAudit(source){
 const names=['getSessionUserByBearer','handleAdminResumen','handleAdminSesiones','requireAdmin'];
 const originals=names.map(name=>{
  const matches=[...source.matchAll(new RegExp('^async function '+name+'\\([^\\n]*\\) \\{','gm'))];
  assert.equal(matches.length,1,name);
  const start=matches[0].index,end=source.indexOf('\n__name('+name+',',start);
  assert.ok(end>start,name);
  const old=source.slice(start,end);assert.ok(old.endsWith('\n}'),name);
  return {name,old};
 });
 assert.ok(!source.includes('apdSessionIsCurrentAuditV1'),'Already staged');
 function once(s,anchor,replacement){assert.equal(s.split(anchor).length,2,'Unexpected anchor: '+anchor);return s.replace(anchor,()=>replacement);}
 const [auth,summary,list,admin]=originals;
 admin.next=once(admin.old,'if (!user.es_admin) {','if (user.es_admin !== true) {');
 auth.next=once(auth.old,'if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {','if (!apdSessionIsCurrentAuditV1(session, Date.now())) {');
 auth.next=once(auth.next,'if (user.activo === false) return null;','if (user.activo !== true) return null;');
 summary.next=once(summary.old,'supabaseSelect(env, "sessions?activo=eq.true&select=token").catch(() => [])','supabaseSelect(env, "sessions?activo=eq.true&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&select=user_id").catch(() => null)');
 summary.next=once(summary.next,'sesiones_activas: sesionesActivasRes.length || 0,','sesiones_activas: Array.isArray(sesionesActivasRes) ? sesionesActivasRes.length : null,');
 list.next=once(list.old,'sessions?select=token,user_id,metodo,created_at,expires_at,activo&order=created_at.desc&limit=300','sessions?select=user_id,metodo,created_at,expires_at,activo&order=created_at.desc&limit=300');
 list.next=once(list.next,'const activas = (rows || []).filter((x) => x.activo === true).length;','const now = Date.now();\n  const activas = (rows || []).filter((x) => apdSessionIsCurrentAuditV1(x,now)).length;');
 list.next=once(list.next,'(x) => x.expires_at && new Date(x.expires_at).getTime() < Date.now()','(x) => Number.isFinite(Date.parse(x.expires_at)) && Date.parse(x.expires_at) <= now');
 list.next=once(list.next,'items: rows || []','limit: 300,\n    truncated: (rows || []).length >= 300,\n    items: (rows || []).map(x => apdPublicSessionRowAuditV1(x,now))');
 const prefix=sessionIsCurrent.toString().replace('function sessionIsCurrent(','function apdSessionIsCurrentAuditV1(')+'\n'+publicSessionRow.toString().replace('function publicSessionRow(','function apdPublicSessionRowAuditV1(').replace('sessionIsCurrent(row,now)','apdSessionIsCurrentAuditV1(row,now)')+'\n';
 let candidate=source;for(const r of originals)candidate=once(candidate,r.old,r.next);
 candidate=prefix+candidate;
 let reverse=candidate.slice(prefix.length);for(const r of originals)reverse=once(reverse,r.next,r.old);
 assert.equal(reverse,source);
 return {candidate,functions:names,unrelatedBytesPreserved:true,deployable:false};
}

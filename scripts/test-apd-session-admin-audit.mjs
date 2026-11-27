import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stageSessionAdminAudit,sessionIsCurrent,publicSessionRow} from './apd-session-admin-audit-stage.mjs';
const source=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
const now=Date.parse('2026-11-27T16:30:00Z');
const live={token:'synthetic-token-never-return',user_id:'fixture',metodo:'password',created_at:new Date(now-1000).toISOString(),expires_at:new Date(now+1000).toISOString(),activo:true};
test('invalid, expired at exact boundary or inactive sessions denied',()=>{
 assert.equal(sessionIsCurrent(live,now),true);
 for(const row of [{...live,activo:false},{...live,expires_at:new Date(now).toISOString()},{...live,expires_at:'invalid'},{...live,expires_at:null},{...live,activo:1}])assert.equal(sessionIsCurrent(row,now),false);
 assert.equal(Object.hasOwn(publicSessionRow(live,now),'token'),false);
});
test('real repository worker source stages exactly with no unrelated modifications',()=>{
 const r=stageSessionAdminAudit(source);assert.equal(r.unrelatedBytesPreserved,true);assert.equal(r.deployable,false);
 assert.throws(()=>stageSessionAdminAudit(r.candidate));
 const auth=r.candidate.slice(r.candidate.indexOf('async function getSessionUserByBearer('),r.candidate.indexOf('\n__name(getSessionUserByBearer,'));
 assert.match(auth,/apdSessionIsCurrentAuditV1/);assert.match(auth,/user.activo !== true/);
});
test('actual staged administrative handler never returns token even if upstream sends it',async()=>{
 const r=stageSessionAdminAudit(source);
 const helper=r.candidate.slice(0,r.candidate.indexOf(source.slice(0,100)));
 const start=r.candidate.indexOf('async function handleAdminSesiones('),end=r.candidate.indexOf('\n__name(handleAdminSesiones,',start);
 assert.ok(start>=0&&end>start&&helper.length>0);
 let queries=[];let authorized=true;const c=vm.createContext({requireAdmin:async()=>authorized?{ok:true}:{ok:false,response:{status:403}},supabaseSelect:async(env,q)=>{queries.push(q);return [{...live,expires_at:'2099-01-01T00:00:00Z'},{...live,expires_at:'2000-01-01T00:00:00Z'}];},adminJson:v=>v});
 vm.runInContext(helper+r.candidate.slice(start,end),c);
 const response=await c.handleAdminSesiones({},{});assert.equal(response.activas,1);assert.equal(response.vencidas,1);
 assert.ok(!JSON.stringify(response).includes(live.token));assert.ok(!queries[0].includes('select=token'));
 authorized=false;assert.equal((await c.handleAdminSesiones({},{})).status,403);assert.equal(queries.length,1);
});

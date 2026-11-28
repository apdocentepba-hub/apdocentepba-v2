import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {channelAllowedFromResolved,stageChannelEntitlementAudit} from './apd-channel-entitlement-audit-stage.mjs';
const now=Date.parse('2026-11-27T17:00:00Z'),start=new Date(now-1000).toISOString(),end=new Date(now+1000).toISOString();
const make=(code,extra={})=>({plan:{code,feature_flags:{whatsapp:true}},subscription:{user_id:'fixture',plan_code:code,status:'ACTIVE',source:'verified',started_at:start,current_period_ends_at:end,trial_ends_at:end,...extra}});
const can=(r,ch,active=true)=>channelAllowedFromResolved(r,'fixture',ch,()=>active,now);
test('Gratis Telegram only; verified trial and Completo both; expired or mismatched deny',()=>{
 const free=make('FREE',{source:'apd_free_verified'});assert.equal(can(free,'telegram'),true);assert.equal(can(free,'whatsapp'),false);
 for(const code of ['COMPLETO','TRIAL_14D']){const r=make(code);assert.equal(can(r,'telegram'),true);assert.equal(can(r,'whatsapp'),true);assert.equal(can(r,'whatsapp',false),false);}
 for(const extra of [{user_id:'other'},{status:'PENDING'},{status:'PAUSED'},{started_at:end},{current_period_ends_at:new Date(now).toISOString()},{source:'fallback_frontend'}])assert.equal(can(make('COMPLETO',extra),'whatsapp'),false);
 assert.equal(can({plan:{code:'INSIGNE'},subscription:make('FREE').subscription},'whatsapp'),false);
 assert.equal(can(make('INSIGNE',{current_period_ends_at:null,source:'manual_admin_grant'}),'whatsapp'),true);
});
test('exact versioned source stages both resolvers without unrelated drift',()=>{
 const s=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8'),r=stageChannelEntitlementAudit(s);
 assert.equal(r.deployable,false);assert.equal(r.unrelatedBytesPreserved,true);
 assert.match(r.candidate,/apdChannelAllowedAuditV1\(resolved,userId,"telegram",isPlanActivo\)/);
 assert.match(r.candidate,/apdChannelAllowedAuditV1\(resolved,userId,"whatsapp",isPlanActivo\)/);
});

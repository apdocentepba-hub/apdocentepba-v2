import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stageChannelQueryAudit,uniqueWhatsAppAccount} from './apd-channel-query-audit-stage.mjs';
test('ambiguous or truncated phone search cannot select a user',()=>{
 const row={id:'fixture',activo:true,celular:'5491112345678'};
 const find=rows=>uniqueWhatsAppAccount(rows,row.celular,v=>[v],()=> '541112345678');
 assert.equal(find([row]),row);
 assert.equal(find([row,{...row,id:'other'}]),null);
 assert.equal(find([{...row,activo:false}]),null);
 assert.equal(find([row,...Array.from({length:19},(_,i)=>({...row,id:String(i),celular:'other'}))]),null);
});
test('exact Worker stage preserves unrelated bytes and gates both channels',()=>{
 const source=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
 const r=stageChannelQueryAudit(source);
 assert.equal(r.unrelatedBytesPreserved,true);assert.equal(r.deployable,false);
 for(const name of ['findUserByWhatsAppNumber','handleTelegramWebhook','handleWhatsAppWebhook']){
  const start=r.candidate.indexOf('async function '+name+'('),end=r.candidate.indexOf('\n__name('+name+',',start);
  assert.ok(start>=0&&end>start);
  const fn=r.candidate.slice(start,end);new vm.Script(fn);
  if(name==='findUserByWhatsAppNumber')assert.match(fn,/apdUniqueWhatsAppAccountAuditV1/);
  else assert.match(fn,/apdStoredAbcOfferOpenAuditV1/);
  if(name==='handleWhatsAppWebhook')assert.match(fn,/sendResult\?\.ok === true/);
 }
});

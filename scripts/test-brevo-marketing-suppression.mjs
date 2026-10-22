import test from 'node:test';
import assert from 'node:assert/strict';
import {readBrevoMarketingStatus,canSendMarketing} from './brevo-marketing-suppression-readonly.mjs';

const listId=31415;
const fetchMock=(data,status=200,calls=[])=>async(url,options)=>{
  calls.push({url,method:options?.method});
  return {ok:status>=200&&status<300,status,json:async()=>data};
};

test('configuration missing and provider outage fail closed',async()=>{
 assert.equal((await readBrevoMarketingStatus('a@example.org')).status,'unknown');
 assert.equal((await readBrevoMarketingStatus('a@example.org',{
  apiKey:'MOCK',approvedListId:listId,fetchImpl:async()=>{throw new Error('down');}
 })).status,'unknown');
});

test('Brevo blacklist and list unsubscribe are always blocked',async()=>{
 for(const data of [
  {emailBlacklisted:true,listIds:[listId]},
  {emailBlacklisted:false,listIds:[listId],listUnsubscribed:[listId]}
 ]){
  const r=await readBrevoMarketingStatus('a@example.org',{
   apiKey:'MOCK',approvedListId:listId,fetchImpl:fetchMock(data)
  });
  assert.equal(r.status,'blocked');
 }
});

test('no verified marketing list, 404 and unclear response fail closed',async()=>{
 for(const [data,status] of [
  [{emailBlacklisted:false,listIds:[]},200],
  [{emailBlacklisted:false,listIds:[2]},200],
  [{emailBlacklisted:null,listIds:[listId]},200],
  [null,404],
 ]){
  const r=await readBrevoMarketingStatus('a@example.org',{
    apiKey:'MOCK',approvedListId:listId,fetchImpl:fetchMock(data,status)
  });
  assert.equal(r.status,'unknown');
 }
});

test('Provider read is GET only and does not send emails',async()=>{
 const calls=[];
 const r=await readBrevoMarketingStatus('a+tag@example.org',{
  apiKey:'MOCK',approvedListId:listId,
  fetchImpl:fetchMock({emailBlacklisted:false,listIds:[listId]},200,calls)
 });
 assert.equal(r.status,'eligible');
 assert.equal(calls.length,1);
 assert.equal(calls[0].method,'GET');
 assert.ok(calls[0].url.includes(encodeURIComponent('a+tag@example.org')));
});

test('eligible provider alone cannot send without independently verified consent',()=>{
 const provider={status:'eligible'};
 const local={status:'subscribed',provider_status:'eligible',
  confirmed_at:'2026-10-22T18:00:00Z',consent_version:'reactivation-1'};
 assert.equal(canSendMarketing({provider,local}),true);
 for(const changes of [
  {local:null},
  {local:{...local,status:'pending_confirmation'}},
  {local:{...local,confirmed_at:null}},
  {local:{...local,provider_status:'blocked'}},
  {local:{...local,consent_version:null}},
  {provider:{status:'unknown'}},
  {provider:{status:'blocked'}},
  {subscriptionActive:true},{manualException:true},{previouslySent:true},
 ])assert.equal(canSendMarketing({provider,local,...changes}),false);
});

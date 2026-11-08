import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileExpoRetentionLab}
 from './mobile-push-expo-retention-lab.mjs';

test('maintenance cannot retire without explicit fixture authorization',async()=>{
 let writes=0,authorizations=0;
 const worker=createMobileExpoRetentionLab({
  database:{async retireResolvedExpoTickets(){writes++;return 1;}},
  authorizeRetentionRun:async()=>{authorizations++;return false;}
 });
 assert.equal((await worker({fixtureOnly:false})).reason,'not_authorized');
 assert.equal((await worker({fixtureOnly:true})).reason,'not_authorized');
 assert.equal(writes,0);
 assert.equal(authorizations,1);
});
test('approved bounded 90-day batch returns count and never claims delivery',async()=>{
 const calls=[];
 const worker=createMobileExpoRetentionLab({
  database:{async retireResolvedExpoTickets(args){calls.push(args);return 2;}},
  authorizeRetentionRun:async()=>true
 });
 assert.deepEqual(await worker({fixtureOnly:true,limit:5,minAgeDays:90}),{
  ok:true,retired:2,provider_calls:0,delivery_to_device_confirmed:false
 });
 assert.deepEqual(calls,[{limit:5,minAgeDays:90}]);
});
test('cannot shorten minimum 90-day retention or expand batch',async()=>{
 let calls=0;
 const worker=createMobileExpoRetentionLab({
  database:{async retireResolvedExpoTickets(){calls++;return 0;}},
  authorizeRetentionRun:async()=>{calls++;return true;}
 });
 for(const args of [
  {limit:0},{limit:21},{limit:1.5},{limit:'2'},
  {minAgeDays:0},{minAgeDays:89},{minAgeDays:'90'},
  {minAgeDays:3651}
 ]){
  await assert.rejects(()=>worker({fixtureOnly:true,...args}),
   /invalid_expo_retention_batch/);
 }
 assert.equal(calls,0);
});
test('unavailable storage and invalid result cannot report success',async()=>{
 for(const handler of [
  async()=>{throw Error('offline');},
  async()=>-1,async()=>23,async()=>null,async()=>true
 ]){
  const worker=createMobileExpoRetentionLab({
   database:{retireResolvedExpoTickets:handler},
   authorizeRetentionRun:async()=>true
  });
  const result=await worker({fixtureOnly:true,limit:10});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'retention_storage_unavailable');
  assert.equal(result.retired,0);
  assert.equal(result.provider_calls,0);
 }
});
test('retention requires both a database and authorization callback',()=>{
 assert.throws(()=>createMobileExpoRetentionLab(),
  /missing_expo_retention_dependencies/);
 assert.throws(()=>createMobileExpoRetentionLab({
  database:{retireResolvedExpoTickets:async()=>0}
 }),/missing_expo_retention_dependencies/);
});

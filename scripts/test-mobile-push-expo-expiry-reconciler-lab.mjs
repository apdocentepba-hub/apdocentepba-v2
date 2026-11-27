import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileExpoExpiryReconcilerLab}
 from './mobile-push-expo-expiry-reconciler-lab.mjs';

test('an explicitly approved LAB-only maintenance batch quarantines results',async()=>{
 const calls=[];
 const reconcile=createMobileExpoExpiryReconcilerLab({
  database:{
   async expireMissingExpoReceipts({limit}){
    calls.push(['db',limit]);return 3;
   }
  },
  authorizeMaintenanceRun:async({fixtureOnly,limit})=>{
   calls.push(['authorize',fixtureOnly,limit]);return true;
  }
 });
 assert.deepEqual(await reconcile({fixtureOnly:true,limit:5}),{
  ok:true,expired:3,provider_calls:0,
  delivery_to_device_confirmed:false
 });
 assert.deepEqual(calls,[['authorize',true,5],['db',5]]);
});
test('nonfixture, denied and failed maintenance never touch database',async()=>{
 const events=[];
 const worker=createMobileExpoExpiryReconcilerLab({
  database:{async expireMissingExpoReceipts(){events.push('db');return 1;}},
  authorizeMaintenanceRun:async()=>{events.push('auth');return false;}
 });
 const a=await worker({fixtureOnly:false,limit:1});
 const b=await worker({fixtureOnly:true,limit:1});
 assert.equal(a.reason,'not_authorized');
 assert.equal(b.reason,'not_authorized');
 assert.equal(events.filter(x=>x==='db').length,0);
 assert.equal(events.filter(x=>x==='auth').length,1);
});
test('invalid batch size fails before authorization or database calls',async()=>{
 let n=0;
 const job=createMobileExpoExpiryReconcilerLab({
  database:{async expireMissingExpoReceipts(){n++;return 0;}},
  authorizeMaintenanceRun:async()=>{n++;return true;}
 });
 for(const limit of [0,-1,21,'12',1.5,null]){
  await assert.rejects(()=>job({fixtureOnly:true,limit}),
   /invalid_reconciliation_batch/);
 }
 assert.equal(n,0);
});
test('database error or unexpected count never produces success',async()=>{
 for(const failure of [
  async()=>{throw Error('SECRET_DB_FAILURE');},
  async()=>-1,async()=>12,async()=>null
 ]){
  const job=createMobileExpoExpiryReconcilerLab({
   database:{expireMissingExpoReceipts:failure},
   authorizeMaintenanceRun:async()=>true
  });
  const result=await job({fixtureOnly:true,limit:10});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'reconciliation_storage_unavailable');
  assert.equal(JSON.stringify(result).includes('SECRET_DB_FAILURE'),false);
  assert.equal(result.provider_calls,0);
  assert.equal(result.delivery_to_device_confirmed,false);
 }
});
test('cannot initialize with missing server-only dependencies',()=>{
 assert.throws(()=>createMobileExpoExpiryReconcilerLab(),
  /missing_reconciliation_lab_dependencies/);
});

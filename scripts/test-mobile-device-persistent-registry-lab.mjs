import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersistentMobileRegistryLab} from './mobile-device-persistent-registry-lab.mjs';
import {createMobilePushPostgrestAdapterLab} from './mobile-push-postgrest-adapter-lab.mjs';
import {openMobilePushToken} from './mobile-push-token-crypto-lab.mjs';
const userId='11111111-1111-4111-8111-111111111111',deviceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actor={userId,sessionVerified:true};
const push_token='ExpoPushToken[LAB_TOKEN_123456789ABCDEFGHI]',encryptionKey=Buffer.alloc(32,11).toString('base64url'),hmacKey=Buffer.alloc(32,12).toString('base64url');
test('encrypted token only traverses server-to-PostgREST boundary; verified actor controls every operation',async()=>{
 let registered=false,body,requests=0;
 const json=v=>Response.json(v);
 const adapter=createMobilePushPostgrestAdapterLab({projectUrl:'https://fixture.supabase.co',secretKey:'sb_secret_fixture_only_01234567890123456789',fetchImpl:async(url,opts)=>{
  requests++;const u=new URL(url);assert.equal(u.origin,'https://fixture.supabase.co');assert.equal(opts.redirect,'manual');
  if(u.pathname.endsWith('apd_mobile_register_device_lab')){
   body=JSON.parse(opts.body);assert.equal(body.p_user,userId);assert.equal(body.p_device,deviceId);assert.ok(!opts.body.includes(push_token));assert.match(body.p_hash,/^[a-f0-9]{64}$/);
   registered=true;return json([{id:deviceId,platform:'android',transport:'expo',enabled:true,opted_in:true}]);
  }
  if(u.pathname.endsWith('apd_mobile_revoke_device_lab')){assert.deepEqual(JSON.parse(opts.body),{p_user:userId,p_device:deviceId});registered=false;return json(true);}
  assert.equal(u.searchParams.get('user_id'),'eq.'+userId);assert.ok(!u.searchParams.get('select').includes('token'));
  return json([{id:deviceId,user_id:userId,platform:'android',transport:'expo',enabled:registered,opted_in:registered}]);
 }});
 const registry=createPersistentMobileRegistryLab({adapter,encryptionKey,hmacKey});
 const request={device_id:deviceId,platform:'android',transport:'expo',push_token,opted_in:true};
 await assert.rejects(registry.register({actor:{userId,sessionVerified:false},request}),/unauthenticated/);
 await assert.rejects(registry.register({actor,request:{...request,user_id:userId}}),/invalid_registration/);
 assert.equal(requests,0);
 const result=await registry.register({actor,request});assert.equal(result.enabled,true);assert.ok(!JSON.stringify(result).includes('token'));
 assert.equal(await openMobilePushToken({token_ciphertext:body.p_ciphertext,encryptionKey,hmacKey}),push_token);
 assert.equal((await registry.getForUser({actor,deviceId})).enabled,true);
 assert.equal(await registry.revoke({actor,deviceId}),true);assert.equal((await registry.listForUser({actor}))[0].enabled,false);
});

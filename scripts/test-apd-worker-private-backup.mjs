import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encryptModule,decryptModule,persistEncryptedModule} from './apd-worker-private-backup.mjs';
const bytes=Buffer.from('export default {fetch(){return new Response("synthetic fixture")}};');
const sha=b=>createHash('sha256').update(b).digest('hex');
const meta={version:'fixture-version',sha256:sha(bytes)};
const secret='synthetic-operator-only-credential-123';
test('authenticated encryption round trip, randomized ciphertext, wrong key and metadata tamper rejected',()=>{
 const a=encryptModule(bytes,meta,secret),b=encryptModule(bytes,meta,secret);
 assert.ok(!a.equals(b));assert.ok(!a.includes(bytes));assert.ok(decryptModule(a,secret).equals(bytes));
 assert.throws(()=>decryptModule(a,'different-secret-123456789012345'));
 const obj=JSON.parse(a);obj.version='changed';assert.throws(()=>decryptModule(Buffer.from(JSON.stringify(obj)),secret));
 const changed=JSON.parse(a);changed.ciphertext=Buffer.alloc(bytes.length).toString('base64');assert.throws(()=>decryptModule(Buffer.from(JSON.stringify(changed)),secret));
 assert.throws(()=>encryptModule(bytes,{...meta,sha256:'0'.repeat(64)},secret));
});
test('persistent encrypted backup is exclusive, readback verified and outside repo',()=>{
 const root=mkdtempSync(join(tmpdir(),'apd-backup-test-'));
 try{
  const repo=join(root,'repo'),directory=join(root,'private');
  mkdirSync(repo,{mode:0o700});mkdirSync(directory,{mode:0o700});
  assert.throws(()=>persistEncryptedModule({bytes,meta,secret,directory:repo,repository:repo}));
  const args={bytes,meta,secret,directory,repository:repo};
  const report=persistEncryptedModule(args);
  assert.equal(report.persistentModuleBackup,true);
  assert.equal(report.configurationBackedUp,false);assert.equal(report.databaseBackedUp,false);
  const files=readdirSync(directory);assert.equal(files.length,1);
  const stored=readFileSync(join(directory,files[0]));assert.equal(report.backupSha256,sha(stored));assert.ok(decryptModule(stored,secret).equals(bytes));
  assert.throws(()=>persistEncryptedModule(args));assert.ok(readFileSync(join(directory,files[0])).equals(stored));
 }finally{rmSync(root,{recursive:true,force:true});}
});

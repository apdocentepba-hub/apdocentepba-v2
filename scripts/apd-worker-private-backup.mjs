/** Local operator-only encrypted module custody. No networking or repository writes. */
import assert from 'node:assert/strict';
import {randomBytes,scryptSync,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {realpathSync,statSync,openSync,writeFileSync,readFileSync,fsyncSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const magic='APD_WORKER_BACKUP_V1';
const derive=(secret,salt)=>scryptSync(secret,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
function strictHeader(meta){
 assert.ok(typeof meta.version==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(meta.version),'Invalid version');
 assert.ok(typeof meta.sha256==='string'&&/^[a-f0-9]{64}$/.test(meta.sha256),'Invalid digest');
 return {format:magic,worker:'ancient-wildflower-cd37',version:meta.version,sha256:meta.sha256};
}
function validSecret(secret){assert.ok(typeof secret==='string'&&secret.length>=24,'Backup secret must be at least 24 characters');}
export function encryptModule(bytes,meta,secret){
 validSecret(secret);const header=strictHeader(meta);
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=3000000&&sha(bytes)===header.sha256,'Module digest mismatch');
 const salt=randomBytes(32),iv=randomBytes(12),key=derive(secret,salt);
 try{
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.from(JSON.stringify({...header,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}));
 }finally{key.fill(0);}
}
export function decryptModule(envelope,secret){
 validSecret(secret);
 assert.ok(Buffer.isBuffer(envelope)&&envelope.length<=4100000,'Invalid backup size');
 const data=JSON.parse(envelope.toString('utf8')),header=strictHeader(data);
 assert.equal(data.format,magic);assert.equal(data.worker,header.worker);
 const salt=Buffer.from(data.salt,'base64'),iv=Buffer.from(data.iv,'base64'),tag=Buffer.from(data.tag,'base64'),encrypted=Buffer.from(data.ciphertext,'base64');
 assert.equal(salt.length,32);assert.equal(iv.length,12);assert.equal(tag.length,16);
 assert.ok(encrypted.length>0&&encrypted.length<=3000000);
 const key=derive(secret,salt);
 try{
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(Buffer.from(JSON.stringify(header)));decipher.setAuthTag(tag);
  const bytes=Buffer.concat([decipher.update(encrypted),decipher.final()]);
  assert.equal(sha(bytes),header.sha256,'Restored module digest mismatch');
  return bytes;
 }finally{key.fill(0);}
}
export function persistEncryptedModule({bytes,meta,secret,directory,repository=process.cwd()}){
 assert.ok(isAbsolute(directory),'Explicit absolute private backup directory required');
 const dir=realpathSync(directory),repo=realpathSync(repository);
 const rel=relative(repo,dir);
 assert.ok(rel!==''&&(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)),'Backup inside repository prohibited');
 const st=statSync(dir);
 assert.ok(st.isDirectory(),'Private backup directory required');
 // POSIX permission check; Windows operators must ensure the destination ACL is private.
 if(process.platform!=='win32')assert.equal(st.mode&0o077,0,'Backup directory must be owner-only');
 const header=strictHeader(meta),name='apd-worker-'+header.version+'-'+header.sha256.slice(0,16)+'.encrypted.json';
 const file=join(dir,name),envelope=encryptModule(bytes,header,secret);
 let fd,created=false;
 try{
  fd=openSync(file,'wx',0o600);created=true;
  writeFileSync(fd,envelope);fsyncSync(fd);closeSync(fd);fd=undefined;
  const stored=readFileSync(file);
  assert.ok(stored.equals(envelope));
  assert.ok(decryptModule(stored,secret).equals(bytes),'Backup readback mismatch');
  return {persistentModuleBackup:true,encrypted:true,backupSha256:sha(stored),restoredModuleSha256:header.sha256,remoteRollbackTested:false,configurationBackedUp:false,databaseBackedUp:false};
 }catch(error){if(fd!==undefined)closeSync(fd);if(created)unlinkSync(file);throw error;}
}

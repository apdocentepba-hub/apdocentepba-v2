/**
 * APDocentePBA mobile push - cross-runtime Web Crypto (Node / Worker) candidate.
 * LAB ONLY: no network, secrets, Supabase, provider calls or deployment.
 * Keys MUST be server-only 32-byte values from separate environment secrets.
 *
 * token_ciphertext stores 12-byte IV + AES-GCM ciphertext/tag, base64url.
 * token_hash stores HMAC-SHA256 with an independent server-only key.
 * AES-GCM IV is freshly random for each encryption.
 */
const utf8=new TextEncoder();
const textDecoder=new TextDecoder("utf-8",{fatal:true});
const byteString=bytes=>String.fromCharCode(...bytes);
const encode=bytes=>btoa(byteString(bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
function decode(s){
 if(typeof s!=="string"||s.length===0||!/^[-_a-zA-Z0-9]+$/.test(s))
  throw Error("invalid_encoding");
 const fixed=s.replace(/-/g,"+").replace(/_/g,"/");
 const raw=atob(fixed.padEnd(Math.ceil(fixed.length/4)*4,"="));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function keyBytes(value){
 const bytes=decode(value);
 if(bytes.length!==32)throw Error("invalid_server_key");
 return bytes;
}
async function importKeys({encryptionKey,hmacKey}={}){
 if(!globalThis.crypto?.subtle||!globalThis.crypto.getRandomValues)
  throw Error("web_crypto_unavailable");
 const encryptKey=await crypto.subtle.importKey("raw",keyBytes(encryptionKey),
  {name:"AES-GCM"},false,["encrypt","decrypt"]);
 const hashKey=await crypto.subtle.importKey("raw",keyBytes(hmacKey),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return{encryptKey,hashKey};
}
function cleanToken(token){
 if(typeof token!=="string"||token.length<16||token.length>500||
    /[\u0000-\u001f\u007f]/.test(token))throw Error("invalid_push_token");
 return utf8.encode(token);
}
export async function protectMobilePushToken({
 token,encryptionKey,hmacKey
}={}){
 const bytes=cleanToken(token);
 const {encryptKey,hashKey}=await importKeys({encryptionKey,hmacKey});
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const [cipher,mac]=await Promise.all([
  crypto.subtle.encrypt({name:"AES-GCM",iv},encryptKey,bytes),
  crypto.subtle.sign("HMAC",hashKey,bytes)
 ]);
 const raw=new Uint8Array(iv.length+cipher.byteLength);
 raw.set(iv,0);raw.set(new Uint8Array(cipher),iv.length);
 const token_hash=Array.from(new Uint8Array(mac),v=>v.toString(16).padStart(2,"0")).join("");
 return Object.freeze({token_ciphertext:encode(raw),token_hash});
}
export async function openMobilePushToken({
 token_ciphertext,encryptionKey,hmacKey
}={}){
 const bytes=decode(token_ciphertext);
 if(bytes.length<12+16+16||bytes.length>1024)throw Error("invalid_ciphertext");
 const {encryptKey}=await importKeys({encryptionKey,hmacKey});
 const iv=bytes.slice(0,12);
 const plain=await crypto.subtle.decrypt(
  {name:"AES-GCM",iv},encryptKey,bytes.slice(12)
 );
 const token=textDecoder.decode(new Uint8Array(plain));
 cleanToken(token);
 return token;
}

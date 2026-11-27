/** Reviewed static catalog only. No third-party requests or credentials. */
import {createSchoolCatalog} from './apd-career-school-catalog.mjs';
const MAX=32*1024*1024;
export async function loadReviewedSchoolCatalog({manifest,origin,fetcher=fetch,signal}){
 if(manifest?.approved!==true||!/^sha256:[a-f0-9]{64}$/.test(manifest.indexDigest||'')||!/^data\/career-schools-[a-f0-9]{16}\.json$/.test(manifest.path||''))return null;
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Origen inválido');
 const url=new URL(manifest.path,base);
 if(url.origin!==base.origin)throw Error('Origen del padrón inválido');
 const timeout=AbortSignal.timeout(12000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 const res=await fetcher(url.href,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:combined});
 if(!res.ok)throw Error('Padrón no disponible');
 const advertised=Number(res.headers.get('content-length')||0);
 if(!Number.isFinite(advertised)||advertised>MAX)throw Error('Padrón demasiado extenso');
 const reader=res.body?.getReader();if(!reader)throw Error('Padrón vacío');
 const chunks=[];let count=0;
 try{while(true){const r=await reader.read();if(r.done)break;count+=r.value.byteLength;if(count>MAX)throw Error('Padrón demasiado extenso');chunks.push(r.value);}}
 finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if('sha256:'+digest!==manifest.indexDigest)throw Error('Integridad del padrón no confirmada');
 const snapshot=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(snapshot.resourceId!==manifest.resourceId||snapshot.sha256!==manifest.sourceDigest||snapshot.catalogModified!==manifest.catalogModified)throw Error('Procedencia del padrón no confirmada');
 return createSchoolCatalog(snapshot);
}

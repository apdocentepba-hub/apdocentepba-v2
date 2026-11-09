#!/usr/bin/env node
// MANUAL opt-in only. Source: ABC's public Solr endpoint. OUTPUT: aggregate counts.
// No writes, no screenshots, no personal data, no users, no notification channels.
import {createAPDABCPublicPageReader} from './apd-abc-public-reader.mjs';
import {createAPDScannerCompactAdapter} from './apd-scanner-compact-adapter.mjs';

const args=process.argv.slice(2);
const authorized=args.length===2&&args.includes('--read-only')&&
 args.includes('--district=AVELLANEDA')&&
 process.env.APD_ABC_READONLY_PROBE==='1';
if(!authorized){
 console.error('PROBE_DISABLED: requires --read-only --district=AVELLANEDA and APD_ABC_READONLY_PROBE=1');
 process.exitCode=2;
}else{
 try{
  const readPage=createAPDABCPublicPageReader({enabled:true});
  const adapter=createAPDScannerCompactAdapter({
   enabled:true,readPage,
   readScanState:async()=>{throw Error('Scanner attestation unavailable in public probe');},
   pageSize:10
  });
  const report=await adapter.inspect({district:'AVELLANEDA'});
  // No source document, names, IDs, CUIL or row payload is printed or stored.
  console.log(JSON.stringify(report));
 }catch(error){
  // Never log URL, raw response, documents, authentication or stack.
  console.error('PROBE_REJECTED: '+String(error?.message||'unknown').slice(0,180));
  process.exitCode=1;
 }
}

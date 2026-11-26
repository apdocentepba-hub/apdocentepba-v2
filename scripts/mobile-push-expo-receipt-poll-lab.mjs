/** Candidate server-only receipt polling. No send, cron or default network.
 * A failed lookup is not evidence of rejection. Missing receipts stay pending.
 */
import {classifyExpoPushReceiptLab} from './mobile-push-provider-response-replay-lab.mjs';
export function createExpoReceiptPollLab({database,transport,authorizeRun,clock=Date.now}={}){
 if(typeof authorizeRun!=='function'||typeof clock!=='function'||typeof transport?.getReceipts!=='function'||!['listExpoPendingReceiptChecks','settleConsumedExpoReceipt'].every(k=>typeof database?.[k]==='function'))throw Error('invalid_receipt_poll_dependencies');
 return async function run(context){
  let checked=0,settled=0,pending=0,unconfirmed=0;
  const result=state=>Object.freeze({state,checked,settled,pending,unconfirmed,delivery_to_device_confirmed:false});
  try{if(await authorizeRun(context)!==true)return result('denied');}catch{return result('denied');}
  try{
   const rows=await database.listExpoPendingReceiptChecks({nowMs:clock(),limit:10});
   if(!Array.isArray(rows)||rows.length>10)return result('unavailable');
   if(!rows.length)return result('empty');
   const ids=rows.map(r=>r.ticketId);
   if(ids.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{8,200}$/.test(x))||new Set(ids).size!==ids.length)return result('unavailable');
   const reply=await transport.getReceipts(ids);
   if(reply?.httpStatus!==200||!reply.body||typeof reply.body!=='object'||!reply.body.data||typeof reply.body.data!=='object'||Array.isArray(reply.body.data)||reply.body.errors?.length)return result('unavailable');
   for(const row of rows){
    checked++;
    const c=classifyExpoPushReceiptLab({...reply,receiptId:row.ticketId});
    const outcome=({awaiting_receipt:'pending',provider_accepted:'provider_accepted',rejected:'provider_rejected',invalid_device:'invalid_device'})[c.state];
    // Unknown/malformed receipt must not become terminal just from bad data.
    if(!outcome){unconfirmed++;continue;}
    try{
     if(await database.settleConsumedExpoReceipt({...row,outcome})!==true){unconfirmed++;continue;}
     if(outcome==='pending')pending++;else settled++;
    }catch{unconfirmed++;}
   }
   return result('checked');
  }catch{return result('unavailable');}
 };
}

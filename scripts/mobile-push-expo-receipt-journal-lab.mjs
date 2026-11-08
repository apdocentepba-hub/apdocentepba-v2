/**
 * APD mobile: OFFLINE Expo ticket/receipt journal bridge.
 * This is NOT a transport: takes injected sample responses and private
 * persistence, never performs a provider HTTP request or marks delivered.
 */
import {classifyExpoPushTicketLab,classifyExpoPushReceiptLab}
 from './mobile-push-provider-response-replay-lab.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT=/^[0-9a-f]{64}$/;
const TICKET=/^[A-Za-z0-9_-]{8,200}$/;
const noDelivery=Object.freeze({provider_calls:0,delivery_to_device_confirmed:false});
const outcomeMap=Object.freeze({
 awaiting_receipt:'pending',provider_accepted:'provider_accepted',
 rejected:'provider_rejected',invalid_device:'invalid_device',
 uncertain:'uncertain'
});
function ids({eventKey,dispatchId,ticketId}){
 if(!EVENT.test(eventKey||'')||!UUID.test(dispatchId||'')||
    (ticketId!==undefined&&!TICKET.test(ticketId||'')))
  throw Error('invalid_expo_journal_identity');
}
export function createMobileExpoReceiptJournalLab({database}={}){
 if(typeof database?.recordExpoTicket!=='function'||
    typeof database?.recordExpoReceiptAudit!=='function')
  throw Error('expo_journal_requires_private_database');
 return Object.freeze({
  async recordSyntheticTicket({eventKey,dispatchId,providerReply}={}){
   ids({eventKey,dispatchId});
   const result=classifyExpoPushTicketLab(providerReply||{});
   if(result.state!=='awaiting_receipt'||!result.receiptId)
    return Object.freeze({
     stored:false,classification:result.state,...noDelivery
    });
   const stored=await database.recordExpoTicket({
    eventKey,dispatchId,ticketId:result.receiptId
   });
   if(typeof stored!=='boolean')throw Error('expo_ticket_storage_unverified');
   return Object.freeze({
    stored,classification:stored?'awaiting_receipt':'storage_refused',
    ...noDelivery
   });
  },
  async recordSyntheticReceipt({eventKey,dispatchId,ticketId,providerReply}={}){
   ids({eventKey,dispatchId,ticketId});
   if(!TICKET.test(ticketId||''))throw Error('invalid_expo_journal_identity');
   const result=classifyExpoPushReceiptLab({
    ...(providerReply||{}),receiptId:ticketId
   });
   const outcome=outcomeMap[result.state];
   if(!outcome)throw Error('invalid_expo_receipt_classification');
   const stored=await database.recordExpoReceiptAudit({
    eventKey,dispatchId,ticketId,outcome
   });
   if(typeof stored!=='boolean')throw Error('expo_receipt_storage_unverified');
   // Classification is an observation, not the SQL tracking state.
   // If the SQL authorization was revoked or quarantined it records
   // late_audit, never changes outbox into sent.
   return Object.freeze({
    stored,observed_status:result.state,
    delivery_to_device_confirmed:false,provider_calls:0
   });
  }
 });
}

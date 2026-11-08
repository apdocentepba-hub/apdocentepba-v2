/**
 * Complete isolated Worker fixture:
 * signed SQL claim -> private PostgREST -> leased device -> plan ->
 * read-only official ABC shape -> actual APD Worker matcher ->
 * re-check SQL lease and consent -> WebCrypto final safety gate.
 *
 * ALL database, ABC and plan responses are fictional in-memory stubs.
 * No real DNS, HTTP provider, Supabase project, user, token or notification.
 */
import {createMobilePushPostgrestAdapterLab}
 from '../mobile-push-postgrest-adapter-lab.mjs';
import {createMobilePushServerRepositoryLab}
 from '../mobile-push-server-repository-lab.mjs';
import {createAbcCurrentOfferVerifierLab}
 from '../mobile-push-abc-current-offer-lab.mjs';
import {createWorkerMobilePushDryRunLab}
 from '../mobile-push-worker-webcrypto-lab.mjs';
import {createMobilePushSubscriptionVerifierLab}
 from '../mobile-push-subscription-verifier-lab.mjs';
import {matchWithCurrentPreferences}
 from './generated-apd-matcher-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='77777777-7777-4777-8777-777777777777';
const OFFER='D_123';
const NOW=Date.parse('2026-11-08T10:00:00Z');
const HMAC='SYNTHETIC_HMAC_WORKER_LAB_1234567890123456789012345';
const API_KEY='sb_secret_SYNTHETIC_NO_REAL_SUPABASE_CREDENTIALS_12345';
const DB='https://apdsynthetic123.supabase.co';
const VALID=new Set([
 'ready','district','cargo','turno','nivel','closed','expired',
 'plan-inactive','plan-stale','plan-other','pref-disabled','source-down',
 'source-missing','source-duplicated','stale-before','stolen-after',
 'device-revoked','revoked-after','device-other','no-auth','wrong-hmac',
 'bad-key','database-down','outbox-duplicate','revocation-cancels-lease',
 'prefs-unscoped','prefs-wrong-user','prefs-bad-type',
 'plan-pending','plan-paused','plan-trial-valid','plan-trial-expired',
 'plan-no-expiry','plan-catalog-disabled','plan-expired',
 'plan-unknown','plan-ambiguous','plan-wrong-user',
 'plan-bad-type','plan-catalog-missing','plan-catalog-other',
 'plan-history-overflow','plan-newer-pending',
 'plan-revoked-after','plan-paused-after','plan-expired-after',
 'plan-catalog-disabled-after','plan-account-down-after'
]);
const iso=t=>new Date(t).toISOString();
const json=(value,status=200)=>Response.json(value,{
 status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const doc=()=>({
 id:'SOLR-999',iddetalle:'123',idoferta:'456',
 estado:'Publicada',finoferta:'08/11/2026 09:00',
 descdistrito:'AVELLANEDA',descripcioncargo:'PRECEPTOR',
 turno:'M',descnivelmodalidad:'SECUNDARIA'
});
const preferences=()=>({
 user_id:USER,alertas_activas:true,
 distrito_principal_apd:'AVELLANEDA',otros_distritos_apd:[],
 cargos_apd:['PRECEPTOR'],materias_apd:[],
 turnos:['MAÑANA'],niveles:['SECUNDARIA']
});
async function eventHash(){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(HMAC),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode(JSON.stringify([USER,DEVICE,OFFER]))));
 return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
export default {
 async fetch(request){
  const u=new URL(request.url);
  const mode=u.pathname.slice(1);
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  if(!VALID.has(mode))return json({error:'not_found'},404);
  const counts={claim:0,lease:0,device:0,cancel:0,retry:0,
   abc:0,prefs:0,match:0,plan:0,unauthorizedRequests:0};
  const realHash=await eventHash();
  const claim={
   event_key:mode==='wrong-hmac'?'0'.repeat(64):realHash,
   user_id:USER,device_id:DEVICE,lease_id:LEASE,attempts:1,
   source_offer_key:mode==='bad-key'?'ABC_FALLBACK_UNKNOWN':OFFER,
   transport:'expo'
  };
  const fetchImpl=async(address,opts)=>{
   const target=new URL(address);
   if(target.origin===DB){
    if(opts.headers?.apikey!==API_KEY||opts.credentials!=='omit'||
       opts.redirect!=='manual'||opts.cache!=='no-store'||
       'Authorization' in opts.headers)
     throw Error('forbidden_private_request');
    if(mode==='database-down')throw Error('synthetic_db_outage');
    switch(target.pathname){
     case '/rest/v1/rpc/apd_mobile_claim_push':{
      counts.claim++;
      if(opts.method!=='POST')throw Error('invalid_claim_method');
      const args=JSON.parse(opts.body);
      if(args.p_limit!==10||args.p_lease_seconds!==60)
       throw Error('unbounded_claim');
      return json(mode==='outbox-duplicate'?[claim,claim]:[claim]);
     }
     case '/rest/v1/apd_mobile_push_outbox':{
      counts.lease++;
      if(target.searchParams.get('event_key')!=='eq.'+claim.event_key||
         target.searchParams.get('lease_id')!=='eq.'+LEASE||
         target.searchParams.get('status')!=='eq.leased')
       throw Error('wrong_lease_scope');
      if((mode==='stolen-after'||mode==='revocation-cancels-lease')&&counts.lease>1)
       return json([]);
      return json([{
       event_key:claim.event_key,user_id:USER,device_id:DEVICE,
       source_offer_key:claim.source_offer_key,status:'leased',
       lease_id:LEASE,leased_until:iso(NOW+
        (mode==='stale-before'?-1000:60000))
      }]);
     }
     case '/rest/v1/apd_mobile_push_devices':{
      counts.device++;
      if(target.searchParams.get('id')!=='eq.'+DEVICE||
         target.searchParams.get('user_id')!=='eq.'+USER||
         /token_ciphertext|token_hash/.test(target.searchParams.get('select')||''))
       throw Error('device_scope_or_token_violation');
      const revoked=mode==='device-revoked'||
       (mode==='revoked-after'&&counts.device>1);
      return json([{
       id:DEVICE,user_id:mode==='device-other'?OTHER:USER,
       platform:'android',transport:'expo',opted_in:!revoked,
       enabled:!revoked,revoked_at:revoked?iso(NOW):null
      }]);
     }
     case '/rest/v1/users':{
      if(mode==='plan-account-down-after'&&counts.plan>1)
       throw Error('synthetic_subscription_server_unavailable');
      if(target.searchParams.get('id')!=='eq.'+USER||
         target.searchParams.get('select')!=='id,activo'||
         target.searchParams.get('limit')!=='2')
       throw Error('unscoped_account_lookup');
      if(mode==='plan-notfound')return json([]);
      return json([{
       id:mode==='plan-other'?OTHER:USER,
       activo:mode!=='plan-inactive'&&
        !(mode==='plan-revoked-after'&&counts.plan>1),
       email:'DONT_SEND_ACCOUNT_EMAIL'
      }]);
     }
     case '/rest/v1/user_subscriptions':{
      if(target.searchParams.get('user_id')!=='eq.'+USER||
         target.searchParams.get('order')!=='created_at.desc'||
         target.searchParams.get('limit')!=='6'||
         target.searchParams.get('select')!==
           'id,user_id,plan_code,status,created_at,trial_ends_at,current_period_ends_at')
       throw Error('unscoped_subscription_lookup');
      const trial=mode==='plan-trial-valid'||mode==='plan-trial-expired';
      const subscription={
       id:'99999999-9999-4999-8999-999999999999',
       user_id:mode==='plan-wrong-user'?OTHER:USER,
       plan_code:trial?'TRIAL_7D':mode==='plan-unknown'?'UNTRUSTED_PLAN':'PLUS',
       status:mode==='plan-pending'||mode==='plan-newer-pending'?'PENDING':
        (mode==='plan-paused-after'&&counts.plan>1)?'PAUSED':
        mode==='plan-paused'?'PAUSED':trial?'TRIALING':'ACTIVE',
       created_at:mode==='plan-stale'?'INVALID_TIME':
        iso(NOW-24*3600_000),
       trial_ends_at:trial?iso(NOW+
        (mode==='plan-trial-expired'?-10_000:3600_000)):null,
       current_period_ends_at:trial||mode==='plan-no-expiry'?null:
        mode==='plan-expired'||(mode==='plan-expired-after'&&counts.plan>1)?
         iso(NOW-10_000):iso(NOW+3*3600_000),
       mercadopago_payer_email:'DONT_SEND_BILLING_EMAIL'
      };
      if(mode==='plan-bad-type')subscription.status=12345;
      if(mode==='plan-newer-pending')return json([
       subscription,
       {...subscription,
        id:'99999999-9999-4999-8999-999999999997',
        created_at:iso(NOW-48*3600_000),status:'ACTIVE'}
      ]);
      if(mode==='plan-ambiguous')return json([subscription,{
       ...subscription,id:'99999999-9999-4999-8999-999999999998'
      }]);
      if(mode==='plan-history-overflow'){
       return json(Array.from({length:6},(_,i)=>({
        ...subscription,id:'99999999-9999-4999-8999-'+String(i).padStart(12,'0')
       })));
      }
      return json([subscription]);
     }
     case '/rest/v1/subscription_plans':{
      if(target.searchParams.get('code')!=='eq.'+
          (mode==='plan-trial-valid'?'TRIAL_7D':
           mode==='plan-trial-expired'?'TRIAL_7D':'PLUS')||
         target.searchParams.get('select')!=='code,is_active'||
         target.searchParams.get('limit')!=='2')
       throw Error('unscoped_catalog_lookup');
      if(mode==='plan-catalog-missing')return json([]);
      return json([{
       code:mode==='plan-catalog-other'?'INSIGNE':
        mode==='plan-trial-valid'?'TRIAL_7D':'PLUS',
       is_active:mode!=='plan-catalog-disabled'&&
        !(mode==='plan-catalog-disabled-after'&&counts.plan>1),
       mercadopago_plan_id:'DONT_SEND_MERCADOPAGO_REFERENCE'
      }]);
     }
     case '/rest/v1/user_preferences':{
      counts.prefs++;
      if(target.searchParams.get('user_id')!=='eq.'+USER||
         target.searchParams.get('limit')!=='2'||
         target.searchParams.get('select')!==
          'user_id,distrito_principal,otros_distritos,cargos,materias,niveles,turnos,alertas_activas')
       throw Error('preferences_scope_or_private_metadata_violation');
      return json([{
       user_id:mode==='prefs-wrong-user'?OTHER:USER,
       distrito_principal:'Avellaneda',
       otros_distritos:[],cargos:mode==='prefs-unscoped'?[]:['PRECEPTOR'],
       materias:[],turnos:['MAÑANA'],
       niveles:mode==='prefs-bad-type'?'INVALID_ARRAY':['SECUNDARIA'],
       alertas_activas:mode!=='pref-disabled',
       email:'SHOULD_NEVER_LEAVE_PRIVATE_DB',
       dni:'SHOULD_NEVER_LEAVE_PRIVATE_DB'
      }]);
     }
     case '/rest/v1/rpc/apd_mobile_cancel_push':{
      counts.cancel++;
      if(JSON.parse(opts.body).p_lease_id!==LEASE)
       throw Error('attempt_to_cancel_other_lease');
      return json(true);
     }
     case '/rest/v1/rpc/apd_mobile_finish_push':{
      counts.retry++;
      const a=JSON.parse(opts.body);
      if(a.p_sent!==false||a.p_lease_id!==LEASE)
       throw Error('attempt_to_mark_sent');
      return json(!['stale-before','stolen-after','revocation-cancels-lease'].includes(mode));
     }
     default:throw Error('unknown_private_query');
    }
   }
   if(target.origin==='https://servicios3.abc.gob.ar'){
    counts.abc++;
    if(opts.method!=='GET'||opts.credentials!=='omit'||
       opts.redirect!=='manual'||opts.cache!=='no-store'||
       target.pathname!=='/valoracion.docente/api/apd.oferta.encabezado/select'||
       target.searchParams.get('rows')!=='2')
     throw Error('unexpected_abc_request');
    if(mode==='source-down')throw Error('synthetic_abc_timeout');
    if(mode==='source-missing')return json({
     responseHeader:{status:0},response:{numFound:0,docs:[]}
    });
    const o=doc();
    if(mode==='district')o.descdistrito='QUILMES';
    if(mode==='cargo')o.descripcioncargo='MAESTRO';
    if(mode==='turno')o.turno='TT';
    if(mode==='nivel')o.descnivelmodalidad='PRIMARIA';
    if(mode==='closed')o.estado='Cerrada';
    if(mode==='expired')o.finoferta='08/11/2026 06:00';
    const docs=mode==='source-duplicated'?[o,o]:[o];
    return json({responseHeader:{status:0},
     response:{numFound:docs.length,docs}});
   }
   counts.unauthorizedRequests++;
   throw Error('no_other_network_permitted');
  };
  const database=createMobilePushPostgrestAdapterLab({
   projectUrl:DB,secretKey:API_KEY,fetchImpl
  });
  const authoritativeSubscriptions=createMobilePushSubscriptionVerifierLab({
   database,now:()=>NOW
  });
  const plans={async verify({userId}){
   counts.plan++;
   if(userId!==USER)throw Error('untrusted_plan_lookup');
   return authoritativeSubscriptions.verify({userId});
  }};
  // The same private database adapter now reads and maps the legacy APD
  // preferences, instead of accepting an independently invented match flag.
  const prefs={getForUser:({userId})=>database.readUserPreferences({userId})};
  const offers=createAbcCurrentOfferVerifierLab({
   fetchImpl,preferences:prefs,now:()=>NOW,
   matchWithCurrentPreferences:input=>{
    counts.match++;
    if(input.userId!==USER||input.preferences.user_id!==USER)
     throw Error('untrusted_preference_link');
    return matchWithCurrentPreferences(input);
   }
  });
  const repository=createMobilePushServerRepositoryLab({
   database,plans,offers,now:()=>NOW,
   finalReservationRecheck:true,finalPlanRecheck:true
  });
  const run=createWorkerMobilePushDryRunLab({
   authorizeScheduledRun:async()=>mode!=='no-auth',
   repository,hmacSecret:HMAC,now:()=>NOW
  });
  const outcome=await run({fixtureOnly:true});
  // The diagnostic never includes offer IDs, user IDs, tokens or API key.
  return json({...outcome,counts});
 }
};

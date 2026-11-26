import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const token=process.env.MERCADOPAGO_ACCESS_TOKEN;
const uri=process.env.APD_SUPABASE_DB_URL;
if(!token||!token.startsWith('APP_USR-')){console.log('APD_OWNER_RECONCILIATION_BLOCKED production provider credential not available in runner');process.exit(1);}
const db=new URL(uri);
assert.equal(db.protocol,'postgresql:');assert.equal(db.port,'5432');assert.equal(decodeURIComponent(db.username),'postgres.vvgkinkvojqwfuqaxijh');assert.match(db.hostname,/\.pooler\.supabase\.com$/);assert.equal(db.pathname,'/postgres');
const sql=`BEGIN READ ONLY;
SELECT jsonb_build_object('gate_closed', (SELECT NOT enrollment_open FROM public.apd_commercial_release_control WHERE singleton),
'owner_count',(SELECT count(*) FROM public.users WHERE activo AND es_admin AND md5(id::text)='2e9596824e588c6f47e538068efe970b'),
'rows',coalesce(jsonb_agg(jsonb_build_object('reference',c.external_reference,'preference',c.provider_payload->>'preference_id','payment',c.provider_payload->>'payment_id','status',c.status,'created_at',c.created_at,'plan',c.plan_code)),'[]'::jsonb))
FROM public.mercadopago_checkout_sessions c JOIN public.users u ON u.id=c.user_id
WHERE u.activo AND u.es_admin AND md5(u.id::text)='2e9596824e588c6f47e538068efe970b' AND c.plan_code<>'COMPLETO' AND c.status IN ('ready','approved');
COMMIT;`;
const r=spawnSync('psql',[uri,'-X','-Atq','-v','ON_ERROR_STOP=1','-c',sql],{env:{...process.env,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'10'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000});
if(r.status!==0)throw Error('Read-only DB query failed');
const data=JSON.parse(r.stdout.trim());
assert.equal(data.gate_closed,true);assert.equal(data.owner_count,1);assert.equal(data.rows.filter(x=>x.status==='ready').length,25);assert.equal(data.rows.filter(x=>x.status==='approved').length,1);
async function get(path,params={}){
 const url=new URL(path,'https://api.mercadopago.com');
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 const res=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token}});
 if(!res.ok)throw Error('Provider read returned HTTP '+res.status);
 return res.json();
}
// Identify authenticated seller independently of the historical local payment ID.
const me=await get('/users/me');
assert.ok(/^\d+$/.test(String(me.id))&&me.site_id==='MLA','Credential seller/site not verified');
const merchant=String(me.id);
const prefixes=[...new Set(data.rows.filter(r=>r.status==='ready').map(r=>/^([0-9]+)-/.exec(String(r.preference))?.[1]||''))];
console.log('APD_OWNER_PROVIDER_AUTHENTICATED '+JSON.stringify({site:'MLA',authenticatedSellerSuffix:merchant.slice(-4),historicalPreferencePrefixSuffixes:prefixes.filter(Boolean).map(x=>x.slice(-4)),preferencePrefixMatch:prefixes.length===1&&prefixes[0]===merchant}));
// Historical preference IDs share a seller prefix; fail closed before querying
// payment details when the authenticated identity differs. Never alter records.
if(prefixes.length!==1||!prefixes[0]||prefixes[0]!==merchant){
 console.log('APD_OWNER_RECONCILIATION_BLOCKED seller identity mismatch; zero payment/preference lookups; zero writes');
 process.exit(1);
}
const known=data.rows.find(x=>x.status==='approved');
let historicalPaymentVerified=false;
let historicalLookup='unverified';
try{
 if(!/^[0-9]{1,30}$/.test(String(known.payment)))throw Error('missing local payment identity');
 const payment=await get('/v1/payments/'+encodeURIComponent(known.payment));
 historicalPaymentVerified=String(payment.id)===String(known.payment)&&payment.external_reference===known.reference&&payment.live_mode===true&&String(payment.collector_id)===merchant;
 historicalLookup=historicalPaymentVerified?'verified':'identity_mismatch';
}catch(e){historicalLookup=/HTTP \d{3}$/.exec(String(e.message))?.[0]||'unverified';}
console.log('APD_OWNER_HISTORICAL_PAYMENT_LOOKUP '+JSON.stringify({historicalLookup,historicalPaymentVerified}));
const counts={expiredNoPayments:0,openNoPayments:0,hasPayments:0,unverified:0};
const statuses={};
const failures={};let matchedSellerPreferences=0;
for(const row of data.rows.filter(x=>x.status==='ready')){
 try{
  if(typeof row.reference!=='string'||!row.reference||!/^[A-Za-z0-9_-]{1,180}$/.test(row.preference))throw Error('identity');
  let pref;try{pref=await get('/checkout/preferences/'+encodeURIComponent(row.preference));}catch(e){throw Error('preference '+(/HTTP \d{3}$/.exec(String(e.message))?.[0]||'lookup_failed'));}
  if(pref.id!==row.preference||pref.external_reference!==row.reference||String(pref.collector_id)!==merchant)throw Error('preference identity');
  matchedSellerPreferences++;
  const search=await get('/v1/payments/search',{external_reference:row.reference,sort:'date_created',criteria:'desc',limit:'50',offset:'0'});
  if(!Number.isInteger(search.paging?.total)||!Array.isArray(search.results)||search.results.length!==search.paging.total||search.results.some(p=>p.external_reference!==row.reference||String(p.collector_id)!==String(merchant)||p.live_mode!==true))throw Error('incomplete search');
  if(search.results.length){counts.hasPayments++;for(const pay of search.results){const k=['approved','pending','in_process','rejected','cancelled','refunded','charged_back','authorized'].includes(pay.status)?pay.status:'other';statuses[k]=(statuses[k]||0)+1;}}
  else if(pref.expires===true&&Number.isFinite(Date.parse(pref.expiration_date_to))&&Date.parse(pref.expiration_date_to)<=Date.now())counts.expiredNoPayments++;
  else counts.openNoPayments++;
 }catch(e){counts.unverified++;const msg=String(e.message);const k=/^(?:preference (?:HTTP \d{3}|lookup_failed|identity)|identity|incomplete search|Provider read returned HTTP \d{3})$/.test(msg)?msg:'other';failures[k]=(failures[k]||0)+1;}
}
console.log('APD_OWNER_RECONCILIATION_READONLY '+JSON.stringify({legacyReady:25,historicalPaymentVerified,historicalLookup,matchedSellerPreferences,...counts,paymentStatuses:statuses,failures,productionWrites:0,providerWrites:0}));
if(counts.unverified||!historicalPaymentVerified)process.exit(1);
if(process.argv.includes('--expire-one-owner-link')){
 assert.equal(process.env.APD_OWNER_EXPIRY_PILOT,'1');
 assert.equal(process.env.GITHUB_REPOSITORY,'apdocentepba-hub/apdocentepba-v2');
 assert.equal(process.env.GITHUB_HEAD_REF,'qa/owner-payment-reconciliation-20261126');
 assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request');
 assert.equal(counts.hasPayments,0);
 assert.equal(counts.expiredNoPayments+counts.openNoPayments,25);
 assert.equal(matchedSellerPreferences,25);
 const pilot=data.rows.filter(x=>x.status==='ready').sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.preference.localeCompare(b.preference))[0];
 const endpoint='/checkout/preferences/'+encodeURIComponent(pilot.preference);
 const assertIdentity=pref=>{
  assert.equal(pref.id,pilot.preference);
  assert.equal(pref.external_reference,pilot.reference);
  assert.equal(String(pref.collector_id),merchant);
 };
 const assertNoPayments=async()=>{
  const search=await get('/v1/payments/search',{external_reference:pilot.reference,sort:'date_created',criteria:'desc',limit:'50',offset:'0'});
  assert.equal(search.paging?.total,0,'Pilot has associated payment; stop');
  assert.ok(Array.isArray(search.results)&&search.results.length===0,'Incomplete search');
 };
 const isExpired=pref=>pref.expires===true&&Number.isFinite(Date.parse(pref.expiration_date_to))&&Date.parse(pref.expiration_date_to)<Date.now();
 const before=await get(endpoint);assertIdentity(before);await assertNoPayments();
 if(isExpired(before)){console.log('APD_OWNER_EXPIRY_PILOT_PASS '+JSON.stringify({expired:1,alreadyExpired:true,providerWrites:0,databaseWrites:0,scope:'owner_only'}));process.exit(0);}
 assert.ok(counts.expiredNoPayments===0,'Unexpected partially expired inventory; stop');
 const created=Date.parse(before.date_created);
 assert.ok(Number.isFinite(created)&&created<Date.now()-86400000*30,'Only old preferences');
 const terms=pref=>JSON.stringify([pref.id,pref.external_reference,String(pref.collector_id),pref.items,pref.notification_url,pref.back_urls,pref.marketplace_fee,pref.payment_methods]);
 const body={expires:true,expiration_date_from:new Date(created).toISOString(),expiration_date_to:new Date(Date.now()-3600000).toISOString()};
 const response=await fetch(new URL(endpoint,'https://api.mercadopago.com'),{method:'PUT',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 console.log('APD_OWNER_EXPIRY_PILOT_PUT '+JSON.stringify({http:response.status,attempted:1}));
 // Never retry a failed/uncertain write automatically; verify authoritative GET.
 const after=await get(endpoint);assertIdentity(after);
 assert.equal(terms(after),terms(before),'Unexpected preference terms drift');
 await assertNoPayments();
 assert.ok(response.ok&&isExpired(after),'Expiration not verified; stop');
 console.log('APD_OWNER_EXPIRY_PILOT_PASS '+JSON.stringify({expired:1,alreadyExpired:false,providerWrites:1,databaseWrites:0,scope:'owner_only'}));
}

if(process.argv.includes('--expire-remaining-owner-links')){
 assert.equal(process.env.APD_OWNER_EXPIRY_BATCH,'1');
 assert.equal(process.env.GITHUB_REPOSITORY,'apdocentepba-hub/apdocentepba-v2');
 assert.equal(process.env.GITHUB_HEAD_REF,'qa/owner-payment-reconciliation-20261126');
 assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request');
 assert.equal(counts.hasPayments,0);
 assert.equal(counts.expiredNoPayments+counts.openNoPayments,25);
 assert.equal(matchedSellerPreferences,25);
 assert.ok(counts.expiredNoPayments>=1,'Pilot not confirmed');
 const rows=data.rows.filter(x=>x.status==='ready').sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.preference.localeCompare(b.preference));
 assert.equal(new Set(rows.map(r=>r.preference)).size,25);
 assert.equal(new Set(rows.map(r=>r.reference)).size,25);
 const isExpired=pref=>pref.expires===true&&Number.isFinite(Date.parse(pref.expiration_date_to))&&Date.parse(pref.expiration_date_to)<Date.now();
 const terms=pref=>JSON.stringify([pref.id,pref.external_reference,String(pref.collector_id),pref.items,pref.notification_url,pref.back_urls,pref.marketplace_fee,pref.payment_methods]);
 async function check(row){
  const endpoint='/checkout/preferences/'+encodeURIComponent(row.preference);
  const pref=await get(endpoint);
  assert.equal(pref.id,row.preference);assert.equal(pref.external_reference,row.reference);assert.equal(String(pref.collector_id),merchant);
  const search=await get('/v1/payments/search',{external_reference:row.reference,sort:'date_created',criteria:'desc',limit:'50',offset:'0'});
  assert.equal(search.paging?.total,0,'Associated payment discovered; stop');
  assert.ok(Array.isArray(search.results)&&search.results.length===0,'Incomplete search');
  return {pref,endpoint};
 }
 assert.ok(isExpired((await check(rows[0])).pref),'Oldest pilot not expired');
 let writes=0,skipped=0;
 for(const row of rows){
  const {pref:before,endpoint}=await check(row);
  if(isExpired(before)){skipped++;continue;}
  const created=Date.parse(before.date_created);
  assert.ok(Number.isFinite(created)&&created<Date.now()-86400000*30,'Only old preferences');
  const body={expires:true,expiration_date_from:new Date(created).toISOString(),expiration_date_to:new Date(Date.now()-3600000).toISOString()};
  const response=await fetch(new URL(endpoint,'https://api.mercadopago.com'),{method:'PUT',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  console.log('APD_OWNER_EXPIRY_BATCH_PUT '+JSON.stringify({ordinal:writes+skipped+1,http:response.status}));
  const {pref:after}=await check(row);
  assert.equal(terms(after),terms(before),'Unexpected preference terms drift');
  assert.ok(response.ok&&isExpired(after),'Expiration not verified; stop');
  writes++;
 }
 for(const row of rows)assert.ok(isExpired((await check(row)).pref),'Final verification failed');
 assert.equal(writes+skipped,25);
 console.log('APD_OWNER_EXPIRY_BATCH_PASS '+JSON.stringify({expired:25,alreadyExpired:skipped,providerWrites:writes,databaseWrites:0,associatedPayments:0,scope:'owner_only'}));
}

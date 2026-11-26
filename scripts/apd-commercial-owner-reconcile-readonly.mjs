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
const known=data.rows.find(x=>x.status==='approved');
if(!/^[0-9]{1,30}$/.test(String(known.payment)))throw Error('Missing historical payment identity');
const payment=await get('/v1/payments/'+encodeURIComponent(known.payment));
assert.ok(String(payment.id)===String(known.payment)&&payment.external_reference===known.reference&&payment.live_mode===true,'Production merchant/payment not verified');
const merchant=payment.collector_id;
assert.ok(merchant,'Collector not verified');
const counts={expiredNoPayments:0,openNoPayments:0,hasPayments:0,unverified:0};
const statuses={};
for(const row of data.rows.filter(x=>x.status==='ready')){
 try{
  if(typeof row.reference!=='string'||!row.reference||!/^[A-Za-z0-9_-]{1,180}$/.test(row.preference))throw Error('identity');
  const pref=await get('/checkout/preferences/'+encodeURIComponent(row.preference));
  if(pref.id!==row.preference||pref.external_reference!==row.reference||String(pref.collector_id)!==String(merchant))throw Error('preference identity');
  const search=await get('/v1/payments/search',{external_reference:row.reference,sort:'date_created',criteria:'desc',range:'date_created',begin_date:new Date(Date.parse(row.created_at)-86400000).toISOString(),end_date:new Date().toISOString(),limit:'50',offset:'0'});
  if(!Number.isInteger(search.paging?.total)||!Array.isArray(search.results)||search.results.length!==search.paging.total||search.results.some(p=>p.external_reference!==row.reference||String(p.collector_id)!==String(merchant)||p.live_mode!==true))throw Error('incomplete search');
  if(search.results.length){counts.hasPayments++;for(const pay of search.results){const k=['approved','pending','in_process','rejected','cancelled','refunded','charged_back','authorized'].includes(pay.status)?pay.status:'other';statuses[k]=(statuses[k]||0)+1;}}
  else if(pref.expires===true&&Number.isFinite(Date.parse(pref.expiration_date_to))&&Date.parse(pref.expiration_date_to)<=Date.now())counts.expiredNoPayments++;
  else counts.openNoPayments++;
 }catch{counts.unverified++;}
}
console.log('APD_OWNER_RECONCILIATION_READONLY '+JSON.stringify({legacyReady:25,historicalPaymentVerified:true,...counts,paymentStatuses:statuses,productionWrites:0,providerWrites:0}));
if(counts.unverified)process.exitCode=1;

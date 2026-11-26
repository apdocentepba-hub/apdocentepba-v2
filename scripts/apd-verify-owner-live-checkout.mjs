import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const token=process.env.MERCADOPAGO_ACCESS_TOKEN,uri=process.env.APD_SUPABASE_DB_URL;
assert.ok(token?.startsWith('APP_USR-'));
const db=new URL(uri);assert.equal(db.protocol,'postgresql:');assert.equal(db.port,'5432');assert.equal(decodeURIComponent(db.username),'postgres.vvgkinkvojqwfuqaxijh');assert.match(db.hostname,/\.pooler\.supabase\.com$/);assert.equal(db.pathname,'/postgres');
const sql=`BEGIN READ ONLY;
SELECT jsonb_build_object('gate_closed',(SELECT NOT enrollment_open FROM public.apd_commercial_release_control WHERE singleton),'rows',coalesce(jsonb_agg(jsonb_build_object('reference',c.external_reference,'preference',c.provider_payload->>'preference_id','status',c.status,'url',c.checkout_url,'price',c.provider_payload->>'price_ars')),'[]'::jsonb))
FROM public.mercadopago_checkout_sessions c JOIN public.users u ON u.id=c.user_id WHERE u.activo AND u.es_admin AND md5(u.id::text)='2e9596824e588c6f47e538068efe970b' AND c.plan_code='COMPLETO';
COMMIT;`;
const r=spawnSync('psql',[uri,'-X','-Atq','-v','ON_ERROR_STOP=1','-c',sql],{env:{...process.env,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'10'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000});
if(r.status!==0)throw Error('Read-only DB query failed');
const d=JSON.parse(r.stdout.trim());assert.equal(d.gate_closed,true);assert.equal(d.rows.length,1);
const row=d.rows[0];assert.equal(row.status,'ready');assert.equal(row.price,'2000');
assert.ok(/^[A-Za-z0-9_-]{1,180}$/.test(row.preference));
async function get(path,params={}){const u=new URL(path,'https://api.mercadopago.com');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const res=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token}});if(!res.ok)throw Error('Provider HTTP '+res.status);return res.json();}
const me=await get('/users/me');assert.equal(me.site_id,'MLA');assert.ok(String(me.id).endsWith('6781'));assert.equal(row.preference.split('-')[0],String(me.id));
const pref=await get('/checkout/preferences/'+encodeURIComponent(row.preference));
assert.equal(pref.id,row.preference);assert.equal(pref.external_reference,row.reference);assert.equal(String(pref.collector_id),String(me.id));assert.equal(pref.init_point,row.url);
assert.equal(pref.items.length,1);const item=pref.items[0];assert.equal(item.id,'COMPLETO');assert.equal(item.quantity,1);assert.equal(item.currency_id,'ARS');assert.equal(item.unit_price,2000);
const u=new URL(row.url);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password&&!u.port);assert.ok((['mercadopago.com.ar','www.mercadopago.com.ar'].includes(u.hostname)&&u.pathname.startsWith('/checkout/'))||(u.hostname==='www.mercadopago.com'&&u.pathname==='/mla/checkout/start'));
assert.ok(pref.expires!==true||Date.parse(pref.expiration_date_to)>Date.now());
const search=await get('/v1/payments/search',{external_reference:row.reference,sort:'date_created',criteria:'desc',limit:'50',offset:'0'});assert.equal(search.paging?.total,0);assert.equal(search.results?.length,0);
console.log('APD_OWNER_LIVE_CHECKOUT_VERIFIED '+JSON.stringify({sellerSuffix:String(me.id).slice(-4),site:'MLA',price:2000,currency:'ARS',quantity:1,plan:'COMPLETO',preferenceMatches:true,officialUrl:true,associatedPayments:0,globalAdmissionOpen:false,writes:0}));

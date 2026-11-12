import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
import {sanitizeAccountHome} from './apd-account-home-core.mjs';

const addr='CNL JOSE RONDEAU 319, Wilde, Avellaneda, Buenos Aires';
const geo={source:'GEOREF_AR_V2',label:addr,lat:-34.7,lon:-58.32,
 height:319,scope:'exacta'};
test('saved address and optional Georef are canonical and bounded',()=>{
 const x=sanitizeAccountHome({address_text:addr,georef:geo});
 assert.equal(x.address_text,addr);
 assert.equal(x.georef.label,addr);
 assert.deepEqual(Object.keys(x.georef).sort(),['height','label','lat','lon','scope','source'].sort());
 assert.deepEqual(sanitizeAccountHome({address_text:addr,georef:null}),
  {address_text:addr,georef:null});
});
test('never accept coordinates for a different address or unreviewed uncertain point',()=>{
 for(const invalid of [
  {...geo,label:'OTRA DIRECCION 321'},
  {...geo,lat:100},
  {...geo,lon:Infinity},
  {...geo,height:0},
  {...geo,source:'GPS'},
  {...geo,scope:'otro'},
  {...geo,scope:'pais'}
 ])assert.throws(()=>sanitizeAccountHome({address_text:addr,georef:invalid}));
 const reviewed=sanitizeAccountHome({address_text:addr,
  georef:{...geo,scope:'partido',reviewed:true}});
 assert.equal(reviewed.georef.reviewed,true);
});
test('reject invalid personal address text',()=>{
 for(const raw of ['', 'abc','Calle\n 319','<img>','X'.repeat(181),null,[]])
  assert.throws(()=>sanitizeAccountHome({address_text:raw,georef:null}));
});
test('candidate Worker is built offline with one authenticated route',()=>{
 const build=spawnSync(process.execPath,['scripts/build-account-home-worker-candidate.mjs'],
  {encoding:'utf8',timeout:30000});
 assert.equal(build.status,0,build.stderr);
 const compiled='tmp/apd-account-home/worker-home-candidate.mjs';
 const syntax=spawnSync(process.execPath,['--check',compiled],{encoding:'utf8',timeout:30000});
 assert.equal(syntax.status,0,syntax.stderr);
 const source=fs.readFileSync(compiled,'utf8');
 assert.equal(source.split('async function handleAccountHomeSecureV1').length-1,1);
 assert.equal(source.split('if (path === API_URL_PREFIX3 + "/account/home")').length-1,1);
 assert.match(source,/getSessionUserByBearer\(env,request\)/);
 const onlyNewRoute=source.slice(source.indexOf('// Authenticated home reference.'),
  source.indexOf('async function handleAccountPreferencesSecureV1'));
 assert.doesNotMatch(onlyNewRoute,/localStorage|navigator\.geolocation/);
});
test('Worker endpoint scopes GET PUT DELETE to session user, not spoofed body user_id',async()=>{
 const source=fs.readFileSync('tmp/apd-account-home/worker-home-candidate.mjs','utf8');
 const from=source.indexOf('// Authenticated home reference.');
 const to=source.indexOf('async function handleAccountPreferencesSecureV1',from);
 assert.ok(from>0&&to>from,'candidate function location');
 const map=new Map(),queries=[],writes=[],deletes=[];
 const scope={
  Date,Number,String,Array,Object,Error,JSON,encodeURIComponent,
  json2:(body,status=200)=>new Response(JSON.stringify(body),{status}),
  getSessionUserByBearer:async(_env,req)=>{
   const bearer=req.headers.get('Authorization');
   return bearer==='Bearer account-A'?{id:'account-A'}:
    bearer==='Bearer account-B'?{id:'account-B'}:null;
  },
  supabaseSelect:async(_env,query)=>{
   queries.push(query);
   const id=query.match(/user_id=eq\.([^&]+)/)?.[1];
   return map.has(id)?[{user_id:id,...map.get(id)}]:[];
  },
  supabaseUpsert:async(_env,table,rows,conflict)=>{
   assert.equal(table,'user_home_reference');
   assert.equal(conflict,'user_id');
   const row=rows[0];writes.push(row);
   map.set(row.user_id,row);
  },
  supabaseFetchWithRetry:async(_env,url,options)=>{
   assert.equal(options.method,'DELETE');
   const id=url.match(/user_id=eq\.([^&]+)/)?.[1];
   deletes.push(id);map.delete(id);
   return {ok:true};
  },
  Response
 };
 vm.runInNewContext(source.slice(from,to)+'\nthis.handler=handleAccountHomeSecureV1;',scope);
 const send=async(method,account,body)=>scope.handler(
  new Request('https://worker.invalid/api/account/home',{method,
   headers:{...(account?{Authorization:'Bearer '+account}:{}),
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})}),
  {SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},{}
 );
 const anon=await send('GET');
 assert.equal(anon.status,401);
 const saved=await send('PUT','account-A',{
  user_id:'account-B',address_text:addr,georef:geo});
 assert.equal(saved.status,200,await saved.text().catch(()=>'')); 
 assert.equal(writes[0].user_id,'account-A');
 const a=await send('GET','account-A');
 assert.equal((await a.json()).home.address_text,addr);
 const b=await send('GET','account-B');
 assert.equal((await b.json()).home,null);
 const invalid=await send('PUT','account-B',{
  address_text:addr,georef:{...geo,lat:300}});
 assert.equal(invalid.status,400);
 assert.equal(writes.length,1);
 const del=await send('DELETE','account-A');
 assert.equal(del.status,200);
 assert.deepEqual(deletes,['account-A']);
 assert.equal((await (await send('GET','account-A')).json()).home,null);
 assert.ok(queries.every(q=>q.includes('user_id=eq.account-')));
});
test('database migration denies direct anon and authenticated table access',()=>{
 const sql=fs.readFileSync('sql/apd_account_home_reference_20261112.sql','utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/REVOKE ALL .* FROM PUBLIC, anon, authenticated/i);
 assert.match(sql,/GRANT SELECT, INSERT, UPDATE, DELETE .* TO service_role/i);
 assert.match(sql,/REFERENCES public\.users\(id\) ON DELETE CASCADE/i);
 assert.doesNotMatch(sql,/CREATE POLICY .* TO authenticated/i);
});

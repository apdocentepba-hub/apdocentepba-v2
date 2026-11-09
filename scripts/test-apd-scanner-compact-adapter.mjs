import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAPDScannerCompactAdapter,projectCurrentAPDHeader}
 from './apd-scanner-compact-adapter.mjs';

const CLOCK=Date.parse('2026-11-09T10:02:00Z');
const stamp='2026-11-09T10:00:00Z';
const scan=()=>({
 scope:'PROVINCIA_FULL',mode:'current_published',status:'finished',
 total_districts:137,districts_completed:137,offers_processed:1865,
 started_at:'2026-11-09T08:00:00Z',
 finished_at:'2026-11-09T09:59:00Z'
});
const raw=(i)=>({
 iddetalle:String(8000+i),idoferta:String(9000+i),
 descdistrito:'AVELLANEDA',estado:'Publicada',
 finoferta:'2026-11-12T07:30:00Z',descnivelmodalidad:'Secundaria',
 descripcioncargo:'PRECEPTOR',descripcionarea:'/PR',escuela:'E.E.S.T. Nº 6',
 turno:i%2===0?'M':'T',jornada:'JS',hsmodulos:'4',
 cursodivision:'1°1°',supl_desde:'2026-11-04',supl_hasta:'2026-11-18',
 email:'private@example.invalid',raw:{other:'secret'}
});
const fixture=(items=[raw(0),raw(1),raw(2),raw(3)],changes={})=>{
 const calls=[];
 let states=0;
 const readScanState=async()=>{states++;return states===2&&changes.stateAfter?changes.stateAfter:scan()};
 const readPage=async ({district,start,rows,pass})=>{
  calls.push({district,start,rows,pass});
  if(changes.failAt===pass+':'+start)throw Error('FAKE_ABC_IO_FAILURE');
  const docs=(pass===2&&changes.secondRows?changes.secondRows:items).slice(start,start+rows);
  if(changes.replace&&changes.replace.pass===pass&&changes.replace.start===start)
   docs.splice(0,docs.length,...changes.replace.docs);
  const total=changes.totalAt?.[pass+':'+start]??items.length;
  if(changes.omitNumFound) return {response:{start,docs}};
  return {response:{numFound:total,start:changes.wrongStart??start,docs}};
 };
 return {calls,readScanState,readPage,states:()=>states};
};
const run=(f,options={})=>createAPDScannerCompactAdapter({
 enabled:true,readPage:f.readPage,readScanState:f.readScanState,
 pageSize:options.pageSize??2,clock:()=>CLOCK
}).capture({district:options.district??'AVELLANEDA',capturedAt:options.capturedAt??stamp});

test('flag OFF rejects before either scanner callback can execute',()=>{
 let calls=0;
 assert.throws(()=>createAPDScannerCompactAdapter({
  readPage:()=>calls++,readScanState:()=>calls++
 }),/disabled/);
 assert.equal(calls,0);
});
test('two complete source passes produce only a candidate, never delivery',async()=>{
 const f=fixture();
 const result=await run(f);
 assert.equal(result.candidateOnly,true);
 assert.equal(result.authorizedForProduction,false);
 assert.equal(result.source,'abc_solr_double_pass_lab');
 assert.equal(result.capture.complete,true);
 assert.equal(result.capture.sourceTotal,4);
 assert.equal(result.capture.fieldCount,14);
 assert.equal(result.capture.rows.length,4);
 assert.equal(result.evidence.pagesPerPass,2);
 assert.deepEqual(f.calls.map(x=>[x.pass,x.start]),[[1,0],[1,2],[2,0],[2,2]]);
 assert.equal(f.states(),2);
 assert.equal(result.capture.rows[0].source_offer_key,'D_8000');
 assert.equal(result.capture.rows[0].turno,'MANANA');
 assert.equal(result.capture.rows[0].curso_division,undefined);
 assert.equal(result.capture.rows[0].cursodivision,'1°1°');
 assert.ok(!JSON.stringify(result).includes('private@example.invalid'));
 assert.ok(!JSON.stringify(result).includes('secret'));
 assert.equal(Object.keys(result.capture.rows[0]).length,14);
});
test('identity and 14-field projection matches scanner snapshot schema',()=>{
 const offer=raw(9);
 const got=projectCurrentAPDHeader(offer,'AVELLANEDA');
 assert.equal(got.source_offer_key,'D_8009');
 assert.equal(got.finoferta,offer.finoferta);
 assert.equal(got.escuela,offer.escuela);
 assert.equal(got.cargo,offer.descripcioncargo);
 assert.equal(got.area,offer.descripcionarea);
 assert.equal(got.nivel_modalidad,offer.descnivelmodalidad);
 assert.equal(got.modulos,undefined);
 assert.equal(got.hsmodulos,'4');
 assert.equal(got.distrito,'AVELLANEDA');
 const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
 const section=worker.split('function buildGlobalSnapshotRow(oferta, capturedAt) {')[1]
  ?.split('async function loadCurrentRowsMap(')[0];
 assert.ok(section,'Worker schema must be inspected and still present');
 for(const field of Object.keys(got)){
  if(field==='source_offer_key')assert.match(section,/buildSourceOfferKeyFromOferta/);
  else assert.ok(section.includes(field+':'),field+' lost from Worker snapshot');
 }
 assert.match(worker,/const pageDocs = Array\.isArray\(data\?\.response\?\.docs\)/);
 assert.ok(worker.includes('async function fetchAPDDistrictBatch('));
});
test('source count drift across pages must fail closed',async()=>{
 const f=fixture(undefined,{totalAt:{'1:2':5}});
 await assert.rejects(()=>run(f),/numFound changed/);
 assert.ok(!f.calls.some(x=>x.pass===2));
});
test('missing numFound or mismatched page start blocks the capture',async()=>{
 await assert.rejects(()=>run(fixture(undefined,{omitNumFound:true})),/numFound/);
 await assert.rejects(()=>run(fixture(undefined,{wrongStart:99})),/numFound/);
});
test('incomplete page or false total never becomes a valid snapshot',async()=>{
 const f=fixture([raw(0),raw(1),raw(2)],{
  replace:{pass:1,start:2,docs:[]}
 });
 await assert.rejects(()=>run(f,{pageSize:2}),/page length/);
 assert.ok(!f.calls.some(x=>x.pass===2));
});
test('duplicated offers across pages fail before second pass',async()=>{
 const data=[raw(0),raw(1),raw(0),raw(3)];
 const f=fixture(data);
 await assert.rejects(()=>run(f),/repeated an offer/);
 assert.ok(!f.calls.some(x=>x.pass===2));
});
test('content drift with stable numFound fails after two passes',async()=>{
 const items=[raw(0),raw(1),raw(2),raw(3)];
 const f=fixture(items,{secondRows:[raw(0),raw(1),{...raw(2),turno:'N'},raw(3)]});
 await assert.rejects(()=>run(f),/contents shifted/);
 assert.equal(f.calls.filter(x=>x.pass===2).length,2);
});
test('change in scan state invalidates otherwise stable source pages',async()=>{
 const f=fixture(undefined,{stateAfter:{...scan(),finished_at:'2026-11-09T10:01:00Z'}});
 await assert.rejects(()=>run(f),/Scanner changed/);
});
test('scanner must be finished and all districts accounted for',async()=>{
 const f=fixture();
 f.readScanState=async()=>({...scan(),districts_completed:136});
 await assert.rejects(()=>run(f),/not complete/);
 assert.equal(f.calls.length,0);
});
test('stale, future, or pre-finish captures are refused before page reads',async()=>{
 for(const time of ['2026-11-09T09:58:00Z','2026-11-09T11:00:00Z',
  '2026-11-08T09:59:00Z']){
  const f=fixture();
  await assert.rejects(()=>run(f,{capturedAt:time}),/Capture is stale/);
  assert.equal(f.calls.length,0);
 }
});
test('malformed or noncanonical district and missing official stable IDs rejected',async()=>{
 await assert.rejects(()=>run(fixture(),{district:'Avellaneda'}),/canonical district/);
 await assert.rejects(()=>run(fixture([{...raw(0),idoferta:'',iddetalle:''}])),
  /missing_stable_official_offer_identifier/);
 await assert.rejects(()=>run(fixture([{...raw(0),descdistrito:'QUILMES'}])),
  /unexpected_district_from_abc/);
});
test('current published scanner cannot manufacture terminal-state cancellation',async()=>{
 await assert.rejects(()=>run(fixture([{...raw(0),estado:'Anulada'}])),
  /non_published_state_in_current_feed/);
});
test('empty official district accepted only with total 0 and empty pages',async()=>{
 const r=await run(fixture([]));
 assert.equal(r.capture.complete,true);
 assert.equal(r.capture.sourceTotal,0);
 assert.equal(r.evidence.pagesPerPass,1);
});
test('reader errors do not return a partial capture',async()=>{
 const f=fixture(undefined,{failAt:'1:2'});
 await assert.rejects(()=>run(f),/FAKE_ABC_IO_FAILURE/);
 assert.ok(!f.calls.some(x=>x.pass===2));
});
test('source adapter has no built-in HTTP, Supabase writes or senders',()=>{
 const source=readFileSync(new URL('./apd-scanner-compact-adapter.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|supabase(?:Select|Upsert|Insert|Request)|service_role|mailgun|sendgrid|whatsapp|telegram|localStorage|resend/i);
 assert.match(source,/enabled=false/);
 assert.match(source,/candidateOnly:true/);
});

/* Real Worker parity lab. Reads the repository's bundled Worker, but only
 * executes a strict allowlist of small pure function declarations in vm.
 * No network calls, no production auth, no Supabase/ABC access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {prepareProjectedGlobalPairsForIsolatedPg17} from './apd-global-projected-content-preflight-lab.mjs';

const workerSource=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
const allowedNames=[
 'norm','sanitizeSolrNumber','sanitizeKeyText','buildSourceOfferKeyFromOferta',
 'mapTurnoAPD','normalizarCursoDivisionServidor','buildGlobalSnapshotRow'
];
const selected=allowedNames.map(name=>{
 const pattern=new RegExp('^function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?^\\}','gm');
 const matches=[...workerSource.matchAll(pattern)];
 assert.equal(matches.length,1,'Expected exactly one real Worker function: '+name);
 return matches[0][0];
});
// The only evaluated source is the seven extracted, pure Worker declarations.
const worker=runInNewContext(
 selected.join('\n')+'\n({'+allowedNames.join(',')+'})',
 Object.create(null),{timeout:2000}
);
function fixture(id,detail,district,turno,curso,rest={}){
 return {
  id,iddetalle:String(detail),idoferta:'ABC_FAKE_'+detail,
  descdistrito:district,estado:'Publicada',
  escuela:'ESCUELA FICTICIA',descripcioncargo:'INFORMATICA',
  descripcionarea:'SISTEMAS',descnivelmodalidad:'TECNICA',
  turno,cursodivision:curso,jornada:'SIMPLE',hsmodulos:'2',
  supl_desde:'2026-11-01',supl_hasta:'2026-11-30',
  finoferta:'2099-12-31',ult_movimiento:'2026-11-03T10:00:00Z',
  observaciones:'PRIVADO@example.com',...rest
 };
}
const docs={
 'LA MATANZA':[
  fixture('SOLR_FAKE_1',9401,'LA MATANZA','M','1°  2°'),
  fixture('SOLR_FAKE_2',9402,'LA MATANZA','T',' 2º   3 º '),
  fixture('SOLR_FAKE_3',9403,'LA MATANZA','TT','1Â°2Â°'),
  fixture('SOLR_FAKE_4',9404,'LA MATANZA','n','1  A ')
 ],
 'SAN MARTIN':[
  fixture('SOLR_FAKE_5',9501,'San Martín','V','3°  4°'),
  fixture('SOLR_FAKE_6',9502,'San Martín','A','5° 1°'),
  fixture('SOLR_FAKE_7',9503,'San Martín','MT','7°'),
  fixture('SOLR_FAKE_8',9504,'San Martín','NOCHE','   '),
 ]
};
const readDistrict=async district=>{
 const rows=structuredClone(docs[district]);
 return {docs:rows,totalBruto:rows.length,totalFiltrado:rows.length};
};
async function gate(){
 return prepareProjectedGlobalPairsForIsolatedPg17({
  districts:Object.keys(docs),readDistrict,
  keyFromOffer:doc=>worker.buildSourceOfferKeyFromOferta(doc)
 });
}
test('all 17 non-raw staged columns match actual Worker snapshot code',async()=>{
 const verified=await gate();
 const comparedFields=[
  'source_offer_key','idoferta','iddetalle','estado','distrito','escuela',
  'cargo','area','nivel_modalidad','turno','jornada','hsmodulos',
  'cursodivision','supl_desde','supl_hasta','finoferta','ult_movimiento'
 ];
 let seen=0;
 for(const [district,rows] of Object.entries(docs)){
  const keys=rows.map(x=>worker.buildSourceOfferKeyFromOferta(x));
  const actual=verified.stagedRowsForIsolatedPg17(district,keys);
  assert.equal(actual.length,rows.length);
  const indexed=new Map(actual.map(row=>[row.source_offer_key,row]));
  for(const source of rows){
   const reference=worker.buildGlobalSnapshotRow(source,'2026-11-03T12:00:00Z');
   const staged=indexed.get(reference.source_offer_key);
   assert.ok(staged,'Missing verified source staging candidate');
   for(const field of comparedFields){
    assert.equal(staged[field],reference[field],'Worker mismatch on '+field);
   }
   // Deliberate privacy divergence: Worker snapshot includes original source
   // in raw. The disposable pilot MUST NOT persist that unfiltered record.
   assert.equal(staged.raw,null);
   assert.equal(Object.hasOwn(staged,'captured_at'),false);
   seen++;
  }
 }
 assert.equal(seen,8);
 assert.equal(verified.summary.source_content_hashes_checked,true);
});
test('turno and curso mapping includes aliases, diacritics and degree symbols',async()=>{
 for(const [value,expected] of [
  ['M','MANANA'],['T','TARDE'],['V','VESPERTINO'],['N','NOCHE'],
  ['MT','MANANA'],['TT','TARDE'],['A','ALTERNADO'],
  ['mañana','MANANA'],['TM','TM'],['desconocido','DESCONOCIDO']
 ]){
  assert.equal(worker.mapTurnoAPD(value),expected);
 }
 const verified=await gate();
 const row=verified.stagedRowsForIsolatedPg17('LA MATANZA',['D_9401'])[0];
 assert.equal(row.turno,worker.mapTurnoAPD('M'));
 assert.equal(row.cursodivision,worker.normalizarCursoDivisionServidor('1°  2°'));
 assert.equal(worker.norm('San Martín'),'SAN MARTIN');
});
test('fail closed on out-of-scope Worker key fallback or altered real source',async()=>{
 const invalid=fixture('SOLR_FAKE_X','', 'LA MATANZA','M','1°');
 invalid.iddetalle='';
 await assert.rejects(()=>prepareProjectedGlobalPairsForIsolatedPg17({
  districts:Object.keys(docs),
  readDistrict:async district=>{
   const result=await readDistrict(district);
   if(district==='LA MATANZA')result.docs.push(invalid);
   result.totalBruto=result.docs.length;result.totalFiltrado=result.docs.length;
   return result;
  },
  keyFromOffer:worker.buildSourceOfferKeyFromOferta
 }),/rejected source identity or status/);
});

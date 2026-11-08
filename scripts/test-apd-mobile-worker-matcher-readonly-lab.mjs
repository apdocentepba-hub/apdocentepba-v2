import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadAPDWorkerMatcherForLab}
 from './apd-mobile-worker-matcher-readonly-lab.mjs';
import {createAbcCurrentOfferVerifierLab}
 from './mobile-push-abc-current-offer-lab.mjs';

const WORKER=readFileSync('worker.js','utf8');
const USER='11111111-1111-4111-8111-111111111111';
const NOW=Date.parse('2026-11-08T10:00:00Z');
const offer=()=>({
 iddetalle:'123',idoferta:'456',id:'solr-999',
 estado:'Publicada',finoferta:'08/11/2026 09:00',
 descdistrito:'AVELLANEDA',descripcioncargo:'PRECEPTOR',
 descripcionarea:'',turno:'M',descnivelmodalidad:'SECUNDARIA'
});
const prefs=()=>({
 user_id:USER,alertas_activas:true,
 distrito_principal_apd:'AVELLANEDA',
 otros_distritos_apd:[],
 cargos_apd:['PRECEPTOR'],materias_apd:[],
 turnos:['MAÑANA'],niveles:['SECUNDARIA']
});
const run=(candidate,preferences)=>loadAPDWorkerMatcherForLab(WORKER)
 .matchWithCurrentPreferences({offer:candidate,preferences}).match;

test('the exact Worker matcher validates all four preferences without copying rules',()=>{
 assert.equal(run(offer(),prefs()),true);
});
for(const [name,override] of [
 ['district',{descdistrito:'QUILMES'}],
 ['cargo',{descripcioncargo:'MAESTRO'}],
 ['shift',{turno:'T'}],
 ['education level',{descnivelmodalidad:'PRIMARIA'}]
]){
 test('actual Worker rejects mismatched '+name,()=>{
  assert.equal(run({...offer(),...override},prefs()),false);
 });
}
test('real Worker turno adapter accepts M and MT and rejects TT for mañana',()=>{
 assert.equal(run({...offer(),turno:'M'},prefs()),true);
 assert.equal(run({...offer(),turno:'MT'},prefs()),true);
 assert.equal(run({...offer(),turno:'TT'},prefs()),false);
});
test("real Worker applies user district and cargos_apd, not ABC flags",()=>{
 const p=prefs();
 p.distrito_principal_apd='QUILMES';
 p.cargos_apd=['PROFESOR'];
 const a=offer();
 a.compatible=true;a.matched_user_id=USER;
 assert.equal(run(a,p),false);
});
test('no source or malformed inputs cannot be treated as matching',()=>{
 assert.throws(()=>loadAPDWorkerMatcherForLab('not worker'),/invalid_worker_source/);
 const code=WORKER.replace('function matchTurno(', 'function removedMatchTurno(');
 assert.throws(()=>loadAPDWorkerMatcherForLab(code),
  /current_worker_matcher_function_missing_or_ambiguous/);
 const bridge=loadAPDWorkerMatcherForLab(WORKER);
 assert.throws(()=>bridge.matchWithCurrentPreferences({
  offer:offer(),preferences:null
 }),/missing_trusted_match_inputs/);
});
test('real APD matcher plugs into the ABC verifier with synthetic current preference rows',async()=>{
 const bridge=loadAPDWorkerMatcherForLab(WORKER);
 const calls={source:0,preferences:0,matcher:0};
 const fetchImpl=async(url,options)=>{
  calls.source++;
  const u=new URL(url);
  assert.equal(u.searchParams.get('q'),'iddetalle:"123"');
  assert.equal(options.method,'GET');
  return new Response(JSON.stringify({
   responseHeader:{status:0},
   response:{numFound:1,docs:[offer()]}
  }),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const p=prefs();
 const verifier=createAbcCurrentOfferVerifierLab({
  fetchImpl,now:()=>NOW,
  preferences:{
   async getForUser({userId}){
    calls.preferences++;
    assert.equal(userId,USER);return p;
   }
  },
  matchWithCurrentPreferences:async input=>{
   calls.matcher++;
   return bridge.matchWithCurrentPreferences(input);
  }
 });
 const accepted=await verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(accepted.compatible,true);
 assert.equal(accepted.currently_available,true);
 assert.deepEqual(calls,{source:1,preferences:1,matcher:1});
 p.cargos_apd=['MAESTRO'];
 const rejected=await verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(rejected.compatible,false);
 assert.equal(rejected.currently_available,true);
 assert.equal(calls.source,2);
});

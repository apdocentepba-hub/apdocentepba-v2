/**
 * LAB-ONLY extraction of APDocentePBA's actual matching functions.
 * Node-only QA. Reads a trusted repo source snapshot, not any user data.
 * No eval is introduced in the real Worker or deployed mobile client.
 *
 * A production integration must statically package those exact source
 * functions (or call the existing server matcher), never dynamically eval.
 */
import vm from 'node:vm';

const REQUIRED=Object.freeze([
 'norm','unique','distritosPrefsAPD','cargosMateriasPrefsAPD',
 'turnosPrefs','categoriasNivel','matchDistritos','matchCargosMaterias',
 'matchTurno','matchNivelModalidad','coincideOfertaConPreferencias',
 'mapTurnoAPD','coincideOfertaConPreferenciasAPD'
]);
function extractFunction(workerSource,name){
 const marker='function '+name+'(';
 const start=workerSource.indexOf(marker);
 if(start<0||workerSource.indexOf(marker,start+marker.length)!==-1)
  throw Error('current_worker_matcher_function_missing_or_ambiguous');
 const end=workerSource.indexOf('\nfunction ',start+marker.length);
 if(end<start||end-start>12000)
  throw Error('current_worker_matcher_function_boundary_invalid');
 return workerSource.slice(start,end);
}
/**
 * Generates Worker-native ESM from the exact Worker matching functions.
 * The output has no Node imports, VM calls or external dependencies.
 * It is for disposable CI fixtures only, NEVER a production entrypoint.
 */
export function extractAPDMatcherWorkerRuntimeLab(workerSource){
 if(typeof workerSource!=='string'||workerSource.length<1000||
    workerSource.length>1_000_000)
  throw Error('invalid_worker_source');
 const pieces=REQUIRED.map(name=>extractFunction(workerSource,name));
 return [
  '// GENERATED from trusted worker.js by CI. NOT FOR DEPLOYMENT.',
  ...pieces,
  'export function matchWithCurrentPreferences({offer,preferences}={}) {',
  ' if(!offer||!preferences)throw Error("missing_match_inputs");',
  ' const result=coincideOfertaConPreferenciasAPD(offer,preferences);',
  ' if(typeof result?.match!=="boolean")throw Error("matcher_result_invalid");',
  ' return {match:result.match};',
  '}',
  ''
 ].join('\\n');
}

/**
 * A test-only function wrapper delegating to the exact Worker matcher.
 * vm isolates its symbols from Node APIs (no fetch, process or secrets).
 */
export function loadAPDWorkerMatcherForLab(workerSource){
 if(typeof workerSource!=='string'||workerSource.length<1000||
    workerSource.length>1_000_000)
  throw Error('invalid_worker_source');
 const functions=REQUIRED.map(name=>extractFunction(workerSource,name));
 const context=vm.createContext(Object.create(null));
 try{
  vm.runInContext(functions.join('\n'),context,{timeout:1000});
 }catch{
  throw Error('current_worker_matcher_cannot_compile');
 }
 if(typeof context.coincideOfertaConPreferenciasAPD!=='function')
  throw Error('current_worker_matcher_unavailable');
 return Object.freeze({
  matchWithCurrentPreferences({offer,preferences}={}){
   if(!offer||typeof offer!=='object'||
      !preferences||typeof preferences!=='object')
    throw Error('missing_trusted_match_inputs');
   let result;
   try{
    result=context.coincideOfertaConPreferenciasAPD(offer,preferences);
   }catch{
    throw Error('current_worker_matcher_failed');
   }
   if(typeof result?.match!=='boolean')
    throw Error('current_worker_matcher_unexpected_result');
   // Intentionally omit user preferences, raw ABC record and explainers.
   return Object.freeze({match:result.match});
  }
 });
}

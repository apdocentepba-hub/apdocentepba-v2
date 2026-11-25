import assert from 'node:assert/strict';
import {persistFreePreferences} from './apd-commercial-persist-preferences.mjs';
export function stageCommercialConcurrentSave(source){
 const m=[...source.matchAll(/^async function handleGuardarPreferencias\(request, env\) \{/gm)];
 assert.equal(m.length,1,'Save anchor changed');
 const start=m[0].index,end=source.indexOf('\n__name(handleGuardarPreferencias,',start);
 assert.ok(end>start,'Missing boundary');
 const old=source.slice(start,end);
 const a='let limpias = sanitizarPreferenciasEntrada(preferencias, resolved.plan);';
 const b='limpias=apdPreserveFreePrefsV1(limpias,saved[0]||null);';
 const pattern=/const rows = await supabaseUpsertReturning\(\n[\s\S]*?\n  \);/g;
 const matches=[...old.matchAll(pattern)];
 assert.equal(matches.length,1,'Storage anchor changed');
 assert.ok(matches[0][0].includes('"user_preferences"')&&matches[0][0].includes('"user_id"'));
 assert.equal(old.split(a).length,2);assert.equal(old.split(b).length,2);
 const fresh=old.replace(a,a+'\n  let apdExpectedFreePrefs;').replace(b,'apdExpectedFreePrefs=saved[0]||null;\n      '+b)
 .replace(matches[0][0],()=> 'let rows;\n  try {\n  '+matches[0][0].replace('const rows = await supabaseUpsertReturning(', 'rows = await (apdExpectedFreePrefs!==undefined ? (env,_table,items)=>apdPersistFreePrefsV1(env,userId,apdExpectedFreePrefs,items[0]) : supabaseUpsertReturning)(')+'\n  } catch(err) { if(apdExpectedFreePrefs!==undefined)return json({ok:false,message:"Tus preferencias cambiaron o no se pudo confirmar el guardado. Actualizá el panel antes de volver a guardar."},409); throw err; }');
 const prefix=persistFreePreferences.toString().replace(/^async function persistFreePreferences\(/,'async function apdPersistFreePrefsV1(')+'\n';
 assert.ok(!source.includes('apdPersistFreePrefsV1'),'Already staged');
 const candidate=prefix+source.replace(old,()=>fresh);
 assert.equal(candidate.slice(prefix.length).replace(fresh,()=>old),source);
 return {candidate,unrelatedBytesPreserved:true,compareAndSave:true,deployable:false};
}

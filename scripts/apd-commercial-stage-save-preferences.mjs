import assert from 'node:assert/strict';
import {preserveFreePreferences} from './apd-commercial-preserve-preferences.mjs';
export function stageCommercialSavePreferences(source){
 const m=[...source.matchAll(/^async function handleGuardarPreferencias\(request, env\) \{/gm)];
 assert.equal(m.length,1,'Preference save anchor changed');
 const start=m[0].index,end=source.indexOf('\n__name(handleGuardarPreferencias,',start);
 assert.ok(end>start,'Missing boundary');
 const old=source.slice(start,end);
 assert.ok(old.endsWith('\n}'),'Invalid boundary');
 const anchor='const limpias = sanitizarPreferenciasEntrada(preferencias, resolved.plan);';
 assert.equal(old.split(anchor).length,2,'Sanitizer anchor changed');
 assert.ok(old.includes('supabaseUpsertReturning')&&old.includes('"user_preferences"'),'Storage anchor changed');
 const fresh=old.replace(anchor,'let limpias = sanitizarPreferenciasEntrada(preferencias, resolved.plan);\n  if (String(resolved?.subscription?.plan_code||"").toUpperCase()==="FREE") {\n    if (!isPlanActivo(resolved)||String(resolved?.plan?.code||"").toUpperCase()!=="FREE") return json({ok:false,message:"Plan sin verificar"},403);\n    try {\n      const saved=await supabaseSelect(env,"user_preferences?user_id=eq."+encodeURIComponent(userId)+"&select=*&limit=2");\n      if(!Array.isArray(saved)||saved.length>1||saved.some(row=>row.user_id!==userId)) throw Error("Preferencias sin verificar");\n      limpias=apdPreserveFreePrefsV1(limpias,saved[0]||null);\n    } catch { return json({ok:false,message:"No se pudieron conservar tus filtros anteriores. Verificá distrito y cargo antes de guardar."},409); }\n  }');
 const prefix=preserveFreePreferences.toString().replace(/^function preserveFreePreferences\(/,'function apdPreserveFreePrefsV1(')+'\n';
 assert.ok(!source.includes('apdPreserveFreePrefsV1'),'Already staged');
 const candidate=prefix+source.replace(old,()=>fresh);
 assert.equal(candidate.slice(prefix.length).replace(fresh,()=>old),source,'Unrelated code changed');
 return {candidate,unrelatedBytesPreserved:true,hiddenPreferencesPreserved:true,transactional:false,deployable:false};
}

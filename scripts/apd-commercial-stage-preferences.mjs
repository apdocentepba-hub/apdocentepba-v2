import assert from 'node:assert/strict';
import {effectiveCommercialPreferences} from './apd-commercial-effective-preferences.mjs';
export function stageCommercialEffectivePreferences(source){
 const startMatches=[...source.matchAll(/^async function construirAlertasParaUsuario\(env, userId\) \{/gm)];
 assert.equal(startMatches.length,1,'Alert builder anchor changed');
 const start=startMatches[0].index,end=source.indexOf('\n__name(construirAlertasParaUsuario,',start);
 assert.ok(end>start,'Alert builder boundary missing');
 const old=source.slice(start,end);
 assert.ok(old.endsWith('\n}'),'Alert builder boundary invalid');
 const anchor='const prefs = await obtenerPreferenciasUsuario(env, userId);';
 assert.equal(old.split(anchor).length,2,'Preference load anchor changed');
 for(const key of ['canonizarPreferenciasConCatalogo(prefs, catalogos)','traerOfertasAPDPorDistritos(prefsCanon)','coincideOfertaConPreferenciasAPD(oferta, prefsCanon)'])assert.ok(old.includes(key),'Alert matching anchor changed');
 const fresh=old.replace(anchor,'const savedCommercialPrefs = await obtenerPreferenciasUsuario(env, userId);\n  const resolvedCommercialPrefs = await resolverPlanUsuario(env, userId);\n  const prefs = apdEffectiveCommercialPrefsV1(savedCommercialPrefs,resolvedCommercialPrefs,isPlanActivo(resolvedCommercialPrefs));');
 const prefix=effectiveCommercialPreferences.toString().replace(/^function effectiveCommercialPreferences\(/,'function apdEffectiveCommercialPrefsV1(')+'\n';
 assert.ok(!source.includes('apdEffectiveCommercialPrefsV1'),'Already staged');
 const candidate=prefix+source.replace(old,()=>fresh);
 assert.equal(candidate.slice(prefix.length).replace(fresh,()=>old),source,'Unrelated bytes changed');
 return {candidate,alertBuilder:true,readOnlyProjection:true,unrelatedBytesPreserved:true,deployable:false};
}

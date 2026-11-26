// Scoped extension of existing account tool gates. Never deploy this candidate directly.
import assert from 'node:assert/strict';
export function stageCommercialTools(source){
 const owners=['handleAccountScheduleSecureV1','handleAccountFavoritesSecureV1','handleAccountDiarySecureV1','hasAccountCareerAccessV1'];
 const declarations=[...source.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\(/gm)];
 const pattern=/isPlanActivo\((p|resolved)\)\s*&&\s*\[\s*['"]INSIGNE['"]\s*,\s*['"]INSIGNE_ANUAL['"]\s*,\s*['"]SIGNATURE['"]\s*,\s*['"]SIGNATURE_ANUAL['"]\s*\]\.includes\(String\(\1\?\.subscription\?\.plan_code\s*\|\|\s*['"]['"]\)\.toUpperCase\(\)\)\s*&&\s*\[\s*['"]ACTIVE['"]\s*,\s*['"]AUTHORIZED['"]\s*,\s*['"]APPROVED['"]\s*\]\.includes\(String\(\1\?\.subscription\?\.status\s*\|\|\s*['"]['"]\)\.toUpperCase\(\)\)/g;
 const matches=[...source.matchAll(pattern)].map(m=>({index:m.index,old:m[0],variable:m[1],owner:declarations.findLast(d=>d.index<=m.index)?.[1]}));
 assert.equal(matches.length,3,'Account entitlement gate count changed');
 assert.ok(matches.every(m=>owners.includes(m.owner)),'Unexpected entitlement location');
 assert.ok(matches.some(m=>m.owner==='handleAccountScheduleSecureV1')&&matches.some(m=>m.owner==='handleAccountFavoritesSecureV1')&&matches.some(m=>['handleAccountDiarySecureV1','hasAccountCareerAccessV1'].includes(m.owner)),'Missing account tool gate');
 let candidate=source;
 const changes=[];
 for(const m of matches.toReversed()){
  // Preserve legacy expression exactly, extend only to the two new full-access codes.
  const fresh='('+m.old+' || apdCommercialNewToolsV1('+m.variable+'))';
  candidate=candidate.slice(0,m.index)+fresh+candidate.slice(m.index+m.old.length);
  changes.push({old:m.old,fresh});
 }
 const pid=/return getPlanCodeValue\(value\)\s*===\s*"INSIGNE";/g;
 const pidMatches=[...candidate.matchAll(pid)];
 assert.equal(pidMatches.length,1,'PID visibility anchor changed');
 assert.equal([...candidate.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\(/gm)].findLast(m=>m.index<=pidMatches[0].index)?.[1],'canShowPidForPlan');
 // The legacy PID helper receives a code, not an entitlement. Preserve this legacy
 // behavior but do not trust a new plan code alone: require a verified resolved object.
 const oldPid=pidMatches[0][0];
 const newPid='return getPlanCodeValue(value) === "INSIGNE" || (typeof value==="object" && apdCommercialNewToolsV1(value));';
 candidate=candidate.replace(oldPid,newPid);
 const prefix='function apdCommercialNewToolsV1(resolved) {\n const code=String(resolved?.subscription?.plan_code||"").trim().toUpperCase();\n return ["COMPLETO","TRIAL_14D"].includes(code)&&apdCommercialCoreV1.completeAccess(resolved,Date.now());\n}\n';
 assert.ok(!source.includes('apdCommercialNewToolsV1'),'Already staged');
 candidate=prefix+candidate;
 let reversed=candidate.slice(prefix.length).replace(newPid,oldPid);
 for(const c of changes)reversed=reversed.replace(c.fresh,c.old);
 assert.equal(reversed,source,'Unrelated source changed');
 return {candidate,accountGates:matches.map(m=>m.owner),pidObjectGate:true,unrelatedBytesPreserved:true,deployable:false};
}

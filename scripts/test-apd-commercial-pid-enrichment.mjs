import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {redactNestedPid,stageCommercialPidEnrichment} from './apd-commercial-stage-pid-enrichment.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const fixture=['async function enrichAlertForRichChannels(env,user,alertItem,resolved=null) {\n let enriched=alertItem;const planCode=resolved.plan.code;\n if (planCode !== "INSIGNE") {\n enriched = stripPidFromPayload(enriched);\n }\n return enriched;\n}\n__name(enrichAlertForRichChannels,"fixture");','function stripPidFromPayload(payload) {\n const p = normalizeOfferPayload(payload || {});\n return {...p,pid_match:false};\n}\n__name(stripPidFromPayload,"fixture");'].join('\n');
test('nested PID redaction preserves unrelated fields and does not mutate input',()=>{const x={cargo:'MAT',pid_match:true,raw:{pid_puntaje_total:12,raw:[{PID_REASON:'private',id:1}]}};assert.deepEqual(redactNestedPid(x),{cargo:'MAT',raw:{raw:[{id:1}]}});assert.equal(x.raw.pid_puntaje_total,12);});
test('rich-channel enrichment uses verified resolved entitlement; free strips nested payload',async()=>{
 const r=stageCommercialPidEnrichment(fixture);verifyTrialCandidateSyntax(r.candidate);assert.equal(r.unrelatedBytesPreserved,true);
 const ctx={__name:()=>{},normalizeOfferPayload:x=>x,canShowPidForPlan:r=>['TRIAL_14D','COMPLETO','INSIGNE'].includes(r.plan.code)&&r.active===true};
 vm.runInNewContext(r.candidate,ctx);
 const payload={cargo:'MAT',pid_match:true,raw:{pid_puntaje_total:12}};
 for(const code of ['TRIAL_14D','COMPLETO','INSIGNE'])assert.equal((await ctx.enrichAlertForRichChannels({},null,payload,{plan:{code},active:true})).raw.pid_puntaje_total,12);
 for(const code of ['FREE','TRIAL_14D','COMPLETO'])assert.equal((await ctx.enrichAlertForRichChannels({},null,payload,{plan:{code},active:false})).raw.pid_puntaje_total,undefined);
 assert.throws(()=>stageCommercialPidEnrichment(fixture.replace('planCode !== "INSIGNE"','true')));
});

import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stageCommercialPidChannels} from './apd-commercial-stage-pid-channels.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const fixture=[
 'function canShowPidForPlan(value) { return getPlanCodeValue(value) === "INSIGNE" || (typeof value==="object" && apdCommercialNewToolsV1(value)); }',
 'function initial(){ canShowPidForPlan(initialEmailPlanCode); applyPidVisibilityToAlerts(\n    alerts,\n    initialEmailPlanCode\n  ); }',
 'function email(){ canShowPidForPlan(emailPlanCode); applyPidVisibilityToAlerts(\n      visibleAlerts,\n      emailPlanCode\n    ); }',
 ...['resolveTelegramEntitlement','resolveWhatsAppEntitlement'].map(n=>'async function '+n+'(env,userId) {\n const resolved = await resolverPlanUsuario(env, userId);\n return {allowed:true};\n}\n__name('+n+',"fixture");'),
 'function telegram(){applyPidVisibilityToAlerts(\n      visibleAlerts,\n      entitlement?.plan_code\n    );}',
 'function whatsapp(){applyPidVisibilityToAlerts(\n            visibleAlerts,\n            entitlement?.plan_code\n          );}'
].join('\n');
test('PID visibility carries server-verified result to all three channel renderers',()=>{const r=stageCommercialPidChannels(fixture);assert.equal(r.channels,3);assert.equal(r.unrelatedBytesPreserved,true);verifyTrialCandidateSyntax(r.candidate);assert.throws(()=>stageCommercialPidChannels(fixture.replace('initialEmailPlanCode\n  );','otherCode\n  );')));});

test('optional redundant email visibility computation is not required but actual rendering must be verified',()=>{
 const r=stageCommercialPidChannels(fixture.replace('canShowPidForPlan(emailPlanCode);',''));
 assert.equal(r.channels,3);assert.match(r.candidate,/applyPidVisibilityToAlerts\(visibleAlerts, resolvedPlanForEmail\)/);
 assert.throws(()=>stageCommercialPidChannels(fixture.replace('emailPlanCode\n    );','unknownCode\n    );')));
});

test('messaging renderer formatting and local variable names may differ, both calls remain mandatory',()=>{
 const compact=fixture.replace('visibleAlerts,\n            entitlement?.plan_code\n          );','storedVisible, entitlement.plan_code);');
 const r=stageCommercialPidChannels(compact);assert.match(r.candidate,/applyPidVisibilityToAlerts\(storedVisible, entitlement \/\* apd_channel_1 \*\/\)/);
 assert.throws(()=>stageCommercialPidChannels(compact.replace('entitlement.plan_code','unknownCode')));
});

test('a serialized or forged bot entitlement cannot unlock PID; expiry rechecked',async()=>{
 let active=true;
 const resolved={plan:{code:'COMPLETO'},subscription:{plan_code:'COMPLETO'}};
 const ctx={__name:()=>{},getPlanCodeValue:v=>typeof v==='string'?v:v?.plan_code||v?.plan?.code||'',apdCommercialNewToolsV1:v=>active&&v===resolved,resolverPlanUsuario:async()=>resolved};
 vm.runInNewContext(stageCommercialPidChannels(fixture).candidate,ctx);
 const actual=await ctx.resolveTelegramEntitlement({},'fixture');
 assert.equal(ctx.canShowPidForPlan(actual),true);
 assert.equal(ctx.canShowPidForPlan({plan_code:'COMPLETO',pid_visible:true}),false);
 assert.equal(ctx.canShowPidForPlan({...actual,plan_code:'COMPLETO'}),false);
 assert.equal(ctx.canShowPidForPlan('COMPLETO'),false);
 active=false;assert.equal(ctx.canShowPidForPlan(actual),false);
});

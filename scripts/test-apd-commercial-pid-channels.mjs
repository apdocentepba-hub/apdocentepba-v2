import test from 'node:test';
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

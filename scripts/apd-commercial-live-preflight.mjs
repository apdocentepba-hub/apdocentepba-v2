// Read-only preflight: no source or binding values leave the runner.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {stageCommercialConcurrentSave} from './apd-commercial-stage-concurrent-save.mjs';
import {stageCommercialSavePreferences} from './apd-commercial-stage-save-preferences.mjs';
import {stageCommercialEffectivePreferences} from './apd-commercial-stage-preferences.mjs';
import {stageCommercialCheckout} from './apd-commercial-stage-checkout.mjs';
import {stageCommercialPayment} from './apd-commercial-stage-payment.mjs';
import {stageCommercialTools} from './apd-commercial-stage-tools.mjs';
import {stageCommercialAccess} from './apd-commercial-stage-access.mjs';
import {stageTrialHelpers,verifyTrialCandidateSyntax,assertObservedFingerprint} from './apd-commercial-stage-trial.mjs';
const worker='ancient-wildflower-cd37';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function activeVersion(deployments){
 const active=(deployments?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 if(active.length!==1||Number(active[0].percentage)!==100||!active[0].version_id)throw Error('Ambiguous active deployment');
 return String(active[0].version_id);
}
export function inspectVersion(details,version,manifest){
 if(details.id&&details.id!==version)throw Error('Version identity mismatch');
 const modules=details.modules||[];
 if(modules.length!==1||!/^[-a-zA-Z0-9_]+\.(?:js|mjs)$/.test(modules[0]?.name||'')||typeof modules[0].content_base64!=='string')throw Error('Unexpected module shape');
 const bytes=Buffer.from(modules[0].content_base64,'base64'),code=bytes.toString('utf8');
 if(bytes.length<100000||bytes.length>3000000)throw Error('Unexpected source size');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(code)||/\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b/.test(code))throw Error('Potential embedded credential');
 const bindings=new Map((details.bindings||[]).map(b=>[b.name+':'+b.type,b]));
 if(bindings.size!==(details.bindings||[]).length)throw Error('Duplicate binding');
 for(const b of manifest.bindings||[]){
  const actual=bindings.get(b.name+':'+b.type);
  if(!actual|| (b.namespace_id&&String(actual.namespace_id||actual.id||'')!==b.namespace_id))throw Error('Binding drift');
 }
 const required=['getSessionUserByBearer','resolverPlanUsuario','handleAccountProfileSecureV1','handleAccountPreferencesSecureV1','scheduled('];
 for(const key of required)if(!code.includes(key))throw Error('Missing required core anchor');
 const identifiers=['TRIAL_7D','INSIGNE','PREMIUM','PLUS','access_active','trial_ends_at','current_period_ends_at','mercadopago_preapproval_id','/account/application-diary','/account/favorites','/account/schedule','/mercadopago/create-checkout-link','handleMercadoPagoWebhook'];
 const counts=Object.fromEntries(identifiers.map(key=>[key,code.split(key).length-1]));
 return {version,module:modules[0].name,bytes:bytes.length,sha256:hash(bytes),binding_count:bindings.size,counts,canonical_match:version===manifest.version_id&&hash(bytes)===manifest.modules?.[0]?.sha256,approved_for_deploy:false};
}
async function main(){
 const token=process.env.CLOUDFLARE_API_TOKEN;
 if(!token)throw Error('Cloudflare token missing');
 const get=async path=>{
  const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Cloudflare GET HTTP '+r.status);
  const j=await r.json();if(j.success!==true)throw Error('Cloudflare GET rejected');return j.result;
 };
 const accounts=await get('/accounts?per_page=50');
 const id=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:'');
 if(!id||!accounts.some(a=>a.id===id))throw Error('Account not verified');
 const root='/accounts/'+encodeURIComponent(id)+'/workers/';
 const route=root+'scripts/'+worker+'/deployments';
 const version=activeVersion(await get(route));
 const details=await get(root+'workers/'+worker+'/versions/'+encodeURIComponent(version)+'?include=modules');
 const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
 if(manifest.worker_name!==worker)throw Error('Wrong repository Worker');
 const report=inspectVersion(details,version,manifest);
 if(activeVersion(await get(route))!==version)throw Error('Active version changed during inspection');
 const bytes=Buffer.from(details.modules[0].content_base64,'base64');
 const observation=JSON.parse(fs.readFileSync('docs/APD_COMMERCIAL_LIVE_OBSERVATION_20261125.json','utf8'));
 assertObservedFingerprint(bytes,report,observation);
 const staged=stageTrialHelpers(bytes.toString('utf8'));
 verifyTrialCandidateSyntax(staged.candidate);
 console.log('APD_COMMERCIAL_TRIAL_STAGE '+JSON.stringify({helpers:staged.helpers,unrelatedBytesPreserved:staged.unrelatedBytesPreserved,syntax:true,executed:false,deployed:false}));
 const accessStage=stageCommercialAccess(staged.candidate);
 verifyTrialCandidateSyntax(accessStage.candidate);
 console.log('APD_COMMERCIAL_ACCESS_STAGE '+JSON.stringify({functions:accessStage.functions,unrelatedBytesPreserved:accessStage.unrelatedBytesPreserved,remainingPlanReferences:accessStage.remainingPlanReferences,syntax:true,deployable:false}));
 const toolsStage=stageCommercialTools(accessStage.candidate);
 verifyTrialCandidateSyntax(toolsStage.candidate);
 console.log('APD_COMMERCIAL_TOOLS_STAGE '+JSON.stringify({accountGates:toolsStage.accountGates,pidObjectGate:toolsStage.pidObjectGate,unrelatedBytesPreserved:toolsStage.unrelatedBytesPreserved,syntax:true,deployable:false}));
 const paymentStage=stageCommercialPayment(toolsStage.candidate);
 verifyTrialCandidateSyntax(paymentStage.candidate);
 console.log('APD_COMMERCIAL_PAYMENT_STAGE '+JSON.stringify({legacyPreserved:paymentStage.legacyPreserved,unrelatedBytesPreserved:paymentStage.unrelatedBytesPreserved,approvalOnly:paymentStage.approvalOnly,syntax:true,deployable:false}));
 const checkoutStage=stageCommercialCheckout(paymentStage.candidate);
 verifyTrialCandidateSyntax(checkoutStage.candidate);
 console.log('APD_COMMERCIAL_CHECKOUT_STAGE '+JSON.stringify({functions:checkoutStage.functions,unrelatedBytesPreserved:checkoutStage.unrelatedBytesPreserved,syntax:true,deployable:false}));
 const preferencesStage=stageCommercialEffectivePreferences(checkoutStage.candidate);
 verifyTrialCandidateSyntax(preferencesStage.candidate);
 console.log('APD_COMMERCIAL_PREFERENCES_STAGE '+JSON.stringify({alertBuilder:preferencesStage.alertBuilder,readOnlyProjection:preferencesStage.readOnlyProjection,unrelatedBytesPreserved:preferencesStage.unrelatedBytesPreserved,syntax:true,deployable:false}));
 const saveStage=stageCommercialSavePreferences(preferencesStage.candidate);
 verifyTrialCandidateSyntax(saveStage.candidate);
 console.log('APD_COMMERCIAL_SAVE_STAGE '+JSON.stringify({hiddenPreferencesPreserved:saveStage.hiddenPreferencesPreserved,unrelatedBytesPreserved:saveStage.unrelatedBytesPreserved,transactional:false,syntax:true,deployable:false}));
 const concurrentStage=stageCommercialConcurrentSave(saveStage.candidate);
 verifyTrialCandidateSyntax(concurrentStage.candidate);
 console.log('APD_COMMERCIAL_CONCURRENT_SAVE_STAGE '+JSON.stringify({compareAndSave:concurrentStage.compareAndSave,unrelatedBytesPreserved:concurrentStage.unrelatedBytesPreserved,syntax:true,deployable:false}));
 // Anonymous GET only. No checkout, registration, cron, or mutation.
 const checks={};
 for(const [endpoint,expected] of [['/api/version',200],['/api/planes',200],['/api/mi-plan',401],['/api/account/profile',401],['/api/account/application-diary',401]]){
  const res=await fetch('https://'+worker+'.apdocentepba.workers.dev'+endpoint,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});
  checks[endpoint]={status:res.status,expected,pass:res.status===expected};
  await res.body?.cancel();
 }
 console.log('APD_COMMERCIAL_LIVE_PREFLIGHT '+JSON.stringify({...report,checks,writes:0,source_exported:false}));
 if(Object.values(checks).some(c=>!c.pass))throw Error('Anonymous contract mismatch');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

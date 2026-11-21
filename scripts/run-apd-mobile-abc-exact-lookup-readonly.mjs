/**
 * One-time public-source diagnostic. Invoked only by isolated GitHub CI.
 * No user ID, offer identity, document, cookies, auth or real user matching.
 * Produces a compact aggregate report and fails explicitly if unverified.
 */
import {auditMobileAbcExactLookupReadOnlyLab}
 from './apd-mobile-abc-exact-lookup-readonly-lab.mjs';

const result=await auditMobileAbcExactLookupReadOnlyLab({
 fetchImpl:fetch,
 timeoutMs:9000
});
console.log(JSON.stringify(result));
if(result.source_contract_verified!==true){
 console.error('::error::ABC exact-key live source contract NOT verified. No application or push changes.');
 process.exitCode=2;
}

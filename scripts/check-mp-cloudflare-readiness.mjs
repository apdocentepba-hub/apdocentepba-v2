// Read-only Cloudflare billing readiness audit. Never output credential contents.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export async function inspectMpReadiness({env, manifest, fetcher}) {
  if (!env.CLOUDFLARE_API_TOKEN) return {ready:false,reason:"cloudflare_token_not_available",verified:false};
  const token=env.CLOUDFLARE_API_TOKEN;
  async function get(path) {
    const response=await fetcher("https://api.cloudflare.com/client/v4"+path,{
      method:"GET",
      headers:{"Authorization":"Bearer "+token},
      signal:AbortSignal.timeout(14000)
    });
    if (!response.ok) throw new Error("Cloudflare metadata read failed: HTTP "+response.status);
    const parsed=await response.json();
    if (parsed?.success!==true) throw new Error("Cloudflare metadata read failed: provider rejected request");
    return parsed.result;
  }
  let accountId=String(env.CLOUDFLARE_ACCOUNT_ID||"").trim();
  if (!accountId) {
    const accounts=await get("/accounts?per_page=50");
    if (!Array.isArray(accounts)||accounts.length!==1) throw new Error("Account selection ambiguous or inaccessible");
    accountId=String(accounts[0].id);
  }
  const worker=String(manifest.worker_name||"").trim();
  const baseline=String(manifest.version_id||"").trim();
  if (!worker||!baseline) throw new Error("Canonical manifest missing worker or version");
  const deployments=await get("/accounts/"+encodeURIComponent(accountId)+"/workers/scripts/"+encodeURIComponent(worker)+"/deployments");
  const current=deployments?.deployments?.[0];
  const versions=(current?.versions||[]).filter(v=>Number(v.percentage)>0);
  if (versions.length!==1||Number(versions[0].percentage)!==100) throw new Error("Live deployment is not a single verified version");
  const liveVersion=String(versions[0].version_id||"");
  if(!liveVersion) throw new Error("Live version missing");
  const detail=await get("/accounts/"+encodeURIComponent(accountId)+"/workers/workers/"+encodeURIComponent(worker)+"/versions/"+encodeURIComponent(liveVersion)+"?include=modules");
  const bindings=new Set((detail?.bindings||[]).map(x=>String(x.name||"")+":"+String(x.type||"")));
  const baselineMatch=liveVersion===baseline;
  const signatureReady=bindings.has("MERCADOPAGO_WEBHOOK_SECRET:secret_text");
  const webhookConfigured=bindings.has("MERCADOPAGO_WEBHOOK_URL:plain_text")||bindings.has("MERCADOPAGO_WEBHOOK_URL:secret_text");
  const providerToken=bindings.has("MERCADOPAGO_ACCESS_TOKEN:secret_text");
  return {
    verified:true,ready:baselineMatch&&signatureReady&&webhookConfigured&&providerToken,
    liveMatchesCanonical:baselineMatch,
    signatureSecretBound:signatureReady,
    webhookUrlBound:webhookConfigured,
    providerTokenBound:providerToken
  };
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const manifest=JSON.parse(fs.readFileSync("worker-live/manifest.json","utf8"));
  try {
    const result=await inspectMpReadiness({env:process.env,manifest,fetcher:fetch});
    // No account IDs, token values, URLs, secrets, headers, or response bodies in output.
    console.log("MP Cloudflare readiness audit (read-only):");
    for (const [field,value] of Object.entries(result)) console.log(field+": "+String(value));
    if (!result.ready) console.log("Not ready for signed-webhook production release. Existing Worker unchanged.");
    if (!result.verified) process.exitCode=2;
  } catch(e) {
    console.error("Cloudflare metadata audit incomplete: "+String(e.message||e));
    process.exitCode=2;
  }
}

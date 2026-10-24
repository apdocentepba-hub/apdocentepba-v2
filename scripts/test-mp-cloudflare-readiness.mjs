import test from "node:test";
import assert from "node:assert/strict";
import { inspectMpReadiness } from "./check-mp-cloudflare-readiness.mjs";

const base={worker_name:"synthetic-worker",version_id:"baseline-version"};
function mock({live="baseline-version",withSecret=false,withWebhook=true}={}) {
  const calls=[];
  const fetcher=async (url,options)=>{
    assert.equal(options.method,"GET","preflight is read-only");
    assert.ok(url.startsWith("https://api.cloudflare.com/client/v4/"));
    calls.push(url);
    const resource=url.includes("/deployments")?
      {deployments:[{versions:[{percentage:100,version_id:live}]}]}:
      {bindings:[
        {name:"MERCADOPAGO_ACCESS_TOKEN",type:"secret_text"},
        ...(withWebhook?[{name:"MERCADOPAGO_WEBHOOK_URL",type:"plain_text"}]:[]),
        ...(withSecret?[{name:"MERCADOPAGO_WEBHOOK_SECRET",type:"secret_text"}]:[])
      ]};
    return {ok:true,json:async()=>({success:true,result:resource})};
  };
  return {fetcher,calls};
}
const env={CLOUDFLARE_API_TOKEN:"mock-token",CLOUDFLARE_ACCOUNT_ID:"synthetic-account"};

test("missing API credential reports unverified without network calls",async()=>{
 const x=await inspectMpReadiness({env:{},manifest:base,fetcher:async()=>{throw Error("network forbidden")}});
 assert.equal(x.verified,false);assert.equal(x.ready,false);
});
test("signed webhook cannot be deployed until dedicated secret binding exists",async()=>{
 const m=mock();
 const x=await inspectMpReadiness({env,manifest:base,fetcher:m.fetcher});
 assert.equal(x.ready,false);assert.equal(x.signatureSecretBound,false);
 assert.equal(x.liveMatchesCanonical,true);assert.equal(m.calls.length,2);
});
test("binding presence and canonical release match are all required",async()=>{
 const m=mock({withSecret:true});
 const x=await inspectMpReadiness({env,manifest:base,fetcher:m.fetcher});
 assert.equal(x.ready,true);assert.equal(x.signatureSecretBound,true);
});
test("a drifting live release is never claimed ready",async()=>{
 const m=mock({withSecret:true,live:"different-version"});
 const x=await inspectMpReadiness({env,manifest:base,fetcher:m.fetcher});
 assert.equal(x.ready,false);assert.equal(x.liveMatchesCanonical,false);
});
test("missing webhook notification URL binding prevents readiness",async()=>{
 const m=mock({withSecret:true,withWebhook:false});
 const x=await inspectMpReadiness({env,manifest:base,fetcher:m.fetcher});
 assert.equal(x.ready,false);assert.equal(x.webhookUrlBound,false);
});

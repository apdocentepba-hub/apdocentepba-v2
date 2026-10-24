import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { inspectMpReadiness } from "./check-mp-cloudflare-readiness.mjs";

const testModule=Buffer.from("synthetic Worker source only");
const expectedHash=crypto.createHash("sha256").update(testModule).digest("hex");
const base={worker_name:"synthetic-worker",version_id:"baseline-version",
  main_module:"worker_hotfix.js",modules:[{name:"worker_hotfix.js",sha256:expectedHash}]};
function mock({live="baseline-version",withSecret=false,withWebhook=true,withSource=true,changeSource=false,telegramTokenType=null}={}) {
  const calls=[];
  const fetcher=async (url,options)=>{
    assert.equal(options.method,"GET","preflight is read-only");
    assert.ok(url.startsWith("https://api.cloudflare.com/client/v4/"));
    calls.push(url);
    const resource=url.includes("/deployments")?
      {deployments:[{versions:[{percentage:100,version_id:live}]}]}:
      {modules:withSource?[{name:"worker_hotfix.js",content_base64:Buffer.from(changeSource?"modified source":"synthetic Worker source only").toString("base64")}]:[],
       bindings:[
        {name:"MERCADOPAGO_ACCESS_TOKEN",type:"secret_text"},
        ...(withWebhook?[{name:"MERCADOPAGO_WEBHOOK_URL",type:"plain_text"}]:[]),
        ...(withSecret?[{name:"MERCADOPAGO_WEBHOOK_SECRET",type:"secret_text"}]:[]),
        ...(telegramTokenType?[{name:"TELEGRAM_BOT_TOKEN",type:telegramTokenType}]:[])
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
 assert.equal(x.liveWorkerCodeMatchesSnapshot,true);
 assert.equal(x.deployChangedBindingsOnly,true);
});
test("unexpected Worker source is not mistaken for a configuration-only deploy",async()=>{
 const m=mock({withSecret:true,live:"different-version",changeSource:true});
 const x=await inspectMpReadiness({env,manifest:base,fetcher:m.fetcher});
 assert.equal(x.liveWorkerCodeMatchesSnapshot,false);
 assert.equal(x.deployChangedBindingsOnly,false);
});
test("unavailable Worker source is reported as unverified, not equal",async()=>{
 const m=mock({withSecret:true,live:"different-version",withSource:false});
 const x=await inspectMpReadiness({env,manifest:base,fetcher:m.fetcher});
 assert.equal(x.liveWorkerCodeMatchesSnapshot,null);
 assert.equal(x.deployChangedBindingsOnly,false);
});
test("missing webhook notification URL binding prevents readiness",async()=>{
 const m=mock({withSecret:true,withWebhook:false});
 const x=await inspectMpReadiness({env,manifest:base,fetcher:m.fetcher});
 assert.equal(x.ready,false);assert.equal(x.webhookUrlBound,false);
});

test("Telegram token metadata is checked without retrieving the token",async()=>{
  const secret=mock({withSecret:true,telegramTokenType:"secret_text"});
  const safe=await inspectMpReadiness({env,manifest:base,fetcher:secret.fetcher});
  assert.equal(safe.telegramBotTokenSecretBound,true);
  assert.equal(safe.telegramBotTokenPlaintextBound,false);
  assert.equal(secret.calls.length,2);
  const plain=mock({withSecret:true,telegramTokenType:"plain_text"});
  const risky=await inspectMpReadiness({env,manifest:base,fetcher:plain.fetcher});
  assert.equal(risky.telegramBotTokenSecretBound,false);
  assert.equal(risky.telegramBotTokenPlaintextBound,true);
  const absent=mock({withSecret:true});
  const unknown=await inspectMpReadiness({env,manifest:base,fetcher:absent.fetcher});
  assert.equal(unknown.telegramBotTokenSecretBound,false);
  assert.equal(unknown.telegramBotTokenPlaintextBound,false);
});

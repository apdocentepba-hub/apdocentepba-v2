import test from "node:test";
import assert from "node:assert/strict";
import {probePublicEntrypoint} from "./probe-apd-public-entrypoint-timing-readonly.mjs";

const html=[
 '<!doctype html><html><head><title>APDocentePBA</title>',
 '<link rel="stylesheet" href="styles.css?v=visual3"></head>',
 '<body><section id="login"></section>',
 '<script src="app_v2.js?v=20"></script>',
 '<script src="auth_session_patch.js?v=3"></script>',
 '</body></html>'
].join("\n");
function fakeFetch(overrides={}){
 const requests=[],state={time:0};
 async function fetchImpl(url,opts){
  requests.push({url,opts});
  state.time+=3;
  const u=new URL(url);
  const isHtml=u.pathname==="/";
  let source=isHtml?html:u.pathname.endsWith(".css")?"body{}":"window.lab=true;";
  if(overrides.html&&isHtml)source=overrides.html;
  if(overrides.assetBody&&!isHtml)source=overrides.assetBody;
  const mime=isHtml?"text/html":u.pathname.endsWith(".css")?"text/css":"application/javascript";
  const status=overrides.status??200;
  if(overrides.redirect)throw Error("redirect prohibited");
  return new Response(source,{status,headers:{"content-type":overrides.mime??mime}});
 }
 return {fetchImpl,requests,now:()=>state.time};
}
test("two full browser-agnostic public probes; exactly eight GETs without credentials",async()=>{
 const f=fakeFetch();
 const result=await probePublicEntrypoint(f);
 assert.equal(result.request_count,8);
 assert.equal(result.user_authentication_used,false);
 assert.equal(result.no_authenticated_alert_endpoint_measured,true);
 assert.equal(result.production_modified,false);
 assert.deepEqual(Object.keys(result.assets),
  ["document","app_v2.js","auth_session_patch.js","styles.css"]);
 assert.ok(result.assets["app_v2.js"].bytes_min>0);
 assert.equal(f.requests.length,8);
 const names=f.requests.map(({url})=>new URL(url).pathname);
 assert.deepEqual(names,[
  "/","/app_v2.js","/auth_session_patch.js","/styles.css",
  "/","/app_v2.js","/auth_session_patch.js","/styles.css"
 ]);
 for(const {url,opts} of f.requests){
  assert.equal(new URL(url).origin,"https://alertasapd.com.ar");
  assert.equal(opts.method,"GET");
  assert.equal(opts.credentials,"omit");
  assert.equal(opts.redirect,"error");
  assert.equal(opts.referrerPolicy,"no-referrer");
  assert.equal(opts.cache,"no-store");
  assert.equal(opts.headers.Authorization,undefined);
  assert.equal(opts.headers.Cookie,undefined);
 }
});
test("HTTP 429, non-HTML and external redirects are errors, never healthy baseline",async()=>{
 for(const c of [{status:429},{mime:"text/plain"},{redirect:true}]){
  await assert.rejects(()=>probePublicEntrypoint(fakeFetch(c)),
    /HTTP 429|Unexpected MIME|Public GET failed/);
 }
});
test("missing, duplicated or externally hosted critical scripts are rejected",async()=>{
 for(const broken of [
  html.replace('app_v2.js?v=20','absent.js?v=20'),
  html.replace('<script src="app_v2.js?v=20"></script>',
   '<script src="app_v2.js?v=20"></script><script src="app_v2.js?v=20"></script>'),
  html.replace('app_v2.js?v=20','https://other.example/app_v2.js?v=20'),
  html.replace('styles.css?v=visual3','/different/styles.css?v=visual3')
 ]){
  await assert.rejects(()=>probePublicEntrypoint(fakeFetch({html:broken})),
   /Critical static asset missing or ambiguous/);
 }
});
test("malformed landing or too-large response fails closed",async()=>{
 const noLogin=html.replace('id="login"','id="not-login"');
 await assert.rejects(()=>probePublicEntrypoint(fakeFetch({html:noLogin})),
  /Public landing markup unrecognized/);
 const f=fakeFetch({assetBody:"X".repeat(1_000_001)});
 await assert.rejects(()=>probePublicEntrypoint(f),/Asset too large/);
});
test("zero or oversized trial counts are not permitted",async()=>{
 for(const trials of [0,1,3,200]){
  await assert.rejects(()=>probePublicEntrypoint({...fakeFetch(),trials}),
   /Exactly two bounded public measurements required/);
 }
});

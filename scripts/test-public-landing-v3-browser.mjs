/* APD landing v3 visual smoke: real Chromium, no credentials or live auth.
 * Captures public home, login and signup at desktop/mobile in CI artifacts.
 */
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
const chromeCmd=["google-chrome","google-chrome-stable","chromium","chromium-browser"]
 .find(x=>spawnSync("which",[x],{stdio:"ignore"}).status===0);
assert.ok(chromeCmd,"Chrome/Chromium not installed in visual CI");
const root=mkdtempSync(path.join(tmpdir(),"apd-public-v3-"));
const output=path.resolve("tmp/public-landing-v3-browser");
mkdirSync(output,{recursive:true});
const chrome=spawn(chromeCmd,[
 "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
 "--disable-background-networking","--no-first-run","--no-default-browser-check",
 "--remote-debugging-port=0","--user-data-dir="+root,"about:blank"
],{stdio:["ignore","ignore","pipe"]});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let socket,number=0;const pending=new Map();
async function debugPort(){
 for(let i=0;i<120;i++){
  const file=path.join(root,"DevToolsActivePort");
  if(existsSync(file))return Number(readFileSync(file,"utf8").split("\n")[0]);
  if(chrome.exitCode!==null)throw Error("Chrome quit prematurely");
  await sleep(100);
 }
 throw Error("Chrome debugging connection timeout");
}
async function cdp(method,params={}){
 const id=++number;
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout: "+method));},12000);
  pending.set(id,{resolve,reject,timeout});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expr){
 const result=await cdp("Runtime.evaluate",{
  expression:expr,returnByValue:true,awaitPromise:true,userGesture:true
 });
 if(result.exceptionDetails)throw Error("Browser JS failed: "+JSON.stringify(result.exceptionDetails));
 return result.result.value;
}
async function screenshot(name){
 const shot=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,fromSurface:true});
 writeFileSync(path.join(output,name+".png"),Buffer.from(shot.data,"base64"));
}
async function waitLoaded(){
 for(let i=0;i<80;i++){
  if(await evaluate('document.readyState==="complete"'))return;
  await sleep(100);
 }
 throw Error("Index.html load timeout");
}
const seen=[];
try{
 const port=await debugPort();
 const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 const page=targets.find(x=>x.type==="page");
 assert.ok(page,"No Chrome page target");
 socket=new WebSocket(page.webSocketDebuggerUrl);
 socket.addEventListener("message",event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id)return;
  const p=pending.get(msg.id);
  if(!p)return;
  pending.delete(msg.id);clearTimeout(p.timeout);
  if(msg.error)p.reject(Error(JSON.stringify(msg.error)));
  else p.resolve(msg.result||{});
 });
 await new Promise((resolve,reject)=>{
  socket.addEventListener("open",resolve,{once:true});
  socket.addEventListener("error",reject,{once:true});
 });
 await cdp("Page.enable");await cdp("Runtime.enable");
 for(const width of [1440,390]){
  await cdp("Emulation.setDeviceMetricsOverride",{
   width,height:900,deviceScaleFactor:1,mobile:width<600
  });
  await cdp("Page.navigate",{url:pathToFileURL(path.resolve("index.html")).href});
  await waitLoaded();await sleep(1200);
  // Production app defaults to login when no session is present. Verify it,
  // then explicitly visit the public home section for a separate screenshot.
  const initial=await evaluate(`({
   homeVisible:!document.getElementById("inicio").classList.contains("hidden"),
   loginVisible:!document.getElementById("login").classList.contains("hidden"),
   panelHidden:document.getElementById("panel-docente").classList.contains("hidden"),
   privateNavHidden:getComputedStyle(document.getElementById("navPrivado")).display==="none",
   oldTabsHidden:[...document.querySelectorAll(".apd-top-tabs")]
      .every(n=>getComputedStyle(n).display==="none")
  })`);
  assert.ok(initial.panelHidden,"Private panel exposed without session");
  assert.ok(initial.privateNavHidden && initial.oldTabsHidden,
    "Private header actions should be hidden on public screens: "+JSON.stringify(initial));
  assert.ok(initial.homeVisible||initial.loginVisible,
   "No public view visible on first load");
  await evaluate("mostrarSeccion('inicio');true");
  const first=await evaluate(`({
   homeVisible:!document.getElementById("inicio").classList.contains("hidden"),
   loginHidden:document.getElementById("login").classList.contains("hidden"),
   signupHidden:document.getElementById("registro").classList.contains("hidden"),
   panelHidden:document.getElementById("panel-docente").classList.contains("hidden"),
   headline:document.getElementById("apd-public-title").textContent.trim(),
   previewVisible:getComputedStyle(document.querySelector(".apd-v3-preview")).display!=="none",
   background:getComputedStyle(document.querySelector(".apd-v3-hero")).backgroundImage,
   overflow:document.documentElement.scrollWidth,
   viewport:window.innerWidth,
   heroWidth:document.querySelector(".apd-v3-hero").getBoundingClientRect().width,
   titleBreakVisible:getComputedStyle(document.querySelector(".apd-v3-title br")).display!=="none",
   previewX:document.querySelector(".apd-v3-visual").getBoundingClientRect().x,
   copyRight:document.querySelector(".apd-v3-copy").getBoundingClientRect().right,
   previewY:document.querySelector(".apd-v3-visual").getBoundingClientRect().y,
   copyBottom:document.querySelector(".apd-v3-copy").getBoundingClientRect().bottom,
   mobileMenuVisible:getComputedStyle(document.querySelector(".apd-v3-mobile-menu")).display!=="none"
  })`);
  assert.ok(first.homeVisible&&first.loginHidden&&first.signupHidden&&first.panelHidden,
   "Homepage/session visibility regression: "+JSON.stringify(first));
  assert.ok(first.previewVisible);
  assert.match(first.background,/gradient/);
  assert.match(first.headline,/Menos tiempo buscando/);
  assert.ok(first.titleBreakVisible,"Headline line break overridden by legacy CSS");
  if(width===1440){
   assert.ok(first.previewX>first.copyRight-8,
    "Desktop preview must appear in right column: "+JSON.stringify(first));
   assert.equal(first.mobileMenuVisible,false);
  }else{
   assert.ok(first.previewY>=first.copyBottom-8,
    "Mobile preview must stack below the headline: "+JSON.stringify(first));
   assert.equal(first.mobileMenuVisible,true);
  }
  assert.ok(first.overflow<=first.viewport+4,"Horizontal overflow on home "+width+": "+JSON.stringify(first));
  await screenshot("home-"+width);
  const login=await evaluate(`(()=>{
   document.querySelector("#inicio .apd-v3-cta").click();
   return {
    visible:!document.getElementById("login").classList.contains("hidden"),
    homeHidden:document.getElementById("inicio").classList.contains("hidden"),
    inputs:!!document.getElementById("login-email")&&!!document.getElementById("login-password"),
    google:!!document.getElementById("google-btn-login"),
    overflow:document.documentElement.scrollWidth,viewport:window.innerWidth,
    asideWidth:document.querySelector("#login .apd-v3-auth-aside").getBoundingClientRect().width,
    privateNavHidden:getComputedStyle(document.getElementById("navPrivado")).display==="none",
    themeBottom:document.querySelector(".apd-theme-toggle")?.getBoundingClientRect().bottom??0,
    passwordTop:document.getElementById("login-password").getBoundingClientRect().top
   }
  })()`);
  assert.ok(login.visible&&login.homeHidden&&login.inputs&&login.google,
   "Login navigation/controls broken "+JSON.stringify(login));
  assert.ok(login.overflow<=login.viewport+4,"Login overflow "+width);
  assert.ok(login.asideWidth>150,"Login aside collapsed");
  assert.ok(login.privateNavHidden,"Private nav visible in login");
  if(width===390)assert.ok(login.themeBottom<login.passwordTop,"Mobile theme toggle overlays login password field");
  const toggleLogin=await evaluate(`(()=>{
   const input=document.getElementById("login-password");
   const button=document.querySelector('[data-target="login-password"].pw-toggle');
   const keyboardReachable=button.tabIndex>=0;
   button.focus();
   const focusable=document.activeElement===button;
   button.click();
   const revealed=input.type==="text";
   button.click();
   return {keyboardReachable,focusable,revealed,remasked:input.type==="password",
     accessibleName:button.getAttribute("aria-label"),
     controls:button.getAttribute("aria-controls"),
     initPwTogglesType:typeof initPwToggles,
     appLoaded:typeof loginPassword,
     catalogPreloadType:typeof cargarCatalogoDistritosAutocomplete,
     documentReady:document.readyState};
  })()`);
  assert.ok(toggleLogin.keyboardReachable&&toggleLogin.focusable&&
    toggleLogin.revealed&&toggleLogin.remasked&&
    toggleLogin.accessibleName==="Mostrar u ocultar contraseña"&&
    toggleLogin.controls==="login-password",
   "Accessible password toggle broken: "+JSON.stringify(toggleLogin));
  await screenshot("login-"+width);
  const signup=await evaluate(`(()=>{
   document.querySelector("#login .form-foot .link-btn").click();
   return {
    visible:!document.getElementById("registro").classList.contains("hidden"),
    hasForm:!!document.getElementById("form-registro"),
    hasConsent:!!document.getElementById("reg-acepta-legal"),
    google:!!document.getElementById("google-btn-registro"),
    overflow:document.documentElement.scrollWidth,viewport:window.innerWidth
   }
  })()`);
  assert.ok(signup.visible&&signup.hasForm&&signup.hasConsent&&signup.google,
   "Registration navigation/controls broken "+JSON.stringify(signup));
  assert.ok(signup.overflow<=signup.viewport+4,"Registration overflow "+width);
  const toggleRegistration=await evaluate(`(()=>{
   const input=document.getElementById("reg-password");
   const button=document.querySelector('[data-target="reg-password"].pw-toggle');
   const keyboardReachable=button.tabIndex>=0;
   button.focus();
   const focusable=document.activeElement===button;
   button.click();
   const revealed=input.type==="text";
   button.click();
   return {keyboardReachable,focusable,revealed,remasked:input.type==="password",
     accessibleName:button.getAttribute("aria-label"),
     controls:button.getAttribute("aria-controls"),
     initPwTogglesType:typeof initPwToggles,
     appLoaded:typeof loginPassword,
     catalogPreloadType:typeof cargarCatalogoDistritosAutocomplete,
     documentReady:document.readyState};
  })()`);
  assert.ok(toggleRegistration.keyboardReachable&&toggleRegistration.focusable&&
    toggleRegistration.revealed&&toggleRegistration.remasked&&
    toggleRegistration.accessibleName==="Mostrar u ocultar contraseña"&&
    toggleRegistration.controls==="reg-password",
   "Accessible password toggle broken: "+JSON.stringify(toggleRegistration));
  await screenshot("registration-"+width);
  const dark=await evaluate(`(()=>{
   document.body.classList.add("apd-dark");
   const x=document.querySelector("#registro .apd-v3-auth-card");
   return {cardBackground:getComputedStyle(x).backgroundColor,
    buttonBackground:getComputedStyle(document.querySelector("#registro .form-actions .btn-primary")).backgroundColor};
  })()`);
  assert.notEqual(dark.cardBackground,"rgb(255, 255, 255)",
   "Registration dark card erroneously white");
  seen.push({width,home:true,login:true,registration:true,layout:true,dark:true});
  await evaluate('document.body.classList.remove("apd-dark")');
 }
 console.log("APD_PUBLIC_V3_BROWSER_PASSED "+JSON.stringify(seen));
}finally{
 for(const p of pending.values()){clearTimeout(p.timeout);p.reject(Error("Chrome shutdown"));}
 pending.clear();
 socket?.close();chrome.kill("SIGTERM");
 await sleep(200);rmSync(root,{recursive:true,force:true});
}

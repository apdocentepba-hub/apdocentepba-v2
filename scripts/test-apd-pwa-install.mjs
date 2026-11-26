import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read = p => fs.readFileSync(new URL("../"+p, import.meta.url));
const js = read("apd-pwa-install.js").toString();
const manifest = JSON.parse(read("apd-app.webmanifest"));
test("manifest fixed online start, standalone and actual PNG dimensions", () => {
  assert.equal(manifest.start_url,"./");
  assert.equal(manifest.scope,"./");
  assert.equal(manifest.display,"standalone");
  for(const n of [192,512]) {
    const entry = manifest.icons.find(x=>x.sizes===n+"x"+n);
    assert.ok(entry);
    const png = read(entry.src);
    assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16),n);
    assert.equal(png.readUInt32BE(20),n);
  }
  assert.match(read("index.html").toString(),/rel="manifest" href="\.\/apd-app\.webmanifest"/);
});
function env(standalone=false) {
  const listeners = {};
  const button={hidden:false,disabled:false,addEventListener:(n,f)=>listeners[n]=f};
  const note={hidden:true,textContent:""};
  const window={matchMedia:()=>({matches:standalone}),addEventListener:(n,f)=>listeners[n]=f};
  const document={getElementById:id=>id==="apd-pwa-install"?button:note};
  vm.runInNewContext(js,{window,document,navigator:{}});
  return {listeners,button,note};
}
test("unsupported browser gets actionable instructions", async()=>{
  const e=env();await e.listeners.click();assert.match(e.note.textContent,/Android.*iPhone/);
});
test("consent prompt used only on explicit click and consumed once",async()=>{
  const e=env();let prevented=0,calls=0;
  e.listeners.beforeinstallprompt({preventDefault:()=>prevented++,prompt:async()=>calls++,userChoice:Promise.resolve({outcome:"dismissed"})});
  assert.equal(calls,0);assert.equal(prevented,1);
  await e.listeners.click();await e.listeners.click();assert.equal(calls,1);
});
test("error is safe and button recovers",async()=>{
  const e=env();e.listeners.beforeinstallprompt({preventDefault(){},prompt:async()=>{throw Error("private");}});
  await e.listeners.click();assert.match(e.note.textContent,/No se pudo/);assert.equal(e.button.disabled,false);assert.ok(!e.note.textContent.includes("private"));
});
test("already installed or install event hides control",()=>{
  assert.equal(env(true).button.hidden,true);const e=env();e.listeners.appinstalled();assert.equal(e.button.hidden,true);
});
test("no service worker registration, offline cache or credentials",()=>{
  assert.doesNotMatch(js,/serviceWorker|caches\.|localStorage|sessionStorage|\bfetch\s*\(|Notification\.requestPermission/);
});

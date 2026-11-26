// Chromium executes the actual checkout patch in a local synthetic panel.
// No production network, user credentials, or payment calls.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const source=fs.readFileSync('plan_checkout_patch.js','utf8');
const html=String.raw`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:8px;font:16px Arial}*{box-sizing:border-box}.panel-card{width:100%;padding:8px}</style></head><body><main id="panel-content"><section id="panel-plan"><div class="plan-stack"><div class="plan-pill-row"><span class="plan-pill">Activo</span><span class="plan-pill">Precio anterior</span></div></div></section><section id="panel-canales"></section></main><pre id="qa-result">PENDING</pre>
<script>
const plans=[{code:'FREE',price_ars:0,max_distritos:1,max_cargos:1},{code:'COMPLETO',price_ars:2000,max_distritos:5,max_cargos:10}];
let catalog={ok:true,commercial_model:'free_complete_v1',trial_days:14,commercial_enrollment_open:true,planes:plans};
let checkoutCalls=0,mode='safe',opened=[];
window.obtenerToken=()=> 'fixture';
window.renderPlanUI=()=>{};
window.open=(url)=>{opened.push(url);return null;};
window.workerFetchJson=async(url,opts)=>{
 if(url==='/api/planes')return catalog;
 if(url==='/api/mercadopago/create-checkout-link'){
  checkoutCalls++;
  if(JSON.stringify(JSON.parse(opts.body))!==JSON.stringify({plan_code:'COMPLETO'}))throw Error('checkout body');
  return {ok:true,checkout_url:mode==='safe'?'https://www.mercadopago.com/mla/checkout/start?pref_id=fixture':'https://evil.invalid/checkout/',message:'<img src=x onerror=alert(1)>'};
 }
 throw Error('unexpected API');
};
</script>
<script src="/patch.js"></script>
<script>
(async()=>{
 const verify=(condition,label)=>{if(!condition)throw Error(label)};
 const settle=()=>new Promise(r=>setTimeout(r,30));
 const info=(code,active=true,source='server')=>({ok:true,access_active:active,plan:{code},subscription:{plan_code:code,status:'ACTIVE',source}});
 const render=async(code,active=true,source='server')=>{window.renderPlanUI(info(code,active,source));await settle();};
 const body=()=>document.getElementById('panel-plan-selector-body');
 const button=()=>body().querySelector('[data-plan-checkout="COMPLETO"]');
 await render('TRIAL_14D');
 verify(body().querySelectorAll('.plan-title').length===2,'two cards');
 verify(body().textContent.includes('$2.000'),'price');
 verify(body().textContent.includes('Telegram por consulta'),'free channel description');
 verify(document.querySelector('[data-apd-commercial-terms]')?.textContent.includes('No hay renovación automática'),'terms retained');
 verify(button(),'trial may buy');
 verify(!body().querySelector('[data-plan-checkout="FREE"]'),'no free checkout');
 verify(document.documentElement.scrollWidth<=innerWidth+1,'viewport overflow');
 button().click();await settle();
 verify(checkoutCalls===1&&opened.length===1,'only one checkout');
 verify(document.querySelector('#plan-selector-msg a')?.hostname==='www.mercadopago.com','fallback link');
 verify(!document.querySelector('#plan-selector-msg img'),'provider text not HTML');
 mode='unsafe';button().click();await settle();verify(opened.length===1,'unsafe URL blocked');
 await render('COMPLETO');verify(!button(),'paid cannot buy again');
 await render('FREE');verify(button(),'free may buy');
 await render('FREE',true,'fallback_frontend');verify(!button(),'unverified cannot buy');
 catalog={...catalog,commercial_enrollment_open:false};await render('FREE');verify(!button(),'paused cannot buy');
 verify(document.querySelector('[data-apd-commercial-terms]')?.textContent.includes('pausadas'),'pause terms');
 catalog={...catalog,trial_days:7};await render('FREE');verify(!button(),'invalid catalog fails closed');
 report('PASS_COMMERCIAL_BROWSER '+innerWidth);
})().catch(e=>report('FAIL_COMMERCIAL_BROWSER '+e.message));
function report(text){document.getElementById('qa-result').textContent=text;if(parent!==window)parent.postMessage(text,location.origin);}
</script></body></html>`;
const server=http.createServer((req,res)=>{
 if(req.url==='/patch.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(source);}
 else if(req.url==='/mobile'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><pre id="qa-result">PENDING</pre><script>addEventListener("message",e=>{if(e.origin===location.origin&&e.source===document.querySelector("iframe").contentWindow&&typeof e.data==="string")document.getElementById("qa-result").textContent=e.data;});</script><iframe src="/" style="width:390px;height:850px;border:0"></iframe>');}
 else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'"});res.end(html);}
 else{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
assert.ok(chrome,'Chromium executable not found');
try{
 for(const width of [390,1280]){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'apd-commercial-chrome-'));
  try{
   const result=await new Promise((resolve,reject)=>{
    const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--window-size='+width+',1000','--force-device-scale-factor=1','--virtual-time-budget=5000','--dump-dom','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port+(width===390?'/mobile':'/')],{stdio:['ignore','pipe','ignore']});
    let out='';child.stdout.on('data',b=>out+=b);const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Chrome timeout'));},30000);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);resolve({out,code});});
   });
   assert.equal(result.code,0);
   const status=result.out.match(/<pre id="qa-result">([^<]+)<\/pre>/)?.[1];
   assert.equal(status,'PASS_COMMERCIAL_BROWSER '+width,'Browser viewport '+width+': '+status);
   console.log('APD_COMMERCIAL_BROWSER '+JSON.stringify({requestedWidth:width,status,productionWrites:0,providerCalls:0}));
  }finally{fs.rmSync(profile,{recursive:true,force:true});}
 }
}finally{await new Promise(resolve=>server.close(resolve));}

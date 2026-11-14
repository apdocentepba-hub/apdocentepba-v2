/**
 * Local-only Chromium QA for the exact card HTML rendered by app_v2.js.
 * No real users, network, backend, third-party locations or credentials.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderOffer} from './test-apd-offer-card-compact.mjs';

const bin=['google-chrome','google-chrome-stable','chromium','chromium-browser']
 .find(name=>spawnSync('which',[name],{stdio:'ignore'}).status===0);
assert.ok(bin,'Chromium browser required for real layout QA');
const tmp=mkdtempSync(path.join(tmpdir(),'apd-card-'));
const output=path.resolve('tmp/apd-offer-card-browser');
mkdirSync(output,{recursive:true});
// Match the real index.html cascade, including style tags injected at
// runtime by legacy UI patch scripts. These formerly escaped visual QA.
const stylesheets=['styles.css','mobile_optimizations.css',
 'mobile_overrides_v2.css','visual_contrast_patch.css',
 'apd_comparador_panel.css','conversion-ux-2026.css',
 'apd_ui_v21.css','public-landing-v3.css'];
const runtimePatches=['frontend_easy_fixes_patch.js',
 'mobile_visual_patch.js','visual_last_patch.js'];
function injectedStyle(path){
 const js=readFileSync(path,'utf8');
 const m=js.match(/s\.textContent\s*=\s*`([\s\S]*?)`;/);
 assert.ok(m,'Legacy patch style injection is missing: '+path);
 assert.doesNotMatch(m[1],/\$\{/,'Expected static CSS only in '+path);
 return m[1];
}
const css=[...stylesheets.map(name=>readFileSync(name,'utf8')),
 ...runtimePatches.map(injectedStyle)].join('\n');
const cases=[
 {name:'desktop-suplencia',width:1366,kind:'Suplencia',dark:false},
 {name:'desktop-provisional',width:1366,kind:'Provisionalidad',dark:false},
 {name:'mobile-suplencia',width:390,kind:'Suplencia',dark:false},
 {name:'mobile-provisional-dark',width:390,kind:'Provisionalidad',dark:true}
];
const records=[];
try{
 for(const option of cases){
  const html=`<!doctype html><html lang="es"><head>
   <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <style>${css}
     body{margin:0;padding:20px;min-height:100vh}
     #panel-alertas{max-width:1200px;margin:0 auto;min-width:0}
   </style></head><body class="${option.dark?'apd-dark':''}">
   <div id="panel-alertas">${renderOffer({revista:option.kind})}</div>
   <pre id="apd-layout-result"></pre>
   <script>window.addEventListener('load',()=>{
    const card=document.querySelector('.alerta-main-card');
    const schedule=document.querySelector('.alerta-row-horarios');
    const school=document.querySelector('.alerta-location-school');
    const district=document.querySelector('.alerta-location-district');
    const tag=document.querySelector('.tag-revista');
    const cs=getComputedStyle(card),ss=getComputedStyle(schedule);
    const data={viewport:innerWidth,cardWidth:card.getBoundingClientRect().width,
      cardRight:card.getBoundingClientRect().right,cardLeft:card.getBoundingClientRect().left,
      pageWidth:document.documentElement.scrollWidth,
      cardColor:cs.borderLeftColor,
      scheduleWidth:schedule.getBoundingClientRect().width,
      scheduleFont:parseFloat(getComputedStyle(schedule.querySelector('.alerta-val')).fontSize),
      schoolFont:parseFloat(getComputedStyle(school.querySelector('.alerta-location-value')).fontSize),
      districtFont:parseFloat(getComputedStyle(district.querySelector('.alerta-location-value')).fontSize),
      tagVisible:!!tag&&tag.getBoundingClientRect().width>0,
      scheduleVisible:!!schedule&&schedule.getBoundingClientRect().height>40,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+3};
    document.getElementById('apd-layout-result').textContent=JSON.stringify(data);
   });</script></body></html>`;
  const file=path.join(tmp,option.name+'.html');writeFileSync(file,html);
  const args=['--headless=new','--no-sandbox','--disable-gpu',
   '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
   '--virtual-time-budget=1800','--window-size='+option.width+',940',
   '--dump-dom',pathToFileURL(file).href];
  const process=spawnSync(bin,args,{encoding:'utf8',timeout:35000,maxBuffer:8*1024*1024});
  assert.equal(process.status,0,option.name+' Chromium error '+String(process.stderr||'').slice(-600));
  const match=process.stdout.match(/<pre id="apd-layout-result">([^<]+)<\/pre>/);
  assert.ok(match,option.name+' missing measured DOM');
  const d=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
  assert.ok(d.cardWidth<=762,option.name+' card too wide '+d.cardWidth);
  assert.ok(d.cardWidth>=250,option.name+' card too narrow '+d.cardWidth);
  assert.equal(d.horizontalOverflow,false,option.name+' horizontal overflow');
  assert.equal(d.tagVisible,true,option.name+' appointment chip missing');
  assert.equal(d.scheduleVisible,true,option.name+' schedule hidden');
  assert.ok(d.scheduleFont>=16,option.name+' schedule typography too small');
  assert.ok(d.schoolFont>=15,option.name+' school typography too small');
  assert.ok(d.districtFont>=15,option.name+' district typography too small');
  records.push({name:option.name,...d});
 }
 assert.notEqual(records[0].cardColor,records[1].cardColor,
  'Suplencia and provisionalidad must have distinct border colours');
 console.log('APD_OFFER_CARD_BROWSER '+JSON.stringify({success:true,records,
  synthetic:true,network:'file_only',style_stack:{
  linked:stylesheets.length,injected:runtimePatches.length
 }}));
}finally{rmSync(tmp,{recursive:true,force:true});}

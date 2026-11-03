import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,statSync} from "node:fs";
import path from "node:path";
import vm from "node:vm";
const root="tmp/apd-integrated-offline-preview";
const html=readFileSync(path.join(root,"index.html"),"utf8");
const js=readFileSync(path.join(root,"apd-offline-preview-bridge.js"),"utf8");
test("preview retains real v3 section IDs and CSS but strips all live application scripts",()=>{
 for(const marker of ['id="inicio"','id="login"','id="registro"',
  'id="panel-docente"','id="form-login"','id="form-registro"',
  "public-landing-v3.css","apd-preview-banner"])
  assert.ok(html.includes(marker),"Missing "+marker);
 const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)]
  .map(m=>m[1]);
 assert.deepEqual(scripts,["apd-offline-preview-bridge.js"]);
 assert.doesNotMatch(html,/<script\b[^>]*>(?!\s*<\/script>)[\s\S]*?<\/script>/i);
 assert.doesNotMatch(html,/\s+on(?:click|load|submit|error)\s*=/i);
 assert.doesNotMatch(html,/<(?:script|link)\b[^>]*(?:https?:)?\/\/(?:accounts\.google|fonts\.google)/i);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/form-action 'none'/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/VISTA DE EJEMPLO/);
});
test("offline package includes all local stylesheets and no production runtime JS",()=>{
 const styles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
  .map(m=>m[0].match(/\bhref=["']([^"']+)["']/i)?.[1]?.split("?")[0]);
 assert.ok(styles.length>=6);
 for(const f of styles){
  assert.match(f,/^[a-z0-9_-]+\.css$/i);
  assert.ok(statSync(path.join(root,f)).size>100);
 }
 const found=readdirSync(root);
 assert.equal(found.some(f=>f==="app_v2.js"),false);
 assert.equal(found.some(f=>f==="worker.js"),false);
 assert.equal(found.some(f=>f.endsWith(".map")),false);
 assert.ok(found.includes("LEEME.txt"));
 const instructions=readFileSync(path.join(root,"LEEME.txt"),"utf8");
 assert.match(instructions,/SIN CONEXION/);
 assert.match(instructions,/NO es un paquete/);
});
test("preview source never sends forms or credentials and navigation switches sections",()=>{
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
 const sections=new Map(["inicio","login","registro","panel-docente"].map(id=>
  [id,{id,hidden:id!=="inicio",classList:{
   toggle(name,state){assert.equal(name,"hidden");sections.get(id).hidden=state;}
  }}]));
 const listeners={};
 const nav=["inicio","login","registro","panel-docente"].map(id=>({
  dataset:{apdPreviewSection:id},listeners:{},
  addEventListener(event,cb){this.listeners[event]=cb;}
 }));
 const nodes=new Map(sections);
 const values={};
 for(const id of ["apd-preview-current","panel-bienvenida","panel-subtitulo",
  "panel-preferencias-resumen","panel-alertas","panel-estadisticas",
  "panel-historial","login-msg","registro-msg"]){
  nodes.set(id,{set textContent(value){values[id]=value;},
   set innerHTML(value){values[id]=value;}});
 }
 const selectors=new Map([
  ["#inicio .apd-v3-cta",null],
  ["#inicio .apd-v3-cta-secondary",null],
  ["#registro .link-btn",null],
  ["#login .link-btn",null]
 ]);
 const doc={
  getElementById:id=>nodes.get(id)||null,
  querySelectorAll:selector=>selector==="[data-apd-preview-section]"?nav:[],
  querySelector:selector=>selectors.get(selector)||null,
  addEventListener:(type,cb,capture)=>{listeners[type]=cb;}
 };
 vm.runInNewContext(js,{document:doc,window:{scrollTo(){}},console},{timeout:1500});
 assert.equal(sections.get("inicio").hidden,false);
 nav[1].listeners.click();
 assert.equal(sections.get("login").hidden,false);
 assert.equal(sections.get("inicio").hidden,true);
 nav[3].listeners.click();
 assert.equal(sections.get("panel-docente").hidden,false);
 assert.match(values["panel-bienvenida"],/sin datos reales/);
 assert.match(values["panel-alertas"],/FICTICIA/);
 let prevented=0,stopped=0;
 listeners.submit({target:{id:"form-login"},preventDefault(){prevented++;},
  stopImmediatePropagation(){stopped++;}});
 assert.equal(prevented,1);assert.equal(stopped,1);
 assert.match(values["login-msg"],/no se envió ningún dato/);
});

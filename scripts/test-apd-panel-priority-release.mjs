import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync("apd_panel_priority_v3.js","utf8");
const html=readFileSync("index.html","utf8");
const tag='<script src="apd_panel_priority_v3.js?v=1"></script>';
test("the candidate loads once after the existing panel bootstrap",()=>{
 assert.equal(html.split(tag).length-1,1);
 assert.ok(html.indexOf(tag)>html.indexOf('<script src="apd_ui_v21.js?v=20261102-clean"></script>'));
 assert.equal(html.split('id="panel-alertas"').length-1,1);
 assert.equal(html.split('id="panel-content"').length-1,1);
});
test("priority script never requests data or reads credentials",()=>{
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|Authorization/i);
 assert.doesNotMatch(source,/\binnerHTML\b|outerHTML|removeChild|replaceChild/);
 assert.match(source,/insertBefore\(alertCard,grid\.firstElementChild\)/);
 assert.match(source,/panel\.appendChild\(aside\)/);
});
function fixture(valid=true){
 const nodes=new Map();
 const make=(name)=>({name,parentElement:null,listeners:[],addEventListener(_name,cb){this.listeners.push(cb);}});
 const alertCard=make("alertCard"),account=make("account"),plan=make("plan");
 const ad1=make("ad1"),ad2=make("ad2"),container=make("container");
 const grid={children:[account,plan,alertCard],
  get firstElementChild(){return this.children[0]},
  insertBefore(node,first){
   assert.equal(first,this.children[0]);
   this.children=this.children.filter(x=>x!==node);
   this.children.unshift(node);
  }};
 for(const card of grid.children)card.parentElement=grid;
 const panel={
  children:[ad1,ad2,container],
  get firstElementChild(){return this.children[0]},
  querySelector(selector){assert.equal(selector,":scope > .container");return container;},
  querySelectorAll(selector){assert.equal(selector,":scope > .apd-safe-side-ad");return valid?[ad1,ad2]:[ad1]},
  insertBefore(node,first){
   assert.equal(first,this.children[0]);
   this.children=this.children.filter(x=>x!==node);
   this.children.unshift(node);
  },
  appendChild(node){this.children=this.children.filter(x=>x!==node);this.children.push(node);}
 };
 for(const child of panel.children)child.parentElement=panel;
 container.querySelector=selector=>selector==="#panel-content"?grid:null;
 const alert={closest:selector=>selector===".panel-card"?alertCard:null};
 nodes.set("panel-docente",panel);nodes.set("panel-alertas",alert);
 const listeners=[];
 const context={
  document:{readyState:"complete",getElementById:id=>nodes.get(id)||null,
   addEventListener(name,handler){listeners.push({name,handler})}},
  window:{}
 };
 vm.runInNewContext(source,context,{timeout:1000});
 return {grid,panel,alertCard,container,ad1,ad2,account,plan,context};
}
test("real DOM nodes move to alert-first order without losing object identity",()=>{
 const f=fixture();
 assert.equal(f.grid.firstElementChild,f.alertCard);
 assert.deepEqual(f.grid.children,[f.alertCard,f.account,f.plan]);
 assert.deepEqual(f.panel.children,[f.container,f.ad1,f.ad2]);
 assert.equal(f.context.window.__APD_PANEL_PRIORITY_V3.apply().ok,true);
 assert.deepEqual(f.panel.children,[f.container,f.ad1,f.ad2],"idempotent");
 assert.deepEqual(f.grid.children,[f.alertCard,f.account,f.plan],"idempotent");
});
test("fails closed if a future panel layout no longer matches expected shape",()=>{
 const f=fixture(false);
 assert.deepEqual(f.grid.children,[f.account,f.plan,f.alertCard]);
 assert.deepEqual(f.panel.children,[f.ad1,f.ad2,f.container]);
 assert.equal(f.context.window.__APD_PANEL_PRIORITY_V3.apply().ok,false);
});

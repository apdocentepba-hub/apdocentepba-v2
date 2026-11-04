import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync("apd_panel_priority_v3.js","utf8");
const html=readFileSync("index.html","utf8");
const tag='<script src="apd_panel_priority_v3.js?v=1"></script>';

test("V3 prioritization loads once after the existing tab shell",()=>{
 assert.equal(html.split(tag).length-1,1);
 assert.ok(html.indexOf(tag)>html.indexOf('<script src="apd_ui_v21.js?v=20261102-clean"></script>'));
 assert.equal(html.split('src="panel_tabs_patch.js').length-1,1);
 assert.equal(html.split('id="panel-alertas"').length-1,1);
});
test("candidate does not read credentials, relocate tabs, or fetch user data",()=>{
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|Authorization/i);
 assert.doesNotMatch(source, /insertBefore\s*\(|appendChild\s*\(\s*(?:alert|aside|card)|replaceChildren|innerHTML|outerHTML|removeChild/i);
 assert.match(source,/#panel-tab-pane-alertas/);
 assert.match(source,/\.panel-card:has\(#panel-alertas\)/);
 assert.match(source,/\[data-top-tab-key="alertas"\]/);
});
function fixture(ready=true){
 const card={id:"alerts-card"};
 const alerts={closest:sel=>sel===".panel-card"?card:null};
 const panel={contains:node=>node===alerts};
 const pane={contains:node=>ready&&node===card};
 const nodes=new Map([["panel-docente",panel],["panel-alertas",alerts]]);
 if(ready)nodes.set("panel-tab-pane-alertas",pane);
 const head={children:[],appendChild(node){this.children.push(node);nodes.set(node.id,node);}};
 const doc={
  readyState:"complete",head,
  getElementById:id=>nodes.get(id)||null,
  createElement:tagName=>{assert.equal(tagName,"style");return {id:"",textContent:""};},
  addEventListener:()=>{throw Error("No DOMContentLoaded handler expected")}
 };
 const window={};
 vm.runInNewContext(source,{document:doc,window},{timeout:1000});
 return {window,doc,head,card,pane,alerts,panel};
}
test("real tabs remain unmodified; a scoped CSS rule loads exactly once",()=>{
 const fixture1=fixture();
 const r=fixture1.window.__APD_PANEL_PRIORITY_V3.apply();
 assert.equal(r.ok,true);assert.equal(r.method,"css_tab_scoped");
 assert.equal(r.tab_ready,true);
 assert.equal(r.stored_tab_selection_untouched,true);
 assert.equal(fixture1.head.children.length,1);
 const style=fixture1.head.children[0];
 assert.equal(style.id,"apd-priority-v3-style");
 assert.match(style.textContent,/order:-10!important/);
 assert.match(style.textContent,/grid-column:1\/-1!important/);
 assert.equal(fixture1.window.__APD_PANEL_PRIORITY_V3.apply().ok,true);
 assert.equal(fixture1.head.children.length,1,"idempotent");
});
test("CSS installed before asynchronous legacy tab initialization remains scoped",()=>{
 const state=fixture(false);
 const r=state.window.__APD_PANEL_PRIORITY_V3.apply();
 assert.equal(r.ok,true);
 assert.equal(r.tab_ready,false);
 assert.ok(state.head.children[0].textContent.includes("#panel-tab-pane-alertas"));
});
test("fails closed without original dashboard and alert anchor",()=>{
 const doc={readyState:"complete",head:{appendChild(){throw Error("unexpected")}},
  getElementById:()=>null,createElement(){throw Error("unexpected")}};
 const window={};
 vm.runInNewContext(source,{document:doc,window},{timeout:1000});
 assert.equal(window.__APD_PANEL_PRIORITY_V3.apply().ok,false);
});

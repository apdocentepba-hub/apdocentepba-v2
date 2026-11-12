import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const src=fs.readFileSync('account_home_reference_patch.js','utf8');

class FakeElement {
 constructor(tagName='div'){
  this.tagName=tagName.toUpperCase();this.style={};this.dataset={};
  this.children=[];this.events=new Map();this.attributes=new Map();
  this.textContent='';this.value='';this.hidden=false;this.isConnected=true;
 }
 append(...children){for(const c of children)this.appendChild(c)}
 appendChild(child){this.children.push(child);child.parent=this;return child}
 replaceChildren(...items){this.children=[];this.append(...items)}
 setAttribute(key,value){this.attributes.set(key,String(value))}
 addEventListener(type,cb){const curr=this.events.get(type)||[];curr.push(cb);this.events.set(type,curr)}
 async fire(type){for(const cb of this.events.get(type)||[])await cb()}
 findAll(predicate){
  const all=[];const visit=node=>{
   for(const child of node.children||[]){
    if(predicate(child))all.push(child);
    visit(child);
   }
  };visit(this);return all;
 }
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 querySelectorAll(selector){
  const simple=selector.trim();
  if(simple.startsWith('#'))return this.findAll(node=>node.id===simple.slice(1));
  if(simple==='[role=status]')return this.findAll(node=>node.attributes?.get('role')==='status');
  if(simple==='input'||simple==='button')return this.findAll(node=>node.tagName===simple.toUpperCase());
  if(simple==='[role=group] button')return this.findAll(node=>node.tagName==='BUTTON'&&node.parent?.attributes?.get('role')==='group');
  throw Error('Fake DOM selector not implemented: '+selector);
 }
 remove(){
  if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);
  this.parent=null;this.isConnected=false;
 }
}
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
function fixture({holdFirstGet=false}={}){
 const box=new FakeElement('div');
 box.id='panel-datos-docente';
 let token='account-a';
 const rows=new Map();
 const calls=[];
 let countGet=0;
 let releaseGet;
 const held=new Promise(res=>{releaseGet=res});
 const fetch=async(url,options)=>{
  assert.equal(url,'https://worker.example.invalid/api/account/home');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.equal(options.headers.Authorization,'Bearer '+token);
  const method=options.method;
  calls.push(method);
  if(method==='GET'){
   countGet++;
   if(holdFirstGet&&countGet===1){
    await held;
    return {ok:true,json:async()=>({ok:true,home:null})};
   }
   return {ok:true,json:async()=>({ok:true,home:rows.get(token)||null})};
  }
  if(method==='PUT'){
   const row=JSON.parse(options.body);
   rows.set(token,row);
   return {ok:true,json:async()=>({ok:true,home:row})};
  }
  if(method==='DELETE'){
   rows.delete(token);
   return {ok:true,json:async()=>({ok:true,home:null})};
  }
  throw Error('Unexpected method '+method);
 };
 const document={
  readyState:'complete',activeElement:null,
  createElement:tag=>new FakeElement(tag),
  createTextNode:txt=>({textContent:String(txt),children:[]}),
  getElementById:id=>id==='panel-datos-docente'?box:null
 };
 let mutation;
 const window={
  API_URL:'https://worker.example.invalid',obtenerAuthBearer:()=>token,
  addEventListener:()=>{},dispatchEvent:()=>{},confirm:()=>true,
  open:()=>{throw Error('No map should open automatically')}
 };
 class FakeMutationObserver{
  constructor(cb){mutation=cb}
  observe(){}
 }
 vm.runInNewContext(src,{
  window,document,fetch,AbortSignal,AbortController,Event,
  MutationObserver:FakeMutationObserver
 });
 return {box,rows,calls,bridge:window.APD_accountHome,
  changeAccount:next=>{token=next;mutation?.()},
  releaseGet:()=>releaseGet?.()};
}
function controls(box){
 const form=box.querySelector('#apd-account-home');
 const input=box.querySelector('#mi-cuenta-domicilio');
 const status=form.querySelector('#apd-account-home-status');
 const buttons=form.querySelectorAll('button');
 return {form,input,status,buttons,
  save:buttons.find(b=>b.textContent==='Guardar domicilio en mi cuenta'),
  erase:buttons.find(b=>b.textContent==='Eliminar domicilio'),
  georef:buttons.find(b=>b.textContent==='Buscar calle y localidad')};
}

test('loaded empty account displays a clear save prompt, never remains preparing forever',async()=>{
 const f=fixture();
 await flush();
 const c=controls(f.box);
 assert.ok(c.input);
 assert.equal(c.status.textContent,
  'Todavía no hay un domicilio guardado. Escribí tu dirección y tocá Guardar.');
 assert.ok(c.georef,'Georef search must be explicitly opt-in');
 assert.deepEqual(f.calls,['GET'],'No address/GPS request until opt-in');
});
test('save waits for authenticated PUT then GET confirmation and reports real state',async()=>{
 const f=fixture();await flush();
 const c=controls(f.box);
 c.input.value='Calle Ficticia 319, Wilde, Buenos Aires';
 await c.input.fire('input');
 assert.match(c.status.textContent,/sin guardar/);
 await c.save.fire('click');
 assert.deepEqual(f.calls,['GET','PUT','GET']);
 assert.equal(f.rows.get('account-a').address_text,c.input.value);
 assert.equal(f.bridge.peek().address_text,c.input.value);
 assert.equal(c.status.textContent,'Domicilio guardado en tu cuenta.');
 assert.equal(c.form.dataset.dirty,undefined);
});
test('new login clears a dirty address from old account even when no address is saved',async()=>{
 const f=fixture();await flush();
 const c=controls(f.box);
 c.input.value='Calle A 333';
 await c.input.fire('input');
 f.changeAccount('account-b');await flush();
 assert.equal(c.input.value,'');
 assert.match(c.status.textContent,/Todavía no hay un domicilio guardado/);
 assert.equal(f.bridge.peek(),null);
});
test('late initial GET cannot erase a later verified save',async()=>{
 const f=fixture({holdFirstGet:true});
 const c=controls(f.box);
 c.input.value='Calle Verificada 456, Wilde';
 await c.input.fire('input');
 await c.save.fire('click');
 assert.equal(f.bridge.peek().address_text,c.input.value);
 f.releaseGet();await flush();
 assert.equal(f.bridge.peek().address_text,c.input.value);
 assert.equal(c.status.textContent,'Domicilio guardado en tu cuenta.');
});
test('delete is acknowledged only after GET confirms absence',async()=>{
 const f=fixture();await flush();
 const c=controls(f.box);
 c.input.value='Calle Temporal 278';
 await c.input.fire('input');await c.save.fire('click');
 await c.erase.fire('click');
 assert.equal(f.rows.size,0);
 assert.equal(c.status.textContent,'Domicilio eliminado de tu cuenta.');
 assert.deepEqual(f.calls,['GET','PUT','GET','DELETE','GET']);
});

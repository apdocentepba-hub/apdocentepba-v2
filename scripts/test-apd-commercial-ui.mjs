import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('plan_checkout_patch.js','utf8');
const extract=(a,b)=>{const start=src.indexOf(a),end=src.indexOf(b,start+a.length);assert.ok(start>=0&&end>start);return src.slice(start,end);};
const bundle=[extract('function normalizePlanCodeSafe(','function canalesBox('),extract('async function obtenerPlanesDisponiblesUI()','function planActualCode('),extract('function planActualCode(','function buildPlanFeatureList('),extract('function buildPlanCards(','function renderSelectorCard(')].join('\n');
const plans=[{code:'FREE',price_ars:0,max_distritos:1,max_cargos:1},{code:'COMPLETO',price_ars:2000,max_distritos:5,max_cargos:10}];
const payload={ok:true,commercial_model:'free_complete_v1',trial_days:14,commercial_enrollment_open:true,planes:plans};
const ctx=data=>vm.runInNewContext(bundle+'\n({obtenerPlanesDisponiblesUI,transitionPolicy,buildPlanCards})',{window:{workerFetchJson:async()=>data}});
const info=(code,active=true,source='server')=>({ok:true,access_active:active,plan:{code},subscription:{plan_code:code,source,status:'ACTIVE'}});
test('only verified exact catalog enables commercial presentation',async()=>{const r=await ctx(payload).obtenerPlanesDisponiblesUI();assert.equal(r.length,2);assert.equal(r[1].commercial_model,'free_complete_v1');for(const data of [{...payload,trial_days:7},{...payload,planes:[...plans,{code:'PLUS'}]},{...payload,planes:[plans[0],{...plans[1],price_ars:1}]},{planes:plans}])await assert.rejects(ctx(data).obtenerPlanesDisponiblesUI());});
test('legacy catalog unchanged',async()=>{const r=await ctx({planes:[{code:'PLUS'},{code:'INSIGNE',public_visible:false}]}).obtenerPlanesDisponiblesUI();assert.equal(r.length,1);assert.equal(r[0].code,'PLUS');});
test('trial and free can buy, unknown and paid cannot; no free checkout',async()=>{const api=ctx(payload),[free,full]=await api.obtenerPlanesDisponiblesUI();for(const code of ['FREE','TRIAL_14D','TRIAL_7D'])assert.equal(api.transitionPolicy(full,info(code)).allowed,true);for(const i of [info('INSIGNE'),info('COMPLETO'),info('FREE',true,'fallback_frontend'),{...info('FREE'),access_active:undefined},{...info('FREE'),subscription:{plan_code:'PLUS'} }])assert.equal(api.transitionPolicy(full,i).allowed,false);assert.equal(api.transitionPolicy(free,info('TRIAL_14D')).allowed,false);});
test('two cards with honest trial and price, no old transition language',async()=>{const api=ctx(payload),p=await api.obtenerPlanesDisponiblesUI();const html=api.buildPlanCards(info('TRIAL_14D'),p);assert.match(html,/14 días de prueba/);assert.match(html,/\$2\.000/);assert.match(html,/data-plan-checkout="COMPLETO"/);assert.doesNotMatch(html,/data-plan-checkout="FREE"|Pagar diferencia|Programar cambio|7 días/);});

test('summary correction is limited to verified new plans',()=>{
 const fn=extract('function normalizeCommercialSummary(','const originalRenderPlanUI');
 const pills=[{textContent:'Activo'},{textContent:'Precio a definir'}];
 const correct=vm.runInNewContext(extract('function normalizePlanCodeSafe(','function canalesBox(')+fn+'\nnormalizeCommercialSummary',{document:{querySelector:()=>({querySelectorAll:()=>pills})}});
 correct(info('TRIAL_14D'));assert.equal(pills[0].textContent,'En prueba');assert.equal(pills[1].textContent,'Gratis');
 pills[0].textContent='Activo';pills[1].textContent='Precio original';
 for(const snapshot of [info('INSIGNE'),info('FREE',false),info('FREE',true,'fallback_frontend'),{...info('FREE'),plan:{code:'COMPLETO'}}])correct(snapshot);
 assert.equal(pills[0].textContent,'Activo');assert.equal(pills[1].textContent,'Precio original');
 correct(info('FREE'));assert.equal(pills[1].textContent,'Gratis');
});

test('paused or unverified commercial admission never displays a purchase action',async()=>{for(const open of [false,undefined]){const api=ctx({...payload,commercial_enrollment_open:open});const plans=await api.obtenerPlanesDisponiblesUI();assert.equal(api.transitionPolicy(plans[1],info('FREE')).allowed,false);assert.doesNotMatch(api.buildPlanCards(info('FREE'),plans),/data-plan-checkout="COMPLETO"/);}});

test('complete checkout navigates same tab after verified response, no popup, one POST',async()=>{
 const url='https://www.mercadopago.com/mla/checkout/start?pref_id=fixture';
 const code=extract('async function iniciarCheckoutPlan(','function openPlanTab(');
 for(const variant of ['ok','blocked','invalid','unverified']){
  const calls=[],nodes=[{children:[],append(...items){this.children.push(...items)}},{children:[],append(...items){this.children.push(...items)}}];
  const errors=[],nav=[];
  const data={ok:variant!=='unverified',checkout_url:variant==='invalid'?'https://evil.invalid/checkout/':url};
  const window={obtenerToken:()=> 'fixture',workerFetchJson:async(path,options)=>{calls.push({path,options});return data;},open:()=>{throw Error('popup must not be attempted');},location:{assign:v=>{nav.push(v);if(variant==='blocked')throw Error('navigation blocked');}}};
  const start=vm.runInNewContext(code+'\niniciarCheckoutPlan',{window,URL,document:{createElement:tag=>({tag})},clearPlanMsg(){},clearSelectorMsg(){},setPlanMsg:(m,t)=>{if(t==='error')errors.push(m)},setSelectorMsg(){},setMsg(){},ensurePlanMsgNode:()=>nodes[0],ensureSelectorMsgNode:()=>nodes[1],console:{error(){}}});
  await start('COMPLETO',null);
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/api/mercadopago/create-checkout-link');
  assert.equal(calls[0].options.body,'{"plan_code":"COMPLETO"}');
  if(variant==='ok'||variant==='blocked'){
   assert.deepEqual(nav,[url]);assert.equal(errors.length,0);
   for(const node of nodes){assert.equal(node.children[1].href,url);assert.equal(node.children[1].target,undefined);}
  }else{assert.equal(nav.length,0);assert.equal(errors.length,1);assert.ok(nodes.every(n=>n.children.length===0));}
 }
});

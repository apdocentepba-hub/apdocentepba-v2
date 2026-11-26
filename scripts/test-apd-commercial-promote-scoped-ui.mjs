import test from 'node:test';
import assert from 'node:assert/strict';
import {OLD,NEXT,promoteScoped,closedCatalog} from './apd-commercial-promote-scoped-ui.mjs';
const catalog={ok:true,commercial_model:'free_complete_v1',trial_days:14,commercial_enrollment_open:false,commercial_checkout_resume:false,planes:[{code:'FREE',price_ars:0,max_distritos:1,max_cargos:1},{code:'COMPLETO',price_ars:2000,max_distritos:5,max_cargos:10}]};
const headers={scoped:true,cache:'private, no-store',vary:'Authorization, Origin'};
test('closed catalog and private cache contract',()=>{
 assert.doesNotThrow(()=>closedCatalog(catalog,headers));
 assert.throws(()=>closedCatalog({...catalog,commercial_checkout_resume:true},headers));
 assert.throws(()=>closedCatalog({...catalog,commercial_enrollment_open:true},headers));
 assert.throws(()=>closedCatalog(catalog,{...headers,cache:'public'}));
 assert.throws(()=>closedCatalog(catalog,{...headers,vary:'Origin'}));
 assert.throws(()=>closedCatalog({...catalog,planes:[...catalog.planes,{code:'PLUS'}]},headers));
});
function fixture({initial=OLD,badDb=false,badPreview=false,badAfter=false}={}){
 let live=initial;const writes=[];
 return {writes,live:()=>live,ops:{active:async()=>live,checkDb:async()=>{if(badDb)throw Error('db');},versions:async()=>{},crons:async()=>{},smoke:async v=>{if(badPreview||(badAfter&&v===NEXT))throw Error('smoke');},deploy:async v=>{writes.push(v);live=v;},log:()=>{}}};
}
test('only exact staged version promoted',async()=>{const f=fixture();await promoteScoped(f.ops);assert.deepEqual(f.writes,[NEXT]);assert.equal(f.live(),NEXT);});
test('bad database or preview refuses all writes',async()=>{for(const o of [{badDb:true},{badPreview:true},{initial:'unknown'}]){const f=fixture(o);await assert.rejects(promoteScoped(f.ops));assert.deepEqual(f.writes,[]);}});
test('failed after promotion rolls back to exact original',async()=>{const f=fixture({badAfter:true});await assert.rejects(promoteScoped(f.ops));assert.deepEqual(f.writes,[NEXT,OLD]);assert.equal(f.live(),OLD);});
test('already promoted is idempotent',async()=>{const f=fixture({initial:NEXT});await promoteScoped(f.ops);assert.deepEqual(f.writes,[]);});

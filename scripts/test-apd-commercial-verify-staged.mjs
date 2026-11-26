import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCatalog,compareBindings,smoke,verifyVersion} from './apd-commercial-verify-staged.mjs';
const catalog={planes:[{code:'INSIGNE',price_ars:8000,max_cargos:10},{code:'PLUS',price_ars:4000}]};
test('unchanged legacy catalog accepted, new plans, altered prices, empty and open rejected',()=>{
 assert.equal(compareCatalog(catalog,{planes:[...catalog.planes].reverse()}),2);
 for(const x of [{planes:[]},{planes:[...catalog.planes,{code:'FREE'}]},{planes:catalog.planes.map(p=>({...p,price_ars:1}))},{...catalog,commercial_enrollment_open:true}])assert.throws(()=>compareCatalog(catalog,x));
});
test('binding and runtime drift rejected',()=>{
 const d={bindings:[{name:'X',type:'kv_namespace',namespace_id:'a'},{name:'Y',type:'plain_text',text:'b'}],compatibility_date:'2026-01-01'};
 compareBindings(d,structuredClone(d));
 for(const x of [{...d,bindings:[]},{...d,bindings:[{...d.bindings[0],namespace_id:'z'},d.bindings[1]]},{...d,compatibility_date:'2026-01-02'}])assert.throws(()=>compareBindings(d,x));
 assert.throws(()=>verifyVersion({id:'bad'},'good','hash',1));
});
test('both origins pass exact eight GET contracts and rejects preview failure',async()=>{
 const get=async (origin,path)=>({status:path==='/api/planes'||path==='/api/version'?200:401,data:catalog});
 assert.deepEqual(await smoke(get),{legacyPlans:2,checks:8});
 await assert.rejects(smoke(async (origin,path)=>origin.includes('762b5116')?{status:500}:get(origin,path)),/HTTP contract/);
});

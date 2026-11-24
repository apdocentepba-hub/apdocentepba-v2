import test from 'node:test';
import assert from 'node:assert/strict';
import {createFavoriteOffers} from './apd-favorite-offers.mjs';
const now=new Date('2026-11-24T12:00:00Z');
const offer={cargo:'Matemática',distrito:'Avellaneda',finoferta:'2026-11-24 14:00:00',estado:'PUBLICADA',pid_puntaje_total:42,postulantes_count:12};
test('favorites deduplicate and retain only minimal public fields',()=>{
 const f=createFavoriteOffers();f.add(offer,'D_1',now);f.add(offer,'D_1',now);
 assert.equal(f.count(),1);const row=f.list(new Set(['D_1']),now)[0];assert.equal(row.status,'soon');assert.equal(row.visible,true);assert.equal('pid_puntaje_total' in row,false);assert.equal('postulantes_count' in row,false);
});
test('absence from visible results is not proof of closure',()=>{
 const f=createFavoriteOffers();f.add(offer,'D_1',now);
 assert.equal(f.list(f.refresh([],x=>x.source_offer_key),now)[0].status,'soon');
 assert.equal(f.list(new Set(),now)[0].visible,false);
});
test('deadline expires without any new offer fetch',()=>{
 const f=createFavoriteOffers();f.add(offer,'D_1',now);
 assert.equal(f.list(new Set(),new Date('2026-11-24T17:00:00Z'))[0].status,'closed');
 assert.throws(()=>f.add(offer,'D_2',new Date('2026-11-24T17:00:00Z')));
});
test('official closure wins even if deadline is future; missing replacement deadline retained',()=>{
 const f=createFavoriteOffers();f.add(offer,'D_1',now);f.refresh([{source_offer_key:'D_1',estado:'CERRADA'}],x=>x.source_offer_key);
 assert.equal(f.list(new Set(),now)[0].status,'closed');
});
test('missing date is not active and reset removes favorites',()=>{
 const f=createFavoriteOffers();f.add({cargo:'Fixture'},'D_1',now);
 assert.equal(f.list(new Set(),now)[0].status,'unknown');f.clear();assert.equal(f.count(),0);
});
test('limit and removal are deterministic',()=>{
 const f=createFavoriteOffers();for(let i=0;i<50;i++)f.add(offer,'D_'+i,now);
 assert.throws(()=>f.add(offer,'D_50',now));assert.equal(f.remove('D_0'),true);f.add(offer,'D_50',now);assert.equal(f.count(),50);
});

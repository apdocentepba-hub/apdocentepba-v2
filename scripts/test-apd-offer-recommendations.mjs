import test from 'node:test';import assert from 'node:assert/strict';
import {recommendOffers} from './apd-offer-recommendations.mjs';
const now=new Date('2026-11-24T12:00:00Z'),profile={jobs:[{school:'Fixture',start:'08:00',end:'09:00',days:[1]}],travelGapMinutes:0};
const offer=(key,over={})=>({source_offer_key:key,cargo:'Matemática',distrito:'AVELLANEDA',turno:'Mañana',estado:'PUBLICADA',finoferta:'2026-11-25T12:00:00Z',pid_compatible:true,dias_horarios:'Martes: 08:00 a 09:00',...over});
test('observed matches first, unknown separate, conflicts last and expired excluded',()=>{
 const r=recommendOffers({now,profile,offers:[offer('x',{dias_horarios:'Lunes: 08:30 a 09:30'}),offer('u',{pid_compatible:undefined}),offer('g'),offer('e',{finoferta:'2026-11-24T08:00:00Z'}),offer('c',{estado:'CERRADA'}),offer('d',{finoferta:''})]});
 assert.deepEqual(r.items.map(x=>[x.source_offer_key,x.group]),[['g','observed'],['u','review'],['d','review'],['x','conflict']]);
 assert.equal(r.excluded.length,2);
});
test('PID mismatch dominates positive indication; afternoon unknown cannot be recommended',()=>{
 const p={jobs:[],moduleSchedule:['T0-2']};
 const r=recommendOffers({now,profile:p,offers:[offer('bad',{pid_verified:true,pid_match:false}),offer('unknown')]});
 assert.deepEqual(r.items.map(x=>x.group),['review','conflict']);
});
test('preferences explicit; no hidden score or fabricated wage/probability',()=>{
 const r=recommendOffers({now,profile,preferredDistricts:['Avellaneda'],preferredTurns:['Mañana'],offers:[offer('a',{distrito:'QUILMES'}),offer('b')]});
 assert.deepEqual(r.items.map(x=>x.group),['observed','review']);assert.equal(r.items[0].source_offer_key,'b');assert.equal(r.items[0].km,null);assert.equal('salary' in r.items[0],false);
});
test('full visible list beyond five; duplicates removed; no mutation',()=>{
 const offers=Array.from({length:23},(_,i)=>offer('D_'+i));offers.push(offers[0]);const before=JSON.stringify(offers);
 assert.equal(recommendOffers({now,profile,offers}).items.length,23);assert.equal(JSON.stringify(offers),before);
});
test('distance sort uses only exact ABC keys and exact home, unknown last',()=>{
 const p={...profile,homeLocation:{lat:-34.66,lon:-58.36,scope:'exacta',source:'GEOREF_AR_V2',label:'Fixture 123, Avellaneda',height:123,reviewed:true}};
 const geo={clave:'0005MS0004',source:'ABC_WFS',exact_key_match:true,lat:-34.67,lon:-58.37};
 const r=recommendOffers({now,profile:p,sort:'distancia',verifiedGeoByKey:{'0005MS0004':geo,'0085MS0043':geo},offers:[offer('a',{escuela:'0085MS0043'}),offer('b',{escuela:'0005MS0004'})]});
 assert.equal(r.items.find(x=>x.source_offer_key==='a').km,null);
 assert.equal(r.items[0].source_offer_key,'b');
 assert.ok(r.items[0].km>0);
 const unverified=recommendOffers({now,profile:{...p,homeLocation:{...p.homeLocation,scope:'partido'}},verifiedGeoByKey:{'0005MS0004':geo},offers:[offer('b',{escuela:'0005MS0004'})]});
 assert.equal(unverified.items[0].km,null);
});

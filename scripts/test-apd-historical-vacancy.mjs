import test from 'node:test';import assert from 'node:assert/strict';
import snapshot from './apd-vacancy-snapshot-20261124.mjs';
import {validateVacancySnapshot,vacancyGroups} from './apd-historical-vacancy.mjs';
test('real aggregate snapshot reconciles unique totals and known outcomes',()=>{
 const d=validateVacancySnapshot(snapshot).rows.filter(x=>x.kind==='district');assert.equal(d.length,6);
 assert.equal(d.reduce((a,x)=>a+x.total,0),9905);assert.equal(d.reduce((a,x)=>a+x.desiertas,0),2332);assert.equal(d.reduce((a,x)=>a+x.designadas,0),6405);
 assert.equal(d.reduce((a,x)=>a+x.other,0),1168);
});
test('denominator excludes other states and distinguishes count from share',()=>{
 const a=vacancyGroups(snapshot),b=vacancyGroups(snapshot,{sort:'share'});
 assert.equal(a[0].district,'GENERAL SAN MARTIN');assert.equal(b[0].district,'PARTIDO DE LA COSTA');
 assert.equal(a[0].share,1012/3302*100);
});
test('district drilldown and accent insensitive cargo search',()=>{
 const a=vacancyGroups(snapshot,{district:'AVELLANEDA',query:'matematica'});
 assert.equal(a.length,2);assert.ok(a.every(x=>x.district==='AVELLANEDA'&&x.kind==='cargo'));
 assert.deepEqual(vacancyGroups(snapshot,{district:'AVELLANEDA',query:'nonexistent'}),[]);
});
test('rejects duplicate, insufficient sample and inconsistent aggregate',()=>{
 const row=snapshot.rows[0];for(const rows of [[...snapshot.rows,row],[{...row,total:1}],[{...row,desiertas:0,designadas:2}],[...snapshot.rows,{...row,cargo:'Extra',total:100000,desiertas:50000,designadas:50000}]])assert.throws(()=>validateVacancySnapshot({...snapshot,rows}));
});
test('published aggregate contains no individual identifiers or raw data',()=>{
 for(const row of snapshot.rows)assert.deepEqual(Object.keys(row).sort(),['cargo','desiertas','designadas','district','kind','total']);
});

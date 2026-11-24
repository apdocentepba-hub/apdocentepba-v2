import test from 'node:test';import assert from 'node:assert/strict';
import {projectPersonalHistory} from './apd-personal-history.mjs';
const now=new Date('2026-11-24T12:00:00Z');
const base={ok:true,empty:false,ventana_dias:30,ofertas_unicas:12,capturas_filtradas:14,ultima_captura:'2026-11-02T08:00:00Z',ultimas_ofertas:[]};
const row=(iddetalle,over={})=>({iddetalle,estado:'PUBLICADA',cargo:'MATEMÁTICA',finoferta:'2026-11-20T10:00:00Z',captured_at:'2026-11-02T08:00:00Z',...over});
test('historical closing and capture never imply active or awarded',()=>{
 const r=projectPersonalHistory({...base,ultimas_ofertas:[row('1'),row('2',{estado:'DESIGNADA'}),row('3',{finoferta:'2026-11-25T10:00:00Z'}),row('4',{finoferta:'sin dato'})]},30,now);
 assert.deepEqual(r.rows.map(x=>x.status),['Vencida según cierre informado','Estado cerrado en captura','Cierre informado futuro; vigencia actual no comprobada','Vigencia no comprobada']);assert.equal(r.total,12);assert.equal(r.partial,true);
});
test('empty and failure distinct, strict window and count',()=>{
 assert.equal(projectPersonalHistory({...base,empty:true,ofertas_unicas:0},30,now).empty,true);
 for(const value of [null,{...base,ok:false},{...base,ventana_dias:7},{...base,ofertas_unicas:null},{...base,empty:true}])assert.throws(()=>projectPersonalHistory(value,30,now));
});
test('bounded output, deduplication and no raw private information',()=>{
 const r=projectPersonalHistory({...base,ultimas_ofertas:[row('1',{raw:{dni:'fixture'},total_postulantes:99}),row('1'),...Array.from({length:8},(_,i)=>row(String(i+2)))]},30,now);
 assert.equal(r.rows.length,5);assert.equal('raw' in r.rows[0],false);assert.equal('total_postulantes' in r.rows[0],false);
});
test('captured date requires timestamp with explicit zone',()=>{
 const r=projectPersonalHistory({...base,ultima_captura:'2026-11-02',ultimas_ofertas:[row('1',{captured_at:'2026-11-02'})]},30,now);
 assert.equal(r.latest,null);assert.equal(r.rows[0].capturedAt,null);
});

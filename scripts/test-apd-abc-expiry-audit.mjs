import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {abcOfferDeadlineAudit,stageAbcExpiryAudit} from './apd-abc-expiry-audit-stage.mjs';
const source=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
const now=Date.parse('2026-11-27T16:30:00Z');
const row=(finoferta,estado='Publicada')=>({finoferta,estado});
test('ABC local clock, exact boundary, offsets and fractional seconds',()=>{
 assert.equal(abcOfferDeadlineAudit(row('2026-11-27T14:00:00Z'),now),true);
 assert.equal(abcOfferDeadlineAudit(row('2026-11-27T13:30:00Z'),now),false);
 assert.equal(abcOfferDeadlineAudit(row('2026-11-27T13:30:00.001Z'),now),true);
 assert.equal(abcOfferDeadlineAudit(row('27/11/2026 14:00'),now),true);
 assert.equal(abcOfferDeadlineAudit(row('2026-11-27T14:00:00+00:00'),now),false);
 assert.equal(abcOfferDeadlineAudit(row('2026-11-27T14:00:00-03:00'),now),true);
});
test('unknown states, conflicting states, malformed and missing dates fail closed',()=>{
 for(const raw of ['',null,'2026-11-27','2026-02-30T14:00:00Z','9999-01-01T14:00:00Z','2026-11-27T24:00:00Z','2026-11-27T14:00:00+15:00','invalid'])assert.equal(abcOfferDeadlineAudit(row(raw),now),false);
 for(const state of ['','Cancelada','Designada','Desierta','Cerrada','Pendiente'])assert.equal(abcOfferDeadlineAudit(row('2026-11-27T14:00:00Z',state),now),false);
 assert.equal(abcOfferDeadlineAudit({...row('2026-11-27T14:00:00Z'),estado_actual:'Cerrada'},now),false);
});
test('real Worker source reproduces early exclusion and unknown date inclusion then candidate fixes both',()=>{
 const extract=(src,name)=>{const at=src.indexOf('function '+name+'('),end=src.indexOf('\n__name('+name+',',at);assert.ok(at>=0&&end>at);return src.slice(at,end);};
 class Clock extends Date{static now(){return now;}}
 const old=vm.createContext({Date:Clock});
 vm.runInContext(['norm2','parseFechaFlexible2','ofertaVigente'].map(n=>extract(source,n)).join('\n'),old);
 assert.equal(old.ofertaVigente(row('2026-11-27T14:00:00Z')),false);
 assert.equal(old.ofertaVigente(row('invalid')),true);
 const r=stageAbcExpiryAudit(source);assert.equal(r.unrelatedBytesPreserved,true);assert.equal(r.deployable,false);
 const c=vm.createContext({Date:Clock});
 vm.runInContext(r.candidate.slice(0,r.candidate.indexOf(source.slice(0,100)))+'\n'+['ofertaVigente','ofertaEsVisibleParaAlerta'].map(n=>extract(r.candidate,n)).join('\n'),c);
 for(const fn of ['ofertaVigente','ofertaEsVisibleParaAlerta']){
  assert.equal(c[fn](row('2026-11-27T14:00:00Z')),true);
  assert.equal(c[fn](row('invalid')),false);
  assert.equal(c[fn](row('2026-11-27T13:30:00Z')),false);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOffers,parseClosure,extractOfferSchedule} from './apd-comparador-criterios.mjs';
import {parseOfferWeeklySegments,checkScheduleOverlap} from './apd-mi-jornada-comparador.mjs';

const now='2026-11-07T20:00:00Z';
const A={
 source_offer_key:'D_100',escuela:'0005MS0004',distrito:'AVELLANEDA',
 cargo:'MATEMÁTICA',turno:'Mañana',finoferta:'08/11/2026 10:00',estado:'PUBLICADA'
};
const B={
 source_offer_key:'D_200',escuela:'0085MT0006',distrito:'QUILMES',
 cargo:'INFORMÁTICA',turno:'Tarde',finoferta:'2026-11-10T12:00:00-03:00',estado:'PUBLICADA'
};
const compare=(offers,settings={})=>compareOffers({offers,now,...settings});

test('compares at most five distinct user-selected offers',()=>{
 assert.throws(()=>compare(Array.from({length:6},(_,i)=>({...A,source_offer_key:'D_'+i}))),/at_most_five/);
 const a=compare([A,B]);
 assert.equal(a.items.length,2);
 assert.equal(a.eligibility_or_appointment_probability,null);
 assert.match(a.disclaimer,/Verificar postulación/);
});
test('orders by verified closing time, not guessed chance',()=>{
 const rows=compare([B,A]);
 assert.deepEqual(rows.items.map(x=>x.source_offer_key),['D_100','D_200']);
 assert.equal(rows.items[0].horas_hasta_cierre,17);
 assert.ok(!Object.hasOwn(rows.items[0],'chance'));
});
test('expired or officially closed offers are excluded',()=>{
 const x=compare([A,{...B,estado:'Anulada'},{
  ...B,source_offer_key:'D_300',estado:'PUBLICADA',finoferta:'07/11/2026 09:00'
 }]);
 assert.deepEqual(x.items.map(v=>v.source_offer_key),['D_100']);
 assert.deepEqual(x.excluded.map(v=>v.reason),['official_status_closed','confirmed_deadline_passed']);
});
test('missing date is not inventively treated as a current deadline',()=>{
 const x=compare([{...A,finoferta:'mañana'}]);
 assert.equal(x.items[0].cierre_ms,null);
 assert.equal(x.items[0].horas_hasta_cierre,null);
 assert.match(x.items[0].explicacion.join(' '),/revisar ABC/);
});
test('invalid calendar dates and ambiguous timestamps fail closed',()=>{
 for(const x of [
  '31/02/2026 10:00','2026-02-31T10:00:00Z',
  '2026-11-07T12:00:00','2026-11-07',
  '2026-11-07T12:00:00+14:30','2026-11-07T25:00:00-03:00',
  '29/02/2026 18:00','2026-11-07T12:00:00+15:00'
 ])assert.equal(parseClosure(x),null,x);
 assert.equal(parseClosure('29/02/2028 12:30'),Date.UTC(2028,1,29,15,30));
});
test('distance only from explicit trusted exact-key WFS record and user-selected reference',()=>{
 const settings={
  sortBy:'distancia',
  referenceLocation:{lat:-34.6900,lon:-58.3300},
  verifiedGeoByKey:{
   '0005MS0004':{source:'ABC_WFS',exact_key_match:true,clave:'0005MS0004',lat:-34.691,lon:-58.333}
  }
 };
 const x=compare([A,B],settings);
 assert.equal(x.items[0].source_offer_key,'D_100');
 assert.ok(x.items[0].distancia_km>0);
 assert.ok(x.items[0].distancia_km<1);
 assert.equal(x.items[1].distancia_km,null);
 assert.match(x.items[0].explicacion.join(' '),/Distancia en línea recta/);
});
test('no user location means no computed distances or location storage',()=>{
 const x=compare([A],{
  verifiedGeoByKey:{'0005MS0004':{source:'ABC_WFS',exact_key_match:true,clave:'0005MS0004',lat:-34.691,lon:-58.333}}
 });
 assert.equal(x.items[0].distancia_km,null);
 assert.equal(JSON.stringify(x).includes('referenceLocation'),false);
});
test('untrusted coordinates and wrong keys never produce distances',()=>{
 for(const geo of [
  {source:'ABC_WFS',exact_key_match:false,clave:'0005MS0004',lat:-34.69,lon:-58.33},
  {source:'GOOGLE',exact_key_match:true,clave:'0005MS0004',lat:-34.69,lon:-58.33},
  {source:'ABC_WFS',exact_key_match:true,clave:'0005MS0005',lat:-34.69,lon:-58.33},
  {source:'ABC_WFS',exact_key_match:true,clave:'0005MS0004',lat:0,lon:0}
 ]){
  const x=compare([A],{
   referenceLocation:{lat:-34.68,lon:-58.33},
   verifiedGeoByKey:{'0005MS0004':geo}
  });
  assert.equal(x.items[0].distancia_km,null);
 }
});
test('PID comparison is informational only when explicitly verified',()=>{
 const x=compare([{...A,pid_match:true,pid_verified:false}]);
 assert.equal(x.items[0].pid_match_verified,null);
 const y=compare([{...A,pid_match:false,pid_verified:true}]);
 assert.equal(y.items[0].pid_match_verified,false);
 assert.match(y.items[0].explicacion.join(' '),/no coincidente/);
});
test('competition unverified is hidden, actual 0 is not replaced by unknown',()=>{
 const x=compare([{...A,postulantes_count:27,competition_verified:false}]);
 assert.equal(x.items[0].postulantes_observados,null);
 const y=compare([{...A,postulantes_count:0,competition_verified:true}]);
 assert.equal(y.items[0].postulantes_observados,0);
});
test('preference order uses only explicit district and turn choices',()=>{
 const x=compare([B,A],{
  sortBy:'preferencias',preferredDistricts:['Avellaneda'],preferredTurns:['Mañana']
 });
 assert.deepEqual(x.items.map(v=>v.source_offer_key),['D_100','D_200']);
 assert.equal(x.items[0].district_preferred,true);
 assert.equal(x.items[0].turn_preferred,true);
});
test('duplicate/invalid identity never shows two cards for one offer',()=>{
 const x=compare([A,A,{...B,source_offer_key:'invalid/key'}]);
 assert.equal(x.items.length,1);
 assert.equal(x.excluded.length,2);
 assert.deepEqual(x.excluded.map(i=>i.reason),['duplicate_key','missing_or_invalid_key']);
});
test('sort by distance leaves unverified destinations after verified ones',()=>{
 const x=compare([A,B],{
  sortBy:'distancia',referenceLocation:{lat:-34.7,lon:-58.35},
  verifiedGeoByKey:{
   '0085MT0006':{source:'ABC_WFS',exact_key_match:true,clave:'0085MT0006',lat:-34.72,lon:-58.32}
  }
 });
 assert.equal(x.items[0].source_offer_key,'D_200');
});
test('all comparisons are non-mutating and carry no applicant credentials',()=>{
 const offers=Object.freeze([Object.freeze({...A,personal_email:'secret@example.com'})]);
 const x=compare(offers);
 assert.equal(x.items[0].personal_email,undefined);
 assert.ok(!JSON.stringify(x).includes('secret@example.com'));
 assert.ok(!JSON.stringify(x).includes('probabilidad'));
});
test('unknown sort and invalid preferences are rejected',()=>{
 assert.throws(()=>compare([A],{sortBy:'probabilidad'}),/unsupported_sort/);
 assert.throws(()=>compare([A],{preferredDistricts:'Avellaneda'}),/invalid_preferences/);
});

test('ABC finoferta ISO/Z is Argentina wall time, not a UTC instant',()=>{
 const raw='2026-11-12T07:30:00Z';
 const localExpected=Date.parse('2026-11-12T07:30:00-03:00');
 assert.equal(parseClosure(raw),Date.parse(raw),'ordinary ISO Z keeps UTC semantics');
 assert.equal(parseClosure(raw,{abcWallTime:true}),localExpected);
 const x=compare([{...A,finoferta:raw,finoferta_label:'12/11/2026 07:30'}],
  {now:'2026-11-12T09:00:00Z'});
 assert.equal(x.items.length,1,'should not discard offer 90 min before 07:30 AR');
 assert.equal(x.items[0].cierre_ms,localExpected);
 assert.equal(x.items[0].horas_hasta_cierre,1.5);
 assert.equal(compare([{...A,finoferta:raw}],{now:'2026-11-12T10:30:01Z'}).items.length,0);
});
test('explicit -03:00 and display-label fallback remain stable',()=>{
 const expected=Date.parse('2026-11-12T07:30:00-03:00');
 assert.equal(compare([{...A,finoferta:'2026-11-12T07:30:00-03:00'}],
  {now:'2026-11-12T08:00:00Z'}).items[0].cierre_ms,expected);
 assert.equal(compare([{...A,finoferta:'',finoferta_label:'12/11/2026 07:30'}],
  {now:'2026-11-12T08:00:00Z'}).items[0].cierre_ms,expected);
});

test('decision facts come from offer fields and session cache without inferring eligibility',()=>{
 const offer={...A,pid_compatible:true,pid_puntaje_total_final:'38,10',
  pid_listado:'oficial',dias_horarios:'Lunes a Viernes: 7:20 a 11:50',
  hsmodulos:'4',revista:'Suplencia',supl_desde:'2026-11-04T00:00:00Z',
  supl_hasta:'2026-11-18T00:00:00Z'};
 const o=compare([offer],{applicantSummaries:{
  D_100:{verified_from_current_card:true,total_postulantes:25,
   puntaje_primero:'42,60',listado_origen_primero:'oficial'}
 }}).items[0];
 assert.equal(o.horario,'Lunes a Viernes: 7:20 a 11:50');
 assert.equal(o.modulos,'4');
 assert.equal(o.revista,'Suplencia');
 assert.equal(o.supl_desde,'04/11/2026');
 assert.equal(o.supl_hasta,'18/11/2026');
 assert.equal(o.pid_compatible_panel,true);
 assert.equal(o.pid_puntaje_panel,38.1);
 assert.equal(o.postulantes_observados,25);
 assert.equal(o.puntaje_primero_observado,42.6);
 assert.equal(o.diferencia_puntaje_comparable,-4.5);
 assert.equal(o.eligibility_or_appointment_probability,undefined);
});
test('unknown or different PID listings do not fabricate point differences',()=>{
 const offer={...A,pid_compatible:true,pid_puntaje_total_final:38.1,pid_listado:'oficial'};
 const absent=compare([offer]).items[0];
 assert.equal(absent.postulantes_observados,null);
 assert.equal(absent.diferencia_puntaje_comparable,null);
 const mismatched=compare([offer],{applicantSummaries:{
  D_100:{verified_from_current_card:true,total_postulantes:5,puntaje_primero:42.6,listado_origen_primero:'108 A'}
 }}).items[0];
 assert.equal(mismatched.postulantes_observados,5);
 assert.equal(mismatched.diferencia_puntaje_comparable,null);
 const unverified=compare([offer],{applicantSummaries:{
  D_100:{verified_from_current_card:false,total_postulantes:100,puntaje_primero:42.6,listado_origen_primero:'oficial'}
 }}).items[0];
 assert.equal(unverified.postulantes_observados,null);
});
test('PID false is descriptive, not a verified ranking or eligibility conclusion',()=>{
 const row=compare([{...A,pid_compatible:false,pid_puntaje_total_final:40,
  pid_listado:'oficial'}],{applicantSummaries:{D_100:{
   verified_from_current_card:true,total_postulantes:0,puntaje_primero:0,
   listado_origen_primero:'oficial'
 }}}).items[0];
 assert.equal(row.pid_compatible_panel,false);
 assert.equal(row.pid_puntaje_panel,null);
 assert.equal(row.postulantes_observados,0);
 assert.equal(row.diferencia_puntaje_comparable,null);
});

test('multi-block schedule survives extraction beyond ordinary 180-character label limit',()=>{
 const week={
  lunes:'07:20 hs a 11:50 hs',martes:'07:20 hs a 11:50 hs',
  miercoles:'14:00 hs a 18:30 hs',jueves:'14:00 hs a 18:30 hs',
  viernes:'08:00 hs a 12:00 hs',sabado:'08:00 hs a 12:00 hs',
  domingo:'08:00 a 12:00'
 };
 const result=compare([{...A,...week}]).items[0].horario;
 assert.ok(result.length>180,'Seven declared weekday blocks require more than 180 chars');
 assert.ok(result.includes('Domingo: 08:00 a 12:00'),'Last weekday cannot be silently discarded');
 assert.equal(parseOfferWeeklySegments(result)?.length,7);
 assert.equal(checkScheduleOverlap(result,{jobs:[{
  school:'Escuela domingo',days:[7],start:'09:00',end:'10:00'
 }]}).status,'overlap');
});
test('explicit ABC schedule takes precedence over fallback weekday fields',()=>{
 const explicit='Lunes: 07:20 a 11:50; Miércoles: 14:00 a 17:30';
 const offer={...A,dias_horarios:explicit,lunes:'08:00 a 15:00'};
 assert.equal(compare([offer]).items[0].horario,explicit);
 const fallback={...A,dias_horarios:'Sin datos',lunes:'07:20 a 11:50'};
 assert.equal(compare([fallback]).items[0].horario,'Lunes: 07:20 a 11:50');
});
test('oversized schedule is rejected as unverified, never truncated into a false complete subset',()=>{
 const giant='Lunes: 08:00 a 12:00; Miércoles: 14:00 a 17:30; '+
  'X'.repeat(900);
 const extracted=extractOfferSchedule({...A,dias_horarios:giant});
 assert.match(extracted,/demasiado extenso/);
 assert.equal(parseOfferWeeklySegments(extracted),null);
 assert.equal(compare([{...A,dias_horarios:giant}]).items[0].horario,extracted);
});
test('prefixed weekday source stays intact rather than getting duplicate day labels',()=>{
 const offer={...A,lunes:'Lunes: 08:00 a 12:00',
  martes:'Martes: 14:00 a 18:00',miercoles:'Miércoles: 09:00 a 12:00'};
 const schedule=extractOfferSchedule(offer);
 assert.equal(schedule,'Lunes: 08:00 a 12:00; Martes: 14:00 a 18:00; Miércoles: 09:00 a 12:00');
 assert.equal(parseOfferWeeklySegments(schedule)?.length,3);
});

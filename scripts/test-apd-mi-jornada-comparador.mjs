import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseOfferWeeklySchedule,parseOfferWeeklySegments,formatWeeklySchedule,schedulesEquivalent,
 sanitizeWorkProfile,checkScheduleOverlap,compareSelectedOfferSchedules
} from './apd-mi-jornada-comparador.mjs';
import {assessComparatorCriterion} from './apd-comparador-datos-evaluacion.mjs';
import {sanitizeHomeLocation,parseGeorefCandidates,lookupHomeAddresses,lookupHomeAddressesDetailed,straightLineHomeSchoolKm,parseHomeAddressQuery} from './apd-home-georef.mjs';
const first='Lunes a viernes: 07:20 a 11:50';
const second='Lunes a Viernes: 7:20 a 11:50';
const hsa='Lunes a Viernes: 7:20HSA 11:50HS';
const jobs=[{school:'Escuela de prueba',days:[1,2,3,4,5],start:'07:20',end:'11:50'}];
test('screenshots: semantically identical ABC horarios are equal despite case and leading zero',()=>{
 assert.deepEqual(parseOfferWeeklySchedule(first),parseOfferWeeklySchedule(second));
 assert.equal(schedulesEquivalent(first,second),true);
 assert.equal(assessComparatorCriterion('Días y horarios',[first,second]).status,'same');
 assert.deepEqual(assessComparatorCriterion('Días y horarios',[first,second]).values,
  ['Lunes a viernes: 07:20 a 11:50','Lunes a viernes: 07:20 a 11:50']);
});
test('HSA, HS and zero width characters match canonical schedule',()=>{
 for(const raw of [hsa,'Lunes a Viernes: 7:20 hs a 11:50 hs',
   'Lunes a Viernes: 7:20\u200b a 11:50','Lunes a Viernes: 7:20 a 11:50  ',
   'Lunes a Viernes: 7:20 a 11:50\uFEFF']){
  assert.equal(schedulesEquivalent(raw,first),true,raw);
 }
});
test('real time/day differences remain different',()=>{
 assert.equal(schedulesEquivalent(first,'Lunes a Viernes: 14:00 a 18:30'),false);
 assert.equal(schedulesEquivalent(first,'Lunes a Jueves: 07:20 a 11:50'),false);
 assert.equal(assessComparatorCriterion('Días y horarios',
  [first,'Lunes a Jueves: 07:20 a 11:50']).status,'different');
});
test('unknown or ambiguous schedule is unverified, not a false difference',()=>{
 for(const raw of ['No informado','7:20 a 11:50',
  'Lunes a Viernes: 07:20 a 11:50 y 14:00 a 17:00',
  'Lunes a Viernes: 11:50 a 07:20','Lunes a Viernes: 7:20 a 11:50 remoto']){
  assert.equal(parseOfferWeeklySchedule(raw),null,raw);
  assert.equal(assessComparatorCriterion('Días y horarios',[first,raw]).status,'unverified',raw);
 }
});
test('explicit non-consecutive weekday list is parsed',()=>{
 const x=parseOfferWeeklySchedule('Lunes, Miércoles y Viernes: 08:00 a 12:00');
 assert.deepEqual(x,{days:[1,3,5],start:480,end:720});
});
test('actual job overlaps offer on declared weekdays and minutes',()=>{
 const x=checkScheduleOverlap(first,{jobs});
 assert.equal(x.status,'overlap');
 assert.deepEqual(x.conflicts[0].days,['Lunes','Martes','Miércoles','Jueves','Viernes']);
 assert.equal(x.conflicts[0].from,'07:20');assert.equal(x.conflicts[0].to,'11:50');
});
test('overlap boundary uses strict time intersection',()=>{
 const overlap=checkScheduleOverlap(first,{jobs:[{...jobs[0],start:'11:20',end:'13:00'}]});
 assert.equal(overlap.status,'overlap');
 assert.equal(overlap.conflicts[0].from,'11:20');
 assert.equal(overlap.conflicts[0].to,'11:50');
 const adjacent=checkScheduleOverlap(first,{jobs:[{...jobs[0],start:'11:50',end:'14:00'}]});
 assert.equal(adjacent.status,'tight-transition');
 assert.equal(adjacent.transitions[0].gapMinutes,0);
});
test('different weekdays do not conflict and commute is not certified',()=>{
 const x=checkScheduleOverlap(first,{jobs:[{...jobs[0],days:[6,7]}]});
 assert.equal(x.status,'no-overlap');
 assert.match(x.label,/Sin superposición/);
});
test('lack of work profile and missing offer time are not classified compatible',()=>{
 assert.equal(checkScheduleOverlap(first,{jobs:[]}).status,'unverified');
 assert.equal(checkScheduleOverlap('Turno mañana',{jobs}).status,'unverified');
});
test('validate multiple schools/day fields and reject erroneous data',()=>{
 const profile=sanitizeWorkProfile({domicile:'Avellaneda, PBA',jobs:[
  {school:'Escuela A',days:[5,3,1],start:'07:20',end:'11:50'},
  {school:'Escuela B',days:[2,4],start:'14:00',end:'18:30'}
 ]});
 assert.deepEqual(profile.jobs[0].days,[1,3,5]);
 assert.equal(profile.domicile,'Avellaneda, PBA');
 assert.equal(profile.jobs.length,2);
});
test('privacy/safety: reject wrong working times and malformed days',()=>{
 for(const job of [
  {school:'A',days:[1],start:'07:00',end:'11:00'},
  {school:'Escuela',days:[1,1],start:'07:00',end:'11:00'},
  {school:'Escuela',days:[0],start:'07:00',end:'11:00'},
  {school:'Escuela',days:[1],start:'11:00',end:'11:00'},
  {school:'Escuela',days:[1],start:'25:00',end:'11:00'}
 ])assert.throws(()=>sanitizeWorkProfile({domicile:'',jobs:[job]}));
 assert.throws(()=>sanitizeWorkProfile({domicile:'x\nsecret',jobs:[]}));
 assert.throws(()=>sanitizeWorkProfile({domicile:'',jobs:Array(6).fill(jobs[0])}));
});

test('margen de traslado: horarios contiguos sin cruce quedan marcados para revisar',()=>{
 const offer='Lunes a Viernes: 11:50 a 13:00';
 const result=checkScheduleOverlap(offer,{jobs});
 assert.equal(result.status,'tight-transition');
 assert.equal(result.conflicts.length,0);
 assert.equal(result.transitions[0].gapMinutes,0);
 assert.equal(result.transitions[0].direction,'jornada-antes');
 assert.deepEqual(result.transitions[0].days,['Lunes','Martes','Miércoles','Jueves','Viernes']);
 assert.equal(result.travelGapMinutes,30,'Perfil anterior usa margen de 30 min por defecto');
});
test('margen configurable: menos que umbral advierte, igual o mayor no advierte',()=>{
 const offer='Lunes a Viernes: 12:10 a 13:30';
 assert.equal(checkScheduleOverlap(offer,{jobs,travelGapMinutes:30}).status,'tight-transition');
 assert.equal(checkScheduleOverlap(offer,{jobs,travelGapMinutes:15}).status,'no-overlap');
 assert.equal(checkScheduleOverlap(offer,{jobs,travelGapMinutes:0}).status,'no-overlap');
 assert.equal(checkScheduleOverlap('Lunes a Viernes: 12:20 a 13:30',
  {jobs,travelGapMinutes:30}).status,'no-overlap');
});
test('transición también se detecta cuando la oferta es antes del trabajo',()=>{
 const current=[{school:'Escuela turno tarde',days:[1,3,5],start:'13:00',end:'17:30'}];
 const result=checkScheduleOverlap('Lunes a Viernes: 08:00 a 12:45',
  {jobs:current,travelGapMinutes:30});
 assert.equal(result.status,'tight-transition');
 assert.equal(result.transitions[0].gapMinutes,15);
 assert.equal(result.transitions[0].direction,'oferta-antes');
 assert.deepEqual(result.transitions[0].days,['Lunes','Miércoles','Viernes']);
});
test('aviso de traslado no suplanta conflicto ni fabrica compatibilidad',()=>{
 const offer='Lunes a Viernes: 11:20 a 12:30';
 assert.equal(checkScheduleOverlap(offer,{jobs,travelGapMinutes:120}).status,'overlap');
 assert.equal(checkScheduleOverlap('Turno mañana',{jobs}).status,'unverified');
 assert.equal(checkScheduleOverlap('Lunes a Viernes: 12:00 a 13:00',
  {jobs:[{...jobs[0],days:[6]}]}).status,'no-overlap');
 assert.equal(checkScheduleOverlap(first,{jobs:[{...jobs[0],start:'XX',end:'12:00'}]}).status,'unverified');
});
test('solo se aceptan los margenes declarados y el perfil antiguo migra sin perder jornadas',()=>{
 assert.equal(sanitizeWorkProfile({jobs}).travelGapMinutes,30);
 assert.equal(sanitizeWorkProfile({jobs,travelGapMinutes:60}).travelGapMinutes,60);
 for(const travelGapMinutes of [-1,25,1200,'30',null])
  assert.throws(()=>sanitizeWorkProfile({jobs,travelGapMinutes}));
});

test('selected offers: same weekdays, clock and concurrent dates show a pairwise collision',()=>{
 const r=compareSelectedOfferSchedules([
  {horario:'Lunes a Viernes: 07:20 a 11:50',supl_desde:'10/11/2035',supl_hasta:'01/02/2036'},
  {horario:'Lunes a Viernes: 10:30 a 12:00',supl_desde:'2035-11-12',supl_hasta:'2036-03-01'}
 ]);
 assert.equal(r.length,1);assert.equal(r[0].status,'overlap');
 assert.deepEqual(r[0].days,['Lunes','Martes','Miércoles','Jueves','Viernes']);
 assert.equal(r[0].from,'10:30');assert.equal(r[0].to,'11:50');
 assert.equal(r[0].firstOffer,1);assert.equal(r[0].secondOffer,2);
});
test('selected offers: different date periods are not treated as simultaneous',()=>{
 const r=compareSelectedOfferSchedules([
  {horario:first,supl_desde:'01/03/2035',supl_hasta:'31/03/2035'},
  {horario:first,supl_desde:'01/04/2035',supl_hasta:'30/04/2035'}
 ]);
 assert.equal(r[0].status,'separate-periods');
});
test('selected offers: missing and impossible date ranges warn about potential overlap',()=>{
 const a={horario:first,supl_desde:'10/11/2035',supl_hasta:'01/01/2036'};
 for(const b of [
  {horario:first,supl_desde:'',supl_hasta:''},
  {horario:first,supl_desde:'31/02/2035',supl_hasta:'01/01/2036'},
  {horario:first,supl_desde:'01/02/2036',supl_hasta:'01/01/2036'}
 ]){
  assert.equal(compareSelectedOfferSchedules([a,b])[0].status,'possible-overlap');
 }
});
test('selected offers: boundary times and different weekdays do not collide',()=>{
 const base={horario:first};
 for(const other of [
  {horario:'Lunes a Viernes: 11:50 a 14:00'},
  {horario:'Sábado y Domingo: 07:20 a 11:50'}
 ])
  assert.equal(compareSelectedOfferSchedules([base,other])[0].status,'no-time-overlap');
});
test('selected offers: unknown weekly schedule remains unverified',()=>{
 const r=compareSelectedOfferSchedules([{horario:first},{horario:'Turno mañana'}]);
 assert.equal(r[0].status,'unverified');
});
test('selected offers: five offers produce ten unique pairs without guessing any result',()=>{
 const offers=Array.from({length:5},(_,i)=>({
  horario:i===4?'Sin datos':'Lunes a Viernes: 07:20 a 11:50'
 }));
 const result=compareSelectedOfferSchedules(offers);
 assert.equal(result.length,10);
 assert.equal(new Set(result.map(x=>x.firstOffer+'-'+x.secondOffer)).size,10);
 assert.equal(result.filter(x=>x.status==='unverified').length,4);
 assert.throws(()=>compareSelectedOfferSchedules(offers.concat(offers[0])));
});

test('selected offers: matching date windows without a shared weekday do not fake a conflict',()=>{
 const r=compareSelectedOfferSchedules([
  {horario:'Viernes: 08:00 a 10:00',supl_desde:'05/11/2035',supl_hasta:'06/11/2035'},
  {horario:'Viernes: 08:30 a 11:00',supl_desde:'05/11/2035',supl_hasta:'06/11/2035'}
 ]);
 // Confirm these civil dates are Monday/Tuesday, not Friday.
 assert.equal(new Date(Date.UTC(2035,10,5)).getUTCDay(),1);
 assert.equal(r[0].status,'no-shared-date');
});
test('selected offers: one shared weekly day inside overlapping dates is enough',()=>{
 const r=compareSelectedOfferSchedules([
  {horario:'Lunes a Viernes: 07:20 a 11:50',supl_desde:'05/11/2035',supl_hasta:'07/11/2035'},
  {horario:'Martes y Viernes: 10:30 a 12:00',supl_desde:'05/11/2035',supl_hasta:'07/11/2035'}
 ]);
 assert.equal(r[0].status,'overlap');
 assert.deepEqual(r[0].days,['Martes']);
});


test('ABC explicit multi-block schedules parse with weekday and hours preserved',()=>{
 const input='Lunes: 07:20 a 11:50; Miércoles: 14:00 a 17:30';
 const blocks=parseOfferWeeklySegments(input);
 assert.deepEqual(blocks,[
  {days:[1],start:440,end:710},{days:[3],start:840,end:1050}
 ]);
 assert.equal(parseOfferWeeklySchedule(input),null,
  'Legacy single-range parser must not partially accept multi-block input');
 assert.equal(formatWeeklySchedule(input),input);
 const newline='Miércoles: 14:00 a 17:30\nLunes: 07:20 a 11:50';
 assert.equal(schedulesEquivalent(input,newline),true,
  'Block ordering must not fabricate a schedule difference');
 assert.equal(formatWeeklySchedule(newline),input,
  'Comparison labels must be displayed in canonical chronological order');
 assert.deepEqual(parseOfferWeeklySegments('Lunes: 07:20 a 11:50 | Miércoles: 14:00 a 17:30'),blocks);
});
test('incomplete multi-block schedules fail closed rather than inventing missing days',()=>{
 for(const raw of [
  'Lunes: 07:20 a 11:50; 14:00 a 17:30',
  'Lunes: 07:20 a 11:50 y 14:00 a 17:30',
  'Lunes: 07:20 a 11:50; Miércoles sin horario',
  'Lunes: 07:20 a 11:50; Miércoles: 17:30 a 14:00',
  'Lunes: 07:20 a 11:50; Miércoles:',
  'Lunes: 07:20 a 11:50; Miércoles: 07:20 a 11:50; Jueves: sin datos'
 ]){
  assert.equal(parseOfferWeeklySegments(raw),null,raw);
  assert.equal(checkScheduleOverlap(raw,{jobs}).status,'unverified',raw);
  assert.equal(assessComparatorCriterion('Días y horarios',[first,raw]).status,'unverified',raw);
 }
});
test('multiple blocks: compare each day/time against work profile; prioritize actual overlap',()=>{
 const schedule='Lunes: 07:20 a 11:50; Miércoles: 14:00 a 17:30';
 const jobs=[
  {school:'Escuela lunes',days:[1],start:'12:10',end:'13:10'},
  {school:'Escuela miércoles',days:[3],start:'15:00',end:'18:00'}
 ];
 const r=checkScheduleOverlap(schedule,{jobs,travelGapMinutes:30});
 assert.equal(r.status,'overlap');
 assert.equal(r.conflicts.length,1);
 assert.deepEqual(r.conflicts[0].days,['Miércoles']);
 assert.equal(r.conflicts[0].from,'15:00');
 assert.equal(r.conflicts[0].to,'17:30');
 assert.equal(r.transitions.length,1);
 assert.equal(r.transitions[0].gapMinutes,20);
});
test('multiple blocks: equivalence checks all blocks, ignores order and reports actual changes',()=>{
 const first='Lunes: 07:20 a 11:50; Miércoles: 14:00 a 17:30';
 const reverse='Miércoles: 14:00 a 17:30; Lunes: 07:20 a 11:50';
 const changed='Miércoles: 14:30 a 17:30; Lunes: 07:20 a 11:50';
 assert.equal(schedulesEquivalent(first,reverse),true);
 assert.equal(schedulesEquivalent(first,changed),false);
 const same=assessComparatorCriterion('Días y horarios',[first,reverse]);
 assert.equal(same.status,'same');
 assert.deepEqual(same.values,[first,first]);
 assert.equal(assessComparatorCriterion('Días y horarios',[first,changed]).status,'different');
});
test('selected offers: one crossing among multiple blocks is not missed',()=>{
 const r=compareSelectedOfferSchedules([
  {horario:'Lunes: 07:20 a 11:50; Miércoles: 14:00 a 17:30',
   supl_desde:'01/11/2035',supl_hasta:'30/11/2035'},
  {horario:'Martes: 07:20 a 11:50; Miércoles: 16:30 a 18:00',
   supl_desde:'01/11/2035',supl_hasta:'30/11/2035'}
 ]);
 assert.equal(r.length,1);
 assert.equal(r[0].status,'overlap');
 assert.equal(r[0].matches.length,1);
 assert.deepEqual(r[0].matches[0].days,['Miércoles']);
 assert.equal(r[0].matches[0].from,'16:30');
 assert.equal(r[0].matches[0].to,'17:30');
});
test('selected offers: two distinct overlapping blocks are both surfaced',()=>{
 const r=compareSelectedOfferSchedules([
  {horario:'Lunes: 08:00 a 10:00; Miércoles: 14:00 a 17:00',
   supl_desde:'01/11/2035',supl_hasta:'30/11/2035'},
  {horario:'Lunes: 09:00 a 11:00; Miércoles: 15:00 a 18:00',
   supl_desde:'01/11/2035',supl_hasta:'30/11/2035'}
 ]);
 assert.equal(r[0].status,'overlap');
 assert.deepEqual(r[0].matches.map(x=>x.from+'-'+x.to),['09:00-10:00','15:00-17:00']);
 assert.deepEqual(r[0].matches.map(x=>x.days),[['Lunes'],['Miércoles']]);
});
test('selected offers: mixed complete/partial blocks cannot be declared non-overlapping',()=>{
 const r=compareSelectedOfferSchedules([
  {horario:'Lunes: 08:00 a 10:00; Miércoles: 14:00 a 17:00'},
  {horario:'Martes: 08:00 a 10:00; Miércoles: SIN DATOS'}
 ]);
 assert.equal(r[0].status,'unverified');
});


test('Georef candidates disambiguate homonymous street+height by locality and province',()=>{
 const payload={cantidad:3,direcciones:[
  {calle:{nombre:'RONDEAU'},altura:{valor:319},localidad_censal:{nombre:'Wilde'},
   departamento:{nombre:'Avellaneda'},provincia:{nombre:'Buenos Aires'},
   ubicacion:{lat:-34.7,lon:-58.32}},
  {calle:{nombre:'RONDEAU'},altura:{valor:319},localidad_censal:{nombre:'Bahía Blanca'},
   departamento:{nombre:'Bahía Blanca'},provincia:{nombre:'Buenos Aires'},
   ubicacion:{lat:-38.7,lon:-62.3}},
  {calle:{nombre:'RONDEAU'},altura:{valor:321},provincia:{nombre:'Buenos Aires'},
   ubicacion:{lat:-34.6,lon:-58.3}}
 ]};
 const results=parseGeorefCandidates(payload,'Rondeau 319');
 assert.equal(results.length,2,'Wrong house number must not be selectable');
 assert.match(results[0].label,/Wilde, Avellaneda, Buenos Aires/);
 assert.match(results[1].label,/Bahía Blanca/);
 assert.equal(results[0].source,'GEOREF_AR_V2');
 assert.equal(results[0].height,319);
});
test('Georef rejects missing coordinates, mismatched heights and malformed locations',()=>{
 const sample={calle:{nombre:'RONDEAU'},altura:{valor:319},
  provincia:{nombre:'Buenos Aires'},ubicacion:{lat:-34.7,lon:-58.3}};
 assert.deepEqual(parseGeorefCandidates({direcciones:[sample]},'Rondeau 320'),[]);
 assert.deepEqual(parseGeorefCandidates({direcciones:[{...sample,ubicacion:null}]},'Rondeau 319'),[]);
 assert.deepEqual(parseGeorefCandidates({direcciones:[{...sample,ubicacion:{lat:0,lon:0}}]},'Rondeau 319'),[]);
 assert.deepEqual(parseGeorefCandidates({direcciones:[sample]},'Rondeau'),[]);
 assert.throws(()=>sanitizeHomeLocation({source:'GEOREF_AR_V2',label:'Rondeau 319',
  height:319,lat:0,lon:0}));
});
test('Georef only fetches once after explicit call, without cookies/GPS and with bounded results',async()=>{
 const calls=[],input='Rondeau 319';
 const data={direcciones:[{calle:{nombre:'RONDEAU'},altura:{valor:319},
  provincia:{nombre:'Buenos Aires'},departamento:{nombre:'Avellaneda'},
  localidad_censal:{nombre:'Wilde'},ubicacion:{lat:-34.7,lon:-58.32}}]};
 const fetchImpl=async (url,opts)=>{
  calls.push({url,opts});
  const body=new TextEncoder().encode(JSON.stringify(data));
  return {ok:true,headers:{get:()=>String(body.byteLength)},arrayBuffer:async()=>body.buffer};
 };
 const matches=await lookupHomeAddresses(input,{fetchImpl});
 assert.equal(matches.length,1);
 assert.equal(calls.length,1);
 const url=new URL(calls[0].url);
 assert.equal(url.hostname,'apis.datos.gob.ar');
 assert.equal(url.pathname,'/georef/api/v2.0/direcciones');
 assert.equal(url.searchParams.get('direccion'),input);
 assert.equal(calls[0].opts.credentials,'omit');
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(calls[0].opts.mode,'cors');
 await assert.rejects(()=>lookupHomeAddresses('Rondeau',{fetchImpl}),/calle y altura/);
 assert.equal(calls.length,1,'Incomplete input must not trigger external requests');
});
test('home-to-school distance is only a straight line between chosen point and exact ABC key',()=>{
 const home=sanitizeHomeLocation({source:'GEOREF_AR_V2',label:'Rondeau 319, Wilde, Avellaneda, Buenos Aires',
  height:319,lat:-34.7,lon:-58.32});
 const school={source:'ABC_WFS',exact_key_match:true,clave:'0005MS0004',lat:-34.71,lon:-58.33};
 const km=straightLineHomeSchoolKm(home,school);
 assert.ok(km>0&&km<3);
 assert.equal(straightLineHomeSchoolKm(home,{...school,source:'GOOGLE'}),null);
 assert.equal(straightLineHomeSchoolKm(home,{...school,exact_key_match:false}),null);
 assert.equal(straightLineHomeSchoolKm(home,{...school,clave:'bad'}),null);
});
test('private work profile never retains coordinates after manual domicile edit',()=>{
 const home={source:'GEOREF_AR_V2',label:'Rondeau 319, Wilde, Avellaneda, Buenos Aires',
  height:319,lat:-34.7,lon:-58.32};
 const good=sanitizeWorkProfile({domicile:home.label,jobs:[],homeLocation:home});
 assert.deepEqual(good.homeLocation,home);
 assert.throws(()=>sanitizeWorkProfile({domicile:'Calle diferente',homeLocation:home,jobs:[]}),
  /Elegí nuevamente/);
 assert.equal(sanitizeWorkProfile({domicile:'Calle libre',jobs:[]}).homeLocation,null);
});


test('Georef: comma-delimited Wilde and Avellaneda hints become official API filters',async()=>{
 const parsed=parseHomeAddressQuery('Rondeau 319, Wilde, Avellaneda, Buenos Aires');
 assert.equal(parsed.street,'Rondeau 319');
 assert.equal(parsed.height,319);
 assert.deepEqual(parsed.filters,{
  provincia:'Buenos Aires',localidad_censal:'Wilde',departamento:'Avellaneda'
 });
 const queried=[];
 const fetchImpl=async(url,opts)=>{
  queried.push({url,opts});
  const raw=new TextEncoder().encode(JSON.stringify({
   direcciones:[{calle:{nombre:'RONDEAU'},altura:{valor:319},
    provincia:{nombre:'Buenos Aires'},departamento:{nombre:'Avellaneda'},
    localidad_censal:{nombre:'Wilde'},ubicacion:{lat:-34.7,lon:-58.32}}]
  }));
  return {ok:true,headers:{get:()=>String(raw.length)},arrayBuffer:async()=>raw.buffer};
 };
 const actual=await lookupHomeAddresses(parsed.original,{fetchImpl});
 assert.equal(actual.length,1);
 const url=new URL(queried[0].url);
 assert.equal(url.searchParams.get('direccion'),'Rondeau 319');
 assert.equal(url.searchParams.get('provincia'),'Buenos Aires');
 assert.equal(url.searchParams.get('departamento'),'Avellaneda');
 assert.equal(url.searchParams.get('localidad_censal'),'Wilde');
 assert.equal(url.searchParams.get('max'),'30');
 assert.equal(queried[0].opts.credentials,'omit');
});
test('Georef: numbered street, floor and postal code must not replace street height',()=>{
 assert.equal(parseHomeAddressQuery('25 de Mayo 480').height,480);
 assert.equal(parseHomeAddressQuery('Rondeau 319, Wilde, 1875').height,319);
 assert.equal(parseHomeAddressQuery('Rondeau 319 piso 2, Wilde').height,319);
 assert.equal(parseHomeAddressQuery('Rondeau 319, Wilde').filters.localidad_censal,'Wilde');
 assert.equal(parseHomeAddressQuery('Rondeau 319').filters.provincia,undefined);
 const result={direcciones:[{calle:{nombre:'RONDEAU'},altura:{valor:319},
  provincia:{nombre:'Buenos Aires'},ubicacion:{lat:-34.7,lon:-58.32}}]};
 assert.equal(parseGeorefCandidates(result,'Rondeau 319 piso 2, Wilde').length,1);
});
test('Georef: oversized, unnumbered and injected addresses fail before network',async()=>{
 const calls=[];
 const fetchImpl=async()=>{calls.push(1);throw Error('network request must not run');};
 for(const query of ['Rondeau','Rondeau 319'+'A'.repeat(180),'<script> Rondeau 319',
  'Rondeau 319\nWilde']){
  await assert.rejects(()=>lookupHomeAddresses(query,{fetchImpl}));
 }
 assert.equal(calls.length,0);
});

test('Georef: a missing Wilde locality retries only within Avellaneda first',async()=>{
 const calls=[];
 const payload=items=>{
  const bytes=new TextEncoder().encode(JSON.stringify({
   cantidad:items.length,direcciones:items
  }));
  return {ok:true,headers:{get:()=>String(bytes.byteLength)},arrayBuffer:async()=>bytes.buffer};
 };
 const match={calle:{nombre:'RONDEAU'},altura:{valor:319},
  departamento:{nombre:'Avellaneda'},provincia:{nombre:'Buenos Aires'},
  ubicacion:{lat:-34.7,lon:-58.32}};
 const fetchImpl=async(url,opts)=>{
  const u=new URL(url);
  calls.push({scope:Object.fromEntries(u.searchParams),opts});
  return u.searchParams.has('localidad_censal')?payload([]):payload([match]);
 };
 const result=await lookupHomeAddressesDetailed(
  'Rondeau 319, Wilde, Avellaneda, Buenos Aires',{fetchImpl});
 assert.equal(result.scope,'partido');
 assert.equal(result.attempted,2);
 assert.equal(result.candidates.length,1);
 assert.equal(calls.length,2);
 assert.equal(calls[0].scope.localidad_censal,'Wilde');
 assert.equal(calls[1].scope.localidad_censal,undefined);
 assert.equal(calls[1].scope.departamento,'Avellaneda');
 assert.equal(calls[1].scope.provincia,'Buenos Aires');
 assert.equal(calls[0].opts.credentials,'omit');
 assert.match(result.candidates[0].label,/Avellaneda, Buenos Aires/);
});
test('Georef: all retries bounded and aborted queries never continue',async()=>{
 const calls=[],body=new TextEncoder().encode('{"cantidad":0,"direcciones":[]}');
 const fetchImpl=async(url)=>{
  calls.push(url);
  return {ok:true,headers:{get:()=>String(body.byteLength)},arrayBuffer:async()=>body.buffer};
 };
 const out=await lookupHomeAddressesDetailed(
  'Rondeau 319, Wilde, Avellaneda, Buenos Aires',{fetchImpl});
 assert.equal(out.candidates.length,0);
 assert.equal(out.scope,'sin_resultados');
 assert.equal(out.attempted,4);
 assert.equal(calls.length,4);
 const controller=new AbortController(),afterAbort=[];
 const fetchAbort=async url=>{
  afterAbort.push(url);controller.abort();
  return {ok:true,headers:{get:()=>String(body.byteLength)},arrayBuffer:async()=>body.buffer};
 };
 await assert.rejects(()=>lookupHomeAddressesDetailed(
  'Rondeau 319, Wilde, Avellaneda, Buenos Aires',
  {fetchImpl:fetchAbort,signal:controller.signal}),/Consulta cancelada/);
 assert.equal(afterAbort.length,1);
});

test('A national Georef query must never claim an exact locality',async()=>{
 const fixture={direcciones:[{
  calle:{nombre:'RONDEAU'},altura:{valor:319},
  localidad_censal:{nombre:'Wilde'},departamento:{nombre:'Avellaneda'},
  provincia:{nombre:'Buenos Aires'},ubicacion:{lat:-34.7,lon:-58.32}
 }],cantidad:1};
 const bytes=new TextEncoder().encode(JSON.stringify(fixture));
 const fetchImpl=async()=>({
  ok:true,headers:{get:()=>String(bytes.byteLength)},
  arrayBuffer:async()=>bytes.buffer
 });
 const nationwide=await lookupHomeAddressesDetailed('Rondeau 319',{fetchImpl});
 assert.equal(nationwide.scope,'pais');
 assert.equal(nationwide.candidates[0].scope,'pais');
 const provincial=await lookupHomeAddressesDetailed('Rondeau 319, Buenos Aires',{fetchImpl});
 assert.equal(provincial.scope,'provincia');
 assert.equal(provincial.candidates[0].scope,'provincia');
 const exact=await lookupHomeAddressesDetailed(
  'Rondeau 319, Wilde, Avellaneda, Buenos Aires',{fetchImpl});
 assert.equal(exact.scope,'exacta');
 assert.equal(exact.candidates[0].scope,'exacta');
});
test('A reviewed approximate home survives private validation without claiming official certainty',()=>{
 const initial={source:'GEOREF_AR_V2',label:'Rondeau 319, Wilde, Avellaneda, Buenos Aires',
  height:319,lat:-34.7,lon:-58.32,scope:'partido'};
 const reviewed=sanitizeHomeLocation({...initial,reviewed:true});
 assert.equal(reviewed.reviewed,true);
 assert.equal(reviewed.scope,'partido');
 const profile=sanitizeWorkProfile({domicile:reviewed.label,jobs:[],homeLocation:reviewed});
 assert.equal(profile.homeLocation.reviewed,true);
 assert.equal(profile.homeLocation.scope,'partido');
 assert.throws(()=>sanitizeHomeLocation({...initial,reviewed:false}),/inválida/);
});

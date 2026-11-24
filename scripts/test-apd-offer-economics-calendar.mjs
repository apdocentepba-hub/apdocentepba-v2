import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateCalendarWorkDays,estimateCalendarEconomics} from './apd-offer-economics-calendar.mjs';
test('distinct weekdays, calendar and leap year',()=>{
 assert.deepEqual(estimateCalendarWorkDays('Lunes: 08:00 a 10:00; Lunes: 11:00 a 12:00; Miércoles: 08:00 a 09:00','2026-11'),{month:'2026-11',days:9,weekdays:[1,3],scope:'calendar_before_holidays_and_leave'});
 assert.equal(estimateCalendarWorkDays('Jueves: 08:00 a 09:00','2028-02').days,4);
});
test('unknown schedule and invalid date never guessed',()=>{
 assert.equal(estimateCalendarWorkDays('a confirmar','2026-11'),null);
 assert.throws(()=>estimateCalendarWorkDays('Lunes: 08:00 a 09:00','2026-13'));
});
test('transport based on adjusted calendar, no invented salary',()=>{
 const data={schedule:'Lunes: 08:00 a 09:00',month:'2026-11',excludedDays:1,monthlyNet:100000,dailyRoundTrip:2000,otherMonthly:1000,roundTripMinutes:60};
 const r=estimateCalendarEconomics(data);
 assert.equal(r.workDays,4);assert.equal(r.estimate.remaining,91000);assert.equal(r.estimate.travelHours,4);
 assert.throws(()=>estimateCalendarEconomics({...data,excludedDays:6}));
 assert.throws(()=>estimateCalendarEconomics({...data,monthlyNet:null}));
});

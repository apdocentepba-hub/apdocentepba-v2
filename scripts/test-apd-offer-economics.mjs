import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateOfferEconomics,officialPaySource} from './apd-offer-economics.mjs';
const valid={monthlyNet:400000,workDays:12,dailyRoundTrip:2500,otherMonthly:10000,roundTripMinutes:75};
test('net after travel, monthly expenses and travel hours',()=>{
 assert.deepEqual(estimateOfferEconomics(valid),{monthlyNet:400000,transport:30000,otherMonthly:10000,totalCost:40000,remaining:360000,travelHours:15,costShare:10});
});
test('missing commute duration remains unknown',()=>assert.equal(estimateOfferEconomics({...valid,roundTripMinutes:null}).travelHours,null));
test('negative return is visible and no division by zero',()=>{
 const x=estimateOfferEconomics({...valid,monthlyNet:0});assert.equal(x.remaining,-40000);assert.equal(x.costShare,null);
});
test('invalid or omitted financial values fail rather than default to zero',()=>{
 for(const patch of [{monthlyNet:null},{workDays:32},{dailyRoundTrip:-1},{otherMonthly:NaN},{roundTripMinutes:1.5},{workDays:0},{monthlyNet:'100'}])assert.throws(()=>estimateOfferEconomics({...valid,...patch}));
});
test('cent rounding avoids floating-point artifacts',()=>{
 assert.equal(estimateOfferEconomics({monthlyNet:10.2,workDays:3,dailyRoundTrip:0.1,otherMonthly:0.2,roundTripMinutes:null}).remaining,9.7);
});
test('source metadata explicitly records unavailable scale, not verified rates',()=>{
 assert.equal(officialPaySource.status,'official_index_verified_pdf_unavailable');assert.equal(officialPaySource.period,'2026-11');
});

import test from "node:test";
import assert from "node:assert/strict";
import {parseApdDeadlineInstant,apdOfferDeadlineStatus} from "./lib/apd-offer-close-guard.mjs";
const timestamp=Date.parse("2026-11-04T15:30:00Z");
const offer=(finoferta,estado="Publicada")=>({finoferta,estado});
test("generic ISO Z remains UTC unless explicitly in ABC wall-clock mode",()=>{
 const p=parseApdDeadlineInstant("2026-11-04T15:30:00.000Z");
 assert.equal(p.ok,true);assert.equal(p.instant_ms,timestamp);
 assert.equal(parseApdDeadlineInstant("2026-11-04T12:30:00Z",{abcWallTime:true}).instant_ms,timestamp);
});
test("ABC local Argentine closing time is converted to the same absolute instant",()=>{
 for(const f of ["2026-11-04T12:30","2026-11-04 12:30:00","04/11/2026, 12:30"]){
  assert.equal(parseApdDeadlineInstant(f).instant_ms,timestamp);
 }
});
test("explicit offset is respected regardless of user/browser timezone",()=>{
 assert.equal(parseApdDeadlineInstant("2026-11-04T12:30:00-03:00").instant_ms,timestamp);
 assert.equal(parseApdDeadlineInstant("2026-11-04T15:30:00+00:00").instant_ms,timestamp);
});
test("exact closing minute is EXPIRED, previous millisecond is allowed",()=>{
 assert.equal(apdOfferDeadlineStatus(offer("2026-11-04T12:30:00-03:00"),timestamp).eligible,false);
 assert.equal(apdOfferDeadlineStatus(offer("2026-11-04T12:30:00-03:00"),timestamp-1).eligible,true);
});
test("published is necessary but not enough, closed states must be excluded",()=>{
 for(const s of ["Designada","Cerrada","Finalizada","Anulada","Desierta",""]){
  assert.equal(apdOfferDeadlineStatus(offer("2099-01-01T18:00:00Z",s)).eligible,false);
 }
});
test("missing or unverified hour is not advertised as open",()=>{
 for(const f of ["","2026-11-04","04/11/2026","Sin fecha","9999-12-31T23:59:59Z","2026-02-31T17:00:00Z","04/13/2026 17:00","2026-11-04T28:00:00Z"]){
  const p=parseApdDeadlineInstant(f);assert.equal(p.ok,false,"Accepted invalid or unverified "+f);
  assert.equal(apdOfferDeadlineStatus(offer(f),timestamp).eligible,false);
 }
});
test("queued stored alert cannot bypass closure time or source status",()=>{
 const cached={offer_payload:{estado:"Publicada",raw:{estado:"Publicada",finoferta:"2026-11-04T12:30:00Z"},cargo:"MATEMATICA"}};
 assert.equal(apdOfferDeadlineStatus(cached,timestamp-1).eligible,true);
 assert.equal(apdOfferDeadlineStatus(cached,timestamp).eligible,false);
 cached.offer_payload.raw.estado="Cerrada";cached.offer_payload.estado="Cerrada";
 assert.equal(apdOfferDeadlineStatus(cached,timestamp-1).eligible,false);
});
test("formatted label is secondary when raw ABC timestamp is present",()=>{
 const o={estado:"Publicada",finoferta:"2026-11-04T12:30:00Z",fecha_cierre:"04/11/2026, 12:30"};
 assert.equal(apdOfferDeadlineStatus(o,timestamp-1).eligible,true);
 assert.equal(apdOfferDeadlineStatus(o,timestamp).eligible,false);
});
test("ABC publishes 07:30Z and this field must close at 07:30 Argentina, not 04:30",()=>{
 const field=offer("2026-11-05T07:30:00Z");
 const atSevenTwentyNine=Date.parse("2026-11-05T10:29:59.999Z");
 const atSevenThirty=Date.parse("2026-11-05T10:30:00Z");
 assert.equal(apdOfferDeadlineStatus(field,atSevenTwentyNine).eligible,true);
 assert.equal(apdOfferDeadlineStatus(field,atSevenThirty).eligible,false);
 assert.equal(parseApdDeadlineInstant(field.finoferta).instant_ms,Date.parse("2026-11-05T07:30:00Z"),
  "Generic ISO Z must still mean absolute UTC");
});
test("date parser rejects ambiguous GMT formats, does not guess",()=>{
 for(const f of ["Nov 4, 2026 12:30","04-11-2026 12:30","2026-11-04 12:30 ART"]){
  assert.equal(parseApdDeadlineInstant(f).ok,false);
 }
});

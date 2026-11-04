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
test("two rounds of stored-offer normalization cannot erase ABC status or exact close",()=>{
 const official={estado:"Publicada",finoferta:"2026-11-05T07:30:00Z"};
 const once={estado:"",fecha_cierre:"05/11/2026",raw:official};
 const twice={estado:"",fecha_cierre:"05/11/2026",raw:once};
 const before=Date.parse("2026-11-05T10:29:59Z");
 const at=Date.parse("2026-11-05T10:30:00Z");
 assert.equal(apdOfferDeadlineStatus(twice,before).eligible,true);
 assert.equal(apdOfferDeadlineStatus(twice,at).reason,"deadline_reached");
 twice.estado="Cerrada";
 assert.equal(apdOfferDeadlineStatus(twice,before).reason,"not_published");
});
test("date parser rejects ambiguous GMT formats, does not guess",()=>{
 for(const f of ["Nov 4, 2026 12:30","04-11-2026 12:30","2026-11-04 12:30 ART"]){
  assert.equal(parseApdDeadlineInstant(f).ok,false);
 }
});

test("official nested ABC Cerrada overrides cached Publicada label",()=>{
 const item={offer_payload:{estado:"Publicada",fecha_cierre:"05/11/2026, 07:30",raw:{
   estado:"Publicada",raw:{estado:"Cerrada",finoferta:"2099-12-31T07:30:00Z"}
 }}};
 assert.equal(apdOfferDeadlineStatus(item,Date.parse("2026-11-04T15:00:00Z")).eligible,false);
 assert.equal(apdOfferDeadlineStatus(item,Date.parse("2026-11-04T15:00:00Z")).reason,"not_published");
});
test("nested raw official finoferta wins over formatted future closing label",()=>{
 const item={offer_payload:{estado:"Publicada",fecha_cierre:"31/12/2099, 23:59",raw:{
   raw:{estado:"Publicada",finoferta:"2020-01-01T07:30:00Z"}
 }}};
 assert.equal(apdOfferDeadlineStatus(item,Date.parse("2026-11-04T15:00:00Z")).reason,"deadline_reached");
});

test("conflicting saved status is never advertised regardless of nesting order",()=>{
 const open={estado:"Publicada",finoferta:"2099-12-31T07:30:00Z"};
 const closed={estado:"Cerrada",finoferta:"2099-12-31T07:30:00Z"};
 for(const item of [
   {estado:"Cerrada",raw:open},
   {estado:"Publicada",raw:closed},
   {estado:"Publicada",raw:{estado:"Publicada",raw:closed}},
   {offer_payload:{estado:"Publicada",raw:{estado:"Designada",raw:open}}},
   {offer_payload:{estado:"Cerrada",raw:{estado:"Publicada",raw:open}}}
 ]){
   const status=apdOfferDeadlineStatus(item,Date.parse("2026-11-04T18:00:00Z"));
   assert.equal(status.eligible,false,"Conflicting state must be rejected");
   assert.equal(status.reason,"not_published");
 }
});
test("nested saved data stays eligible when all known states agree and closure is future",()=>{
 const item={offer_payload:{estado:"Publicada",raw:{estado:"Publicada",raw:{
   estado:"Publicada",finoferta:"2099-12-31T07:30:00Z"
 }}}};
 const s=apdOfferDeadlineStatus(item,Date.parse("2026-11-04T18:00:00Z"));
 assert.equal(s.eligible,true);
 assert.equal(s.reason,"verified_open");
});

test("user-visible fecha_cierre does NOT prove an offer is still open",()=>{
 for(const item of [
  {estado:"Publicada",fecha_cierre:"31/12/2099, 23:59"},
  {estado:"Publicada",cierre:"31/12/2099, 23:59"},
  {estado:"Publicada",finoferta:"",fecha_cierre:"31/12/2099, 23:59"},
  {offer_payload:{estado:"Publicada",fecha_cierre:"31/12/2099, 23:59",raw:{estado:"Publicada"}}}
 ]){
  const result=apdOfferDeadlineStatus(item,Date.parse("2026-11-04T20:00:00Z"));
  assert.equal(result.eligible,false);
  assert.equal(result.reason,"missing_deadline");
 }
});
test("deeper ABC original finoferta takes precedence over stale outer value",()=>{
 const item={estado:"Publicada",finoferta:"2099-12-31T10:30:00Z",
  raw:{estado:"Publicada",finoferta:"2020-01-01T07:30:00Z"}};
 assert.equal(apdOfferDeadlineStatus(item,Date.parse("2026-11-04T20:00:00Z")).reason,"deadline_reached");
});

test("two documented SAD closing clocks 07:30 and 10:30 remain Argentina-local when ABC emits Z",()=>{
 const day="2026-11-05";
 for(const hhmm of ["07:30","10:30"]){
  const abc=day+"T"+hhmm+":00Z";
  const local=Date.parse(day+"T"+hhmm+":00-03:00");
  assert.equal(parseApdDeadlineInstant(abc,{abcWallTime:true}).instant_ms,local);
  assert.equal(apdOfferDeadlineStatus(offer(abc),local-1).eligible,true);
  assert.equal(apdOfferDeadlineStatus(offer(abc),local).eligible,false);
  const genericUtc=Date.parse(abc);
  assert.equal(local-genericUtc,3*60*60*1000,"Never silently interpret ABC Z as generic UTC");
 }
});
test("district rescheduling is honored when ABC replaces a closing time with a later official finoferta",()=>{
 const today=Date.parse("2026-11-05T10:31:00Z");
 assert.equal(apdOfferDeadlineStatus(offer("2026-11-05T07:30:00Z"),today).eligible,false);
 assert.equal(apdOfferDeadlineStatus(offer("2026-11-06T07:30:00Z"),today).eligible,true);
 // Conservative contradiction handling: obsolete label saying Cerrada is not
 // sufficient grounds to mark a new ABC deadline open.
 assert.equal(apdOfferDeadlineStatus({
  estado:"Cerrada",raw:{estado:"Publicada",finoferta:"2026-11-06T07:30:00Z"}
 },today).eligible,false);
});

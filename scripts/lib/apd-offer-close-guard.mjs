/* Single conservative deadline gate for ABC APD offers.
 * An ISO date with Z/offset is an absolute instant.
 * A local date+time without offset uses Buenos Aires (UTC-03:00 in 2026).
 * A date without time or a missing/invalid deadline is NOT verifiably open.
 * No I/O, no account data, no mutations.
 */
export function parseApdDeadlineInstant(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return {ok:false,reason:"missing_deadline"};
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/i);
  let year,month,day,hour,minute,second,millisecond,zone;
  if (match) {
    [,year,month,day,hour,minute,second,millisecond,zone] = match;
  } else {
    match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return {ok:false,reason:"unsupported_deadline_format"};
    [,day,month,year,hour,minute,second] = match;
    zone = null;
  }
  if (hour == null || minute == null) return {ok:false,reason:"hour_unverified"};
  const y=Number(year),m=Number(month),d=Number(day),h=Number(hour),mi=Number(minute),s=Number(second||0),ms=Number(String(millisecond||"").padEnd(3,"0")||0);
  if (y<2000||y>2100||m<1||m>12||d<1||d>31||h>23||mi>59||s>59||ms>999) {
    return {ok:false,reason:"invalid_deadline"};
  }
  const utcParts=Date.UTC(y,m-1,d,h,mi,s,ms);
  const check=new Date(utcParts);
  if (check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d) {
    return {ok:false,reason:"invalid_deadline"};
  }
  let offsetMinutes = -180; // Local ABC timestamps without a zone: Argentina 2026.
  if (zone && zone.toUpperCase()==="Z") offsetMinutes=0;
  else if (zone) {
    const sign=zone.startsWith("-")?-1:1;
    const oh=Number(zone.slice(1,3)),om=Number(zone.slice(4,6));
    if (oh>23||om>59) return {ok:false,reason:"invalid_deadline"};
    offsetMinutes=sign*(oh*60+om);
  }
  const instant=utcParts-offsetMinutes*60000;
  if (!Number.isFinite(instant)) return {ok:false,reason:"invalid_deadline"};
  return {ok:true,instant_ms:instant,source:zone?"explicit_timezone":"argentina_local_time"};
}
export function apdOfferDeadlineStatus(offer,nowMs=Date.now()){
  const obj=offer?.offer_payload || offer || {};
  const raw=obj?.raw || {};
  const state=String(obj?.estado ?? obj?.estado_oferta ?? raw?.estado ?? raw?.estado_oferta ?? "").trim().toUpperCase();
  if(state!=="PUBLICADA") return {eligible:false,reason:"not_published"};
  // Prefer the authoritative source instant over a formatted display label.
  const rawDeadline=obj?.finoferta || raw?.finoferta || obj?.fecha_cierre_raw ||
    obj?.fecha_cierre || raw?.fecha_cierre || obj?.cierre || "";
  const parse=parseApdDeadlineInstant(rawDeadline);
  if(!parse.ok) return {eligible:false,reason:parse.reason};
  if(parse.instant_ms<=Number(nowMs)) return {eligible:false,reason:"deadline_reached",closes_at_ms:parse.instant_ms};
  return {eligible:true,reason:"verified_open",closes_at_ms:parse.instant_ms};
}

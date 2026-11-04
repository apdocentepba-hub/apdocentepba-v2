/* Single conservative deadline gate for ABC APD offers.
 * Generic ISO dates with Z/offset are absolute instants.
 * ABC's Solr finoferta convention requires local Argentina wall time even
 * when its field has a Z suffix: 07:30Z in ABC means 07:30 Argentina.
 * This source-specific mapping is evidence-based and remains a release gate.
 * A date without time or a missing/invalid deadline is NOT verifiably open.
 * No I/O, no account data, no mutations.
 */
export function parseApdDeadlineInstant(value,options={}) {
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
  if (zone && zone.toUpperCase()==="Z") offsetMinutes=options.abcWallTime===true?-180:0;
  else if (zone) {
    const sign=zone.startsWith("-")?-1:1;
    const oh=Number(zone.slice(1,3)),om=Number(zone.slice(4,6));
    if (oh>23||om>59) return {ok:false,reason:"invalid_deadline"};
    offsetMinutes=sign*(oh*60+om);
  }
  const instant=utcParts-offsetMinutes*60000;
  if (!Number.isFinite(instant)) return {ok:false,reason:"invalid_deadline"};
  return {ok:true,instant_ms:instant,source:zone?.toUpperCase()==="Z"&&options.abcWallTime===true?"abc_local_wall_time":zone?"explicit_timezone":"argentina_local_time"};
}
export function apdOfferDeadlineStatus(offer,nowMs=Date.now()){
  const obj=offer?.offer_payload || offer || {};
  // Re-reading saved offer_payload can nest the ABC raw record multiple
  // times. Empty normalized fields must NOT shadow the official raw fields.
  const raw=obj?.raw || {};
  const nested=raw?.raw || {};
  const original=nested?.raw || {};
  const pick=(...values)=>values.find(v=>String(v??"").trim())||"";
  // Prefer the deepest ABC record over a cached normalized display status.
  // A stale "Publicada" label must never override an official "Cerrada".
  const state=String(pick(
    original?.estado,original?.estado_oferta,
    nested?.estado,nested?.estado_oferta,
    raw?.estado,raw?.estado_oferta,
    obj?.estado,obj?.estado_oferta,obj?.estado_actual
  )).trim().toUpperCase();
  if(state!=="PUBLICADA") return {eligible:false,reason:"not_published"};
  // Raw ABC finoferta wins over display labels after any nesting depth.
  const rawDeadline=pick(
    obj?.finoferta,raw?.finoferta,nested?.finoferta,original?.finoferta,
    obj?.fecha_cierre_raw,raw?.fecha_cierre_raw,nested?.fecha_cierre_raw,
    obj?.fecha_cierre,raw?.fecha_cierre,nested?.fecha_cierre,
    obj?.cierre,raw?.cierre
  );
  const parse=parseApdDeadlineInstant(rawDeadline,{abcWallTime:true});
  if(!parse.ok) return {eligible:false,reason:parse.reason};
  if(parse.instant_ms<=Number(nowMs)) return {eligible:false,reason:"deadline_reached",closes_at_ms:parse.instant_ms};
  return {eligible:true,reason:"verified_open",closes_at_ms:parse.instant_ms};
}

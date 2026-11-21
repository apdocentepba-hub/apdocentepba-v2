/* Aggregate-only privacy screening of the public ABC observaciones field.
 * Never persists, logs, or returns the observation text or source IDs.
 * A clean score does NOT prove that free-form text is safe to display.
 */
const NATIONAL_ID=/\b(?:20|23|24|27|30|33|34)[ -]?\d{8}[ -]?\d\b/;
const EMAIL=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DNI_MARKER=/\b(?:DNI|D\.N\.I\.|CUIL|CUIT|C\.U\.I\.L\.)\b/i;
const PHONE_MARKER=/\b(?:TEL(?:EFONO|ÉFONO)?|CEL(?:ULAR)?|WHATSAPP)\b/i;
const DIGITS7=/\b\d{7,8}\b/;
export function summarizeObservationRisk(records){
 if(!Array.isArray(records))throw Error("Invalid public observations collection");
 const counts={
  documents_checked:records.length,nonempty_observations:0,
  observations_nontext:0,observations_over_500_chars:0,
  possible_personal_identifier:0,possible_email:0,
  possible_phone_reference:0,largest_observation_char_band:"none"
 };
 let maximum=0;
 for(const doc of records){
  const raw=doc?.observaciones;
  if(raw===null||raw===undefined||raw==="")continue;
  if(typeof raw!=="string"){counts.observations_nontext++;continue}
  const value=raw.trim();
  if(!value)continue;
  counts.nonempty_observations++;
  maximum=Math.max(maximum,value.length);
  if(value.length>500)counts.observations_over_500_chars++;
  if(NATIONAL_ID.test(value)||DNI_MARKER.test(value)||DIGITS7.test(value))
   counts.possible_personal_identifier++;
  if(EMAIL.test(value))counts.possible_email++;
  if(PHONE_MARKER.test(value))counts.possible_phone_reference++;
 }
 counts.largest_observation_char_band=maximum===0?"none":
   maximum<=100?"1-100":maximum<=500?"101-500":maximum<=1000?"501-1000":"over-1000";
 return {
  ...counts,
  no_observation_values_returned:true,
  no_source_ids_returned:true,
  content_cannot_be_declared_private_by_regex_alone:true,
  production_use_authorized:false
 };
}

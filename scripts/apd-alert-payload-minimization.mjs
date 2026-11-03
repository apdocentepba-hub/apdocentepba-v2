/* Experimental alert payload minimization. No production worker imports.
 * The browser receives an explicit notice instead of unstructured free text.
 * Original ABC observations remain accessible from the official source;
 * this code never mutates that source or user preferences.
 */
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";
export const OBSERVATION_NOTICE="Hay observaciones en ABC. Consultá el aviso original.";
export const SAFE_RAW_FIELD_KEYS=Object.freeze(PUBLIC_ALERT_FIELDS.filter(
 key=>key!=="observaciones"
));
export function safeObservationNotice(value){
 if(typeof value!=="string"||!value.trim())return "";
 return OBSERVATION_NOTICE;
}
export function safeRawAlertOffer(original){
 if(!original||typeof original!=="object"||Array.isArray(original))
  return {};
 const out={};
 for(const key of SAFE_RAW_FIELD_KEYS){
  const value=original[key];
  // Never return nested values that might hide unreviewed PII.
  if(typeof value==="string"||typeof value==="number"||
     typeof value==="boolean"){
   out[key]=value;
  }
 }
 // Keep a non-sensitive indicator so future consumers know that source
 // remarks were withheld deliberately, not lost during parsing.
 out.observaciones=safeObservationNotice(original.observaciones);
 return out;
}

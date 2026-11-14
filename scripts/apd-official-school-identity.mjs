/**
 * Present an establishment only after an exact, unique ABC WFS key lookup.
 * Public establishment metadata only; never uses the teacher's address, GPS,
 * identity, session, or a guessed location.
 */
import {verifiedSchoolKey} from './apd-school-geodistance.mjs';

const short=(value,max)=>typeof value==='string'?
 value.trim().slice(0,max):'';

export function officialSchoolPresentation(requestedKey,record){
 const key=verifiedSchoolKey(requestedKey);
 if(!key||record?.source!=='ABC_WFS'||
  record.exact_key_match!==true||record.clave!==key)return null;
 const name=short(record.nombre,180);
 if(!name)return null;
 // Field values must be displayed as text, never interpolated into HTML.
 const address=short(record.domicilio,180);
 const cue=short(record.cue,24);
 return Object.freeze({key,name,address,cue,source:'Mapa Escolar ABC / WFS'});
}

/**
 * Update ONLY the current alert's school box, and only if it still corresponds
 * to the requested exact key. A stale response from a previous card is ignored.
 * The current code remains visible for source verification.
 */
export function applyOfficialSchoolIdentity(container,presentation){
 if(!container||!presentation)return false;
 const key=verifiedSchoolKey(presentation.key);
 if(!key||presentation.source!=='Mapa Escolar ABC / WFS')return false;
 const label=container.querySelector?.('.alerta-location-label');
 const value=container.querySelector?.('.alerta-location-value');
 const code=container.querySelector?.('.alerta-location-code');
 if(!label||!value)return false;
 const displayedCode=String(code?.textContent||'').toUpperCase();
 const displayedValue=String(value.textContent||'').trim().toUpperCase();
 // Existing feed-derived name can also have a separate ABC key label.
 if(displayedValue!==key&&!displayedCode.includes(key))return false;
 const doc=container.ownerDocument;
 if(!doc?.createElement)return false;
 label.textContent='Escuela · Mapa Escolar ABC';
 value.textContent=presentation.name;
 let codeLine=code;
 if(!codeLine){
  codeLine=doc.createElement('span');
  codeLine.className='alerta-location-code';
  container.appendChild(codeLine);
 }
 codeLine.textContent='Clave ABC: '+key;
 if(presentation.address){
  let addressLine=container.querySelector?.('.apd-official-school-address');
  if(!addressLine){
   addressLine=doc.createElement('span');
   addressLine.className='apd-official-school-address';
   container.appendChild(addressLine);
  }
  addressLine.textContent='Dirección registrada: '+presentation.address;
 }
 return true;
}

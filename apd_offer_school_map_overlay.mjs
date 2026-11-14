import {fetchVerifiedSchool,verifiedSchoolKey} from './scripts/apd-school-geodistance.mjs?v=20261111-workgeo1';
import {officialSchoolPresentation,applyOfficialSchoolIdentity}
 from './scripts/apd-official-school-identity.mjs?v=20261114-identity1';
/**
 * Optional public-school map links attached to the existing authenticated offer
 * carousel. Never guesses coordinates from an offer, never sends any user data.
 */
const keyPattern=/^[0-9]{4}[A-Z]{2}[0-9]{4}$/;
export function schoolMapHref(alerta) {
 const key=String(alerta?.escuela||alerta?.nombreestablecimiento||'').trim().toUpperCase();
 if(!keyPattern.test(key))return null;
 const district=String(alerta?.distrito||alerta?.descdistrito||'').trim().slice(0,80);
 return './mapa-escuelas-pba.html?'+new URLSearchParams({clave:key,distrito:district}).toString();
}
const SCHOOL_CACHE_LIMIT=24;
const schoolIdentityCache=new Map();
let lookupEpoch=0,activeLookup=null;
function stopSchoolIdentityLookup(){
 lookupEpoch++;
 activeLookup?.abort();
 activeLookup=null;
}
function removeLinks(){
 stopSchoolIdentityLookup();
 document.querySelector('#apd-map-school-link')?.remove();
 document.querySelector('#apd-map-official-link')?.remove();
}
function refreshOfficialSchoolIdentity(offer){
 // The authenticated carousel renders this area. No lookup when absent,
 // including logged-out, unknown-plan, and synthetic empty-card views.
 const schoolBox=document.querySelector(
  '#panel-alertas .alerta-main-card .alerta-location-school');
 const key=verifiedSchoolKey(offer?.escuela);
 if(!schoolBox||!key)return;
 const now=Date.now(),cached=schoolIdentityCache.get(key);
 if(cached&&cached.expires>now){
  if(cached.presentation)applyOfficialSchoolIdentity(schoolBox,cached.presentation);
  return;
 }
 if(cached)schoolIdentityCache.delete(key);
 const requestEpoch=lookupEpoch,controller=new AbortController();
 activeLookup=controller;
 // WFS receives only an establishment key. No domicile, user ID,
 // credentials, GPS or cloud storage is involved.
 void fetchVerifiedSchool(key,{signal:controller.signal}).then(record=>{
  if(controller.signal.aborted||requestEpoch!==lookupEpoch)return;
  const presentation=officialSchoolPresentation(key,record);
  const limit=Date.now()+(presentation?20*60_000:60_000);
  schoolIdentityCache.set(key,{presentation,expires:limit});
  if(schoolIdentityCache.size>SCHOOL_CACHE_LIMIT)
   schoolIdentityCache.delete(schoolIdentityCache.keys().next().value);
  const visibleBox=document.querySelector(
   '#panel-alertas .alerta-main-card .alerta-location-school');
  if(visibleBox&&presentation)
   applyOfficialSchoolIdentity(visibleBox,presentation);
 }).catch(()=>{}).finally(()=>{
  if(activeLookup===controller)activeLookup=null;
 });
}
function anchor(id,text,href){
 const a=document.createElement('a');
 a.id=id;
 a.className='btn btn-secondary alerta-link';
 a.textContent=text;
 a.href=href;a.target='_blank';a.rel='noopener noreferrer';
 return a;
}
export function refreshSchoolMapLinks({offers=[],index=0,enabled=false}={}){
 removeLinks();
 if(enabled!==true)return;
 const actions=document.querySelector('#panel-alertas .alerta-main-card .alerta-actions');
 if(!actions||!Array.isArray(offers)||!Number.isInteger(index))return;
 const current=offers[index];
 if(!current)return;
 const internal=schoolMapHref(current);
 if(internal)actions.appendChild(anchor('apd-map-school-link',
  '📍 Ver escuela en mapa',internal));
 else if(current.escuela)actions.appendChild(anchor('apd-map-official-link',
  'Consultar Mapa Escolar ABC','https://mapaescolar.abc.gob.ar/mapaescolar/'));
 if(internal)refreshOfficialSchoolIdentity(current);
}
window.APD_offerSchoolMapReady=true;
window.APD_offerSchoolMapRefresh=refreshSchoolMapLinks;
window.APD_offerSchoolMapReset=removeLinks;

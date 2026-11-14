import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {officialSchoolPresentation,applyOfficialSchoolIdentity}
 from '../scripts/apd-official-school-identity.mjs';

const key='0005MS0004';
const verified=(extras={})=>({
 source:'ABC_WFS',exact_key_match:true,clave:key,
 nombre:'Escuela Secundaria N° 4',
 domicilio:'Mitre 123',cue:'060000400',lat:-34.66,lon:-58.38,...extras
});
function mockSchoolCard(value=key,code=''){
 const nodes=new Map();
 const make=(className,textContent='')=>({className,textContent});
 nodes.set('alerta-location-label',make('alerta-location-label','Escuela · Clave ABC'));
 nodes.set('alerta-location-value',make('alerta-location-value',value));
 if(code)nodes.set('alerta-location-code',make('alerta-location-code',code));
 const container={
  ownerDocument:{createElement:()=>make('')},
  querySelector(selector){const name=selector.slice(1);return [...nodes.values()].find(n=>n.className.split(/\\s+/).includes(name))||null},
  appendChild(node){nodes.set(node.className,node);}
 };
 return {container,nodes};
}
test('Exact public ABC identity is labelled with source and saved official key',()=>{
 const candidate=officialSchoolPresentation(key,verified());
 assert.equal(candidate.key,key);
 assert.equal(candidate.source,'Mapa Escolar ABC / WFS');
 const {container,nodes}=mockSchoolCard();
 assert.equal(applyOfficialSchoolIdentity(container,candidate),true);
 assert.equal(nodes.get('alerta-location-value').textContent,key);
 assert.equal(container.querySelector('.apd-official-school-name')?.textContent,'Escuela Secundaria N° 4');
 assert.equal(nodes.get('alerta-location-label').textContent,'Escuela · clave ABC');
 assert.equal(container.querySelector('.apd-official-school-name')?.textContent,'Escuela Secundaria N° 4');
 assert.equal(nodes.get('apd-official-school-address').textContent,
  'Dirección registrada: Mitre 123');
});
test('Reject mismatched keys, unconfirmed sources, missing names, unknown layers',()=>{
 for(const row of [
  verified({clave:'0005MS0005'}),
  verified({exact_key_match:false}),
  verified({source:'UNVERIFIED'}),
  verified({nombre:''}),
  verified({nombre:null}),
  verified({clave:'0005MS0004 OR 1=1'})
 ])assert.equal(officialSchoolPresentation(key,row),null);
 assert.equal(officialSchoolPresentation('bad',verified()),null);
 assert.equal(officialSchoolPresentation('0005AB0004',verified()),null);
});
test('Stale response cannot decorate another card',()=>{
 const {container,nodes}=mockSchoolCard('0005MS0099');
 const candidate=officialSchoolPresentation(key,verified());
 assert.equal(applyOfficialSchoolIdentity(container,candidate),false);
 assert.equal(nodes.get('alerta-location-value').textContent,'0005MS0099');
});
test('Current card with a feed name and separate key can be enhanced',()=>{
 const {container,nodes}=mockSchoolCard('Nombre informado','Clave: '+key);
 assert.equal(applyOfficialSchoolIdentity(container,
  officialSchoolPresentation(key,verified({domicilio:''}))),true);
 assert.equal(nodes.get('alerta-location-value').textContent,key);
 assert.equal(container.querySelector('.apd-official-school-name')?.textContent,'Escuela Secundaria N° 4');
 assert.equal(nodes.has('apd-official-school-address'),false);
});
test('Potentially malicious official strings are text only, never HTML',()=>{
 const p=officialSchoolPresentation(key,verified({
  nombre:'<img src=x onerror=alert(1)>',
  domicilio:'<svg onload=alert(1)>'
 }));
 const {container,nodes}=mockSchoolCard();
 assert.equal(applyOfficialSchoolIdentity(container,p),true);
 assert.equal(nodes.get('alerta-location-value').textContent,key);
 assert.equal(container.querySelector('.apd-official-school-name')?.textContent,'<img src=x onerror=alert(1)>');
 assert.equal(nodes.get('apd-official-school-address').textContent,
  'Dirección registrada: <svg onload=alert(1)>');
 const source=readFileSync('scripts/apd-official-school-identity.mjs','utf8');
 assert.doesNotMatch(source,/innerHTML|outerHTML|insertAdjacentHTML/);
});
test('Presentation keeps bounded public strings and immutable value',()=>{
 const p=officialSchoolPresentation(key,verified({
  nombre:'N'.repeat(1000),domicilio:'A'.repeat(1000),cue:'C'.repeat(1000)
 }));
 assert.equal(p.name.length,180);
 assert.equal(p.address.length,180);
 assert.equal(p.cue.length,24);
 assert.ok(Object.isFrozen(p));
});
test('Lookup remains lazy, cancellable, anonymous and limited to school box',()=>{
 const overlay=readFileSync('apd_offer_school_map_overlay.mjs','utf8');
 const html=readFileSync('index.html','utf8');
 assert.match(overlay,/const SCHOOL_CACHE_LIMIT=24/);
 assert.match(overlay,/controller=new AbortController\(\)/);
 assert.match(overlay,/activeLookup\?\.abort\(\)/);
 assert.match(overlay,/requestEpoch!==lookupEpoch/);
 assert.match(overlay,/fetchVerifiedSchool\(key,\{signal:controller\.signal\}\)/);
 assert.match(overlay,/if\(!schoolBox\|\|!key\)return/);
 assert.match(overlay,/if\(enabled!==true\)return/);
 assert.match(html,/planActual\?\.access_active===true/);
 assert.doesNotMatch(overlay,/localStorage|sessionStorage|navigator\.geolocation|\bBearer\b|\bfetch\s*\(/);
});

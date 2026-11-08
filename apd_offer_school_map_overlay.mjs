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
function removeLinks(){
 document.querySelector('#apd-map-school-link')?.remove();
 document.querySelector('#apd-map-official-link')?.remove();
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
}
window.APD_offerSchoolMapReady=true;
window.APD_offerSchoolMapRefresh=refreshSchoolMapLinks;
window.APD_offerSchoolMapReset=removeLinks;

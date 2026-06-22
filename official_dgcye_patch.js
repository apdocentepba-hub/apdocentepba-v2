(function(){
'use strict';
if(window.__apdOfficialDgcyePatchLoaded) return;
window.__apdOfficialDgcyePatchLoaded = true;
function install(){
  var grid=document.querySelector('#panel-tab-pane-inicio .panel-tab-grid');
  var hero=document.getElementById('apd-panel-showcase');
  if(!grid||!hero) return;
  if(!document.getElementById('apd-official-dgcye-style')){
    var s=document.createElement('style');
    s.id='apd-official-dgcye-style';
    s.textContent='.apd-official-dgcye-banner{grid-column:1/-1!important;border-radius:22px!important;padding:22px 24px!important;background:linear-gradient(135deg,#061a37,#0b2d5f 60%,#153d78)!important;color:#fff!important;border:1px solid rgba(255,255,255,.18)!important;box-shadow:0 18px 44px rgba(6,26,55,.16)!important}.apd-official-dgcye-banner h3{margin:0 0 8px!important;color:#fff!important;font-size:clamp(22px,3vw,32px)!important}.apd-official-dgcye-banner p{margin:0 0 14px!important;color:#cfe0ff!important;line-height:1.5!important}.apd-official-dgcye-links{display:flex;gap:9px;flex-wrap:wrap}.apd-official-dgcye-links a{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:10px 13px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);color:#fff!important;text-decoration:none;font-size:12px;font-weight:900}.apd-official-dgcye-links a:first-child{background:#fff;color:#0f3460!important}.apd-official-dgcye-note{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12);color:#b9d7ff!important;font-size:12px}@media(max-width:760px){.apd-official-dgcye-links a{width:100%}}';
    document.head.appendChild(s);
  }
  var card=document.getElementById('apd-official-dgcye-banner');
  if(!card){
    card=document.createElement('div');
    card.id='apd-official-dgcye-banner';
    card.className='panel-card span-12 apd-official-dgcye-banner';
    card.innerHTML='<div style="display:inline-flex;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#dbeafe;margin-bottom:9px">🏛️ Información oficial</div><h3>Accesos oficiales DGCyE / Portal ABC</h3><p>Consultá novedades, comunicados, calendario docente, SAD, APD y listados desde fuentes oficiales de la Provincia de Buenos Aires.</p><div class="apd-official-dgcye-links"><a href="https://abc.gob.ar/mas-noticias" target="_blank" rel="noopener">Comunicados y noticias ABC</a><a href="https://abc.gob.ar/calendario-docente" target="_blank" rel="noopener">Calendario docente</a><a href="https://abc.gob.ar/sad/" target="_blank" rel="noopener">SAD oficiales</a><a href="https://misservicios.abc.gob.ar/actos.publicos.digitales/" target="_blank" rel="noopener">APD oficial</a><a href="https://servado.abc.gob.ar/lof" target="_blank" rel="noopener">Listado oficial</a></div><div class="apd-official-dgcye-note">APDocentePBA organiza accesos útiles, pero no reemplaza comunicaciones oficiales. Verificá siempre normativa, comunicados y fechas en ABC/DGCyE.</div>';
  }
  if(card.parentElement!==grid||card.nextElementSibling!==hero) grid.insertBefore(card,hero);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
[500,1200,2500,5000,9000].forEach(function(ms){setTimeout(install,ms);});
})();

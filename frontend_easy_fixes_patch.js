(function(){
'use strict';
if(window.__apdToolsVisibleLoaded) return;
window.__apdToolsVisibleLoaded = true;

var links = [
  ['./herramientas-docentes.html','🧰 Herramientas'],
  ['./licencias-docentes.html','🧾 Licencias']
];

function addStyle(){
  if(document.getElementById('apd-tools-visible-style')) return;
  var s = document.createElement('style');
  s.id = 'apd-tools-visible-style';
  s.textContent = '.apd-tools-visible-link{border:1px solid #0f3460;background:#0f3460;color:#fff!important;padding:10px 14px;border-radius:999px;font:inherit;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;gap:7px}.apd-tools-visible-link.light{background:#fff;color:#0f3460!important;border-color:#dbe3f0}.apd-tools-row{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.apd-tools-panel-card{grid-column:1/-1;background:#fff;border:1px solid #dbe3f0;border-radius:18px;padding:16px;box-shadow:0 8px 22px rgba(15,52,96,.06)}.apd-tools-panel-card p{margin:8px 0 12px;color:#607086}.apd-tools-panel-card div{display:flex;gap:10px;flex-wrap:wrap}';
  document.head.appendChild(s);
}

function makeLink(item,i){
  var a = document.createElement('a');
  a.href = item[0];
  a.textContent = item[1];
  a.className = 'apd-tools-visible-link' + (i ? ' light' : '');
  return a;
}

function addToHero(){
  var hero = document.querySelector('.hero-card');
  if(!hero || document.getElementById('apd-tools-hero-row')) return;
  var row = document.createElement('div');
  row.id = 'apd-tools-hero-row';
  row.className = 'apd-tools-row';
  links.forEach(function(x,i){ row.appendChild(makeLink(x,i)); });
  hero.appendChild(row);
}

function addToTabs(){
  var nav = document.getElementById('panel-tabs-nav');
  if(!nav) return;
  links.forEach(function(x,i){
    var id = 'apd-tools-tab-link-' + i;
    if(document.getElementById(id)) return;
    var a = makeLink(x,i);
    a.id = id;
    nav.appendChild(a);
  });
}

function addPanelCard(){
  if(document.getElementById('apd-tools-panel-card')) return;
  var grid = document.querySelector('#panel-tab-pane-inicio .panel-tab-grid') || document.getElementById('panel-content');
  if(!grid) return;
  var card = document.createElement('div');
  card.id = 'apd-tools-panel-card';
  card.className = 'apd-tools-panel-card';
  card.innerHTML = '<strong>🧰 Herramientas docentes</strong><p>Funciones rápidas para docentes y secretarías escolares.</p><div><a class="btn btn-primary" href="./licencias-docentes.html">Asistente de Licencias</a><a class="btn btn-secondary" href="./herramientas-docentes.html">Ver herramientas</a></div>';
  grid.appendChild(card);
}

function addToFooter(){
  var f = document.querySelector('.footer-inner');
  if(!f || document.getElementById('apd-tools-footer-link')) return;
  f.appendChild(document.createTextNode(' · '));
  var a = document.createElement('a');
  a.id = 'apd-tools-footer-link';
  a.href = './herramientas-docentes.html';
  a.textContent = 'Herramientas';
  f.appendChild(a);
  f.appendChild(document.createTextNode(' · '));
  var b = document.createElement('a');
  b.href = './licencias-docentes.html';
  b.textContent = 'Licencias docentes';
  f.appendChild(b);
}

function boot(){ addStyle(); addToHero(); addToTabs(); addPanelCard(); addToFooter(); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
[500,1200,2500,5000,9000].forEach(function(ms){ setTimeout(boot, ms); });
})();
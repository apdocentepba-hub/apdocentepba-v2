(function(){
'use strict';
if(window.__apdToolsCleanupLoaded) return;
window.__apdToolsCleanupLoaded = true;

function addFooterLinks(){
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

function removeDuplicateToolLinks(){
  ['apd-tools-tab-link-0','apd-tools-tab-link-1','apd-tools-hero-row','apd-tools-panel-card'].forEach(function(id){
    var el = document.getElementById(id);
    if(el && el.parentNode) el.parentNode.removeChild(el);
  });

  document.querySelectorAll('.panel-actions a[href="./herramientas-docentes.html"], .panel-actions a[href="./licencias-docentes.html"]').forEach(function(el){
    if(el && el.parentNode) el.parentNode.removeChild(el);
  });
}

function boot(){
  removeDuplicateToolLinks();
  addFooterLinks();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
[500,1200,2500,5000,9000].forEach(function(ms){ setTimeout(boot, ms); });
})();
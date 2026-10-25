/* APDocente layout refinements (2026-10-25).
   Presentation-only: moves existing resource cards to the existing Repositorio tab.
   Does not create, modify or remove user or commercial data. */
(function(){
  'use strict';
  function mountStyles(){
    if(document.getElementById('apd-dashboard-compact-css')) return;
    var stylesheet=document.createElement('link');
    stylesheet.id='apd-dashboard-compact-css';
    stylesheet.rel='stylesheet';
    stylesheet.href='./dashboard-compact-20261025.css?v=1';
    document.head.appendChild(stylesheet);
  }
  function tidyResourcePlacement(){
    var target=document.querySelector('#panel-tab-pane-repo .panel-tab-grid');
    if(!target) return;
    // Las herramientas futuras pertenecen a recursos, no a la portada del panel.
    var future=document.getElementById('apd-next-tools-card');
    if(future && future.parentElement!==target) target.appendChild(future);
    // Materiales y enlaces ABC quedan con Repositorio, no antes del panel.
    var resources=document.querySelectorAll('#panel-docente .apd-safe-side-ad');
    resources.forEach(function(resource){
      if(resource.parentElement!==target) target.appendChild(resource);
    });
  }
  function install(){
    mountStyles();
    tidyResourcePlacement();
    [200,900,1800,3500].forEach(function(delay){
      setTimeout(tidyResourcePlacement,delay);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

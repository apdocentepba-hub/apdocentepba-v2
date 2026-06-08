(function(){
'use strict';
if(window.__apdVisualPolishLoaded) return;
window.__apdVisualPolishLoaded = true;

function addStyles(){
  if(document.getElementById('apd-final-polish-style')) return;
  var s=document.createElement('style');
  s.id='apd-final-polish-style';
  s.textContent=`
    body{background:#f5f8ff!important}
    #panel-docente{background:linear-gradient(180deg,#f3f7ff 0%,#fff 36%,#f6f9ff 100%)!important}
    .apd-hero-main{border-radius:0!important}
    .apd-panel-showcase{border-radius:16px!important;overflow:hidden!important}
    .apd-panel-showcase-actions a{cursor:pointer!important}
    .apd-panel-showcase-actions a:hover,.apd-tab-side a:hover,.apd-panel-quick a:hover,.btn:hover,.mini-btn:hover{transform:translateY(-1px);filter:brightness(.99)}
    .apd-panel-showcase-actions a.primary:hover,.btn-primary:hover{box-shadow:0 18px 34px rgba(36,84,245,.28)!important}
    .apd-tab-intro{border-radius:18px!important;margin-bottom:2px!important}
    .apd-tab-intro h2{max-width:720px!important}
    .apd-tab-side a{white-space:nowrap!important}
    .panel-card:not(.apd-panel-showcase):not(.apd-panel-benefits):not(.apd-tab-intro){transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
    .panel-card:not(.apd-panel-showcase):not(.apd-panel-benefits):not(.apd-tab-intro):hover{transform:translateY(-1px);box-shadow:0 16px 36px rgba(16,36,61,.08)!important;border-color:#c9daf0!important}
    .card-lbl,.card-lbl-row .card-lbl{display:flex!important;align-items:center!important;gap:8px!important;font-size:13px!important;text-transform:uppercase!important;letter-spacing:.06em!important}
    .prefs-hint,.ph{color:#64748b!important;line-height:1.5!important}
    .stat-box,.alerta-floating,.historico-box,.radar-box,.backfill-box,.channel-pref-box{border-radius:18px!important;border:1px solid #dbe7f5!important;box-shadow:0 10px 26px rgba(16,36,61,.04)!important;background:#fff!important}
    input,select,textarea{border-radius:13px!important;border-color:#cbd8ea!important}
    input:focus,select:focus,textarea:focus{outline:none!important;border-color:#2454f5!important;box-shadow:0 0 0 4px rgba(36,84,245,.10)!important}
    .btn-danger{background:#e22a2a!important;color:#fff!important;border-color:#e22a2a!important;border-radius:14px!important}
    .apd-top-tab{letter-spacing:-.01em!important}.apd-top-tab.hidden{display:none!important}
    .apd-monitor{animation:apdFloat 5s ease-in-out infinite}.apd-float-bell{animation:apdBell 3.5s ease-in-out infinite}
    @keyframes apdFloat{0%,100%{transform:perspective(900px) rotateY(-4deg) translateY(0)}50%{transform:perspective(900px) rotateY(-4deg) translateY(-6px)}}
    @keyframes apdBell{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-5px) rotate(-2deg)}}
    @media(max-width:760px){.apd-top-tabs{gap:3px!important}.apd-top-tab{font-size:12px!important;padding:8px!important}.apd-panel-showcase{border-radius:18px!important}.apd-tab-side a{width:100%!important}.apd-tab-side{width:100%!important}.panel-tab-grid{gap:14px!important}}
    body.apd-dark .stat-box,body.apd-dark .alerta-floating,body.apd-dark .historico-box,body.apd-dark .radar-box,body.apd-dark .backfill-box,body.apd-dark .channel-pref-box{background:#12243a!important;border-color:#31455f!important;color:#f2f7ff!important}
  `;
  document.head.appendChild(s);
}

function stabilizeInitialScroll(){
  try{ if('scrollRestoration' in history) history.scrollRestoration='manual'; }catch(e){}
  var hasHash = !!location.hash;
  var clickedOrTyped = false;
  ['click','touchstart','wheel','keydown'].forEach(function(evt){
    window.addEventListener(evt,function(){ clickedOrTyped=true; },{once:true,passive:true});
  });
  function shouldPinTop(){
    if(hasHash || clickedOrTyped) return false;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    return y > 0 && y < 260;
  }
  function pinTop(){
    if(shouldPinTop()) window.scrollTo({top:0,left:0,behavior:'auto'});
  }
  [0,60,160,320,650,1200,2200,3800].forEach(function(ms){ setTimeout(pinTop,ms); });
}

function removeDuplicateToolLinks(){
  ['apd-tools-tab-link-0','apd-tools-tab-link-1','apd-tools-hero-row','apd-tools-panel-card'].forEach(function(id){
    var el=document.getElementById(id); if(el&&el.parentNode) el.parentNode.removeChild(el);
  });
  document.querySelectorAll('.panel-actions a[href="./herramientas-docentes.html"], .panel-actions a[href="./licencias-docentes.html"]').forEach(function(el){
    if(el&&el.parentNode) el.parentNode.removeChild(el);
  });
}

function activateTab(key){
  if(typeof window.APD_activatePanelTab==='function'){
    window.APD_activatePanelTab(key);
  }
}

function scrollToPanelStart(){
  var target=document.getElementById('panel-datos-docente') || document.querySelector('#panel-tab-pane-inicio .panel-card:not(#apd-panel-showcase):not(#apd-panel-benefits)');
  if(target){ target.scrollIntoView({behavior:'smooth',block:'start'}); }
}

function fixMainButtons(){
  document.querySelectorAll('.apd-panel-showcase-actions a').forEach(function(a){
    var txt=(a.textContent||'').toLowerCase();
    if(txt.indexOf('ver mis alertas')>-1){
      a.href='#alertas';
      a.onclick=function(ev){ ev.preventDefault(); activateTab('alertas'); setTimeout(function(){var x=document.getElementById('panel-alertas'); if(x) x.scrollIntoView({behavior:'smooth',block:'start'});},120); };
    }
    if(txt.indexOf('ir al panel')>-1){
      a.href='#panel';
      a.onclick=function(ev){ ev.preventDefault(); activateTab('inicio'); setTimeout(scrollToPanelStart,160); };
    }
  });

  var publicHero=document.querySelector('#inicio .hero-card');
  if(publicHero){
    var buttons=publicHero.querySelectorAll('.hero-actions button');
    buttons.forEach(function(btn){
      var t=(btn.textContent||'').toLowerCase();
      if(t.indexOf('ver mis alertas')>-1){
        btn.onclick=function(){
          if(!document.getElementById('navPrivado')?.classList.contains('hidden')){ mostrarSeccion('panel-docente'); setTimeout(function(){activateTab('alertas');},200); }
          else { mostrarSeccion('login'); }
        };
      }
      if(t.indexOf('ir al panel')>-1){
        btn.onclick=function(){
          if(!document.getElementById('navPrivado')?.classList.contains('hidden')){ mostrarSeccion('panel-docente'); setTimeout(function(){activateTab('inicio'); scrollToPanelStart();},250); }
          else { mostrarSeccion('login'); }
        };
      }
    });
  }
}

function makeCardsConsistent(){
  document.querySelectorAll('.panel-card').forEach(function(card){
    if(!card.dataset.polished){ card.dataset.polished='1'; }
  });
}

function boot(){
  addStyles();
  stabilizeInitialScroll();
  removeDuplicateToolLinks();
  fixMainButtons();
  makeCardsConsistent();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
[400,900,1600,2800,5000,9000].forEach(function(ms){setTimeout(boot,ms);});
})();
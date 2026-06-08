(function(){
'use strict';
if(window.__apdVisualPolishLoaded) return;
window.__apdVisualPolishLoaded = true;
window.__apdInitialLoading = true;
setTimeout(function(){ window.__apdInitialLoading = false; }, 2600);

function addStyles(){
  if(document.getElementById('apd-final-polish-style')) return;
  var s=document.createElement('style');
  s.id='apd-final-polish-style';
  s.textContent=`
    html,body{scroll-padding-top:92px!important}
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
    .footer-inner{max-width:1180px!important;margin:0 auto!important;padding:28px 22px!important;color:#dbeafe!important}
    .footer-inner>div:first-child{display:grid!important;grid-template-columns:1.4fr repeat(3,1fr)!important;gap:22px!important;align-items:start!important;text-align:left!important}
    .footer-inner>div:first-child>div{display:flex!important;flex-direction:column!important;gap:6px!important;min-width:0!important}
    .footer-inner strong{display:block!important;margin-bottom:6px!important;color:#fff!important}
    .footer-inner a{display:block!important;color:#cfe0ff!important;text-decoration:none!important;font-weight:800!important;margin:2px 0!important;white-space:normal!important}
    .footer-inner p{margin:8px 0!important;color:#b9d7ff!important;line-height:1.45!important}
    .footer-inner>div:last-child{text-align:center!important;border-top:1px solid rgba(255,255,255,.12)!important;margin-top:22px!important;padding-top:14px!important;color:#9fb9dc!important}
    @media(max-width:760px){.apd-top-tabs{gap:3px!important}.apd-top-tab{font-size:12px!important;padding:8px!important}.apd-panel-showcase{border-radius:18px!important}.apd-tab-side a{width:100%!important}.apd-tab-side{width:100%!important}.panel-tab-grid{gap:14px!important}.footer-inner>div:first-child{grid-template-columns:1fr!important}}
    body.apd-dark .stat-box,body.apd-dark .alerta-floating,body.apd-dark .historico-box,body.apd-dark .radar-box,body.apd-dark .backfill-box,body.apd-dark .channel-pref-box{background:#12243a!important;border-color:#31455f!important;color:#f2f7ff!important}
  `;
  document.head.appendChild(s);
}

function stabilizeInitialScroll(){
  try{ if('scrollRestoration' in history) history.scrollRestoration='manual'; }catch(e){}
  var hasHash = !!location.hash;
  var clickedOrTyped = false;
  ['click','touchstart','wheel','keydown','mousedown'].forEach(function(evt){
    window.addEventListener(evt,function(){ clickedOrTyped=true; window.__apdInitialLoading=false; },{once:true,passive:true});
  });
  function shouldPinTop(){
    if(hasHash || clickedOrTyped || !window.__apdInitialLoading) return false;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    return y > 0 && y < 900;
  }
  function pinTop(){ if(shouldPinTop()) window.scrollTo(0,0); }
  window.scrollTo(0,0);
  [0,30,80,150,260,420,650,900,1250,1700,2300].forEach(function(ms){ setTimeout(pinTop,ms); });
}

function removeDuplicateToolLinks(){
  ['apd-tools-tab-link-0','apd-tools-tab-link-1','apd-tools-hero-row','apd-tools-panel-card'].forEach(function(id){
    var el=document.getElementById(id); if(el&&el.parentNode) el.parentNode.removeChild(el);
  });
  document.querySelectorAll('.panel-actions a[href="./herramientas-docentes.html"], .panel-actions a[href="./licencias-docentes.html"]').forEach(function(el){ if(el&&el.parentNode) el.parentNode.removeChild(el); });
}

function activateTab(key, userInitiated){
  window.__apdInitialLoading = false;
  if(typeof window.APD_activatePanelTab==='function') window.APD_activatePanelTab(key, !!userInitiated);
}

function installTabScrollFix(){
  if(window.__apdTabScrollFixInstalled) return;
  window.__apdTabScrollFixInstalled = true;
  document.addEventListener('click', function(ev){
    var btn = ev.target && ev.target.closest && ev.target.closest('.apd-top-tab[data-top-tab-key]');
    if(!btn) return;
    window.__apdInitialLoading = false;
    var key = btn.getAttribute('data-top-tab-key') || 'inicio';
    setTimeout(function(){
      if(key === 'inicio') window.scrollTo({top:0,left:0,behavior:'auto'});
    }, 40);
  }, true);
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
      a.onclick=function(ev){ ev.preventDefault(); activateTab('alertas', true); setTimeout(function(){var x=document.getElementById('panel-alertas'); if(x) x.scrollIntoView({behavior:'smooth',block:'start'});},120); };
    }
    if(txt.indexOf('ir al panel')>-1){
      a.href='#panel';
      a.onclick=function(ev){ ev.preventDefault(); activateTab('inicio', true); setTimeout(scrollToPanelStart,160); };
    }
  });

  var publicHero=document.querySelector('#inicio .hero-card');
  if(publicHero){
    var buttons=publicHero.querySelectorAll('.hero-actions button');
    buttons.forEach(function(btn){
      var t=(btn.textContent||'').toLowerCase();
      if(t.indexOf('ver mis alertas')>-1){
        btn.onclick=function(){ window.__apdInitialLoading=false; if(!document.getElementById('navPrivado')?.classList.contains('hidden')){ mostrarSeccion('panel-docente'); setTimeout(function(){activateTab('alertas', true);},200); } else { mostrarSeccion('login'); } };
      }
      if(t.indexOf('ir al panel')>-1){
        btn.onclick=function(){ window.__apdInitialLoading=false; if(!document.getElementById('navPrivado')?.classList.contains('hidden')){ mostrarSeccion('panel-docente'); setTimeout(function(){activateTab('inicio', true); scrollToPanelStart();},250); } else { mostrarSeccion('login'); } };
      }
    });
  }
}

function makeCardsConsistent(){
  document.querySelectorAll('.panel-card').forEach(function(card){ if(!card.dataset.polished){ card.dataset.polished='1'; } });
}

function boot(){
  addStyles();
  stabilizeInitialScroll();
  installTabScrollFix();
  removeDuplicateToolLinks();
  fixMainButtons();
  makeCardsConsistent();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
[400,900,1600,2800,5000,9000].forEach(function(ms){setTimeout(function(){ addStyles(); installTabScrollFix(); removeDuplicateToolLinks(); fixMainButtons(); makeCardsConsistent(); },ms);});
})();
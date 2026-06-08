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

    #login,#registro{background:linear-gradient(180deg,#f3f7ff 0%,#ffffff 55%,#f6f9ff 100%)!important;min-height:calc(100vh - 92px)}
    #login .form-wrap,#registro .form-wrap{max-width:1120px!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(360px,430px)!important;gap:22px!important;align-items:stretch!important;padding-top:36px!important;padding-bottom:46px!important}
    .apd-auth-aside{position:relative;overflow:hidden;border-radius:26px;background:linear-gradient(135deg,#061a37,#0b2d5f);color:#fff;padding:34px;box-shadow:0 22px 55px rgba(6,26,55,.20);min-height:520px;display:flex;flex-direction:column;justify-content:space-between}
    .apd-auth-aside:after{content:'🔔';position:absolute;right:26px;top:26px;width:74px;height:74px;border-radius:22px;background:linear-gradient(135deg,#2454f5,#687cff);display:grid;place-items:center;font-size:34px;box-shadow:0 18px 42px rgba(36,84,245,.35)}
    .apd-auth-kicker{display:inline-flex;align-self:flex-start;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:8px 12px;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#cfe0ff;margin-bottom:18px}
    .apd-auth-aside h2{font-size:clamp(34px,4vw,52px);line-height:.98;letter-spacing:-.055em;margin:0 0 14px;color:#fff}.apd-auth-aside h2 span{color:#79a8ff;display:block}.apd-auth-aside p{color:#cfe0ff;line-height:1.58;margin:0;max-width:520px}.apd-auth-list{display:grid;gap:12px;margin-top:24px}.apd-auth-list div{display:flex;gap:10px;align-items:flex-start;color:#e7f0ff;font-weight:800}.apd-auth-list i{font-style:normal;width:30px;height:30px;border-radius:11px;background:rgba(255,255,255,.12);display:grid;place-items:center;flex:0 0 auto}.apd-auth-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:28px}.apd-auth-mini span{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px;font-size:12px;font-weight:900;color:#dbeafe;text-align:center}
    #login .form-card,#registro .form-card{border-radius:26px!important;border:1px solid #dbe7f5!important;box-shadow:0 22px 55px rgba(16,36,61,.10)!important;background:#fff!important;overflow:hidden!important;padding:0!important}
    #login .form-card-hdr,#registro .form-card-hdr{background:linear-gradient(135deg,#fff,#f8fbff)!important;border-bottom:1px solid #edf2f8!important;padding:26px 28px!important}
    #login .form-card-hdr h2,#registro .form-card-hdr h2{font-size:30px!important;line-height:1!important;letter-spacing:-.05em!important;color:#061a37!important;margin:0 0 8px!important;font-weight:900!important}
    #login .form-card-hdr p,#registro .form-card-hdr p{color:#64748b!important;margin:0!important;line-height:1.5!important}
    #login form,#registro form{padding:24px 28px 0!important}#login .separator,#registro .separator{margin:20px 28px 14px!important}#login .google-wrap,#registro .google-wrap{padding:0 28px 26px!important}
    #login .field,#registro .field{margin-bottom:15px!important}#login label,#registro label{font-weight:900!important;color:#0f3460!important;margin-bottom:7px!important}#login input,#registro input{height:48px!important;background:#fbfdff!important;border:1px solid #cbd8ea!important;color:#061a37!important;font-weight:700!important}
    #login .form-foot,#registro .form-foot{border-top:1px solid #edf2f8;margin-top:18px!important;padding-top:16px!important;color:#64748b!important}.link-btn{font-weight:900!important;color:#2454f5!important}.msg{display:block!important;margin-top:12px!important;border-radius:14px!important;padding:10px 12px!important}.msg:empty{display:none!important}

    .apd-next-tools{grid-column:1/-1!important;position:relative;overflow:hidden;border-radius:22px!important;border:1px solid #dbe7f5!important;background:linear-gradient(135deg,#061a37 0%,#0b2d5f 58%,#153d78 100%)!important;color:#fff!important;box-shadow:0 20px 48px rgba(6,26,55,.18)!important;padding:28px!important}
    .apd-next-tools:after{content:'✨';position:absolute;right:22px;top:20px;width:68px;height:68px;border-radius:22px;background:rgba(255,255,255,.10);display:grid;place-items:center;font-size:30px}
    .apd-next-tools h3{margin:0 0 8px!important;color:#fff!important;font-size:27px!important;letter-spacing:-.04em!important}.apd-next-tools p{margin:0 0 20px!important;color:#cfe0ff!important;line-height:1.55!important;max-width:760px}.apd-next-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.apd-next-item{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:16px;color:#eaf2ff}.apd-next-item b{display:block;color:#fff;margin-bottom:6px}.apd-next-item span{display:block;color:#cfe0ff;font-size:12px;line-height:1.35}.apd-next-item i{font-style:normal;width:36px;height:36px;border-radius:13px;background:rgba(255,255,255,.12);display:grid;place-items:center;margin-bottom:10px}

    #panel-alertas .ph,#panel-historial .ph,#panel-estadisticas .ph,#panel-radar-provincia .ph{background:#f8fbff!important;border:1px dashed #cbd8ea!important;border-radius:16px!important;padding:16px!important;color:#64748b!important}
    #panel-alertas .alerta-row,#panel-alertas .alerta-floating,#panel-alertas [class*='alerta-']{border-radius:18px!important;border-color:#dbe7f5!important}.alerta-title,.historico-title{font-weight:900!important;color:#061a37!important}.alerta-meta-item,.historico-offer{border-radius:14px!important;background:#f8fbff!important;border:1px solid #edf2f8!important}.alerta-progress{height:9px!important;border-radius:999px!important;background:#edf2f8!important}.alerta-progress-bar{border-radius:999px!important;background:linear-gradient(90deg,#2454f5,#13b981)!important}
    .plan-pill,.badge-num,.tag-nivel,.historico-chip,.apd-channel-chip{border-radius:999px!important;font-weight:900!important;background:#eef6ff!important;color:#0f4fb8!important;border:1px solid #d5e7ff!important}.msg-ok{background:#ecfdf5!important;color:#047857!important;border:1px solid #a7f3d0!important}.msg-info{background:#eff6ff!important;color:#1d4ed8!important;border:1px solid #bfdbfe!important}.msg-error{background:#fff1f2!important;color:#be123c!important;border:1px solid #fecdd3!important}
    .field-group,.prefs-block,.prefs-card,.channel-pref-box{border-radius:20px!important;border:1px solid #dbe7f5!important;background:#fff!important;box-shadow:0 10px 26px rgba(16,36,61,.04)!important}.ac-list{border-radius:16px!important;border:1px solid #dbe7f5!important;box-shadow:0 18px 36px rgba(16,36,61,.12)!important;overflow:hidden!important}.ac-item{padding:11px 13px!important}.ac-item:hover,.ac-item.is-active{background:#eef6ff!important;color:#0f4fb8!important}

    .footer-inner{max-width:1180px!important;margin:0 auto!important;padding:28px 22px!important;color:#dbeafe!important}.footer-inner>div:first-child{display:grid!important;grid-template-columns:1.4fr repeat(3,1fr)!important;gap:22px!important;align-items:start!important;text-align:left!important}.footer-inner>div:first-child>div{display:flex!important;flex-direction:column!important;gap:6px!important;min-width:0!important}.footer-inner strong{display:block!important;margin-bottom:6px!important;color:#fff!important}.footer-inner a{display:block!important;color:#cfe0ff!important;text-decoration:none!important;font-weight:800!important;margin:2px 0!important;white-space:normal!important}.footer-inner p{margin:8px 0!important;color:#b9d7ff!important;line-height:1.45!important}.footer-inner>div:last-child{text-align:center!important;border-top:1px solid rgba(255,255,255,.12)!important;margin-top:22px!important;padding-top:14px!important;color:#9fb9dc!important}
    @media(max-width:900px){#login .form-wrap,#registro .form-wrap{grid-template-columns:1fr!important}.apd-auth-aside{min-height:auto}.apd-auth-mini{grid-template-columns:1fr 1fr 1fr}.apd-next-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:760px){.apd-top-tabs{gap:3px!important}.apd-top-tab{font-size:12px!important;padding:8px!important}.apd-panel-showcase{border-radius:18px!important}.apd-tab-side a{width:100%!important}.apd-tab-side{width:100%!important}.panel-tab-grid{gap:14px!important}.footer-inner>div:first-child{grid-template-columns:1fr!important}.apd-auth-aside{padding:24px}.apd-auth-aside:after{display:none}.apd-auth-mini{grid-template-columns:1fr}#login form,#registro form,#login .form-card-hdr,#registro .form-card-hdr{padding-left:20px!important;padding-right:20px!important}.apd-next-grid{grid-template-columns:1fr}.apd-next-tools{padding:22px!important}}
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
    setTimeout(function(){ if(key === 'inicio') window.scrollTo({top:0,left:0,behavior:'auto'}); }, 40);
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
      if(t.indexOf('ver mis alertas')>-1){ btn.onclick=function(){ window.__apdInitialLoading=false; if(!document.getElementById('navPrivado')?.classList.contains('hidden')){ mostrarSeccion('panel-docente'); setTimeout(function(){activateTab('alertas', true);},200); } else { mostrarSeccion('login'); } }; }
      if(t.indexOf('ir al panel')>-1){ btn.onclick=function(){ window.__apdInitialLoading=false; if(!document.getElementById('navPrivado')?.classList.contains('hidden')){ mostrarSeccion('panel-docente'); setTimeout(function(){activateTab('inicio', true); scrollToPanelStart();},250); } else { mostrarSeccion('login'); } }; }
    });
  }
}

function enhanceAuthScreens(){
  ['login','registro'].forEach(function(id){
    var sec=document.getElementById(id); if(!sec) return;
    var wrap=sec.querySelector('.form-wrap'); var card=sec.querySelector('.form-card');
    if(!wrap || !card || wrap.querySelector('.apd-auth-aside')) return;
    var isReg=id==='registro';
    var aside=document.createElement('aside');
    aside.className='apd-auth-aside';
    aside.innerHTML='<div><span class="apd-auth-kicker">'+(isReg?'Crear cuenta docente':'Panel docente PBA')+'</span><h2>'+(isReg?'Empezá a recibir <span>alertas útiles</span>':'Entrá a tu <span>panel docente</span>')+'</h2><p>'+(isReg?'Configurá distritos, cargos, niveles y canales para seguir oportunidades APD con menos vueltas.':'Consultá tus alertas, preferencias, plan y herramientas desde un solo lugar.')+'</p><div class="apd-auth-list"><div><i>🔔</i><span>Alertas APD compatibles con tu perfil</span></div><div><i>🧰</i><span>Herramientas docentes y licencias PBA</span></div><div><i>📊</i><span>Radar, estadísticas y seguimiento</span></div></div></div><div class="apd-auth-mini"><span>Email</span><span>Telegram</span><span>WhatsApp</span></div>';
    wrap.insertBefore(aside, card);
  });
}

function enhanceInicioExtras(){
  var pane=document.getElementById('panel-tab-pane-inicio');
  var grid=pane && pane.querySelector('.panel-tab-grid');
  if(!grid || document.getElementById('apd-next-tools-card')) return;
  var anchor=document.getElementById('apd-panel-benefits') || document.getElementById('apd-panel-showcase');
  var card=document.createElement('div');
  card.id='apd-next-tools-card';
  card.className='panel-card span-12 apd-next-tools';
  card.innerHTML='<h3>Próximas herramientas para docentes</h3><p>La idea es que APDocentePBA sea una caja de herramientas real: no solo alertas, también recursos para resolver tareas docentes de todos los días.</p><div class="apd-next-grid"><div class="apd-next-item"><i>📝</i><b>Generador de notas</b><span>Modelos para reclamos, solicitudes y presentaciones.</span></div><div class="apd-next-item"><i>💰</i><b>Control de haberes</b><span>Guía para revisar descuentos, secuencias y pagos.</span></div><div class="apd-next-item"><i>📚</i><b>Biblioteca normativa</b><span>Estatuto, licencias, APD, régimen académico y secretaría.</span></div><div class="apd-next-item"><i>🪪</i><b>Herramientas PID</b><span>Accesos y ayudas para listados y puntajes.</span></div></div>';
  if(anchor && anchor.parentElement===grid) anchor.insertAdjacentElement('afterend',card); else grid.appendChild(card);
}

function enhanceEmptyStates(){
  var blocks=[['panel-alertas','Todavía no hay alertas visibles acá. Revisá tus preferencias o ampliá distritos/cargos para aumentar coincidencias.'],['panel-historial','Cuando haya movimientos o alertas vistas, el historial aparecerá en este bloque.'],['panel-estadisticas','Las estadísticas se muestran cuando hay datos suficientes para analizar tu perfil.']];
  blocks.forEach(function(pair){
    var el=document.getElementById(pair[0]); if(!el || el.dataset.emptyHintReady) return;
    setTimeout(function(){
      if(!el || el.dataset.emptyHintReady) return;
      var txt=(el.textContent||'').trim().toLowerCase();
      if(!txt || txt==='cargando...' || txt.indexOf('cargando')>-1){
        var p=el.querySelector('.ph') || document.createElement('p');
        p.className='ph'; p.textContent=pair[1];
        if(!p.parentElement) el.appendChild(p);
        el.dataset.emptyHintReady='1';
      }
    },3800);
  });
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
  enhanceAuthScreens();
  enhanceInicioExtras();
  enhanceEmptyStates();
  makeCardsConsistent();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
[400,900,1600,2800,5000,9000].forEach(function(ms){setTimeout(function(){ addStyles(); installTabScrollFix(); removeDuplicateToolLinks(); fixMainButtons(); enhanceAuthScreens(); enhanceInicioExtras(); enhanceEmptyStates(); makeCardsConsistent(); },ms);});
})();
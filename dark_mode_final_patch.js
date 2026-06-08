(function(){
'use strict';
if(window.__apdDarkModeFinalPatchLoaded) return;
window.__apdDarkModeFinalPatchLoaded = true;

function inject(){
  var old=document.getElementById('apd-dark-mode-final-style');
  if(old) old.remove();
  var s=document.createElement('style');
  s.id='apd-dark-mode-final-style';
  s.textContent=`
    /* Próximas herramientas: siempre con contraste */
    #apd-next-tools-card.apd-next-tools,
    .apd-next-tools{
      background:linear-gradient(135deg,#061a37 0%,#0b2d5f 58%,#153d78 100%)!important;
      color:#fff!important;
      border:1px solid rgba(219,231,245,.55)!important;
      box-shadow:0 20px 48px rgba(6,26,55,.22)!important;
    }
    #apd-next-tools-card.apd-next-tools h3,
    #apd-next-tools-card.apd-next-tools b,
    .apd-next-tools h3,
    .apd-next-tools b{color:#fff!important}
    #apd-next-tools-card.apd-next-tools p,
    #apd-next-tools-card.apd-next-tools span,
    .apd-next-tools p,
    .apd-next-tools span{color:#cfe0ff!important}
    #apd-next-tools-card .apd-next-item,
    .apd-next-tools .apd-next-item{background:rgba(255,255,255,.11)!important;border:1px solid rgba(255,255,255,.18)!important;color:#eaf2ff!important}

    /* Dark mode nuclear overrides */
    body.apd-dark, body.apd-dark main, body.apd-dark .section, body.apd-dark #panel-docente, body.apd-dark #panel-docente>.container{background:#071426!important;color:#eaf2ff!important}
    body.apd-dark .panel-tab-grid>.panel-card,
    body.apd-dark .panel-card,
    body.apd-dark .panel-card.span-4,
    body.apd-dark .panel-card.span-8,
    body.apd-dark .panel-card.span-12,
    body.apd-dark #panel-content>.panel-card,
    body.apd-dark #panel-tabs-wrap .panel-card,
    body.apd-dark .prefs-card,
    body.apd-dark .form-card,
    body.apd-dark .hero-card,
    body.apd-dark .apd-panel-showcase,
    body.apd-dark .apd-panel-benefits,
    body.apd-dark .apd-tab-intro,
    body.apd-dark .apd-panel-quick,
    body.apd-dark .apd-panel-quick a,
    body.apd-dark .field-group,
    body.apd-dark .prefs-block,
    body.apd-dark .channel-pref-box,
    body.apd-dark .stat-box,
    body.apd-dark .alerta-floating,
    body.apd-dark .historico-box,
    body.apd-dark .radar-box,
    body.apd-dark .backfill-box,
    body.apd-dark .alerta-row,
    body.apd-dark .alerta-meta-item,
    body.apd-dark .historico-offer,
    body.apd-dark .plan-expiration-box{
      background:#10233a!important;color:#eaf2ff!important;border-color:#31506f!important;box-shadow:0 14px 34px rgba(0,0,0,.24)!important;
    }
    body.apd-dark .apd-hero-main,
    body.apd-dark .apd-tab-intro,
    body.apd-dark #login .form-card-hdr,
    body.apd-dark #registro .form-card-hdr{background:linear-gradient(135deg,#10233a,#0b1b2e)!important;border-color:#31506f!important}
    body.apd-dark #apd-next-tools-card.apd-next-tools,
    body.apd-dark .apd-next-tools{background:linear-gradient(135deg,#061a37 0%,#0b2d5f 58%,#153d78 100%)!important;color:#fff!important;border-color:#31506f!important}
    body.apd-dark h1,body.apd-dark h2,body.apd-dark h3,body.apd-dark h4,body.apd-dark h5,body.apd-dark h6,body.apd-dark b,body.apd-dark strong,
    body.apd-dark .card-lbl,body.apd-dark .apd-panel-quick b,body.apd-dark .apd-benefit b,body.apd-dark .apd-tab-intro h2,body.apd-dark .apd-panel-showcase h2,
    body.apd-dark .plan-title,body.apd-dark .alerta-title,body.apd-dark .historico-title,body.apd-dark .form-card-hdr h2{color:#f8fbff!important}
    body.apd-dark p,body.apd-dark span,body.apd-dark label,body.apd-dark li,body.apd-dark td,body.apd-dark th,body.apd-dark small,
    body.apd-dark .prefs-hint,body.apd-dark .ph,body.apd-dark .panel-sub,body.apd-dark .muted,body.apd-dark .text-muted,
    body.apd-dark .apd-panel-quick span,body.apd-dark .apd-benefit span,body.apd-dark .apd-tab-intro p,
    body.apd-dark #panel-preferencias-resumen,body.apd-dark #panel-plan,body.apd-dark #panel-canales,body.apd-dark #panel-datos-docente{color:#cfe0ff!important}
    body.apd-dark #apd-next-tools-card.apd-next-tools *,body.apd-dark .apd-next-tools *{color:#fff!important}
    body.apd-dark #apd-next-tools-card.apd-next-tools p,body.apd-dark #apd-next-tools-card .apd-next-item span,body.apd-dark .apd-next-tools p,body.apd-dark .apd-next-tools .apd-next-item span{color:#cfe0ff!important}
    body.apd-dark input,body.apd-dark select,body.apd-dark textarea{background:#071426!important;color:#fff!important;border-color:#426381!important;caret-color:#fff!important}
    body.apd-dark input::placeholder,body.apd-dark textarea::placeholder{color:#8fb1d6!important;opacity:1!important}
    body.apd-dark .btn-secondary,body.apd-dark .btn-outline,body.apd-dark .btn-ghost,body.apd-dark .mini-btn,
    body.apd-dark .plan-pill,body.apd-dark .badge-num,body.apd-dark .tag-nivel,body.apd-dark .historico-chip,body.apd-dark .apd-channel-chip,body.apd-dark .apd-tab-chip,
    body.apd-dark .mi-cuenta, body.apd-dark .chip, body.apd-dark .pill, body.apd-dark .badge{background:#173454!important;color:#eaf2ff!important;border-color:#426381!important}
    body.apd-dark .btn-primary,body.apd-dark .apd-panel-showcase-actions a.primary,body.apd-dark .apd-tab-side a:first-child{background:#2563eb!important;color:#fff!important;border-color:#60a5fa!important}
    body.apd-dark .card-lbl,body.apd-dark .card-lbl-row .card-lbl{background:transparent!important;color:#f8fbff!important;border:0!important;box-shadow:none!important}
    body.apd-dark .footer,body.apd-dark footer{background:#061a37!important;color:#dbeafe!important;border-top:1px solid #31506f!important}
    body.apd-dark .apd-theme-toggle{background:#f8fbff!important;color:#061a37!important;border-color:#fff!important}
  `;
  document.head.appendChild(s);
}

function setImportant(el, prop, value){try{el.style.setProperty(prop,value,'important');}catch(e){}}
function forceDarkInline(){
  if(!document.body.classList.contains('apd-dark')) return;
  var darkCards=document.querySelectorAll('.panel-card,.prefs-card,.form-card,.hero-card,.apd-panel-showcase,.apd-panel-benefits,.apd-tab-intro,.apd-panel-quick,.apd-panel-quick a,.field-group,.prefs-block,.channel-pref-box,.stat-box,.alerta-floating,.historico-box,.radar-box,.backfill-box,.alerta-row,.alerta-meta-item,.historico-offer,.plan-expiration-box');
  darkCards.forEach(function(el){
    if(el.classList.contains('apd-next-tools')) return;
    setImportant(el,'background','#10233a');
    setImportant(el,'color','#eaf2ff');
    setImportant(el,'border-color','#31506f');
  });
  document.querySelectorAll('#apd-next-tools-card,.apd-next-tools').forEach(function(el){
    setImportant(el,'background','linear-gradient(135deg,#061a37 0%,#0b2d5f 58%,#153d78 100%)');
    setImportant(el,'color','#fff');
    setImportant(el,'border-color','#31506f');
  });
}
function boot(){inject();forceDarkInline();}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
[150,400,900,1600,2600,4200,6500].forEach(function(ms){setTimeout(boot,ms);});
var mo=new MutationObserver(function(){boot();});
if(document.documentElement) mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
})();

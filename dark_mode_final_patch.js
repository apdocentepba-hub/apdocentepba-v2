(function(){
'use strict';
if(window.__apdDarkModeFinalPatchLoaded) return;
window.__apdDarkModeFinalPatchLoaded = true;

function inject(){
  if(document.getElementById('apd-dark-mode-final-style')) return;
  var s=document.createElement('style');
  s.id='apd-dark-mode-final-style';
  s.textContent=`
    .apd-next-tools,
    body:not(.apd-dark) .apd-next-tools{
      background:linear-gradient(135deg,#061a37 0%,#0b2d5f 58%,#153d78 100%)!important;
      color:#fff!important;
      border-color:rgba(219,231,245,.55)!important;
    }
    .apd-next-tools h3,
    .apd-next-tools b,
    body:not(.apd-dark) .apd-next-tools h3,
    body:not(.apd-dark) .apd-next-tools b{color:#fff!important}
    .apd-next-tools p,
    .apd-next-tools span,
    body:not(.apd-dark) .apd-next-tools p,
    body:not(.apd-dark) .apd-next-tools span{color:#cfe0ff!important}
    .apd-next-tools .apd-next-item,
    body:not(.apd-dark) .apd-next-tools .apd-next-item{
      background:rgba(255,255,255,.10)!important;
      border:1px solid rgba(255,255,255,.16)!important;
      color:#eaf2ff!important;
    }

    body.apd-dark,
    body.apd-dark main,
    body.apd-dark .section,
    body.apd-dark #panel-docente,
    body.apd-dark #panel-docente>.container{
      background:#071426!important;
      color:#eaf2ff!important;
    }
    body.apd-dark .panel-tab-grid>.panel-card,
    body.apd-dark .panel-card,
    body.apd-dark .panel-card.span-4,
    body.apd-dark .panel-card.span-8,
    body.apd-dark .panel-card.span-12,
    body.apd-dark #panel-content>.panel-card,
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
      background:#10233a!important;
      color:#eaf2ff!important;
      border-color:#31506f!important;
      box-shadow:0 14px 34px rgba(0,0,0,.24)!important;
    }
    body.apd-dark .apd-hero-main,
    body.apd-dark .apd-tab-intro,
    body.apd-dark #login .form-card-hdr,
    body.apd-dark #registro .form-card-hdr{
      background:linear-gradient(135deg,#10233a,#0b1b2e)!important;
      border-color:#31506f!important;
    }
    body.apd-dark .apd-next-tools{
      background:linear-gradient(135deg,#061a37 0%,#0b2d5f 58%,#153d78 100%)!important;
      color:#fff!important;
      border-color:#31506f!important;
    }
    body.apd-dark h1,
    body.apd-dark h2,
    body.apd-dark h3,
    body.apd-dark h4,
    body.apd-dark h5,
    body.apd-dark h6,
    body.apd-dark b,
    body.apd-dark strong,
    body.apd-dark .card-lbl,
    body.apd-dark .apd-panel-quick b,
    body.apd-dark .apd-benefit b,
    body.apd-dark .apd-tab-intro h2,
    body.apd-dark .apd-panel-showcase h2,
    body.apd-dark .plan-title,
    body.apd-dark .alerta-title,
    body.apd-dark .historico-title,
    body.apd-dark .form-card-hdr h2{
      color:#f8fbff!important;
    }
    body.apd-dark p,
    body.apd-dark span,
    body.apd-dark label,
    body.apd-dark li,
    body.apd-dark td,
    body.apd-dark th,
    body.apd-dark small,
    body.apd-dark .prefs-hint,
    body.apd-dark .ph,
    body.apd-dark .panel-sub,
    body.apd-dark .muted,
    body.apd-dark .text-muted,
    body.apd-dark .apd-panel-quick span,
    body.apd-dark .apd-benefit span,
    body.apd-dark .apd-tab-intro p,
    body.apd-dark #panel-preferencias-resumen,
    body.apd-dark #panel-plan,
    body.apd-dark #panel-canales,
    body.apd-dark #panel-datos-docente{
      color:#cfe0ff!important;
    }
    body.apd-dark .apd-next-tools,
    body.apd-dark .apd-next-tools *,
    body.apd-dark .apd-next-tools h3,
    body.apd-dark .apd-next-tools b,
    body.apd-dark .apd-next-tools p,
    body.apd-dark .apd-next-tools span{
      color:#fff!important;
    }
    body.apd-dark .apd-next-tools p,
    body.apd-dark .apd-next-tools .apd-next-item span{color:#cfe0ff!important}
    body.apd-dark input,
    body.apd-dark select,
    body.apd-dark textarea{
      background:#071426!important;
      color:#fff!important;
      border-color:#426381!important;
      caret-color:#fff!important;
    }
    body.apd-dark input::placeholder,
    body.apd-dark textarea::placeholder{color:#8fb1d6!important;opacity:1!important}
    body.apd-dark .btn-secondary,
    body.apd-dark .btn-outline,
    body.apd-dark .btn-ghost,
    body.apd-dark .mini-btn,
    body.apd-dark .plan-pill,
    body.apd-dark .badge-num,
    body.apd-dark .tag-nivel,
    body.apd-dark .historico-chip,
    body.apd-dark .apd-channel-chip,
    body.apd-dark .apd-tab-chip{
      background:#173454!important;
      color:#eaf2ff!important;
      border-color:#426381!important;
    }
    body.apd-dark .btn-primary,
    body.apd-dark .apd-panel-showcase-actions a.primary,
    body.apd-dark .apd-tab-side a:first-child{
      background:#2563eb!important;
      color:#fff!important;
      border-color:#60a5fa!important;
    }
    body.apd-dark .card-lbl,
    body.apd-dark .card-lbl-row .card-lbl{
      background:transparent!important;
      color:#f8fbff!important;
      border:0!important;
      box-shadow:none!important;
    }
    body.apd-dark .footer,
    body.apd-dark footer{
      background:#061a37!important;
      color:#dbeafe!important;
      border-top:1px solid #31506f!important;
    }
    body.apd-dark .apd-theme-toggle{
      background:#f8fbff!important;
      color:#061a37!important;
      border-color:#fff!important;
    }
  `;
  document.head.appendChild(s);
}
function boot(){
  inject();
  if(document.body.classList.contains('apd-dark')) document.documentElement.classList.add('apd-dark-root');
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
[300,900,1800,3500].forEach(function(ms){setTimeout(boot,ms);});
})();

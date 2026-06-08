(function(){
'use strict';
if(window.__apdVisualLastPatchLoaded) return;
window.__apdVisualLastPatchLoaded = true;
function install(){
  var old=document.getElementById('apd-visual-last-style');
  if(old) old.remove();
  var s=document.createElement('style');
  s.id='apd-visual-last-style';
  s.textContent=`
    :root{
      --apd-bg:#f5f8ff;
      --apd-surface:#ffffff;
      --apd-surface-2:#f8fbff;
      --apd-text:#061a37;
      --apd-muted:#5f718b;
      --apd-border:#dbe7f5;
      --apd-chip-bg:#eef6ff;
      --apd-chip-text:#0f4fb8;
      --apd-primary:#2454f5;
      --apd-next-bg:linear-gradient(135deg,#061a37 0%,#0b2d5f 58%,#153d78 100%);
      --apd-next-text:#ffffff;
      --apd-next-muted:#cfe0ff;
    }
    body.apd-dark{
      --apd-bg:#071426;
      --apd-surface:#10233a;
      --apd-surface-2:#0b1b2e;
      --apd-text:#f8fbff;
      --apd-muted:#cfe0ff;
      --apd-border:#31506f;
      --apd-chip-bg:#173454;
      --apd-chip-text:#eaf2ff;
      --apd-primary:#3b82f6;
    }
    body,#panel-docente,#panel-docente>.container,.section{background:var(--apd-bg)!important;color:var(--apd-text)!important}
    .panel-card:not(#apd-next-tools-card),
    .form-card,.hero-card,.apd-panel-showcase,.apd-panel-benefits,.apd-tab-intro,
    .prefs-card,.field-group,.prefs-block,.channel-pref-box,.stat-box,.alerta-floating,
    .historico-box,.radar-box,.backfill-box,.alerta-row,.alerta-meta-item,.historico-offer,.plan-expiration-box{
      background:var(--apd-surface)!important;
      color:var(--apd-text)!important;
      border-color:var(--apd-border)!important;
    }
    .apd-hero-main,.form-card-hdr,#login .form-card-hdr,#registro .form-card-hdr{
      background:var(--apd-surface-2)!important;
      color:var(--apd-text)!important;
      border-color:var(--apd-border)!important;
    }
    .panel-card:not(#apd-next-tools-card) h1,
    .panel-card:not(#apd-next-tools-card) h2,
    .panel-card:not(#apd-next-tools-card) h3,
    .panel-card:not(#apd-next-tools-card) h4,
    .panel-card:not(#apd-next-tools-card) b,
    .panel-card:not(#apd-next-tools-card) strong,
    .card-lbl,.card-lbl-row .card-lbl,.plan-title,.alerta-title,.historico-title,
    .apd-panel-showcase h2,.apd-tab-intro h2,.form-card-hdr h2{color:var(--apd-text)!important}
    .prefs-hint,.ph,.panel-sub,
    .panel-card:not(#apd-next-tools-card) p,
    .panel-card:not(#apd-next-tools-card) small,
    .apd-panel-quick span,.apd-benefit span,.apd-tab-intro p,.form-card-hdr p{color:var(--apd-muted)!important}
    .card-lbl,.card-lbl-row .card-lbl{background:transparent!important;border:0!important;box-shadow:none!important}
    input,select,textarea{background:var(--apd-surface-2)!important;color:var(--apd-text)!important;border-color:var(--apd-border)!important}
    input::placeholder,textarea::placeholder{color:var(--apd-muted)!important;opacity:1!important}
    .plan-pill,.badge-num,.tag-nivel,.historico-chip,.apd-channel-chip,.apd-tab-chip,.pill,.chip,.badge{
      background:var(--apd-chip-bg)!important;color:var(--apd-chip-text)!important;border-color:var(--apd-border)!important
    }
    .btn-primary,.apd-panel-showcase-actions a.primary,.apd-tab-side a:first-child{
      background:var(--apd-primary)!important;color:#fff!important;border-color:var(--apd-primary)!important
    }
    #apd-next-tools-card,.apd-next-tools,
    body.apd-dark #apd-next-tools-card,body.apd-dark .apd-next-tools{
      background:var(--apd-next-bg)!important;
      color:var(--apd-next-text)!important;
      border:1px solid rgba(219,231,245,.35)!important;
      box-shadow:0 20px 48px rgba(6,26,55,.22)!important;
    }
    #apd-next-tools-card h1,#apd-next-tools-card h2,#apd-next-tools-card h3,
    #apd-next-tools-card b,#apd-next-tools-card strong,
    .apd-next-tools h1,.apd-next-tools h2,.apd-next-tools h3,
    .apd-next-tools b,.apd-next-tools strong{color:var(--apd-next-text)!important}
    #apd-next-tools-card p,#apd-next-tools-card span,
    .apd-next-tools p,.apd-next-tools span{color:var(--apd-next-muted)!important}
    #apd-next-tools-card .apd-next-item,.apd-next-tools .apd-next-item{
      background:rgba(255,255,255,.10)!important;
      border:1px solid rgba(255,255,255,.16)!important;
      color:var(--apd-next-text)!important;
    }
    #apd-next-tools-card .apd-next-item i,.apd-next-tools .apd-next-item i{background:rgba(255,255,255,.14)!important;color:#fff!important}
    body.apd-dark .footer,body.apd-dark footer{background:#061a37!important;color:#dbeafe!important;border-top:1px solid #31506f!important}
    body.apd-dark .apd-theme-toggle{background:#f8fbff!important;color:#061a37!important;border-color:#fff!important}
  `;
  document.head.appendChild(s);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
[300,900,1800,3200].forEach(function(ms){setTimeout(install,ms);});
})();

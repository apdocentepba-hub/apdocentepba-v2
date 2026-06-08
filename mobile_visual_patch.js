(function(){
'use strict';
if(window.__apdMobileVisualPatchLoaded) return;
window.__apdMobileVisualPatchLoaded = true;
function boot(){
  if(document.getElementById('apd-mobile-visual-style')) return;
  var s=document.createElement('style');
  s.id='apd-mobile-visual-style';
  s.textContent=`
    html,body{max-width:100%;overflow-x:hidden!important}
    @media(max-width:760px){
      html,body{scroll-padding-top:132px!important}
      .header{position:sticky!important;top:0!important;z-index:999!important}
      .header-inner{padding:10px 12px!important;display:grid!important;grid-template-columns:1fr!important;gap:9px!important}
      .brand{min-width:0!important;display:flex!important;align-items:center!important;gap:10px!important}
      .brand-icon{width:38px!important;height:38px!important;border-radius:12px!important;font-size:19px!important;flex:0 0 auto!important}
      .brand-title{font-size:18px!important;line-height:1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .brand-sub{display:none!important}
      .top-nav{width:100%!important;display:grid!important;grid-template-columns:1fr auto!important;gap:8px!important;align-items:center!important}
      .apd-top-tabs{grid-column:1 / -1!important;width:100%!important;display:flex!important;flex-wrap:nowrap!important;justify-content:flex-start!important;overflow-x:auto!important;overflow-y:hidden!important;gap:6px!important;padding:2px 0 7px!important;margin:0!important;-webkit-overflow-scrolling:touch;scrollbar-width:none}
      .apd-top-tabs::-webkit-scrollbar{display:none!important}
      .apd-top-tab{flex:0 0 auto!important;font-size:12px!important;padding:9px 11px!important;border-radius:999px!important;background:rgba(255,255,255,.08)!important}
      .apd-top-tab.is-active{background:#2454f5!important;color:#fff!important}
      .apd-top-tab.is-active:after{display:none!important}
      #navPrivado,#navPublico{justify-content:flex-end!important;gap:6px!important}
      #btnCerrarSesion,#btnLogin,#btnRegistro{padding:9px 11px!important;font-size:12px!important;border-radius:12px!important;min-height:38px!important}
      #panel-docente>.container{padding:14px 12px 0!important}
      .panel-tabs-wrap{margin-bottom:12px!important}
      .panel-tab-grid{grid-template-columns:1fr!important;gap:14px!important}
      .panel-tab-grid>.panel-card,.panel-tab-grid>#admin-panel-card,.panel-tab-grid>.prefs-card{grid-column:auto!important}
      .apd-panel-showcase{border-radius:20px!important}
      .apd-hero-main{grid-template-columns:1fr!important;padding:24px 18px!important}
      .apd-hero-art{display:none!important}
      .apd-panel-showcase h2{font-size:33px!important;letter-spacing:-.055em!important}
      .apd-panel-showcase p{font-size:15px!important}
      .apd-panel-showcase-actions{display:grid!important;grid-template-columns:1fr!important}
      .apd-panel-showcase-actions a{width:100%!important;padding:13px 15px!important}
      .apd-panel-quick{grid-template-columns:1fr!important;padding:18px!important;gap:12px!important}
      .apd-panel-quick a{padding:15px!important}
      .apd-panel-benefits,.apd-tab-intro{padding:20px!important;border-radius:20px!important}
      .apd-benefit-grid,.apd-next-grid{grid-template-columns:1fr!important}
      .apd-benefit{border-left:0!important;padding-left:0!important}
      .apd-tab-intro{grid-template-columns:1fr!important}
      .apd-tab-side{width:100%!important;justify-content:stretch!important}
      .apd-tab-side a{width:100%!important;white-space:normal!important}
      .panel-card:not(.apd-panel-showcase):not(.apd-panel-benefits):not(.apd-tab-intro){border-radius:20px!important}
      .card-lbl,.card-lbl-row .card-lbl{font-size:12px!important;line-height:1.25!important}
      .card-lbl-row{display:grid!important;gap:10px!important;align-items:start!important}
      .mini-group{width:100%!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}
      .mini-btn,.btn{min-height:42px!important}
      .stat-box,.alerta-floating,.historico-box,.radar-box,.backfill-box,.channel-pref-box{border-radius:16px!important}
      #login .form-wrap,#registro .form-wrap{grid-template-columns:1fr!important;padding:18px 12px 34px!important;gap:14px!important}
      .apd-auth-aside{padding:22px!important;min-height:auto!important;border-radius:22px!important}
      .apd-auth-aside:after{display:none!important}
      .apd-auth-aside h2{font-size:31px!important}
      .apd-auth-list{display:none!important}
      .apd-auth-mini{grid-template-columns:1fr 1fr 1fr!important;margin-top:18px!important}
      .apd-auth-mini span{padding:9px!important}
      #login .form-card,#registro .form-card{border-radius:22px!important}
      #login form,#registro form,#login .form-card-hdr,#registro .form-card-hdr{padding-left:18px!important;padding-right:18px!important}
      .grid-2{grid-template-columns:1fr!important}
      #login input,#registro input{height:46px!important}
      .pw-toggle{height:46px!important}
      .apd-next-tools{padding:22px!important;border-radius:20px!important}
      .apd-next-tools:after{display:none!important}
      .apd-next-tools h3{font-size:24px!important}
      .footer-inner>div:first-child{grid-template-columns:1fr!important}
      .footer-inner{padding:24px 18px!important}
    }
  `;
  document.head.appendChild(s);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
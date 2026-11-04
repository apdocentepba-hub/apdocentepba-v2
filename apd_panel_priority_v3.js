/* APDocentePBA V3 — first-alert presentation, tab-aware.
 * The live dashboard is divided into tabs by panel_tabs_patch.js.
 * Do not move its cards/asides: doing so breaks the live tab architecture.
 * CSS order prioritizes the ACTUAL alert card inside its existing Alertas tab,
 * and puts the Alertas tab button first without replacing saved tab choices.
 * No fetches, credentials, DOM replacement or plan logic.
 */
(function(){
 "use strict";
 const STYLE_ID="apd-priority-v3-style";
 const css=[
  '#panel-tab-pane-alertas .panel-tab-grid > .panel-card:has(#panel-alertas){order:-10!important;grid-column:1/-1!important}',
  '.apd-top-tabs [data-top-tab-key="alertas"]{order:-10!important}',
  '#panel-tabs-nav [data-tab-key="alertas"]{order:-10!important}'
 ].join("\n");
 function apply(){
  const panel=document.getElementById("panel-docente");
  const alerts=document.getElementById("panel-alertas");
  if(!panel||!alerts||!panel.contains(alerts))
   return {ok:false,reason:"missing_panel_or_alerts"};
  let style=document.getElementById(STYLE_ID);
  if(!style){
   style=document.createElement("style");
   style.id=STYLE_ID;
   style.textContent=css;
   document.head.appendChild(style);
  }
  const pane=document.getElementById("panel-tab-pane-alertas");
  const card=alerts.closest(".panel-card");
  const assigned=!!pane&&!!card&&pane.contains(card);
  return {ok:true,method:"css_tab_scoped",tab_ready:assigned,
   original_card_retained:true,stored_tab_selection_untouched:true};
 }
 Object.defineProperty(window,"__APD_PANEL_PRIORITY_V3",{
  configurable:true,value:Object.freeze({apply})
 });
 if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",apply,{once:true});
 else apply();
})();

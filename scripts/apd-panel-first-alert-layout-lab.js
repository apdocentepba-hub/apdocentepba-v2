/* APDocentePBA — candidate ONLY, never loaded by production index.html.
 * UI priority experiment: put verified offers before secondary cards and place
 * nonessential resource/promotional asides AFTER the main dashboard.
 * No DOM nodes are destroyed, no HTTP is issued, no auth/offer data is read.
 * Moving actual nodes preserves their listeners, input state and links.
 */
(function(){
 "use strict";
 function apply(){
  const panel=document.getElementById("panel-docente");
  if(!panel)return {ok:false,reason:"panel_missing"};
  const container=panel.querySelector(":scope > .container");
  const grid=container?.querySelector("#panel-content");
  const alerts=document.getElementById("panel-alertas");
  const alertCard=alerts?.closest(".panel-card");
  const ads=[...panel.querySelectorAll(":scope > .apd-safe-side-ad")];
  if(!container||!grid||!alertCard||alertCard.parentElement!==grid||
     ads.length!==2||ads.some(a=>a.parentElement!==panel)){
   return {ok:false,reason:"unexpected_layout"};
  }
  if(grid.firstElementChild!==alertCard)
   grid.insertBefore(alertCard,grid.firstElementChild);
  if(panel.firstElementChild!==container)
   panel.insertBefore(container,panel.firstElementChild);
  for(const aside of ads)panel.appendChild(aside);
  return {ok:true,alert_first:grid.firstElementChild===alertCard,
   main_first:panel.firstElementChild===container,ads_after_main:true};
 }
 Object.defineProperty(window,"__APD_PANEL_PRIORITY_LAB",{
  configurable:true,value:Object.freeze({apply})
 });
 if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",apply,{once:true});
 else apply();
})();
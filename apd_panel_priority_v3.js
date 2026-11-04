/* APDocentePBA V3: prioritized alerts UI, proposed for production review.
 * No HTTP calls, no auth access, no content rewriting. Moves existing nodes,
 * retaining their event handlers and user-edited input state.
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
  const asides=[...panel.querySelectorAll(":scope > .apd-safe-side-ad")];
  if(!container||!grid||!alertCard||alertCard.parentElement!==grid||
     asides.length!==2||asides.some(a=>a.parentElement!==panel))
    return {ok:false,reason:"unexpected_layout"};
  if(grid.firstElementChild!==alertCard)
    grid.insertBefore(alertCard,grid.firstElementChild);
  if(panel.firstElementChild!==container)
    panel.insertBefore(container,panel.firstElementChild);
  for(const aside of asides)panel.appendChild(aside);
  return {ok:true,alert_first:grid.firstElementChild===alertCard,
    main_first:panel.firstElementChild===container,asides_after_main:true};
 }
 Object.defineProperty(window,"__APD_PANEL_PRIORITY_V3",{
  configurable:true,value:Object.freeze({apply})
 });
 if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",apply,{once:true});
 else apply();
})();

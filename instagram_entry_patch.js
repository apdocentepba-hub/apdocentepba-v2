/* APDocente: navegación de un clic desde Instagram, sin cookies ni analítica nueva. */
(function(){
  'use strict';
  var params=new URLSearchParams(location.search);
  var action=params.get('apd');
  if(action!=='login' && action!=='registro')return;
  function openAction(){
    try{
      if(typeof window.obtenerToken==='function' && window.obtenerToken())return;
      if(typeof window.mostrarSeccion!=='function')return;
      var target=document.getElementById(action);
      if(!target)return;
      window.mostrarSeccion(action);
    }catch(err){console.warn('No se pudo abrir la sección solicitada.',err)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openAction,{once:true});
  else openAction();
})();
(function(){
'use strict';
if(window.__apdDarkModeFinalPatchLoaded) return;
window.__apdDarkModeFinalPatchLoaded = true;
function load(src){
  var s=document.createElement('script');
  s.src=src;
  s.defer=true;
  document.head.appendChild(s);
}
load('./secretaria_publicidad_patch.js?v=1');
load('./side_banners_patch.js?v=1');
})();
(function(){
'use strict';
if(window.__apdListboxFixLoaded2) return;
window.__apdListboxFixLoaded2 = true;

const pairs=[
['pref-distrito-principal','sug-distrito-1'],['pref-segundo-distrito','sug-distrito-2'],['pref-tercer-distrito','sug-distrito-3'],['pref-cuarto-distrito','sug-distrito-4'],['pref-quinto-distrito','sug-distrito-5'],
['pref-cargo-1','sug-cargo-1'],['pref-cargo-2','sug-cargo-2'],['pref-cargo-3','sug-cargo-3'],['pref-cargo-4','sug-cargo-4'],['pref-cargo-5','sug-cargo-5'],['pref-cargo-6','sug-cargo-6'],['pref-cargo-7','sug-cargo-7'],['pref-cargo-8','sug-cargo-8'],['pref-cargo-9','sug-cargo-9'],['pref-cargo-10','sug-cargo-10']
];

function addStyle(){
 if(document.getElementById('apd-listbox-fix-style-2')) return;
 const s=document.createElement('style');
 s.id='apd-listbox-fix-style-2';
 s.textContent=`
 .ac-list{z-index:9999;}
 .ac-list[data-force-open="1"]{display:block!important;max-height:320px!important;overflow-y:auto!important;}
 #btn-recargar-panel{display:none!important;}
 #form-mi-password .grid-2{grid-template-columns:1fr!important;gap:12px!important;}
 `;
 document.head.appendChild(s);
}

function openList(input,list){
 if(!input||!list) return;
 if(typeof input.focus==='function') input.focus();
 if(typeof input.dispatchEvent==='function'){
   input.dispatchEvent(new Event('input',{bubbles:true}));
 }
 setTimeout(function(){
   list.dataset.forceOpen='1';
   list.style.display='block';
   list.style.maxHeight='320px';
   list.style.overflowY='auto';
 },30);
}

function closeList(list){
 if(!list) return;
 list.dataset.forceOpen='0';
 list.style.display='none';
}

function bind(){
 addStyle();
 pairs.forEach(function(pair){
   const input=document.getElementById(pair[0]);
   const list=document.getElementById(pair[1]);
   if(!input||!list||input.dataset.apdListFixBound==='1') return;
   input.dataset.apdListFixBound='1';
   input.addEventListener('focus',function(){openList(input,list);});
   input.addEventListener('click',function(){openList(input,list);});
   input.addEventListener('keydown',function(ev){ if(ev.key==='ArrowDown') openList(input,list); });
   input.addEventListener('blur',function(){ setTimeout(function(){closeList(list);},180); });
  });
 const rec=document.getElementById('btn-recargar-panel'); if(rec) rec.remove();
}

const obs=new MutationObserver(bind);
obs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
})();
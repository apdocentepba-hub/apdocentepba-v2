/* Buscador de recursos APDocentePBA. Cliente estático y sin solicitudes de red.
 * Compartido por el centro de herramientas y su página de búsqueda.
 */
(function(){
 'use strict';
 const catalog=Array.isArray(window.AP_DOCENTE_HERRAMIENTAS)?window.AP_DOCENTE_HERRAMIENTAS:[];
 const q=document.getElementById('q');
 const results=document.getElementById('grid')||document.getElementById('resultados');
 const essentials=document.getElementById('esenciales');
 const count=document.getElementById('count');
 const chips=document.getElementById('chips');
 const clear=document.getElementById('clear')||document.getElementById('limpiar');
 const initialQuery=new URLSearchParams(window.location.search).get('q');
 if(document.getElementById('grid')&&initialQuery)q.value=initialQuery.slice(0,100);
 if(!q||!results)return;
 const quick=['haberes','licencia','acta','APD','PID','secretaría','analítico','familias','planificación','fuentes','calendario','mapa','docente nuevo'];
 const norm=s=>String(s??'').toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const terms=q=>norm(q).split(/[^a-z0-9]+/).filter(Boolean);
 const blob=r=>norm([r.titulo,r.descripcion,r.categoria,(r.tags||[]).join(' ')].join(' '));
 function rank(record,query){
  const words=terms(query);
  if(words.length===0)return record.destacado?2:1;
  const hay=blob(record);
  if(!words.every(w=>hay.includes(w)))return 0;
  const title=norm(record.titulo),cat=norm(record.categoria);
  return words.reduce((sum,w)=>sum+1+(title.includes(w)?4:0)+(cat.includes(w)?2:0),0)+(record.destacado?.25:0);
 }
 const create=(tag,className,value)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=String(value);
  return node;
 };
 function card(r){
  const article=create('article','card');
  article.append(
   create('div','icon',r.icono||'🧰'),
   create('h2','',r.titulo||'Herramienta'),
   create('p','',r.descripcion||'')
  );
  const meta=create('div','meta');
  const state=String(r.estado||'Sin verificar');
  meta.append(create('span','pill',r.categoria||'Recursos'),create('span','pill '+(['Experimental','Preparado','Próximamente'].includes(state)?'warn':'ok'),state));
  const labels={'Próximamente':'Ver información (no operativo)','Preparado':'Ver función en preparación','Experimental':'Ver prototipo experimental'};
  const action=create('a','btn primary',labels[state]||'Abrir recurso');
  const url=String(r.url||'');
  // Enlaces del propio catálogo, únicamente páginas HTML relativas al sitio.
  if(/^\.\/[a-z0-9_-]+\.html(?:\?v=\d+)?$/i.test(url)){
   action.href=url;
  }else{action.removeAttribute('href');action.textContent='Enlace no verificado';action.setAttribute('aria-disabled','true');}
  meta.appendChild(action);
  article.appendChild(meta);
  return article;
 }
 function draw(target,rows){
  target.replaceChildren();
  if(rows.length===0){
   target.appendChild(create('div','empty','No encontramos resultados para esta búsqueda. Probá palabras más generales o eliminá alguno de los términos.'));
   return;
  }
  const frag=document.createDocumentFragment();
  for(const r of rows)frag.appendChild(card(r));
  target.appendChild(frag);
 }
 function render(){
  const query=q.value.trim();
  let rows=catalog.map((r,i)=>({r,i,score:rank(r,query)}))
   .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.r);
  if(!query && essentials)rows=rows.filter(r=>r.destacado).slice(0,12);
  if(count)count.textContent=(query?'Resultados para “'+query.slice(0,80)+'”':'Herramientas principales')+' · '+rows.length;
  draw(results,rows);
 }
 if(essentials){
  const list=['centro-abc-servado','fuentes-oficiales','uso-responsable','buscar-herramientas','orientador-docente','guia-rapida-docente','docente-nuevo'];
  draw(essentials,list.map(id=>catalog.find(r=>r.id===id)).filter(Boolean));
 }
 for(const word of quick){
  const button=create('button','chip',word);button.type='button';
  button.addEventListener('click',()=>{q.value=word;render();});
  chips?.appendChild(button);
 }
 q.addEventListener('input',render);
 clear?.addEventListener('click',()=>{q.value='';render();q.focus();});
 render();
})();

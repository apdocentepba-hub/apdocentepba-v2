import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';

const root=resolve(new URL('..',import.meta.url).pathname);
const files=['herramientas.html','buscar-herramientas.html','proximamente.html','herramientas-docentes.html','pid.html'];
const search=readFileSync(resolve(root,'buscar-herramientas.html'),'utf8');
const center=readFileSync(resolve(root,'herramientas.html'),'utf8');
const source=readFileSync(resolve(root,'assets/js/herramientas-catalogo.js'),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(source,context);
const catalog=Array.from(context.window.AP_DOCENTE_HERRAMIENTAS||[]);
const from=search.indexOf('function norm(s)'),to=search.indexOf('function render()',from);
assert.ok(from>0&&to>from,'Ranking de búsqueda disponible');
vm.runInContext(search.slice(from,to),context);
const audit=catalog.map(x=>{
  const link=String(x.url||'').split('?')[0];
  const safe=link.startsWith('./')&&!link.includes('..','./'.length);
  return {id:x.id,status:x.estado,title:x.titulo,url:x.url,exists:safe&&existsSync(resolve(root,link))};
});
const missing=audit.filter(r=>!r.exists);
const out=resolve(root,'tmp/growth-audit/tools-routes.json');
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify({checked_at:'2026-11-01',count:audit.length,missing,byStatus:Object.fromEntries([...new Set(audit.map(r=>r.status))].map(k=>[k,audit.filter(r=>r.status===k).length]))},null,2));
test('las páginas principales comparten estilo visual sin tocar carrusel',()=>{
  for(const name of files){
    const html=readFileSync(resolve(root,name),'utf8');
    assert.match(html,/tools_refresh_v1\.css/,'Falta estilo compartido: '+name);
    assert.match(html,/<meta name="viewport"/);
  }
});
test('búsqueda por varias palabras exige coincidencia de todos los términos',()=>{
  const item={titulo:'Control de recibo docente',descripcion:'Compara pagos y descuentos',categoria:'Haberes',tags:['recibo','salario'],destacado:true};
  assert.ok(context.score(item,'recibo haberes')>0);
  assert.equal(context.score(item,'recibo vacaciones'),0);
  assert.ok(context.score(item,'recibo')>context.score({titulo:'Otra herramienta',descripcion:'Recibo en el cuerpo',categoria:'Otros',tags:[]},'recibo'));
});
test('buscar permite limpiar, usar etiquetas y anuncia cantidad de resultados',()=>{
  assert.match(search,/role="search"/);
  assert.match(search,/for="q"/);
  assert.match(search,/aria-live="polite"/);
  assert.match(search,/id="chips"/);
  assert.match(search,/id="clear"/);
});
test('catálogo indica qué herramientas son experimentales o están en preparación',()=>{
  assert.ok(catalog.length>15);
  for(const item of catalog){
    assert.ok(item.id&&item.url&&item.titulo&&item.estado);
  }
  assert.ok(catalog.some(x=>x.estado==='Experimental'));
  assert.ok(catalog.some(x=>x.estado==='Preparado'));
});
test('rutas críticas del catálogo existen y los enlaces faltantes quedan auditados',()=>{
  const essential=['herramientas-docentes','licencias-docentes','pid','asistente-acta-reunion','fuentes-oficiales','haberes-docentes'];
  for(const id of essential){
    const link=audit.find(x=>x.id===id);
    assert.ok(link,'No está el recurso '+id);
    assert.equal(link.exists,true,'Enlace de herramienta crítica inexistente: '+id);
  }
  console.log('TOOLS_ROUTE_AUDIT:',JSON.stringify({total:audit.length,missing:missing.length,missingIds:missing.map(x=>x.id)}));
});

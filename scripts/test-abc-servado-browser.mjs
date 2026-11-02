import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const chrome=['google-chrome','google-chrome-stable','chromium','chromium-browser'].find(x=>spawnSync('which',[x],{stdio:'ignore'}).status===0);
if(!chrome)throw Error('Chrome/Chromium requerido para la validación real');
function page(file,query=''){
  const url=pathToFileURL(resolve(file)).href+(query?'?q='+encodeURIComponent(query):'');
  const cmd=spawnSync(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--virtual-time-budget=1200','--dump-dom',url],{encoding:'utf8',timeout:20000,maxBuffer:5*1024*1024});
  if(cmd.error||cmd.status!==0)throw Error('Chrome '+file+': '+(cmd.error||cmd.stderr.slice(-500)));
  return cmd.stdout;
}
const all=page('buscar-herramientas.html');
assert.match(all,/Herramientas principales · 35/);
assert.match(all,/Centro ABC y SerVaDo/);
assert.match(all,/herramientas-buscador-v2\.js/);
const found=page('buscar-herramientas.html','calendario');
assert.match(found,/Resultados para “calendario”/);
assert.match(found,/Centro ABC y SerVaDo/);
const missing=page('buscar-herramientas.html','licencias inexistente');
assert.match(missing,/Resultados para “licencias inexistente” · 0/);
assert.match(missing,/No encontramos resultados para esta búsqueda/);
const hub=page('centro-abc-servado.html');
assert.match(hub,/ABC y SerVaDo, sin perderte entre sistemas/);
assert.match(hub,/Notificaciones SerVaDo/);
assert.match(hub,/Calendario de inscripciones/);
assert.match(hub,/No.*ingresa a tu cuenta ABC/i);
console.log('ABC_HUB_BROWSER_OK: 35 recursos, AND, sin coincidencias, fuentes ABC navegables');

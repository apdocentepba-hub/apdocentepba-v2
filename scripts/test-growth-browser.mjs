// Smoke tests reales de navegador para landing y guía de activación.
// Ejecutar en CI con Chromium/Google Chrome instalado; no accede a producción.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'tmp', 'growth-browser');
const CHROME = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  .find(name => spawnSync('which', [name], { stdio: 'ignore' }).status === 0);
if (!CHROME) throw new Error('No hay Chrome/Chromium en el runner; no afirmar pruebas visuales');

mkdirSync(OUTPUT, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'apd-growth-chrome-'));
const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
proc.stderr.on('data', chunk => { stderr += String(chunk).slice(-2000); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function awaitPort() {
  const active = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 120; i++) {
    if (existsSync(active)) {
      const [port] = readFileSync(active, 'utf8').trim().split('\n');
      return Number(port);
    }
    if (proc.exitCode !== null) throw new Error('Chrome terminó: ' + stderr.slice(-500));
    await sleep(100);
  }
  throw new Error('Chrome no expuso CDP en 12 segundos');
}

let socket;
let counter = 0;
const pending = new Map();

function cdp(method, params = {}) {
  const id = ++counter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout CDP: ' + method)); }, 8000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function js(expression) {
  const res = await cdp('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
    userGesture: true
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result.value;
}

async function loaded() {
  for (let i = 0; i < 40; i++) {
    if (await js('document.readyState === "complete"')) return;
    await sleep(100);
  }
  throw new Error('La página no terminó de cargar');
}

async function viewport(width, height, filename) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 600
  });
  await cdp('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'empezar.html')).href });
  await loaded();
  const m = await js(`({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim(),
    register: [...document.querySelectorAll('a[href*="apd=registro"]')].length,
    pricing: document.querySelectorAll('#planes .card').length,
    guide: !!document.querySelector('a[href="#como-funciona"]')
  })`);
  assert.ok(m.width >= width - 2, JSON.stringify(m));
  assert.ok(m.scroll <= m.width + 2, 'Desbordamiento horizontal: ' + JSON.stringify(m));
  assert.match(m.title, /APDocentePBA/);
  assert.match(m.heading, /APD/);
  assert.ok(m.register >= 2);
  assert.equal(m.pricing, 3);
  assert.ok(m.guide);
  const shot = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  writeFileSync(path.join(OUTPUT, filename), Buffer.from(shot.data, 'base64'));
  console.log('PASÓ viewport ' + width + 'x' + height + ' (scrollWidth=' + m.scroll + ', registros=' + m.register + ')');
}

async function guide() {
  const fixture = `
    <div id="panel-docente"><div class="container">
      <div class="panel-header"></div>
      <div id="panel-preferencias-resumen">
        <p><strong>Distritos:</strong> (sin filtro)</p>
        <p><strong>Cargos/Materias:</strong> (sin filtro)</p>
        <p><strong>Alertas:</strong> Pausadas</p>
      </div>
    </div></div>
    <form id="form-preferencias"><input id="pref-distrito-principal"></form>`;
  await js(`document.body.innerHTML = ${JSON.stringify(fixture)};
    window.APD_activatePanelTab = (key, flag) => { window.__apdTestTab = [key, flag] };
    true`);
  const guideSource = readFileSync(path.join(ROOT, 'growth_activation_guide.js'), 'utf8');
  await js(guideSource + '\ntrue');
  assert.equal(await js('document.getElementById("apd-growth-activation-guide").hidden'), false);
  await js('document.getElementById("apd-growth-guide-action").click(); true');
  assert.equal(await js('window.__apdTestTab?.[0]'), 'preferencias');
  assert.equal(await js('document.activeElement?.id'), 'pref-distrito-principal');
  await js(`document.getElementById('panel-preferencias-resumen').innerHTML =
    '<p><strong>Distritos:</strong> AVELLANEDA</p>' +
    '<p><strong>Cargos/Materias:</strong> PR</p>' +
    '<p><strong>Alertas:</strong> Activas</p>'; true`);
  await sleep(80);
  assert.equal(await js('document.getElementById("apd-growth-activation-guide").hidden'), true);
  console.log('PASÓ guía de activación en DOM real y navegación a Preferencias');
}


async function demoFlow() {
  const url = pathToFileURL(path.join(ROOT, 'dist-growth-preview', 'panel-demo.html')).href;
  await cdp('Page.navigate', { url });
  await loaded();
  await sleep(160);
  assert.equal(await js('document.getElementById("apd-growth-activation-guide")?.hidden'), false);
  await js('document.getElementById("apd-growth-guide-action").click(); true');
  assert.equal(await js('document.querySelector("#panel-tab-pane-preferencias").classList.contains("active")'), true);
  const lists = await js('document.querySelectorAll("datalist").length');
  assert.equal(lists, 2);
  await js(`document.getElementById('pref-distrito-principal').value = 'AVELLANEDA';
    document.getElementById('pref-cargo-1').value = 'PRECEPTOR';
    document.getElementById('pref-turnos').value = 'T';
    document.querySelector('input[name="pref-nivel-modalidad"][value="SECUNDARIO"]').checked = true;
    document.querySelector('input[name="pref-nivel-modalidad"][value="TECNICO PROFESIONAL"]').checked = true;
    document.getElementById('pref-alertas-activas').value = 'si';
    document.getElementById('pref-alertas-email').value = 'no';
    document.getElementById('form-preferencias').requestSubmit(); true`);
  await sleep(140);
  const first = await js(`({
    summary: document.getElementById('panel-preferencias-resumen').textContent,
    guideHidden: document.getElementById('apd-growth-activation-guide').hidden,
    hint: document.getElementById('demo-msg').textContent
  })`);
  assert.match(first.summary, /AVELLANEDA/);
  assert.match(first.summary, /PRECEPTOR/);
  assert.match(first.summary, /SECUNDARIO/);
  assert.match(first.summary, /TECNICO PROFESIONAL/);
  assert.match(first.summary, /Tarde/);
  assert.match(first.summary, /Activas/);
  assert.match(first.hint, /email sigue desactivado/i);
  assert.equal(first.guideHidden, true);
  const shot = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  writeFileSync(path.join(OUTPUT, 'apd-preview-activated-no-email.png'), Buffer.from(shot.data, 'base64'));
  await js(`document.querySelector('[data-tab="preferencias"]').click();
    document.getElementById('pref-alertas-email').value = 'si';
    document.getElementById('form-preferencias').requestSubmit(); true`);
  await sleep(100);
  const second = await js('document.getElementById("panel-preferencias-resumen").textContent');
  assert.match(second, /Email:\s*Sí/);
  assert.equal(await js('document.getElementById("apd-growth-activation-guide").hidden'), true);
  console.log('PASÓ demo: sugerencias, guardado ficticio, advertencia sin email y canal activado');
}


async function insigneLabFlow() {
  const url=pathToFileURL(path.join(ROOT,'dist-growth-preview','insigne-laboratorio.html')).href;
  await cdp('Page.navigate',{url});
  await loaded();
  await sleep(160);
  const initial=await js("({ hits:document.querySelectorAll('#lab-offers .hit').length, misses:document.querySelectorAll('#lab-offers .miss').length, rules:document.querySelectorAll('#lab-rules .rule').length })");
  assert.equal(initial.hits,3,'Tres ejemplos coinciden por reglas específicas');
  assert.equal(initial.misses,3,'Tres ejemplos no coinciden');
  assert.equal(initial.rules,3);
  await js("document.getElementById('lab-district').value='AVELLANEDA';"+
    "document.getElementById('lab-cargo').value='MATEMÁTICA';"+
    "document.getElementById('lab-mode').value='normal';"+
    "document.getElementById('lab-form').requestSubmit();true");
  const expanded=await js("({hits:document.querySelectorAll('#lab-offers .hit').length,count:document.getElementById('lab-count').textContent})");
  assert.equal(expanded.hits,4,'Agregar combinación exacta añade una coincidencia');
  assert.match(expanded.count,/4\/20/);
  await js("document.getElementById('lab-reset').click();true");
  assert.equal(await js("document.querySelectorAll('#lab-offers .hit').length"),3);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  writeFileSync(path.join(OUTPUT,'apd-insigne-lab-preview.png'),Buffer.from(screenshot.data,'base64'));
  console.log('PASÓ Insigne LAB: coincidencias específicas, emergencia y restablecer sin conexión');
}


async function platformVisualFlow() {
  await cdp('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,deviceScaleFactor:1,mobile:true
  });
  const url=pathToFileURL(path.join(ROOT,'dist-growth-preview','platform-visual.html')).href;
  await cdp('Page.navigate',{url});
  await loaded();
  await sleep(190);
  const initial=await js("({tabs:document.querySelectorAll('#mock-tabs [data-tab]').length,active:document.querySelector('.section.active')?.id,scroll:document.documentElement.scrollWidth,view:innerWidth})");
  assert.equal(initial.tabs,7);
  assert.equal(initial.active,'section-resumen');
  assert.ok(initial.scroll<=initial.view+1,'La demo no debe tener overflow horizontal móvil');
  await js("document.querySelector('[data-tab=\"estadisticas\"]').click();true");
  assert.equal(await js("document.querySelector('.section.active')?.id"),'section-estadisticas');
  const labels=await js("document.querySelector('#section-estadisticas').textContent");
  assert.match(labels,/Sin indicadores inventados/);
  await js("document.querySelector('[data-tab=\"alertas\"]').click();true");
  assert.equal(await js("document.querySelector('.section.active')?.id"),'section-alertas');
  assert.match(await js("document.querySelector('#section-alertas').textContent"),/carrusel actual queda intacto/i);
  await js("document.querySelector('[data-tab=\"resumen\"]').click();true");
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  writeFileSync(path.join(OUTPUT,'apd-platform-redesign-mobile.png'),Buffer.from(screenshot.data,'base64'));
  await cdp('Emulation.setDeviceMetricsOverride',{
    width:1280,height:900,deviceScaleFactor:1,mobile:false
  });
  await sleep(90);
  const desktop=await js("({width:document.documentElement.scrollWidth,view:innerWidth})");
  assert.ok(desktop.width<=desktop.view+1,'Sin overflow horizontal escritorio');
  const shot2=await cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  writeFileSync(path.join(OUTPUT,'apd-platform-redesign-desktop.png'),Buffer.from(shot2.data,'base64'));
  console.log('PASÓ plataforma visual: pestañas, estadísticas honestas, carrusel intacto y responsive');
}

try {
  const port = await awaitPort();
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = targets.find(x => x.type === 'page');
  assert.ok(target?.webSocketDebuggerUrl);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', ev => {
    const data = JSON.parse(ev.data);
    if (!data.id) return;
    const op = pending.get(data.id);
    if (!op) return;
    pending.delete(data.id);
    clearTimeout(op.timer);
    if (data.error) op.reject(new Error(JSON.stringify(data.error)));
    else op.resolve(data.result || {});
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await viewport(390, 844, 'apd-landing-mobile.png');
  await viewport(1280, 900, 'apd-landing-desktop.png');
  await guide();
  await demoFlow();
  await insigneLabFlow();
  await platformVisualFlow();
  console.log('BROWSER_SMOKE_OK');
} finally {
  if (socket) socket.close();
  proc.kill('SIGTERM');
  await sleep(150);
  rmSync(profile, { recursive: true, force: true });
}

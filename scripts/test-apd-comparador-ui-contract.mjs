import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../apd_comparador_panel.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../apd_comparador_panel.css',import.meta.url),'utf8');

test('comparator remains inside the existing authenticated alert card',()=>{
 assert.match(html,/<div id="panel-alertas"/);
 assert.match(html,/id="apd-comparador-panel"[^>]*hidden/);
 assert.match(html,/apd_comparador_panel\.css/);
 assert.doesNotMatch(html,/<script type="module" src="apd_comparador_panel\.mjs/);
 assert.match(app,/import\("\.\/apd_comparador_panel\.mjs\?v=lab-20261107"\)/);
 assert.match(app,/planActual\?\.access_active === true && !!obtenerToken\(\)/);
});
test('comparison happens locally; no storage, network, tokens, or data exports',()=>{
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|Authorization|navigator\.geolocation|indexedDB/i);
 assert.match(ui,/import \{compareOffers\} from '\.\/scripts\/apd-comparador-criterios\.mjs'/);
 assert.match(ui,/state\.selected\.clear\(\)/);
});
test('access gated by active authenticated plan and reset when session changes',()=>{
 assert.match(app,/enabled: !!obtenerToken\(\) && planActual\?\.access_active === true/);
 assert.match(app,/window\.APD_comparatorReset\?\.\(\)/);
 assert.ok(app.split('window.APD_comparatorReset?.()').length>=3);
 assert.match(app,/window\.APD_comparatorRefresh\?\.\(/);
});
test('selection never uses array index or missing ID as official identity',()=>{
 assert.match(ui,/offer\?\.source_offer_key/);
 assert.match(ui,/offer\?\.iddetalle/);
 assert.match(ui,/btn\.disabled=!key/);
 assert.match(ui,/const max=5/);
 assert.match(ui,/if\(state\.selected\.size>=max\)/);
 assert.doesNotMatch(ui,/getCurrentPosition\(/);
});
test('new UI is responsive and all data labels are DOM text, not raw HTML',()=>{
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(ui,/el\.textContent=String\(text\)/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.match(ui,/root\.replaceChildren\(\)/);
 assert.match(ui,/aria-pressed/);
});

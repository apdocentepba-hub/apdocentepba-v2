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
 assert.match(html,/import\('\.\/apd_comparador_panel\.mjs\?v=20261109-modal1'\)/);
 assert.match(html,/new MutationObserver\(sync\)/);
 assert.match(html,/observer\.observe\(panel,\{childList:true,subtree:false\}\)/);
});
test('comparison happens locally; no storage, network, tokens, or data exports',()=>{
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|Authorization|navigator\.geolocation|indexedDB/i);
 assert.match(ui,/import \{compareOffers\} from '\.\/scripts\/apd-comparador-criterios\.mjs'/);
 assert.match(ui,/state\.selected\.clear\(\)/);
});
test('access gated by active authenticated plan and reset when session changes',()=>{
 assert.match(html,/typeof dashboardLoadedOwner==='string'/);
 assert.match(html,/owner!==previousOwner/);
 assert.match(html,/window\.APD_comparatorReset\?\.\(\)/);
 assert.match(html,/planActual\?\.access_active===true/);
 assert.match(html,/window\.APD_comparatorRefresh\(\{offers,index,enabled:true\}\)/);
 assert.doesNotMatch(app,/APD_comparatorRefresh|APD_comparatorReset|apd_comparador_panel/);
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


test('comparison is findable and shows side-by-side differences without PID inference',()=>{
 assert.match(ui,/function focusComparison\(\)/);
 assert.match(ui,/Ver comparación \('/);
 assert.match(ui,/beforeCount===1&&state\.selected\.size===2/);
 assert.match(ui,/dialog\.showModal/);
 assert.match(ui,/document\.body\.appendChild\(dialog\)/);
 assert.match(ui,/closeComparisonDialog\(\)/);
 assert.match(ui,/Comparación lado a lado/);
 assert.match(ui,/class.*apd-comparator-table-scroll|apd-comparator-table-scroll/);
 assert.match(ui,/apd-comparator-diff/);
 assert.match(ui,/No verificado/);
 assert.match(css,/#apd-comparador-panel\{scroll-margin-top/);
 assert.match(css,/\.apd-comparator-table-scroll\{/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/#panel-alertas \.alerta-row\{/);
});

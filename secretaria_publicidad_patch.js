(function(){
'use strict';
if(window.__apdSecretariaPublicidadPatchLoaded) return;
window.__apdSecretariaPublicidadPatchLoaded = true;

const MANUAL_URL = 'https://articulo.mercadolibre.com.ar/MLA-1841742999-manual-operativo-de-secretaria-escolar-_JM';
const GUIA_URL = 'https://articulo.mercadolibre.com.ar/MLA-1847963847-guia-pruebas-secretario-escolar-pba-practica-anexos-_JM';

function addStyles(){
  if(document.getElementById('apd-secretaria-publicidad-style')) return;
  const s = document.createElement('style');
  s.id = 'apd-secretaria-publicidad-style';
  s.textContent = `
    .apd-secretaria-ad{grid-column:1/-1!important;border-radius:22px!important;border:1px solid #dbe7f5!important;background:linear-gradient(135deg,#ffffff 0%,#f8fbff 58%,#eef5ff 100%)!important;box-shadow:0 18px 44px rgba(16,36,61,.08)!important;padding:26px!important;overflow:hidden!important}
    .apd-secretaria-ad-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}.apd-secretaria-ad-kicker{display:inline-flex;background:#edf4ff;color:#0f4fb8;border:1px solid #cfe1fa;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px}.apd-secretaria-ad h3{margin:0;color:#061a37!important;font-size:clamp(24px,3vw,34px)!important;line-height:1.05!important;letter-spacing:-.04em!important}.apd-secretaria-ad p{color:#42526b!important;line-height:1.55!important;margin:8px 0 0!important}.apd-secretaria-products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.apd-secretaria-product{background:#fff;border:1px solid #dbe7f5;border-radius:18px;padding:18px;box-shadow:0 10px 26px rgba(16,36,61,.05)}.apd-secretaria-tags{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.apd-secretaria-tags span{border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;background:#0f3460;color:#fff}.apd-secretaria-tags span+span{background:#f5b301;color:#08235a}.apd-secretaria-product h4{margin:0;color:#0f3460;font-size:18px;line-height:1.18}.apd-secretaria-price{display:block;margin:10px 0 12px;color:#0f3460;font-size:27px;font-weight:900}.apd-secretaria-actions{display:flex;gap:10px;flex-wrap:wrap}.apd-secretaria-note{margin-top:14px;padding:13px 14px;border-radius:14px;background:#fff;border:1px solid #dbe7f5;color:#5f718b;font-size:12px;line-height:1.5}@media(max-width:760px){.apd-secretaria-products{grid-template-columns:1fr}.apd-secretaria-actions a{width:100%;justify-content:center}}
  `;
  document.head.appendChild(s);
}

function makeProduct(title, desc, price, url, btnText){
  const box = document.createElement('article');
  box.className = 'apd-secretaria-product';
  const tags = document.createElement('div');
  tags.className = 'apd-secretaria-tags';
  tags.innerHTML = '<span>PDF DIGITAL</span><span>No es libro físico</span>';
  const h = document.createElement('h4');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = desc;
  const pr = document.createElement('strong');
  pr.className = 'apd-secretaria-price';
  pr.textContent = price;
  const actions = document.createElement('div');
  actions.className = 'apd-secretaria-actions';
  const a = document.createElement('a');
  a.className = 'btn btn-primary';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener sponsored';
  a.textContent = btnText;
  actions.appendChild(a);
  box.append(tags,h,p,pr,actions);
  return box;
}

function buildCard(){
  const card = document.createElement('div');
  card.id = 'apd-secretaria-ad-card';
  card.className = 'panel-card span-12 apd-secretaria-ad';
  const head = document.createElement('div');
  head.className = 'apd-secretaria-ad-head';
  const copy = document.createElement('div');
  copy.innerHTML = '<div class="apd-secretaria-ad-kicker">📘 Recursos recomendados</div><h3>Recursos digitales para Secretaría Escolar PBA</h3><p>Materiales prácticos en PDF para organizar el trabajo administrativo escolar y preparar pruebas de selección.</p>';
  head.appendChild(copy);
  const grid = document.createElement('div');
  grid.className = 'apd-secretaria-products';
  grid.appendChild(makeProduct('Manual Operativo de Secretaría Escolar PBA','Orientaciones, modelos, circuitos de trabajo, legajos, actas, notas, constancias, certificaciones, pases, licencias, contralor, POF, POFA y CUPOF.','$16.900',MANUAL_URL,'Ver manual en Mercado Libre'));
  grid.appendChild(makeProduct('Guía Pruebas Secretario Escolar PBA + Práctica + Anexos','Paquete de estudio para preparar pruebas de selección. Incluye libro principal, cuaderno de práctica y anexos imprimibles.','$12.999',GUIA_URL,'Ver guía en Mercado Libre'));
  const note = document.createElement('div');
  note.className = 'apd-secretaria-note';
  note.innerHTML = '<strong>Entrega 100% digital.</strong> No se envía libro físico. Material didáctico no oficial: no pertenece a DGCyE, SAD, Portal ABC, inspección ni a ningún organismo oficial.';
  card.append(head,grid,note);
  return card;
}

function install(){
  addStyles();
  if(document.getElementById('apd-secretaria-ad-card')) return;
  const grid = document.querySelector('#panel-tab-pane-inicio .panel-tab-grid');
  if(!grid) return;
  const card = buildCard();
  const hero = document.getElementById('apd-panel-showcase');
  if(hero && hero.parentElement === grid) hero.insertAdjacentElement('afterend', card);
  else grid.prepend(card);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
[500,1200,2500,5000,9000].forEach(ms => setTimeout(install, ms));
})();

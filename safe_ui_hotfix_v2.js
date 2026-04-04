(function(){
  'use strict';
  if (window.__apdUiHotfixV2Loaded) return;
  window.__apdUiHotfixV2Loaded = true;

  const MP_LINKS = window.APD_MP_LINKS || {
    plus: '',
    inside: '',
    signature: ''
  };

  const byId = (id) => document.getElementById(id);

  function ensureStyles(){
    if (byId('safe-ui-hotfix-v2-style')) return;
    const s = document.createElement('style');
    s.id = 'safe-ui-hotfix-v2-style';
    s.textContent = `
      .apd-banner-list{display:grid;gap:8px;margin-top:12px}
      .apd-banner-item{padding:10px 12px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff;color:#0f3460;font-size:13px;font-weight:700}
      .apd-fallback-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}
      .apd-fallback-stat{padding:12px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff;text-align:center}
      .apd-fallback-stat strong{display:block;font-size:22px;color:#0f3460}
      .apd-plan-note{margin-top:10px;font-size:12px;color:#64748b}
      .apd-pay-btn[disabled]{opacity:.55;cursor:not-allowed}
      @media (max-width:768px){
        #panel-quick-actions{display:none!important}
        #panel-market-banner .apd-marquee{display:none!important}
        #panel-market-banner .apd-mini-actions{display:grid!important;grid-template-columns:1fr!important;gap:10px}
        #panel-market-banner #apd-open-profile-from-banner{display:none!important}
        .apd-fallback-grid{grid-template-columns:1fr 1fr}
      }
      @media (max-width:540px){
        .apd-fallback-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(s);
  }

  function goTo(id){ byId(id)?.scrollIntoView({behavior:'smooth', block:'start'}); }

  function getPrefs(){
    const box = byId('panel-preferencias-resumen');
    const out = { distritos: [], cargos: [] };
    if (!box) return out;
    const ps = Array.from(box.querySelectorAll('p')).map(p => p.textContent || '');
    const distLine = ps.find(x => x.toLowerCase().includes('distritos:')) || '';
    const cargosLine = ps.find(x => x.toLowerCase().includes('cargos/materias:')) || '';
    out.distritos = distLine.split(':').slice(1).join(':').split('/').map(x => x.trim()).filter(Boolean).filter(x => !x.startsWith('('));
    out.cargos = cargosLine.split(':').slice(1).join(':').split(',').map(x => x.trim()).filter(Boolean).filter(x => !x.startsWith('('));
    return out;
  }

  function getAlertsVisible(){
    const est = byId('panel-estadisticas');
    const text = String(est?.innerText || '');
    const nums = text.match(/\d+/g) || [];
    return nums.length ? Number(nums[0]) : 0;
  }

  function patchBanner(){
    const card = byId('panel-market-banner');
    if (!card || card.dataset.hotfixBanner === '1') return false;
    const marquee = card.querySelector('.apd-marquee');
    if (marquee) {
      marquee.outerHTML = `
        <div class="apd-banner-list">
          <div class="apd-banner-item">📍 Mirá el radar provincial antes de ampliar distritos.</div>
          <div class="apd-banner-item">🎯 Afiná cargos y materias para mejorar compatibilidad.</div>
          <div class="apd-banner-item">📚 Importá listados desde ABC para enriquecer perfil.</div>
        </div>
      `;
    }
    card.dataset.hotfixBanner = '1';
    return true;
  }

  function wirePaymentButton(id, url){
    const btn = byId(id);
    if (!btn) return;
    if (url) {
      btn.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
    } else {
      btn.disabled = true;
      btn.title = 'Falta cargar el link real de Mercado Pago para este plan';
    }
  }

  function patchPlans(){
    const card = byId('panel-planes-catalogo');
    if (!card) return false;
    const body = card.querySelector('.apd-soft-card');
    if (!body) return false;
    if (card.dataset.hotfixPlans === '1') return true;

    body.innerHTML = `
      <div class="apd-section-kicker">Planes</div>
      <div class="apd-soft-title">Planes APDocentePBA</div>
      <div class="apd-soft-text">Catálogo actualizado con 4 planes totales: Free + 3 pagos.</div>
      <div class="apd-plan-grid">
        <div class="apd-plan-card">
          <h4>🟢 Free</h4>
          <div class="apd-plan-price">$0</div>
          <ul class="apd-plan-list">
            <li>alertas básicas</li>
            <li>panel inicial</li>
            <li>preferencias esenciales</li>
            <li>uso liviano</li>
          </ul>
          <div class="apd-plan-cta">
            <button class="apd-top-launch alt" type="button" id="apd-plan-free-market-v2">Ver mercado</button>
          </div>
        </div>
        <div class="apd-plan-card">
          <h4>🟡 Plus</h4>
          <div class="apd-plan-price">plus</div>
          <ul class="apd-plan-list">
            <li>más filtros</li>
            <li>más visibilidad</li>
            <li>más lectura que free</li>
            <li>mejor arranque</li>
          </ul>
          <div class="apd-plan-cta">
            <button class="apd-top-launch apd-pay-btn" type="button" id="apd-plan-plus-pay">Pagar Plus</button>
          </div>
        </div>
        <div class="apd-plan-card">
          <span class="apd-recommended">RECOMENDADO</span>
          <h4>🔵 Inside</h4>
          <div class="apd-plan-price">inside</div>
          <ul class="apd-plan-list">
            <li>más distritos</li>
            <li>más cargos y materias</li>
            <li>mercado e insights</li>
            <li>mejor lectura para decidir</li>
          </ul>
          <div class="apd-plan-cta">
            <button class="apd-top-launch apd-pay-btn" type="button" id="apd-plan-inside-pay">Pagar Inside</button>
          </div>
        </div>
        <div class="apd-plan-card">
          <h4>🟣 Signature</h4>
          <div class="apd-plan-price">signature</div>
          <ul class="apd-plan-list">
            <li>canales avanzados</li>
            <li>prioridad y funciones pro</li>
            <li>extras premium</li>
            <li>enfoque profesional</li>
          </ul>
          <div class="apd-plan-cta">
            <button class="apd-top-launch apd-pay-btn" type="button" id="apd-plan-signature-pay">Pagar Signature</button>
          </div>
        </div>
      </div>
      <div class="apd-plan-note">Los botones de pago ya quedan preparados para Mercado Pago. Si todavía no se definieron las URLs reales, se desactivan para no mandar a links incorrectos.</div>
      <div class="apd-mini-actions">
        <button id="apd-hide-plan-catalog-v2" class="btn btn-secondary" type="button">Cerrar planes</button>
      </div>
    `;

    byId('apd-plan-free-market-v2')?.addEventListener('click', () => goTo('panel-historico-docente'));
    byId('apd-hide-plan-catalog-v2')?.addEventListener('click', () => card.classList.add('apd-hidden'));
    wirePaymentButton('apd-plan-plus-pay', MP_LINKS.plus);
    wirePaymentButton('apd-plan-inside-pay', MP_LINKS.inside);
    wirePaymentButton('apd-plan-signature-pay', MP_LINKS.signature);

    card.dataset.hotfixPlans = '1';
    return true;
  }

  function patchHistoricoFallback(){
    const body = byId('historico-docente-body');
    if (!body || body.dataset.hotfixHistorico === '1') return false;
    const txt = String(body.innerText || '').toLowerCase();
    if (!txt.includes('necesita al menos una importación')) return false;

    const prefs = getPrefs();
    const alertas = getAlertsVisible();
    body.innerHTML = `
      <div class="apd-soft-card">
        <div class="apd-soft-title">Lectura base del histórico</div>
        <div class="apd-soft-text">Hasta que entre una importación real desde ABC, te muestro una base útil del panel para que histórico no quede vacío.</div>
        <div class="apd-fallback-grid">
          <div class="apd-fallback-stat"><strong>${prefs.distritos.length}</strong><span>Distritos cargados</span></div>
          <div class="apd-fallback-stat"><strong>${prefs.cargos.length}</strong><span>Cargos / materias</span></div>
          <div class="apd-fallback-stat"><strong>${alertas}</strong><span>Alertas visibles</span></div>
          <div class="apd-fallback-stat"><strong>local</strong><span>Modo actual</span></div>
        </div>
        <div class="apd-mini-actions">
          <button id="apd-historico-go-radar" class="btn btn-secondary" type="button">Ir al radar provincial</button>
          <button id="apd-historico-go-profile" class="btn btn-outline" type="button">Ir a perfil docente</button>
        </div>
      </div>
    `;
    byId('apd-historico-go-radar')?.addEventListener('click', () => goTo('panel-radar-provincia'));
    byId('apd-historico-go-profile')?.addEventListener('click', () => goTo('panel-perfil-docente'));
    body.dataset.hotfixHistorico = '1';
    return true;
  }

  function boot(){
    ensureStyles();
    let tries = 0;
    const tick = () => {
      tries += 1;
      patchBanner();
      patchPlans();
      patchHistoricoFallback();
      if (tries < 24) setTimeout(tick, 900);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();
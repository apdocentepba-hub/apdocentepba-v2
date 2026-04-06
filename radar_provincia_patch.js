(function () {
  'use strict';

  if (window.__apdRadarProvinciaPatchLoaded) return;
  window.__apdRadarProvinciaPatchLoaded = true;

  const SNAPSHOT = {
    updated_at: '2026-04-06',
    records_total: 155984,
    apd_unicas: 16766,
    publicadas: 8014,
    designadas: 5095,
    desiertas: 2679,
    top_publicadas: [
      { label: 'La Matanza', value: 555 },
      { label: 'La Plata', value: 265 },
      { label: 'Moreno', value: 249 },
      { label: 'Tigre', value: 236 },
      { label: 'Merlo', value: 226 }
    ],
    top_designadas: [
      { label: 'La Matanza', value: 482 },
      { label: 'Lomas de Zamora', value: 246 },
      { label: 'Almirante Brown', value: 193 },
      { label: 'Merlo', value: 192 },
      { label: 'La Plata', value: 187 }
    ],
    top_desiertas: [
      { label: 'General Villegas', value: 106 },
      { label: 'Tres Arroyos', value: 73 },
      { label: 'Villa Gesell', value: 71 },
      { label: 'Pinamar', value: 69 },
      { label: 'Lincoln', value: 61 }
    ],
    top_materias: [
      { label: 'Inglés (IGS)', value: 455 },
      { label: 'Educación Física (EFC)', value: 313 },
      { label: 'Proyectos de Superior (PSU)', value: 294 },
      { label: 'Maestro de Grado (/MG)', value: 267 },
      { label: 'Geografía (GGF)', value: 222 }
    ],
    top_turnos: [
      { label: 'T', value: 3220 },
      { label: 'M', value: 3052 },
      { label: 'V', value: 903 },
      { label: 'A', value: 448 }
    ]
  };

  const state = {
    bannerTimer: null,
    observer: null
  };

  function byId(id) { return document.getElementById(id); }
  function esc(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }
  function fmtNum(v, digits) {
    if (typeof window.fmtNum === 'function') return window.fmtNum(v, digits || 0);
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString('es-AR', {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    });
  }
  function turnoTexto(v) {
    if (typeof window.turnoTexto === 'function') return window.turnoTexto(v);
    const raw = String(v || '').trim().toUpperCase();
    if (raw === 'M') return 'Mañana';
    if (raw === 'T') return 'Tarde';
    if (raw === 'V') return 'Vespertino';
    if (raw === 'N') return 'Noche';
    if (raw === 'A' || raw === 'ALTERNADO') return 'Alternado';
    return raw;
  }

  function ensureStyles() {
    if (byId('apd-radar-provincia-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-radar-provincia-style';
    style.textContent = `
      .radar-wrap{display:grid;gap:14px}
      .radar-banner{padding:16px 18px;border:1px solid rgba(15,52,96,.12);border-radius:18px;background:linear-gradient(135deg,rgba(15,52,96,.06),rgba(37,99,235,.08));}
      .radar-banner-kicker{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#0f3460;opacity:.85;margin-bottom:6px}
      .radar-banner-title{font-size:18px;font-weight:800;color:#0f3460;line-height:1.3;margin-bottom:6px}
      .radar-banner-copy{font-size:14px;line-height:1.55;color:#334155;min-height:44px}
      .radar-banner-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .radar-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid rgba(15,52,96,.12);font-size:12px;font-weight:700;color:#0f3460}
      .radar-dots{display:flex;gap:6px;margin-top:10px}
      .radar-dot{width:8px;height:8px;border-radius:999px;background:rgba(15,52,96,.18)}
      .radar-dot.is-active{background:#0f3460}
      .radar-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .radar-stat{padding:12px 14px;border-radius:14px;background:#fff;border:1px solid rgba(15,52,96,.12)}
      .radar-stat-n{display:block;font-size:20px;font-weight:800;color:#0f3460}
      .radar-stat-l{display:block;font-size:12px;color:#64748b;margin-top:3px}
      .radar-personal{padding:14px 16px;border-radius:18px;background:#fff;border:1px solid rgba(15,52,96,.12)}
      .radar-section-title{font-size:15px;font-weight:800;color:#0f3460;margin:0 0 10px 0}
      .radar-note{font-size:13px;color:#64748b;line-height:1.5;margin:0 0 12px 0}
      .radar-prefs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px 0}
      .radar-columns{display:grid;grid-template-columns:1.1fr .9fr;gap:12px}
      .radar-box{padding:12px 14px;border-radius:14px;background:#f8fafc;border:1px solid rgba(15,52,96,.1)}
      .radar-list{list-style:none;padding:0;margin:0;display:grid;gap:8px}
      .radar-item{display:flex;justify-content:space-between;gap:10px;font-size:14px;color:#334155}
      .radar-item strong{color:#0f3460}
      .radar-empty{padding:12px 14px;border-radius:14px;background:#fff7ed;border:1px solid rgba(234,88,12,.14);color:#9a3412;font-size:13px;line-height:1.5}
      @media (max-width: 900px){.radar-grid,.radar-columns{grid-template-columns:1fr 1fr}}
      @media (max-width: 640px){.radar-grid,.radar-columns{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function panelRoot() { return byId('panel-content'); }

  function ensureCard() {
    const root = panelRoot();
    if (!root) return null;
    let card = byId('panel-radar-combinado-card');
    if (card) return card;

    const historicoCard = byId('panel-historico-apd-card');
    const html = `
      <div id="panel-radar-combinado-card" class="panel-card span-12">
        <div class="card-lbl-row">
          <span class="card-lbl">📍 Radar provincia + tu radar</span>
          <button id="btn-refresh-radar-combinado" class="mini-btn" type="button">Refrescar radar</button>
        </div>
        <div class="radar-wrap">
          <div id="panel-radar-banner-provincia"></div>
          <div id="panel-radar-combinado"></div>
        </div>
      </div>
    `;

    if (historicoCard) {
      historicoCard.insertAdjacentHTML('beforebegin', html);
    } else {
      root.insertAdjacentHTML('beforeend', html);
    }

    card = byId('panel-radar-combinado-card');
    bindRefresh();
    return card;
  }

  function getPreferenceSummary() {
    const districts = [
      'pref-distrito-principal',
      'pref-segundo-distrito',
      'pref-tercer-distrito',
      'pref-cuarto-distrito',
      'pref-quinto-distrito'
    ].map(id => String(byId(id)?.value || '').trim()).filter(Boolean);

    const cargos = Array.from({ length: 10 }, (_, i) => String(byId(`pref-cargo-${i + 1}`)?.value || '').trim()).filter(Boolean);
    const turnosRaw = String(byId('pref-turnos')?.value || '').trim();
    const turnos = turnosRaw ? [turnoTexto(turnosRaw)] : [];
    const niveles = Array.from(document.querySelectorAll('input[name="pref-nivel-modalidad"]:checked')).map(el => {
      const txt = (el.parentElement?.textContent || el.value || '').trim();
      return txt;
    }).filter(Boolean);

    return { districts, cargos, turnos, niveles };
  }

  function buildBannerInsights() {
    const firstDistrito = SNAPSHOT.top_publicadas[0];
    const firstDesignado = SNAPSHOT.top_designadas[0];
    const firstDesierta = SNAPSHOT.top_desiertas[0];
    const firstMateria = SNAPSHOT.top_materias[0];
    const firstTurno = SNAPSHOT.top_turnos[0];

    return [
      `A nivel provincial, ${firstDistrito.label} es hoy el distrito con más publicadas vigentes, con ${fmtNum(firstDistrito.value)} oportunidades captadas en la base histórica 2026.`,
      `${firstDesignado.label} lidera las designadas del histórico reciente, con ${fmtNum(firstDesignado.value)} cierres positivos registrados.`,
      `${firstDesierta.label} aparece como uno de los distritos donde más veces quedaron ofertas desiertas, con ${fmtNum(firstDesierta.value)} casos relevados.`,
      `${firstMateria.label} es una de las materias/cargos con más movimiento provincial, con ${fmtNum(firstMateria.value)} publicaciones en el resumen histórico.`,
      `El turno ${firstTurno.label === 'T' ? 'tarde' : turnoTexto(firstTurno.label).toLowerCase()} concentra ${fmtNum(firstTurno.value)} publicadas y marca el pulso fuerte del movimiento provincial.`
    ];
  }

  function renderBanner() {
    ensureStyles();
    ensureCard();
    const box = byId('panel-radar-banner-provincia');
    if (!box) return;

    const insights = buildBannerInsights();
    box.innerHTML = `
      <div class="radar-banner">
        <div class="radar-banner-kicker">Radar provincia</div>
        <div class="radar-banner-title">Lecturas rápidas del movimiento provincial</div>
        <div id="radar-banner-copy" class="radar-banner-copy"></div>
        <div class="radar-banner-meta">
          <span class="radar-chip">APD únicas: ${fmtNum(SNAPSHOT.apd_unicas)}</span>
          <span class="radar-chip">Publicadas: ${fmtNum(SNAPSHOT.publicadas)}</span>
          <span class="radar-chip">Designadas: ${fmtNum(SNAPSHOT.designadas)}</span>
          <span class="radar-chip">Desiertas: ${fmtNum(SNAPSHOT.desiertas)}</span>
        </div>
        <div id="radar-banner-dots" class="radar-dots"></div>
      </div>
    `;

    const copy = byId('radar-banner-copy');
    const dots = byId('radar-banner-dots');
    let index = 0;

    function paint() {
      if (!copy || !dots) return;
      copy.textContent = insights[index] || '';
      dots.innerHTML = insights.map((_, i) => `<span class="radar-dot ${i === index ? 'is-active' : ''}"></span>`).join('');
    }

    clearInterval(state.bannerTimer);
    paint();
    if (insights.length > 1) {
      state.bannerTimer = setInterval(function () {
        index = (index + 1) % insights.length;
        paint();
      }, 4300);
    }
  }

  function renderPrefsChips(prefs) {
    const chips = [];
    prefs.districts.slice(0, 4).forEach(v => chips.push(`<span class="radar-chip">📍 ${esc(v)}</span>`));
    prefs.cargos.slice(0, 4).forEach(v => chips.push(`<span class="radar-chip">📚 ${esc(v)}</span>`));
    prefs.turnos.slice(0, 2).forEach(v => chips.push(`<span class="radar-chip">🕒 ${esc(v)}</span>`));
    prefs.niveles.slice(0, 3).forEach(v => chips.push(`<span class="radar-chip">🏫 ${esc(v)}</span>`));
    return chips.join('');
  }

  function renderPersonalRadar(data) {
    ensureStyles();
    ensureCard();
    const box = byId('panel-radar-combinado');
    if (!box) return;

    const prefs = getPreferenceSummary();
    const prefsHtml = renderPrefsChips(prefs);

    if (!data || data.empty || !data.ofertas_unicas) {
      box.innerHTML = `
        <div class="radar-personal">
          <h4 class="radar-section-title">Tu radar según preferencias</h4>
          <p class="radar-note">Acá te vamos a resumir qué está pasando dentro de los distritos, materias, turnos y modalidades que elegiste.</p>
          <div class="radar-prefs">${prefsHtml || '<span class="radar-chip">Todavía no hay filtros cargados</span>'}</div>
          <div class="radar-empty">Todavía no hay suficiente histórico filtrado para mostrar un radar personalizado útil.</div>
        </div>
      `;
      return;
    }

    const topDistrito = Array.isArray(data.top_distritos) && data.top_distritos[0];
    const topCargo = Array.isArray(data.top_cargos) && data.top_cargos[0];
    const topTurno = Array.isArray(data.top_turnos) && data.top_turnos[0];

    const insightLines = [
      topDistrito?.label ? `Dentro de tus filtros, el distrito más activo viene siendo ${topDistrito.label}.` : '',
      topCargo?.label ? `La materia / cargo con más movimiento en tu radar es ${topCargo.label}.` : '',
      topTurno?.label ? `El turno que más aparece dentro de tu selección es ${turnoTexto(topTurno.label)}.` : ''
    ].filter(Boolean);

    box.innerHTML = `
      <div class="radar-personal">
        <h4 class="radar-section-title">Tu radar según preferencias</h4>
        <p class="radar-note">Cruza tus preferencias actuales con la base histórica para mostrar dónde hubo más movimiento dentro de tu propio radar.</p>
        <div class="radar-prefs">${prefsHtml || '<span class="radar-chip">Sin filtros específicos: leyendo todo tu histórico</span>'}</div>

        <div class="radar-grid" style="margin-bottom:12px;">
          <div class="radar-stat"><span class="radar-stat-n">${fmtNum(data.ofertas_unicas)}</span><span class="radar-stat-l">Ofertas únicas en tu radar</span></div>
          <div class="radar-stat"><span class="radar-stat-n">${fmtNum(data.activas_estimadas)}</span><span class="radar-stat-l">Activas estimadas</span></div>
          <div class="radar-stat"><span class="radar-stat-n">${fmtNum(data.nuevas_7d)}</span><span class="radar-stat-l">Nuevas en 7 días</span></div>
          <div class="radar-stat"><span class="radar-stat-n">${fmtNum(data.cambios_estado_recientes)}</span><span class="radar-stat-l">Cambios de estado</span></div>
        </div>

        <div class="radar-columns">
          <div class="radar-box">
            <h5 class="radar-section-title" style="font-size:14px;margin-bottom:8px;">Lo más fuerte dentro de tu radar</h5>
            <ul class="radar-list">
              ${(Array.isArray(data.top_distritos) ? data.top_distritos.slice(0, 4) : []).map(item => `<li class="radar-item"><span>${esc(item.label)}</span><strong>${fmtNum(item.value)}</strong></li>`).join('') || '<li class="radar-item"><span>Sin datos</span><strong>-</strong></li>'}
            </ul>
          </div>
          <div class="radar-box">
            <h5 class="radar-section-title" style="font-size:14px;margin-bottom:8px;">Materias / cargos más presentes</h5>
            <ul class="radar-list">
              ${(Array.isArray(data.top_cargos) ? data.top_cargos.slice(0, 4) : []).map(item => `<li class="radar-item"><span>${esc(item.label)}</span><strong>${fmtNum(item.value)}</strong></li>`).join('') || '<li class="radar-item"><span>Sin datos</span><strong>-</strong></li>'}
            </ul>
          </div>
        </div>

        <div class="radar-box" style="margin-top:12px;">
          <h5 class="radar-section-title" style="font-size:14px;margin-bottom:8px;">Lectura rápida de tus filtros</h5>
          <ul class="radar-list">
            ${insightLines.map(txt => `<li class="radar-item"><span>${esc(txt)}</span><strong></strong></li>`).join('') || '<li class="radar-item"><span>Todavía no hay suficiente detalle para generar una lectura rápida.</span><strong></strong></li>'}
          </ul>
        </div>
      </div>
    `;
  }

  async function loadPersonalRadar() {
    const token = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
    const box = byId('panel-radar-combinado');
    if (box) {
      box.innerHTML = '<div class="radar-personal"><p class="ph">Cargando radar según preferencias...</p></div>';
    }
    if (!token || typeof window.obtenerHistoricoResumen !== 'function') {
      renderPersonalRadar(null);
      return;
    }
    try {
      const data = await window.obtenerHistoricoResumen(token, 30);
      renderPersonalRadar(data);
    } catch (err) {
      console.error('ERROR RADAR PREFERENCIAS:', err);
      if (box) {
        box.innerHTML = `<div class="radar-personal"><div class="radar-empty">No se pudo cargar tu radar personalizado. ${esc(err?.message || '')}</div></div>`;
      }
    }
  }

  function bindRefresh() {
    const btn = byId('btn-refresh-radar-combinado');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async function () {
      if (typeof window.btnLoad === 'function') window.btnLoad(btn, 'Refrescando...');
      else btn.disabled = true;
      try {
        await window.cargarExtrasProvincia(true);
      } finally {
        if (typeof window.btnRestore === 'function') window.btnRestore(btn);
        else btn.disabled = false;
      }
    });
  }

  async function cargarExtrasProvincia() {
    ensureStyles();
    ensureCard();
    bindRefresh();
    renderBanner();
    await loadPersonalRadar();
  }

  function installObserver() {
    const root = panelRoot();
    if (!root || state.observer) return;
    state.observer = new MutationObserver(function () {
      if (!byId('panel-radar-combinado-card')) {
        ensureCard();
        bindRefresh();
      }
    });
    state.observer.observe(root, { childList: true, subtree: true });
  }

  window.cargarExtrasProvincia = cargarExtrasProvincia;

  function boot() {
    ensureStyles();
    ensureCard();
    bindRefresh();
    installObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

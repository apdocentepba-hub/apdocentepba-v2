(function () {
  'use strict';

  if (window.__apdStatisticsPanelPatchLoaded) return;
  window.__apdStatisticsPanelPatchLoaded = true;

  const state = {
    historicoTokenLoaded: '',
    bannerTimer: null
  };

  function esc(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(v, digits = 0) {
    if (typeof window.fmtNum === 'function') return window.fmtNum(v, digits);
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function ensureStyles() {
    if (document.getElementById('stats-panel-patch-style')) return;
    const style = document.createElement('style');
    style.id = 'stats-panel-patch-style';
    style.textContent = `
      .stats-hero-wrap{margin:0 0 14px 0;padding:14px 16px;border:1px solid rgba(15,52,96,.12);border-radius:16px;background:linear-gradient(135deg,rgba(15,52,96,.06),rgba(37,99,235,.08));}
      .stats-hero-kicker{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.8;margin-bottom:6px;color:#0f3460}
      .stats-hero-title{font-size:18px;font-weight:800;line-height:1.3;color:#0f3460;margin:0 0 6px 0}
      .stats-hero-copy{font-size:14px;line-height:1.5;color:#334155;min-height:42px}
      .stats-hero-dots{display:flex;gap:6px;margin-top:10px}
      .stats-hero-dot{width:8px;height:8px;border-radius:999px;background:rgba(15,52,96,.18)}
      .stats-hero-dot.is-active{background:#0f3460}
    `;
    document.head.appendChild(style);
  }

  function buildInsights(data) {
    const insights = [];
    const topDistrito = Array.isArray(data?.top_distritos) && data.top_distritos[0];
    const topCargo = Array.isArray(data?.top_cargos) && data.top_cargos[0];
    const topTurno = Array.isArray(data?.top_turnos) && data.top_turnos[0];

    if (topDistrito?.label) insights.push(`El distrito con más movimiento reciente es ${topDistrito.label}, con ${fmtNum(topDistrito.value)} publicaciones en la ventana analizada.`);
    if (topCargo?.label) insights.push(`La materia / cargo que más apareció fue ${topCargo.label}, con ${fmtNum(topCargo.value)} publicaciones.`);
    if (topTurno?.label) insights.push(`El turno más frecuente fue ${topTurno.label}, con ${fmtNum(topTurno.value)} apariciones.`);
    if (Number(data?.nuevas_7d) > 0) insights.push(`En los últimos 7 días detectamos ${fmtNum(data.nuevas_7d)} ofertas nuevas dentro del histórico filtrado.`);
    if (Number(data?.cierran_72h) > 0) insights.push(`Hay ${fmtNum(data.cierran_72h)} ofertas que cierran dentro de 72 horas.`);
    if (data?.promedio_postulantes != null) insights.push(`El promedio de postulantes por oferta es ${fmtNum(data.promedio_postulantes, 1)}.`);
    if (data?.promedio_puntaje_primero != null) insights.push(`El puntaje promedio del primer postulante es ${fmtNum(data.promedio_puntaje_primero, 2)}.`);
    if (Number(data?.cambios_estado_recientes) > 0) insights.push(`Detectamos ${fmtNum(data.cambios_estado_recientes)} cambios recientes de estado entre snapshots.`);

    return insights.filter(Boolean);
  }

  function mountBanner(data) {
    const box = document.getElementById('panel-historico-apd');
    if (!box || !data || data.empty || !data.ofertas_unicas) return;

    ensureStyles();
    const insights = buildInsights(data);
    if (!insights.length) return;

    box.querySelector('.stats-hero-wrap')?.remove();
    const hero = document.createElement('div');
    hero.className = 'stats-hero-wrap';
    hero.innerHTML = `
      <div class="stats-hero-kicker">Lectura rápida del histórico</div>
      <div class="stats-hero-title">Qué está pasando ahora</div>
      <div class="stats-hero-copy"></div>
      <div class="stats-hero-dots"></div>
    `;
    box.prepend(hero);

    const copy = hero.querySelector('.stats-hero-copy');
    const dots = hero.querySelector('.stats-hero-dots');
    let index = 0;

    function renderSlide() {
      if (!copy || !dots) return;
      copy.textContent = insights[index] || '';
      dots.innerHTML = insights.map((_, i) => `<span class="stats-hero-dot ${i === index ? 'is-active' : ''}"></span>`).join('');
    }

    renderSlide();
    clearInterval(state.bannerTimer);
    if (insights.length > 1) {
      state.bannerTimer = setInterval(() => {
        index = (index + 1) % insights.length;
        renderSlide();
      }, 4200);
    }
  }

  function patchRenderHistorico() {
    const original = window.renderHistoricoAPD;
    if (typeof original !== 'function' || original.__apdStatisticsPatched) return;

    function patchedRenderHistoricoAPD(data) {
      const result = original.apply(this, arguments);
      mountBanner(data);
      return result;
    }

    patchedRenderHistoricoAPD.__apdStatisticsPatched = true;
    window.renderHistoricoAPD = patchedRenderHistoricoAPD;
  }

  async function maybeLoadHistorico(force = false) {
    const token = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
    if (!token) return;
    if (!force && state.historicoTokenLoaded === token) return;
    if (typeof window.cargarHistoricoPanel !== 'function') return;

    state.historicoTokenLoaded = token;
    try {
      await window.cargarHistoricoPanel(token);
    } catch (err) {
      console.error('ERROR AUTOLOAD HISTORICO:', err);
      state.historicoTokenLoaded = '';
    }
  }

  function patchDashboardLoad() {
    const original = window.cargarDashboard;
    if (typeof original !== 'function' || original.__apdStatisticsPatched) return;

    async function patchedCargarDashboard() {
      const result = await original.apply(this, arguments);
      setTimeout(() => {
        maybeLoadHistorico(true).catch(() => {});
      }, 160);
      return result;
    }

    patchedCargarDashboard.__apdStatisticsPatched = true;
    window.cargarDashboard = patchedCargarDashboard;
  }

  function retitleCard() {
    const label = document.querySelector('#panel-historico-apd-card .card-lbl');
    if (label) label.textContent = '📈 Estadísticas históricas';
  }

  function bootPass() {
    patchRenderHistorico();
    patchDashboardLoad();
    retitleCard();
    maybeLoadHistorico(false).catch(() => {});
  }

  window.APD_mountStatisticsBanner = function () {
    patchRenderHistorico();
    maybeLoadHistorico(true).catch(() => {});
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootPass();
      setTimeout(bootPass, 600);
      setTimeout(bootPass, 1600);
    }, { once: true });
  } else {
    bootPass();
    setTimeout(bootPass, 600);
    setTimeout(bootPass, 1600);
  }
})();

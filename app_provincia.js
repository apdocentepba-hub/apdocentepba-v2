'use strict';
console.log("APP_PROVINCIA_CARGADO");
const PROVINCIA_DAYS_DEFAULT = 30;
let radarRotationTimer = null;
let provinciaBackfillMonitorTimer = null;

const escProvincia = typeof esc === 'function'
  ? esc
  : value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');

function fmtProvinciaNum(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function fmtProvinciaFecha(value) {
  if (typeof fmtFecha === 'function') return fmtFecha(value);
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString('es-AR');
}

function currentPlanProvincia() {
  try {
    if (typeof planActual !== 'undefined' && planActual) return planActual;
  } catch {}

  try {
    if (typeof buildPlanFallback === 'function') return buildPlanFallback();
  } catch {}

  return { plan: {}, subscription: {} };
}

function stopRadarRotationProvincia() {
  if (radarRotationTimer) clearInterval(radarRotationTimer);
  radarRotationTimer = null;
}

function stopProvinciaBackfillMonitor() {
  if (provinciaBackfillMonitorTimer) clearTimeout(provinciaBackfillMonitorTimer);
  provinciaBackfillMonitorTimer = null;
}

function setPanelHTMLProvincia(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setButtonBusyProvincia(btn, busyText) {
  if (!btn) return;
  if (typeof btnLoad === 'function') {
    btnLoad(btn, busyText);
    return;
  }
  btn.dataset.orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
}

function restoreButtonProvincia(btn) {
  if (!btn) return;
  if (typeof btnRestore === 'function') {
    btnRestore(btn);
    return;
  }
  btn.disabled = false;
  btn.textContent = btn.dataset.orig || btn.textContent;
}

function removePanelCardByContentId(contentId) {
  const content = document.getElementById(contentId);
  const card = content?.closest('.panel-card');
  if (card) card.remove();
}

function removeUnusedProvinciaPanels() {
  removePanelCardByContentId('panel-canales');
  removePanelCardByContentId('panel-backfill-provincia');
  removePanelCardByContentId('panel-historial');
  removePanelCardByContentId('panel-historico-apd');
}

async function obtenerProvinciaResumen(days = PROVINCIA_DAYS_DEFAULT) {
  return workerFetchJson(`/api/provincia/resumen?days=${encodeURIComponent(days)}`);
}

async function obtenerMiPlanProvincia(userId) {
  return workerFetchJson(`/api/mi-plan?user_id=${encodeURIComponent(userId)}`);
}

function clearMercadoPagoReturnParamsProvincia() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('mp')) return;
    url.searchParams.delete('mp');
    window.history.replaceState({}, document.title, url.toString());
  } catch {}
}

function syncPlanProvincia(planInfo, userId) {
  const resolved = planInfo || currentPlanProvincia();

  try {
    if (typeof planActual !== 'undefined') {
      planActual = resolved;
    }
  } catch {}

  if (typeof renderPlanUI === 'function') {
    renderPlanUI(resolved);
    return resolved;
  }

  if (typeof renderPlan === 'function') {
    try {
      renderPlan(resolved, userId);
      return resolved;
    } catch {}
  }

  const plan = resolved?.plan || {};
  const subscription = resolved?.subscription || {};
  const panel = document.getElementById('panel-plan');

  if (panel) {
    const status = subscription?.status || 'inactivo';
    const isTrial = !!subscription?.trial_ends_at;
    const isActive = status === 'active' || status === 'beta';

    let estadoTexto = 'Inactivo';
    let estadoColor = '#6b7280';

    if (isTrial) {
      estadoTexto = 'Periodo de prueba';
      estadoColor = '#f59e0b';
    } else if (isActive) {
      estadoTexto = 'Activo';
      estadoColor = '#16a34a';
    }

    const venceTexto = subscription?.trial_ends_at
      ? `Prueba hasta: ${fmtProvinciaFecha(subscription.trial_ends_at)}`
      : subscription?.current_period_ends_at
        ? `Renueva: ${fmtProvinciaFecha(subscription.current_period_ends_at)}`
        : '';

    panel.innerHTML = `
      <div style="background:#ffffff;border-radius:14px;padding:16px;border:1px solid #e5e7eb;">
        <div style="font-size:18px;font-weight:700;margin-bottom:6px;">${escProvincia(plan.nombre || 'Plan')}</div>
        <div style="margin-bottom:10px;">
          <span style="background:${estadoColor}20;color:${estadoColor};padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">${estadoTexto}</span>
          <span style="margin-left:8px;background:#eef2ff;color:#3730a3;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">
            ${plan.price_ars ? `$ ${fmtProvinciaNum(plan.price_ars)}` : 'Gratis'}
          </span>
        </div>
        <div style="font-size:13px;color:#374151;margin-bottom:8px;">📍 Hasta ${fmtProvinciaNum(plan.max_distritos || 0)} distritos</div>
        <div style="font-size:13px;color:#374151;margin-bottom:8px;">📚 Hasta ${fmtProvinciaNum(plan.max_cargos || 0)} cargos/materias</div>
        <div style="font-size:13px;color:#374151;margin-bottom:8px;">📊 Incluye postulantes y puntajes</div>
        ${venceTexto ? `<div style="font-size:12px;color:#6b7280;margin-top:6px;">${venceTexto}</div>` : ''}
      </div>
    `;
  }

  return resolved;
}

function renderListProvincia(items, emptyMessage, labelFn = item => item.label) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="ph">${escProvincia(emptyMessage)}</p>`;
  }

  return `
    <ul class="historico-list">
      ${items.map(item => `
        <li class="historico-item">
          <span>${escProvincia(labelFn(item))}</span>
          <strong class="historico-count">${fmtProvinciaNum(item.value)}</strong>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderLatestProvincia(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<p class="ph">Todavia no hay movimientos recientes para mostrar.</p>`;
  }

  return `
    <ul class="soft-list">
      ${rows.map(row => `
        <li class="soft-item">
          <div class="soft-title">${escProvincia([row.cargo, row.area].filter(Boolean).join(' · ') || 'Oferta APD')}</div>
          <div class="soft-sub">${escProvincia(row.escuela || 'Sin escuela')} · ${escProvincia(row.distrito || '-')}</div>
          <div class="soft-meta">Estado: ${escProvincia(row.estado || '-')} · Turno: ${escProvincia(row.turno || '-')} · Vista: ${escProvincia(fmtProvinciaFecha(row.last_seen_at || '-'))}</div>
        </li>
      `).join('')}
    </ul>
  `;
}

function startRadarRotationProvincia(items) {
  stopRadarRotationProvincia();

  const host = document.getElementById('radar-banner-host');
  if (!host) return;

  const list = Array.isArray(items) && items.length
    ? items
    : [{ title: 'Radar provincial', text: 'Todavia no hay suficiente historial provincial para construir insights serios.' }];

  let index = list.length > 1 ? Math.floor(Math.random() * list.length) : 0;

  function paint() {
    const item = list[index % list.length];
    host.innerHTML = `
      <div class="banner-rotator">
        <article class="banner-card">
          <div class="banner-title">${escProvincia(item.title || 'Radar provincial')}</div>
          <div class="banner-text">${escProvincia(item.text || '')}</div>
        </article>
      </div>
    `;
    index += 1;
  }

  paint();

  if (list.length > 1) {
    radarRotationTimer = setInterval(paint, 8000);
  }
}

function renderProvincia(data) {
  const box = document.getElementById('panel-radar-provincia');
  if (!box) return;

  if (!data || data.empty) {
    stopRadarRotationProvincia();
    box.innerHTML = `
      <div class="empty-state">
        <p>Todavia no hay radar provincial suficiente.</p>
        <p class="empty-hint">Queda solo el radar provincial que si aporta valor real.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div id="radar-banner-host"></div>
    <div class="stats-grid">
      <div class="stat-box"><span class="stat-n">${fmtProvinciaNum(data.total_ofertas)}</span><span class="stat-l">Radar 30d</span></div>
      <div class="stat-box"><span class="stat-n">${fmtProvinciaNum(data.activas_estimadas)}</span><span class="stat-l">Activas</span></div>
      <div class="stat-box"><span class="stat-n">${fmtProvinciaNum(data.cerradas_estimadas)}</span><span class="stat-l">No activas</span></div>
      <div class="stat-box"><span class="stat-n">${fmtProvinciaNum(data.nuevas_7d)}</span><span class="stat-l">Nuevas 7d</span></div>
    </div>
    <div class="chip-row" style="margin-bottom:14px">
      <span class="chip">Designadas: ${fmtProvinciaNum(data.state_breakdown?.designadas || 0)}</span>
      <span class="chip">Anuladas: ${fmtProvinciaNum(data.state_breakdown?.anuladas || 0)}</span>
      <span class="chip">Desiertas: ${fmtProvinciaNum(data.state_breakdown?.desiertas || 0)}</span>
      <span class="chip">Cerradas: ${fmtProvinciaNum(data.state_breakdown?.cerradas || 0)}</span>
    </div>
    ${data.coverage_hint ? `<p class="prefs-hint" style="margin-bottom:14px">${escProvincia(data.coverage_hint)}</p>` : ''}
    <div class="radar-columns">
      <div class="radar-box">
        <h4>Distritos con mas movimiento</h4>
        ${renderListProvincia(data.top_distritos, 'Todavia no hay ranking distrital.')}
      </div>
      <div class="radar-box">
        <h4>Cargos / areas con mas publicaciones</h4>
        ${renderListProvincia(data.top_cargos, 'Todavia no hay ranking de cargos.')}
      </div>
      <div class="radar-box">
        <h4>Turnos dominantes</h4>
        ${renderListProvincia(data.top_turnos, 'Todavia no hay ranking de turnos.')}
      </div>
    </div>
    <div class="historico-box historico-box-latest" style="margin-top:14px">
      <h4>Ultimo movimiento provincial visible</h4>
      ${renderLatestProvincia(data.latest_rows)}
    </div>
  `;

  startRadarRotationProvincia(data.banner_items);
}

async function cargarExtrasProvincia() {
  removeUnusedProvinciaPanels();

  const token = typeof obtenerToken === 'function' ? obtenerToken() : null;
  if (!token) {
    stopRadarRotationProvincia();
    stopProvinciaBackfillMonitor();
    setPanelHTMLProvincia('panel-radar-provincia', '<p class="ph">Ingresa para ver el radar provincial.</p>');
    return;
  }

  const [freshPlanInfo, provincia] = await Promise.all([
    obtenerMiPlanProvincia(token).catch(err => {
      console.error('ERROR MI PLAN:', err);
      return null;
    }),
    obtenerProvinciaResumen().catch(err => {
      console.error('ERROR RADAR PROVINCIAL:', err);
      return null;
    })
  ]);

  syncPlanProvincia(freshPlanInfo || currentPlanProvincia(), token);
  clearMercadoPagoReturnParamsProvincia();
  renderProvincia(provincia);
}

window.cargarExtrasProvincia = cargarExtrasProvincia;

if (typeof cargarDashboard === 'function') {
  const cargarDashboardOriginal = cargarDashboard;
  cargarDashboard = async function (...args) {
    const result = await cargarDashboardOriginal.apply(this, args);
    await cargarExtrasProvincia();
    return result;
  };
}

if (typeof logout === 'function') {
  const logoutOriginal = logout;
  logout = function (...args) {
    stopRadarRotationProvincia();
    stopProvinciaBackfillMonitor();
    setPanelHTMLProvincia('panel-radar-provincia', '<p class="ph">Ingresa para ver el radar provincial.</p>');
    return logoutOriginal.apply(this, args);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  removeUnusedProvinciaPanels();

  document.getElementById('btn-refresh-provincia')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-provincia');
    setButtonBusyProvincia(btn, 'Refrescando...');
    try {
      await cargarExtrasProvincia();
    } finally {
      restoreButtonProvincia(btn);
    }
  });
});

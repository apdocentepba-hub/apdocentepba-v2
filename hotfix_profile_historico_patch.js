(function () {
  'use strict';

  if (window.__apdProfileHistoricoHotfixLoaded) return;
  window.__apdProfileHistoricoHotfixLoaded = true;

  const WORKER_BASE = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  const LOADING_RE = /cargando|preparando histórico|leyendo histórico/i;

  function esc(v) {
    return String(v || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function token() {
    return localStorage.getItem('apd_token_v2') || '';
  }

  async function fetchJsonWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...(options || {}), signal: controller.signal });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || 'Respuesta inválida');
      }
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || ('HTTP ' + res.status));
      return data;
    } finally {
      clearTimeout(id);
    }
  }

  function panelEmail() {
    return document.getElementById('panel-subtitulo')?.textContent?.replace(/^Sesión:\s*/i, '')?.trim() || '';
  }

  function currentAlertCount() {
    try {
      return Array.isArray(window.alertasState?.items) ? window.alertasState.items.length : 0;
    } catch {
      return 0;
    }
  }

  function renderProfileFallback() {
    const box = document.getElementById('perfil-docente-body');
    if (!box) return;
    if (!LOADING_RE.test(box.textContent || '')) return;

    box.innerHTML = `
      <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="card-lbl" style="margin-bottom:6px;">🪪 Perfil docente</div>
        <div class="soft-meta">
          Esta sección no respondió a tiempo desde el backend del patch. El panel principal sigue funcionando.<br>
          Sesión actual: <strong>${esc(panelEmail() || '—')}</strong>
        </div>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btn-hotfix-reload-profile" class="btn btn-secondary" type="button">Reintentar panel</button>
        </div>
      </div>`;

    document.getElementById('btn-hotfix-reload-profile')?.addEventListener('click', () => {
      document.getElementById('btn-recargar-panel')?.click();
    });
  }

  function renderListadosFallback() {
    const box = document.getElementById('listados-docente-body');
    if (!box) return;
    if (!LOADING_RE.test(box.textContent || '')) return;

    box.innerHTML = `
      <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="card-lbl" style="margin-bottom:6px;">📚 Mis listados</div>
        <div class="soft-meta">
          El backend específico de listados no respondió a tiempo. No te deja colgado en “Cargando...”.<br>
          Alertas visibles ahora en el panel: <strong>${esc(currentAlertCount())}</strong>
        </div>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btn-hotfix-reload-listados" class="btn btn-secondary" type="button">Reintentar panel</button>
        </div>
      </div>`;

    document.getElementById('btn-hotfix-reload-listados')?.addEventListener('click', () => {
      document.getElementById('btn-recargar-panel')?.click();
    });
  }

  function renderHistoricoWorker(data) {
    const box = document.getElementById('historico-docente-body');
    if (!box) return;

    const topDistritos = Array.isArray(data?.top_distritos) ? data.top_distritos.slice(0, 5) : [];
    const topCargos = Array.isArray(data?.top_cargos) ? data.top_cargos.slice(0, 5) : [];
    const latest = Array.isArray(data?.ultimas_ofertas) ? data.ultimas_ofertas.slice(0, 5) : [];

    box.innerHTML = `
      <div class="stats-grid" style="margin-bottom:14px;">
        <div class="stat-box"><span class="stat-n">${esc(data?.ofertas_unicas ?? '-')}</span><span class="stat-l">Radar 30d</span></div>
        <div class="stat-box"><span class="stat-n">${esc(data?.activas_estimadas ?? '-')}</span><span class="stat-l">Activas</span></div>
        <div class="stat-box"><span class="stat-n">${esc(data?.nuevas_7d ?? '-')}</span><span class="stat-l">Nuevas 7d</span></div>
        <div class="stat-box"><span class="stat-n">${esc(data?.cambios_estado_recientes ?? '-')}</span><span class="stat-l">Cambios</span></div>
      </div>
      <div class="radar-columns">
        <div class="radar-box">
          <h4>Distritos con más movimiento</h4>
          ${topDistritos.length ? `<ul class="historico-list">${topDistritos.map(item => `<li class="historico-item"><span>${esc(item.label || '-')}</span><strong class="historico-count">${esc(item.value ?? '-')}</strong></li>`).join('')}</ul>` : `<p class="ph">Sin ranking distrital todavía.</p>`}
        </div>
        <div class="radar-box">
          <h4>Materias / cargos con más salida</h4>
          ${topCargos.length ? `<ul class="historico-list">${topCargos.map(item => `<li class="historico-item"><span>${esc(item.label || '-')}</span><strong class="historico-count">${esc(item.value ?? '-')}</strong></li>`).join('')}</ul>` : `<p class="ph">Sin ranking de cargos todavía.</p>`}
        </div>
      </div>
      <div class="historico-box historico-box-latest" style="margin-top:14px;">
        <h4>Último movimiento provincial</h4>
        ${latest.length ? `<ul class="soft-list">${latest.map(row => `<li class="soft-item"><div class="soft-title">${esc([row.cargo, row.area].filter(Boolean).join(' · ') || row.cargo || 'Oferta APD')}</div><div class="soft-sub">${esc(row.escuela || 'Sin escuela')} · ${esc(row.distrito || '-')}</div><div class="soft-meta">Estado: ${esc(row.estado || '-')} · Turno: ${esc(row.turno || '-')}</div></li>`).join('')}</ul>` : `<p class="ph">Sin movimiento reciente todavía.</p>`}
      </div>`;
  }

  async function ensureHistoricoFromWorker() {
    const box = document.getElementById('historico-docente-body');
    const userId = token();
    if (!box || !userId) return;
    if (!LOADING_RE.test(box.textContent || '')) return;

    try {
      const data = await fetchJsonWithTimeout(`${WORKER_BASE}/api/historico-resumen?user_id=${encodeURIComponent(userId)}&days=30`, {}, 7000);
      renderHistoricoWorker(data || {});
    } catch (err) {
      box.innerHTML = `
        <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
          <div class="card-lbl" style="margin-bottom:6px;">🧭 Mercado APD histórico</div>
          <div class="soft-meta">No se pudo leer el histórico desde el worker.<br><strong>${esc(err?.message || 'Error desconocido')}</strong></div>
          <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <button id="btn-hotfix-reload-historico" class="btn btn-secondary" type="button">Reintentar</button>
          </div>
        </div>`;
      document.getElementById('btn-hotfix-reload-historico')?.addEventListener('click', () => {
        const target = document.getElementById('historico-docente-body');
        if (target) target.innerHTML = '<p class="ph">Leyendo histórico...</p>';
        setTimeout(() => { ensureHistoricoFromWorker().catch(() => null); }, 50);
      });
    }
  }

  function scheduleFixes() {
    setTimeout(renderProfileFallback, 4500);
    setTimeout(renderListadosFallback, 4500);
    setTimeout(() => { ensureHistoricoFromWorker().catch(() => null); }, 1200);
  }

  function boot() {
    scheduleFixes();
    const btn = document.getElementById('btn-recargar-panel');
    if (btn && !btn.dataset.hotfixBound) {
      btn.dataset.hotfixBound = '1';
      btn.addEventListener('click', () => {
        setTimeout(renderProfileFallback, 4500);
        setTimeout(renderListadosFallback, 4500);
        setTimeout(() => { ensureHistoricoFromWorker().catch(() => null); }, 1500);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

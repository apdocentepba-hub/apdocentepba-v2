(function () {
  'use strict';

  if (window.__apdProfileHistoricoHotfixLoaded) return;
  window.__apdProfileHistoricoHotfixLoaded = true;

  const WORKER_BASE = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  const LOADING_RE = /cargando|preparando histórico|leyendo histórico/i;
  const INSIGHTS_CACHE_KEY = 'apd_market_insights_cache_v1';
  const INSIGHTS_CACHE_MS = 1000 * 60 * 20;
  const PREFETCH_LIMIT = 6;

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

  function normalizeTurno(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'MANANA') return 'M';
    if (raw === 'TARDE') return 'T';
    if (raw === 'VESPERTINO') return 'V';
    if (raw === 'NOCHE') return 'N';
    if (raw === 'ALTERNADO') return 'ALTERNADO';
    return raw;
  }

  function normalizeAlertForSync(item) {
    return {
      ...item,
      id: String(item?.idoferta || item?.iddetalle || item?.id || ''),
      offer_id: String(item?.idoferta || item?.iddetalle || item?.id || ''),
      cargo: item?.cargo || item?.descripcioncargo || '',
      materia: item?.materia || item?.area || item?.descripcionarea || '',
      nivel: item?.nivel || item?.nivel_modalidad || item?.descnivelmodalidad || '',
      distrito: item?.distrito || item?.descdistrito || '',
      escuela: item?.escuela || item?.nombreestablecimiento || '',
      turno: item?.turno || '',
      modulos: item?.modulos || item?.hsmodulos || '',
      dias_horarios: item?.dias_horarios || item?.horario || [item?.lunes, item?.martes, item?.miercoles, item?.jueves, item?.viernes, item?.sabado].filter(Boolean).join(' '),
      desde: item?.desde || item?.supl_desde_label || item?.supl_desde || '',
      hasta: item?.hasta || item?.supl_hasta_label || item?.supl_hasta || '',
      tipo_cargo: item?.tipo_cargo || item?.tipooferta || '',
      revista: item?.revista || item?.supl_revista || '',
      curso_division: item?.curso_division || item?.cursodivision || '',
      jornada: item?.jornada || '',
      observaciones: item?.observaciones || '',
      fecha_cierre: item?.fecha_cierre || item?.fecha_cierre_fmt || item?.finoferta_label || item?.finoferta || item?.cierre || '',
      link_postular: item?.link_postular || item?.abc_postulantes_url || item?.abc_url || item?.link || '',
      source_offer_key: item?.source_offer_key || '',
      total_postulantes: item?.total_postulantes ?? null,
      puntaje_primero: item?.puntaje_primero ?? item?.primero_puntaje ?? null,
      listado_origen_primero: item?.listado_origen_primero || ''
    };
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

  function cacheInsightItems(items) {
    try {
      localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: Array.isArray(items) ? items : [] }));
    } catch {}
  }

  function readInsightCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(INSIGHTS_CACHE_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.items)) return [];
      if (!parsed.savedAt || (Date.now() - parsed.savedAt) > INSIGHTS_CACHE_MS) return [];
      return parsed.items;
    } catch {
      return [];
    }
  }

  function buildFallbackInsights(data) {
    const items = [];
    const topDistrito = Array.isArray(data?.top_distritos) ? data.top_distritos[0] : null;
    const topCargo = Array.isArray(data?.top_cargos) ? data.top_cargos[0] : null;
    const latest = Array.isArray(data?.ultimas_ofertas) ? data.ultimas_ofertas[0] : null;

    if (topDistrito?.label || topDistrito?.distrito) {
      items.push({
        title: 'Radar distrital',
        text: `${topDistrito.label || topDistrito.distrito} aparece como el distrito con más movimiento reciente.`,
        tone: 'blue'
      });
    }

    if (topCargo?.label || topCargo?.cargo) {
      items.push({
        title: 'Cargo más activo',
        text: `${topCargo.label || topCargo.cargo} se repite fuerte dentro del histórico visible.`,
        tone: 'green'
      });
    }

    if (latest) {
      items.push({
        title: 'Último movimiento',
        text: `${[latest.cargo, latest.area].filter(Boolean).join(' · ') || latest.cargo || 'Oferta APD'} en ${latest.distrito || '-'} · ${latest.estado || 'Sin estado'}.`,
        tone: 'neutral'
      });
    }

    if (Number(data?.promedio_postulantes || 0) > 0) {
      items.push({
        title: 'Competencia estimada',
        text: `Promedio de postulantes observado: ${Number(data.promedio_postulantes).toFixed(1)}.`,
        tone: 'red'
      });
    }

    return items.filter(item => item?.text);
  }

  async function fetchInsightItems(data) {
    try {
      const res = await fetchJsonWithTimeout(`${WORKER_BASE}/api/provincia/insights?days=30`, {}, 5500);
      const items = Array.isArray(res?.items) ? res.items : [];
      if (items.length) {
        cacheInsightItems(items);
        return items;
      }
    } catch {}

    const cached = readInsightCache();
    if (cached.length) return cached;
    return buildFallbackInsights(data);
  }

  function ensureMarketStyles() {
    if (document.getElementById('apd-market-banner-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-market-banner-style';
    style.textContent = `
      .apd-market-banner{position:relative;overflow:hidden;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:linear-gradient(135deg,#0f3460 0%,#1b5aa6 100%);padding:14px 16px;color:#fff;margin-bottom:14px;min-height:92px}
      .apd-market-banner-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
      .apd-market-banner-title{font-weight:800;font-size:13px;letter-spacing:.04em;text-transform:uppercase;opacity:.96}
      .apd-market-banner-dots{display:flex;gap:6px}
      .apd-market-banner-dot{width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,.35)}
      .apd-market-banner-dot.is-active{background:#fff}
      .apd-market-banner-item{display:none}
      .apd-market-banner-item.is-active{display:block}
      .apd-market-banner-kicker{font-size:12px;font-weight:700;opacity:.82;margin-bottom:4px}
      .apd-market-banner-text{font-size:15px;line-height:1.45;font-weight:700}
      .apd-market-banner-tone-blue{box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
      .apd-market-banner-tone-green{box-shadow:inset 0 0 0 1px rgba(138,255,196,.25)}
      .apd-market-banner-tone-red{box-shadow:inset 0 0 0 1px rgba(255,195,195,.22)}
      .apd-market-banner-tone-neutral{box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
    `;
    document.head.appendChild(style);
  }

  function bannerIdForTarget(targetId) {
    return `apd-market-banner-${targetId}`;
  }

  function ensureBannerContainer(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return null;
    ensureMarketStyles();
    const parent = target.parentElement;
    if (!parent) return null;
    const bannerId = bannerIdForTarget(targetId);
    let banner = document.getElementById(bannerId);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = bannerId;
      banner.className = 'apd-market-banner apd-market-banner-tone-blue';
      parent.insertBefore(banner, target);
    }
    return banner;
  }

  function renderBannerItems(targetId, items) {
    const banner = ensureBannerContainer(targetId);
    const safeItems = (Array.isArray(items) ? items : []).filter(item => item?.text).slice(0, 8);
    if (!banner || !safeItems.length) return;

    const intervalKey = `__${banner.id}_interval`;
    if (window[intervalKey]) {
      clearInterval(window[intervalKey]);
      window[intervalKey] = null;
    }

    let index = 0;
    const update = () => {
      const current = safeItems[index] || safeItems[0];
      banner.className = `apd-market-banner apd-market-banner-tone-${current.tone || 'blue'}`;
      banner.innerHTML = `
        <div class="apd-market-banner-head">
          <div class="apd-market-banner-title">🧭 Radar de mercado APD</div>
          <div class="apd-market-banner-dots">${safeItems.map((_, i) => `<span class="apd-market-banner-dot ${i === index ? 'is-active' : ''}"></span>`).join('')}</div>
        </div>
        <div class="apd-market-banner-item is-active">
          <div class="apd-market-banner-kicker">${esc(current.title || 'Insight')}</div>
          <div class="apd-market-banner-text">${esc(current.text || '')}</div>
        </div>
      `;
      index = (index + 1) % safeItems.length;
    };

    update();
    if (safeItems.length > 1) {
      window[intervalKey] = setInterval(update, 4200);
    }
  }

  async function mountBannerForTarget(targetId, data) {
    const items = await fetchInsightItems(data);
    if (items.length) renderBannerItems(targetId, items);
  }

  function renderProfileFallback() {
    const box = document.getElementById('perfil-docente-body');
    if (!box) return;
    if (!LOADING_RE.test(box.textContent || '')) return;

    box.innerHTML = `
      <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="card-lbl" style="margin-bottom:6px;">🪪 Perfil docente</div>
        <div class="soft-meta">
          Esta sección no respondió a tiempo. El panel principal sigue funcionando.<br>
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
          Esta sección no respondió a tiempo. No te deja clavado en “Cargando...”.<br>
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

    mountBannerForTarget('historico-docente-body', data).catch(() => null);
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

  function renderResumenMetaFromPatch(data) {
    const box = document.getElementById('alerta-postulantes-meta');
    if (!box) return;
    const total = Number(data?.total_postulantes || 0);
    if (!total) {
      box.innerHTML = `
        <div class="alerta-meta-head">Referencia de postulantes</div>
        <div class="alerta-meta-empty">Todavía no hay postulantes visibles para esta oferta.</div>
      `;
      return;
    }

    box.innerHTML = `
      <div class="alerta-meta-head">Referencia de postulantes</div>
      <div class="alerta-meta-grid">
        <div class="alerta-meta-item">
          <span class="alerta-meta-k">Postulantes</span>
          <strong class="alerta-meta-v">${esc(total)}</strong>
        </div>
        <div class="alerta-meta-item">
          <span class="alerta-meta-k">Puntaje del primero</span>
          <strong class="alerta-meta-v">${esc(data?.puntaje_primero != null ? Number(data.puntaje_primero).toFixed(2) : '-')}</strong>
        </div>
        <div class="alerta-meta-item alerta-meta-item-wide">
          <span class="alerta-meta-k">Listado del primero</span>
          <strong class="alerta-meta-v">${esc(data?.listado_origen_primero || '-')}</strong>
        </div>
      </div>
    `;
  }

  async function enrichAlertWithPostSummary(alert) {
    const oferta = String(alert?.idoferta || '').trim();
    const detalle = String(alert?.iddetalle || '').trim();
    if (!oferta && !detalle) return null;
    const key = `${oferta}|${detalle}`;
    if (!window.__apdPostSummaryCache) window.__apdPostSummaryCache = new Map();
    if (window.__apdPostSummaryCache.has(key)) return window.__apdPostSummaryCache.get(key);

    const data = await fetchJsonWithTimeout(`${WORKER_BASE}/api/postulantes-resumen?oferta=${encodeURIComponent(oferta)}&detalle=${encodeURIComponent(detalle)}`, {}, 6000);
    window.__apdPostSummaryCache.set(key, data);

    alert.total_postulantes = data?.total_postulantes ?? alert.total_postulantes ?? null;
    alert.puntaje_primero = data?.puntaje_primero ?? alert.puntaje_primero ?? null;
    alert.primero_puntaje = alert.puntaje_primero;
    alert.listado_origen_primero = data?.listado_origen_primero || alert.listado_origen_primero || '';
    alert.postulados = alert.total_postulantes;

    const current = window.alertasState?.items?.[window.alertasState?.index || 0];
    if (current === alert) {
      if (typeof window.renderResumenPostulantes === 'function') {
        window.renderResumenPostulantes(document.getElementById('alerta-postulantes-meta'), data);
      } else {
        renderResumenMetaFromPatch(data);
      }
    }

    return data;
  }

  async function syncEnrichedOffers() {
    const authToken = token();
    const alerts = Array.isArray(window.alertasState?.items) ? window.alertasState.items : [];
    if (!authToken || !alerts.length) return;

    try {
      await fetchJsonWithTimeout(`${WORKER_BASE}/api/sync-offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          offers: alerts.map(normalizeAlertForSync)
        })
      }, 8000);
    } catch (err) {
      console.warn('HOTFIX SYNC OFFERS ERROR:', err);
    }
  }

  async function warmAlertSummaries() {
    const alerts = Array.isArray(window.alertasState?.items) ? window.alertasState.items.slice(0, PREFETCH_LIMIT) : [];
    if (!alerts.length) return;

    await Promise.all(alerts.map(alert => enrichAlertWithPostSummary(alert).catch(() => null)));
    await syncEnrichedOffers();
  }

  function patchRenderAlertas() {
    if (window.__apdAlertWarmPatchDone) return;
    if (typeof window.renderAlertasAPD !== 'function') return;
    window.__apdAlertWarmPatchDone = true;

    const original = window.renderAlertasAPD;
    window.renderAlertasAPD = function patchedRenderAlertasAPD(alertas) {
      const result = original(alertas);
      setTimeout(() => {
        warmAlertSummaries().catch(() => null);
      }, 50);
      return result;
    };
  }

  function patchRenderHistoricoMainPanel() {
    if (window.__apdHistoricoBannerPatchDone) return;
    if (typeof window.renderHistoricoAPD !== 'function') return;
    window.__apdHistoricoBannerPatchDone = true;

    const original = window.renderHistoricoAPD;
    window.renderHistoricoAPD = function patchedRenderHistoricoAPD(data) {
      const result = original(data);
      setTimeout(() => {
        mountBannerForTarget('panel-historico-apd', data || {}).catch(() => null);
      }, 30);
      return result;
    };
  }

  function scheduleFixes() {
    setTimeout(renderProfileFallback, 4500);
    setTimeout(renderListadosFallback, 4500);
    setTimeout(() => { ensureHistoricoFromWorker().catch(() => null); }, 1200);
    setTimeout(() => { patchRenderAlertas(); patchRenderHistoricoMainPanel(); warmAlertSummaries().catch(() => null); }, 700);
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
        setTimeout(() => { warmAlertSummaries().catch(() => null); }, 900);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

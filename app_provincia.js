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
    .replace(/"/g, '&quot;');

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

function sleepProvincia(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  if (provinciaBackfillMonitorTimer) {
    clearTimeout(provinciaBackfillMonitorTimer);
  }
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

async function obtenerProvinciaResumen(days = PROVINCIA_DAYS_DEFAULT) {
  return workerFetchJson(`/api/provincia/resumen?days=${encodeURIComponent(days)}`);
}

async function obtenerMiPlanProvincia(userId) {
  return workerFetchJson(`/api/mi-plan?user_id=${encodeURIComponent(userId)}`);
}

async function obtenerPlanesProvincia() {
  return workerFetchJson('/api/planes');
}

async function obtenerProvinciaBackfillStatus() {
  return workerFetchJson('/api/provincia/backfill-status');
}

async function procesarProvinciaBackfill(force = false) {
  return workerFetchJson('/api/provincia/backfill-step', {
    method: 'POST',
    body: JSON.stringify({ force })
  });
}

async function lanzarProvinciaBackfillAuto() {
  return workerFetchJson('/api/provincia/backfill-kick', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

async function resetearProvinciaBackfill() {
  return workerFetchJson('/api/provincia/backfill-reset', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

async function obtenerWhatsAppHealth() {
  return workerFetchJson('/api/whatsapp/health');
}

async function enviarWhatsAppTest(userId) {
  return workerFetchJson('/api/whatsapp/test-send', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  });
}

async function crearCheckoutMercadoPago(userId, planCode) {
  return workerFetchJson('/api/mercadopago/create-checkout-link', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      plan_code: planCode
    })
  });
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
  const status = subscription?.status || "inactivo";
  const isTrial = !!subscription?.trial_ends_at;
  const isActive = status === "active" || status === "beta";

  let estadoTexto = "Inactivo";
  let estadoColor = "#6b7280";

  if (isTrial) {
    estadoTexto = "Periodo de prueba";
    estadoColor = "#f59e0b";
  } else if (isActive) {
    estadoTexto = "Activo";
    estadoColor = "#16a34a";
  }

  const venceTexto = subscription?.trial_ends_at
    ? `Prueba hasta: ${fmtProvinciaFecha(subscription.trial_ends_at)}`
    : subscription?.current_period_ends_at
      ? `Renueva: ${fmtProvinciaFecha(subscription.current_period_ends_at)}`
      : "";

  panel.innerHTML = `
    <div style="
      background:#ffffff;
      border-radius:14px;
      padding:16px;
      border:1px solid #e5e7eb;
    ">

      <div style="font-size:18px;font-weight:700;margin-bottom:6px;">
        ${escProvincia(plan.nombre || "Plan")}
      </div>

      <div style="margin-bottom:10px;">
        <span style="
          background:${estadoColor}20;
          color:${estadoColor};
          padding:4px 10px;
          border-radius:999px;
          font-size:12px;
          font-weight:700;
        ">
          ${estadoTexto}
        </span>

        <span style="
          margin-left:8px;
          background:#eef2ff;
          color:#3730a3;
          padding:4px 10px;
          border-radius:999px;
          font-size:12px;
          font-weight:700;
        ">
          ${plan.price_ars ? `$ ${fmtProvinciaNum(plan.price_ars)}` : "Gratis"}
        </span>
      </div>

      <div style="font-size:13px;color:#374151;margin-bottom:8px;">
        📍 Hasta ${fmtProvinciaNum(plan.max_distritos || 0)} distritos
      </div>

      <div style="font-size:13px;color:#374151;margin-bottom:8px;">
        📚 Hasta ${fmtProvinciaNum(plan.max_cargos || 0)} cargos/materias
      </div>

      <div style="font-size:13px;color:#374151;margin-bottom:8px;">
        📊 Incluye postulantes y puntajes
      </div>

      ${venceTexto ? `
        <div style="font-size:12px;color:#6b7280;margin-top:6px;">
          ${venceTexto}
        </div>
      ` : ""}

      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">

        ${
          !isActive
            ? `<button id="btn-suscribirse" class="btn btn-primary">
                Suscribirme
              </button>`
            : `<button class="btn btn-secondary" disabled>
                Plan actual
              </button>`
        }

        ${
          isActive
            ? `<button id="btn-cambiar-plan" class="btn btn-outline">
                Cambiar plan
              </button>`
            : ""
        }

      </div>

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
        <p class="empty-hint">Empeza a procesar lotes para ir poblando el historico global de la provincia.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div id="radar-banner-host"></div>

    <div class="stats-grid">
      <div class="stat-box"><span class="stat-n">${fmtProvinciaNum(data.total_ofertas)}</span><span class="stat-l">Radar total</span></div>
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

function renderBackfill(data) {
  const box = document.getElementById('panel-backfill-provincia');
  if (!box) return;

  if (!data) {
    box.innerHTML = `<p class="ph">No se pudo leer el backfill provincial.</p>`;
    return;
  }

  const statusMap = {
    idle: 'En espera',
    running: 'Procesando',
    finished: 'Completado',
    error: 'Con error'
  };

  box.innerHTML = `
    <div class="progress-wrap">
      <div class="progress">
        <div class="progress-bar" style="width:${Math.min(100, Math.max(0, Number(data.progress_pct || 0)))}%"></div>
      </div>
      <div class="progress-legend">
        <span>Estado: ${escProvincia(statusMap[data.status] || data.status || 'En espera')}</span>
        <span>${fmtProvinciaNum(data.progress_pct || 0, 1)}%</span>
      </div>
    </div>

    <div class="backfill-meta">
      <div class="backfill-box">
        <span class="backfill-k">Distrito actual</span>
        <span class="backfill-v">${escProvincia(data.district_name || 'Pendiente')}</span>
      </div>
      <div class="backfill-box">
        <span class="backfill-k">Pagina siguiente</span>
        <span class="backfill-v">${fmtProvinciaNum((data.next_page || 0) + 1)}</span>
      </div>
      <div class="backfill-box">
        <span class="backfill-k">Distritos completados</span>
        <span class="backfill-v">${fmtProvinciaNum(data.districts_completed || 0)} / ${fmtProvinciaNum(data.total_districts || 0)}</span>
      </div>
      <div class="backfill-box">
        <span class="backfill-k">Ofertas procesadas</span>
        <span class="backfill-v">${fmtProvinciaNum(data.offers_processed || 0)}</span>
      </div>
      <div class="backfill-box">
        <span class="backfill-k">Ultimo lote</span>
        <span class="backfill-v">${fmtProvinciaNum(data.last_batch_count || 0)} ofertas</span>
      </div>
      <div class="backfill-box">
        <span class="backfill-k">Ultima corrida</span>
        <span class="backfill-v">${escProvincia(fmtProvinciaFecha(data.last_run_at || '-'))}</span>
      </div>
    </div>
    ${data.last_error ? `
      <p class="prefs-hint" style="margin-top:14px">
        Ultimo error: ${escProvincia(data.last_error)}${data.retryable ? ' Podes relanzar el proceso; quedo listo para reintentar.' : ''}
      </p>
    ` : ''}
  `;
}

function renderPlanOptionsProvincia(currentPlanCode, publicPlans) {
  if (!Array.isArray(publicPlans) || !publicPlans.length) {
    return `<p class="soft-meta" style="margin-top:10px">Todavia no hay planes publicos disponibles.</p>`;
  }

  const currentCode = String(currentPlanCode || '').trim().toUpperCase();

  return `
    <div class="soft-meta" style="margin-top:10px">
      ${publicPlans.map(item => {
        const itemCode = String(item.code || '').trim().toUpperCase();
        const current = itemCode === currentCode;

        const ctaText = current
          ? 'Plan actual'
          : `Suscribirme a ${escProvincia(item.nombre || itemCode)}`;

        return `
          <div style="
            margin-top:10px;
            padding:12px;
            border:1px solid #e5e7eb;
            border-radius:12px;
            background:#fff;
          ">
            <div style="font-weight:700;color:#111827;">
              ${escProvincia(item.nombre || itemCode)}
            </div>

            <div style="font-size:13px;color:#4b5563;margin-top:4px;">
              ${item.price_ars != null ? `$ ${fmtProvinciaNum(item.price_ars)}` : 'Gratis'}
              · ${fmtProvinciaNum(item.max_distritos || 0)} distrito(s)
              · ${fmtProvinciaNum(item.max_cargos || 0)} cargo(s)/materia(s)
            </div>

            ${item.descripcion ? `
              <div style="font-size:12px;color:#6b7280;margin-top:6px;">
                ${escProvincia(item.descripcion)}
              </div>
            ` : ''}

            <div class="soft-actions" style="margin-top:10px">
              <button
                class="btn ${current ? 'btn-secondary' : 'btn-primary'} soft-action"
                type="button"
                data-checkout-plan-code="${escProvincia(itemCode)}"
                ${current ? 'disabled' : ''}
              >${ctaText}</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
function renderCanalesProvincia(whatsapp, planInfo, planesCatalog) {
  const box = document.getElementById('panel-canales');
  if (!box) return;

  const plan = planInfo?.plan || {};
  const subscription = planInfo?.subscription || {};
  const featureFlags = typeof plan.feature_flags === 'object' && plan.feature_flags
    ? plan.feature_flags
    : {};

  const token = typeof obtenerToken === 'function' ? obtenerToken() : null;
  const planCode = String(plan.code || subscription.plan_code || '').trim().toUpperCase();

  const whatsappConfigured = !!whatsapp?.configured;
  const whatsappAllowed = featureFlags.whatsapp !== false;
  const whatsappDestination = whatsapp?.destination || subscription?.whatsapp_number || '';

  const publicPlans = Array.isArray(planesCatalog)
    ? planesCatalog
        .filter(item => item && item.public_visible !== false && item.is_active !== false)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    : [];

  box.innerHTML = `
    <div class="soft-stack">
      <article class="soft-card">
        <div class="soft-title-row">
          <h3>WhatsApp</h3>
        </div>
        <div class="soft-sub">
          ${whatsappAllowed
            ? (whatsappConfigured
                ? 'Configuracion lista para pruebas controladas.'
                : 'Todavia no esta configurado para este usuario.')
            : 'Tu plan actual no incluye pruebas por WhatsApp.'}
        </div>
        <div class="soft-meta">
          Preferencia del usuario: ${whatsapp?.enabled ? 'Activa' : 'Apagada'}
          · Plantilla: ${escProvincia(whatsapp?.template_name || 'hello_world')}
          · Access token: ${whatsapp?.access_token_present ? 'OK' : 'NO'}
          ${whatsappDestination ? `· Destino: ${escProvincia(whatsappDestination)}` : ''}
        </div>
        <div class="soft-actions">
          <button
            id="btn-whatsapp-test"
            class="btn btn-secondary soft-action"
            type="button"
            ${(token && whatsappAllowed) ? '' : 'disabled'}
          >Enviar prueba</button>
        </div>
      </article>

      <article class="soft-card">
        <div class="soft-title-row">
          <h3>Mercado Pago</h3>
        </div>
        <div class="soft-sub">Elegi el plan que quieras y abri Mercado Pago directamente con ese plan.</div>
        <div class="soft-meta">
          Plan actual: ${escProvincia(plan.nombre || subscription.plan_code || 'Sin plan')}
          · Estado: ${escProvincia(subscription.status || 'inactivo')}
          ${subscription.current_period_ends_at ? `· Renueva: ${escProvincia(fmtProvinciaFecha(subscription.current_period_ends_at))}` : ''}
          ${subscription.trial_ends_at ? `· Prueba hasta: ${escProvincia(fmtProvinciaFecha(subscription.trial_ends_at))}` : ''}
        </div>
        <div class="soft-meta" style="margin-top:8px">
          Incluye postulantes y puntajes en todos los planes.
        </div>

        ${renderPlanOptionsProvincia(planCode, publicPlans)}

        <div class="soft-actions" style="margin-top:12px">
          <button id="btn-refresh-plan-provincia" class="btn btn-secondary soft-action" type="button"${token ? '' : ' disabled'}>Refrescar plan</button>
        </div>
      </article>
    </div>
  `;

  const refreshBtn = document.getElementById('btn-refresh-plan-provincia');
  refreshBtn?.addEventListener('click', async () => {
    const userId = typeof obtenerToken === 'function' ? obtenerToken() : null;
    if (!userId) return;

    setButtonBusyProvincia(refreshBtn, 'Actualizando...');
    try {
      await cargarExtrasProvincia();
    } finally {
      restoreButtonProvincia(refreshBtn);
    }
  });

  box.querySelectorAll('[data-checkout-plan-code]').forEach(button => {
    button.addEventListener('click', async () => {
      const userId = typeof obtenerToken === 'function' ? obtenerToken() : null;
      const targetPlanCode = String(button.getAttribute('data-checkout-plan-code') || '').trim().toUpperCase();
      if (!userId || !targetPlanCode || targetPlanCode === planCode) return;

      setButtonBusyProvincia(button, 'Preparando...');
      try {
        const data = await crearCheckoutMercadoPago(userId, targetPlanCode);
        if (data.checkout_url) {
          window.open(data.checkout_url, '_blank', 'noopener');
        } else {
          window.alert(data.message || 'Se registro la sesion, pero todavia no hay checkout real configurado.');
        }
      } catch (err) {
        console.error('ERROR CHECKOUT PLAN:', err);
        window.alert(err?.message || 'No se pudo preparar el checkout');
      } finally {
        restoreButtonProvincia(button);
      }
    });
  });

  const waBtn = document.getElementById('btn-whatsapp-test');
  waBtn?.addEventListener('click', async () => {
    const userId = typeof obtenerToken === 'function' ? obtenerToken() : null;
    if (!userId) return;

    setButtonBusyProvincia(waBtn, 'Enviando...');
    try {
      const data = await enviarWhatsAppTest(userId);
      window.alert(
        data?.message
          ? `${data.message}${data.destination ? ` a ${data.destination}` : ''}`
          : 'Prueba de WhatsApp enviada'
      );
    } catch (err) {
      console.error('ERROR WHATSAPP TEST:', err);
      window.alert(err?.message || 'No se pudo enviar la prueba de WhatsApp');
    } finally {
      restoreButtonProvincia(waBtn);
    }
  });
}

async function cargarExtrasProvincia() {
  const token = typeof obtenerToken === 'function' ? obtenerToken() : null;

  if (!token) {
    stopRadarRotationProvincia();
    stopProvinciaBackfillMonitor();
    setPanelHTMLProvincia('panel-radar-provincia', '<p class="ph">Ingresa para ver el radar provincial.</p>');
    setPanelHTMLProvincia('panel-backfill-provincia', '<p class="ph">Ingresa para ver el estado del backfill.</p>');
    setPanelHTMLProvincia('panel-canales', '<p class="ph">Ingresa para ver canales y checkout.</p>');
    return;
  }

  const [freshPlanInfo, planesResponse, provincia, backfill, whatsapp] = await Promise.all([
    obtenerMiPlanProvincia(token).catch(err => {
      console.error('ERROR MI PLAN:', err);
      return null;
    }),
    obtenerPlanesProvincia().catch(err => {
      console.error('ERROR PLANES:', err);
      return null;
    }),
    obtenerProvinciaResumen().catch(err => {
      console.error('ERROR RADAR PROVINCIAL:', err);
      return null;
    }),
    obtenerProvinciaBackfillStatus().catch(err => {
      console.error('ERROR BACKFILL STATUS:', err);
      return null;
    }),
    obtenerWhatsAppHealth().catch(err => {
      console.error('ERROR WHATSAPP HEALTH:', err);
      return null;
    })
  ]);

  const planInfo = syncPlanProvincia(freshPlanInfo || currentPlanProvincia(), token);
  const planesCatalog = Array.isArray(planesResponse?.planes) ? planesResponse.planes : [];

  clearMercadoPagoReturnParamsProvincia();
  renderProvincia(provincia);
  renderBackfill(backfill);
  renderCanalesProvincia(whatsapp, planInfo, planesCatalog);

  if (backfill?.status === 'running' && !provinciaBackfillMonitorTimer) {
    provinciaBackfillMonitorTimer = setTimeout(() => {
      monitorProvinciaBackfill().catch(err => {
        console.error('ERROR REANUDANDO MONITOR BACKFILL:', err);
      });
    }, 1000);
  }
}
window.cargarExtrasProvincia = cargarExtrasProvincia;

async function monitorProvinciaBackfill(delayMs = 2500) {
  stopProvinciaBackfillMonitor();

  while (true) {
    await sleepProvincia(delayMs);

    const status = await obtenerProvinciaBackfillStatus().catch(err => {
      console.error('ERROR MONITOR BACKFILL STATUS:', err);
      return null;
    });

    await cargarExtrasProvincia();

    if (!status || status.status !== 'running') {
      stopProvinciaBackfillMonitor();
      return;
    }
  }
}

function bindProvinciaButtons() {
  document.getElementById('btn-refresh-provincia')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-provincia');
    setButtonBusyProvincia(btn, 'Refrescando...');
    try {
      await cargarExtrasProvincia();
    } finally {
      restoreButtonProvincia(btn);
    }
  });

    document.getElementById('btn-provincia-step')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-provincia-step');
    setButtonBusyProvincia(btn, 'Procesando...');
    try {
      await lanzarProvinciaBackfillAuto();
      await cargarExtrasProvincia();

      if (!provinciaBackfillMonitorTimer) {
        provinciaBackfillMonitorTimer = setTimeout(() => {
          monitorProvinciaBackfill().catch(err => {
            console.error('ERROR MONITOR BACKFILL:', err);
          });
        }, 1000);
      }
    } catch (err) {
      console.error('ERROR BACKFILL STEP:', err);
      window.alert(err?.message || 'No se pudo procesar el backfill provincial');
    } finally {
      restoreButtonProvincia(btn);
    }
  });
  document.getElementById('btn-provincia-reset')?.addEventListener('click', async () => {
    if (!window.confirm('Esto reinicia solo el cursor provincial. Queres seguir?')) return;

    const btn = document.getElementById('btn-provincia-reset');
    setButtonBusyProvincia(btn, 'Reseteando...');
    try {
      await resetearProvinciaBackfill();
      await cargarExtrasProvincia();
    } catch (err) {
      console.error('ERROR BACKFILL RESET:', err);
      window.alert(err?.message || 'No se pudo reiniciar el cursor provincial');
    } finally {
      restoreButtonProvincia(btn);
    }
  });
}

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
    setPanelHTMLProvincia('panel-backfill-provincia', '<p class="ph">Ingresa para ver el estado del backfill.</p>');
    setPanelHTMLProvincia('panel-canales', '<p class="ph">Ingresa para ver canales y checkout.</p>');
    return logoutOriginal.apply(this, args);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  bindProvinciaButtons();
});

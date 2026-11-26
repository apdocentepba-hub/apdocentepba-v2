(function () {
  'use strict';

  const PLAN_PATCH_VERSION = '2026-11-26-commercial-v6';
  const PLAN_SELECTOR_CARD_ID = 'panel-plan-selector-card';
  const PLAN_SELECTOR_BODY_ID = 'panel-plan-selector-body';
  const PLAN_MSG_ID = 'plan-checkout-msg';
  const PLAN_SELECTOR_MSG_ID = 'plan-selector-msg';
  // Revalidate catalog on each render, including after commercial activation.
  let renderSeq = 0;

  function normalizePlanCodeSafe(code) {
    const raw = String(code || '').trim().toUpperCase();
    return raw === 'PRO' ? 'PREMIUM' : raw;
  }

  function canalesBox() { return document.getElementById('panel-canales'); }
  function selectorCard() { return document.getElementById(PLAN_SELECTOR_CARD_ID); }
  function selectorBody() { return document.getElementById(PLAN_SELECTOR_BODY_ID); }

  function ensurePlanMsgNode() {
    const box = document.getElementById('panel-plan');
    if (!box) return null;
    let node = document.getElementById(PLAN_MSG_ID);
    if (!node) {
      box.insertAdjacentHTML('beforeend', `<div id="${PLAN_MSG_ID}" class="msg"></div>`);
      node = document.getElementById(PLAN_MSG_ID);
    }
    return node;
  }

  function ensureSelectorMsgNode() {
    const card = selectorCard();
    if (!card) return null;
    let node = document.getElementById(PLAN_SELECTOR_MSG_ID);
    if (!node) {
      const body = selectorBody();
      if (body) {
        body.insertAdjacentHTML('beforebegin', `<div id="${PLAN_SELECTOR_MSG_ID}" class="msg" style="margin:8px 0 12px 0"></div>`);
        node = document.getElementById(PLAN_SELECTOR_MSG_ID);
      }
    }
    return node;
  }

  function setMsg(el, text, type = 'info') {
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type}`;
  }

  function setMsgHtml(el, html, type = 'info') {
    if (!el) return;
    el.innerHTML = String(html || '');
    el.className = `msg msg-${type}`;
  }

  function clearMsg(el) {
    if (!el) return;
    el.textContent = '';
    el.className = 'msg';
  }

  function setPlanMsg(text, type = 'info') { setMsg(ensurePlanMsgNode(), text, type); }
  function setPlanMsgHtml(html, type = 'info') { setMsgHtml(ensurePlanMsgNode(), html, type); }
  function clearPlanMsg() { clearMsg(document.getElementById(PLAN_MSG_ID)); }
  function setSelectorMsg(text, type = 'info') { setMsg(ensureSelectorMsgNode(), text, type); }
  function setSelectorMsgHtml(html, type = 'info') { setMsgHtml(ensureSelectorMsgNode(), html, type); }
  function clearSelectorMsg() { clearMsg(document.getElementById(PLAN_SELECTOR_MSG_ID)); }

  function cleanupCanalesMercadoPago() {
    const box = canalesBox();
    if (!box) return;

    let removedAny = false;
    [...box.querySelectorAll('.soft-card')].forEach(card => {
      const title = String(card.querySelector('h3')?.textContent || '').trim().toLowerCase();
      if (title === 'mercado pago') {
        card.remove();
        removedAny = true;
      }
    });

    if (removedAny && !box.querySelector('[data-plan-managed-note]')) {
      box.insertAdjacentHTML(
        'beforeend',
        '<div class="soft-meta" data-plan-managed-note="1" style="margin-top:8px">Los cambios de plan ahora se hacen desde el bloque <strong>Mi plan</strong>.</div>'
      );
    }
  }

  function mountCanalesCleanup() {
    const box = canalesBox();
    if (!box) return;
    if (box.dataset.planPatchObserved === '1') {
      cleanupCanalesMercadoPago();
      return;
    }
    const observer = new MutationObserver(() => cleanupCanalesMercadoPago());
    observer.observe(box, { childList: true, subtree: true });
    box.dataset.planPatchObserved = '1';
    cleanupCanalesMercadoPago();
  }

  function recurringVisualPatterns() {
    return [
      /d[eé]bito autom[aá]tico/i,
      /debito automatico/i,
      /renovaci[oó]n autom[aá]tica/i,
      /renovacion automatica/i,
      /pr[oó]xima renovaci[oó]n/i,
      /proxima renovacion/i,
      /cobro autom[aá]tico/i,
      /cobro automatico/i,
      /manual por defecto/i,
      /apagada por defecto/i,
      /configuraci[oó]n pendiente/i,
      /configuracion pendiente/i,
      /ya est[aá] activa o en proceso de configuraci[oó]n/i
    ];
  }

  function matchesRecurringVisual(text) {
    const value = String(text || '').trim();
    return !!value && recurringVisualPatterns().some(rx => rx.test(value));
  }

  function stripRecurringVisuals(root) {
    if (!root) return;

    [...root.querySelectorAll('button')].forEach(btn => {
      const text = String(btn.textContent || '').trim();
      if (!matchesRecurringVisual(text)) return;
      btn.remove();
    });

    [...root.querySelectorAll('.msg')].forEach(node => {
      const text = String(node.textContent || '').trim();
      if (!matchesRecurringVisual(text)) return;
      node.textContent = '';
      node.className = 'msg';
    });

    [...root.querySelectorAll('span,p,div,small,strong')].forEach(node => {
      if (node.id === PLAN_MSG_ID || node.id === PLAN_SELECTOR_MSG_ID || node.closest('[data-apd-commercial-terms]') || node.querySelector('[data-apd-commercial-terms]')) return;
      if (node.querySelector('button,[data-plan-open-tab],[data-plan-refresh],[data-plan-checkout],[data-plan-info]')) return;
      const text = String(node.textContent || '').trim();
      if (!text) return;
      if (/Si el precio cambia, la pr[oó]xima renovaci[oó]n usa el valor vigente del plan\.?/i.test(text)) {
        node.remove();
        return;
      }
      if (matchesRecurringVisual(text)) {
        node.remove();
      }
    });
  }

  function mpReturnMessage() {
    const params = new URLSearchParams(window.location.search || '');
    const state = String(params.get('mp') || '').trim().toLowerCase();
    if (state === 'success') return { type: 'info', text: 'Regresaste de Mercado Pago. El resultado del pago debe confirmarse en tu cuenta. Consultá Mi plan y, si todavía no figura vigente, tocá “Actualizar plan”.' };
    if (state === 'pending') return { type: 'info', text: 'Tu pago quedó pendiente. Cuando Mercado Pago confirme, tocá “Actualizar plan”.' };
    if (state === 'failure') return { type: 'error', text: 'El pago no se completó. Podés intentar nuevamente desde acá.' };
    return null;
  }

  async function obtenerPlanesDisponiblesUI() {
    const data = await window.workerFetchJson('/api/planes');
    const planes = Array.isArray(data?.planes) ? data.planes.filter(plan => plan?.public_visible !== false) : [];
    if (data?.commercial_model !== 'free_complete_v1') {
      if (planes.some(p => ['FREE','COMPLETO','TRIAL_14D'].includes(normalizePlanCodeSafe(p?.code)))) throw Error('Catálogo comercial sin verificar');
      return planes;
    }
    if (data.ok !== true || data.trial_days !== 14 || planes.length !== 2 ||
        new Set(planes.map(p=>p.code)).size !== 2 ||
        !planes.some(p=>p.code==='FREE' && Number(p.price_ars)===0 && Number(p.max_distritos)===1 && Number(p.max_cargos)===1) ||
        !planes.some(p=>p.code==='COMPLETO' && Number(p.price_ars)===2000 && Number(p.max_distritos)===5 && Number(p.max_cargos)===10)) throw Error('Catálogo comercial inconsistente');
    return ['FREE','COMPLETO'].map(code=>({...planes.find(p=>p.code===code),commercial_model:'free_complete_v1',commercial_enrollment_open:data.commercial_enrollment_open===true,commercial_checkout_resume:code==='COMPLETO' && data.commercial_checkout_resume===true}));
  }

  function planActualCode(planInfo) {
    const code = window.planCodeUI
      ? window.planCodeUI(planInfo?.plan || {}, planInfo?.subscription || {})
      : (planInfo?.subscription?.plan_code || planInfo?.plan?.code || '');
    return normalizePlanCodeSafe(code);
  }

  function currentPlanPrice(planInfo) {
    return Number(planInfo?.plan?.price_ars || 0) || 0;
  }

  function isCurrentPlan(plan, planInfo) {
    // A lapsed plan is no longer the active selection, even if its code matches.
    return planInfo?.access_active !== false &&
      normalizePlanCodeSafe(plan?.code || plan?.display_code || '') === planActualCode(planInfo);
  }

  function transitionPolicy(plan, planInfo) {
    const currentCode = planActualCode(planInfo);
    const targetCode = normalizePlanCodeSafe(plan?.code || plan?.display_code || '');
    if (plan?.commercial_model === 'free_complete_v1') {
      const deny=(mode,label,reason)=>({allowed:false,mode,label,actionLabel:label,reason});
      const sub=planInfo?.subscription;
      if (!sub || planInfo.ok===false || typeof planInfo.access_active!=='boolean' || String(sub.source||'').toLowerCase()==='fallback_frontend' || normalizePlanCodeSafe(sub.plan_code)!==currentCode)
        return deny('unverified','Actualizar plan','Primero necesitamos verificar tu cuenta.');
      if (targetCode==='FREE') return deny('free','Acceso gratuito','Al vencer tu acceso completo, continuás con Gratis sin perder tus datos.');
      if (targetCode!=='COMPLETO' || Number(plan.price_ars)!==2000) return deny('unavailable','No disponible','El catálogo no está confirmado.');
      if (sub.mercadopago_preapproval_id || (planInfo.access_active===true && !['FREE','TRIAL_14D','TRIAL_7D'].includes(currentCode)))
        return deny('current','Acceso vigente','Conservás las condiciones de tu acceso actual.');
      if (plan.commercial_enrollment_open!==true && plan.commercial_checkout_resume!==true) return deny('paused','Contrataciones pausadas','Las nuevas contrataciones están pausadas temporalmente. Tu acceso actual se conserva.');
      if (plan.commercial_enrollment_open!==true && plan.commercial_checkout_resume===true) return {allowed:true,mode:'checkout',label:'Continuar contratación',actionLabel:'Continuar pago de $2.000',reason:'Retomá tu contratación existente de 30 días. El pago se confirma en Mercado Pago.'};
      return {allowed:true,mode:'checkout',label:'Contratar Completo',actionLabel:'Contratar por $2.000',reason:'30 días de acceso completo, sin renovación automática. El pago se confirma en Mercado Pago.'};
    }
    const currentPrice = currentPlanPrice(planInfo);
    const targetPrice = Number(plan?.price_ars || 0) || 0;
    const targetName = String(plan?.display_name || plan?.nombre || plan?.code || 'este plan');

    // The authenticated Worker is the sole source for entitlement status.
    // A definitely expired plan must be eligible for a NEW paid checkout:
    // never offer a prorated upgrade or schedule a downgrade from an expired cycle.
    if (planInfo?.access_active === false) {
      if (targetCode === 'TRIAL_7D') {
        return {
          allowed: false,
          mode: 'trial_blocked',
          label: 'Prueba finalizada',
          actionLabel: 'No volver a prueba',
          reason: 'La prueba gratis es única. Elegí un plan pago para reactivar las alertas.'
        };
      }
      if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
        return {
          allowed: false,
          mode: 'invalid_price',
          label: 'Precio no disponible',
          actionLabel: 'Consultar disponibilidad',
          reason: 'No se puede iniciar un pago sin un precio válido.'
        };
      }
      return {
        allowed: true,
        mode: 'reactivation_checkout',
        label: 'Reactivar plan',
        actionLabel: `Reactivar ${targetName}`,
        reason: 'El acceso se recupera cuando Mercado Pago confirme el pago. No se cobra automáticamente al entrar.'
      };
    }

    if (targetCode === currentCode) {
      return {
        allowed: false,
        mode: 'current',
        label: 'Plan actual',
        actionLabel: 'Estás en este plan',
        reason: 'Este es el plan que ya tenés activo hoy.'
      };
    }

    if (!currentCode || currentCode === 'TRIAL_7D') {
      return {
        allowed: true,
        mode: 'checkout',
        label: `Activar ${targetName}`,
        actionLabel: `Activar ${targetName}`,
        reason: ''
      };
    }

    if (targetCode === 'TRIAL_7D') {
      return {
        allowed: false,
        mode: 'trial_blocked',
        label: 'No volver a prueba',
        actionLabel: 'Ver por qué',
        reason: 'La prueba gratis de 7 días es solo para el primer ingreso y no vuelve a activarse después de pasar a un plan pago.'
      };
    }

    if (targetPrice > currentPrice) {
      return {
        allowed: true,
        mode: 'upgrade_prorated',
        label: `Subir a ${targetName}`,
        actionLabel: `Pagar diferencia y pasar a ${targetName}`,
        reason: 'Si subís de plan, pagás la diferencia ahora y el nuevo plan queda activo en este ciclo.'
      };
    }

    if (targetPrice < currentPrice) {
      return {
        allowed: true,
        mode: 'downgrade_wait',
        label: 'Bajar al próximo ciclo',
        actionLabel: `Programar cambio a ${targetName}`,
        reason: 'Si bajás de plan, seguís usando el plan actual hasta que termine este ciclo y el cambio queda programado para el próximo.'
      };
    }

    return {
      allowed: false,
      mode: 'same_price_manual',
      label: 'Cambio manual por ahora',
      actionLabel: 'Ver condición del cambio',
      reason: 'Ese cambio todavía no quedó automatizado.'
    };
  }

  function planCardButtonHtml(plan, planInfo) {
    const policy = transitionPolicy(plan, planInfo);
    const current = isCurrentPlan(plan, planInfo);
    const safeReason = encodeURIComponent(policy.reason || '');
    const safeMode = encodeURIComponent(policy.mode || 'info');
    const reasonHtml = policy.reason
      ? `<div class="plan-note" style="margin-top:8px;opacity:.88;">${window.esc ? window.esc(policy.reason) : String(policy.reason)}</div>`
      : '';

    if (policy.allowed) {
      return `
        <button type="button" class="btn btn-primary btn-full" data-plan-checkout="${String(plan?.code || '').trim().toUpperCase()}">
          ${window.esc ? window.esc(policy.actionLabel) : policy.actionLabel}
        </button>
        ${reasonHtml}
      `;
    }

    if (current) {
      return `
        <button type="button" class="btn btn-secondary btn-full" disabled>
          ${window.esc ? window.esc(policy.label) : policy.label}
        </button>
        ${reasonHtml}
      `;
    }

    return `
      <button type="button" class="btn btn-secondary btn-full" data-plan-info="${safeReason}" data-plan-info-mode="${safeMode}">
        ${window.esc ? window.esc(policy.actionLabel) : policy.actionLabel}
      </button>
      ${reasonHtml}
    `;
  }

  function buildPlanFeatureList(plan) {
    const features = Array.isArray(plan?.features) ? [...plan.features] : [];
    // These are presentation labels; actual access is based on the verified
    // /api/mi-plan subscription, never on the text of the plan catalogue.
    const code = String(plan?.code || plan?.canonical_code || '').trim().toUpperCase();
    if (['INSIGNE', 'INSIGNE_ANUAL', 'SIGNATURE', 'SIGNATURE_ANUAL'].includes(code)) {
      const label = 'Comparación con domicilio y jornadas actuales (orientativa, sin GPS)';
      if (!features.includes(label)) features.push(label);
    }
    if (!features.length) return '';
    return `<ul style="margin:8px 0 0 18px;padding:0;font-size:13px;line-height:1.45;">
      ${features.slice(0, 6).map(item => `<li>${window.esc ? window.esc(item) : String(item)}</li>`).join('')}
    </ul>`;
  }

  function ensureSelectorCard() {
    let card = selectorCard();
    if (card) return card;

    const panel = document.getElementById('panel-content');
    if (!panel) return null;

    panel.insertAdjacentHTML('beforeend', `
      <div id="${PLAN_SELECTOR_CARD_ID}" class="panel-card span-8">
        <div class="card-lbl-row">
          <span class="card-lbl">💳 Opciones de plan</span>
          <div class="mini-group">
            <button type="button" class="mini-btn" data-plan-refresh="1">Actualizar plan</button>
          </div>
        </div>
        <p class="prefs-hint">Acá comparás planes y, si corresponde, te abrimos Mercado Pago en una pestaña nueva.</p>
        <div data-plan-transition-note class="soft-meta" style="margin:8px 0 12px 0;">
          Si subís de plan, pagás la diferencia ahora. Si bajás de plan, el cambio queda programado para el próximo ciclo.
        </div>
        <div id="${PLAN_SELECTOR_MSG_ID}" class="msg" style="margin:8px 0 12px 0"></div>
        <div id="${PLAN_SELECTOR_BODY_ID}"><p class="ph">Cargando opciones de plan...</p></div>
      </div>
    `);

    card = selectorCard();
    if (typeof window.APD_refreshPanelTabs === 'function') {
      setTimeout(() => window.APD_refreshPanelTabs(), 0);
    }
    return card;
  }

  function buildPlanCards(planInfo, planes) {
    if (!Array.isArray(planes) || !planes.length) {
      return '<p class="ph">No pudimos cargar los planes disponibles.</p>';
    }

    if (planes.every(p=>p.commercial_model==='free_complete_v1')) {
      return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px;align-items:stretch;">'+planes.map(plan=>{
        const full=plan.code==='COMPLETO';
        const active=isCurrentPlan(plan,planInfo);
        const features=full?['Hasta 5 distritos y 10 cargos/materias','Alertas por email, Telegram y WhatsApp por consulta','Comparador y compatibilidad horaria','Favoritos, postulaciones y herramientas de carrera']:['1 distrito y 1 cargo/materia','Alertas básicas por email y Telegram por consulta','Acceso permanente a recursos públicos'];
        return '<div style="padding:16px;border:1px solid rgba(15,52,96,.18);border-radius:14px;background:#fff;display:flex;flex-direction:column;gap:10px;">'+
          '<div class="plan-title">'+(full?'Completo':'Gratis')+'</div>'+
          '<div style="font-size:28px;font-weight:800;color:#123b72;">'+(full?'$2.000':'$0')+'</div>'+
          '<p class="plan-note">'+(full?'Por 30 días · 14 días de prueba para nuevas cuentas':'Sin vencimiento')+'</p>'+
          (active?'<span class="plan-pill">Plan actual</span>':'')+
          '<ul style="margin:0 0 0 18px;padding:0;line-height:1.6;font-size:13px;">'+features.map(f=>'<li>'+f+'</li>').join('')+'</ul>'+
          '<div style="margin-top:auto;">'+planCardButtonHtml(plan,planInfo)+'</div></div>';
      }).join('')+'</div>';
    }
    return `${planes.map(plan => {
      const limits = window.getPlanLimits ? window.getPlanLimits({ plan }) : {
        maxDistritos: Number(plan?.max_distritos || 1),
        maxCargos: Number(plan?.max_cargos || 2),
        maxDistritosNormales: Number(plan?.max_distritos_normales || plan?.max_distritos || 1),
        maxDistritosEmergencia: Number(plan?.max_distritos_emergencia || 0)
      };
      const current = isCurrentPlan(plan, planInfo);
      const nombre = window.planNombreHumano
        ? window.planNombreHumano(plan, current ? (planInfo?.subscription || {}) : { plan_code: plan?.code || '', status: 'active' })
        : String(plan?.display_name || plan?.nombre || plan?.code || 'Plan');
      const precio = window.planPrecioHumano
        ? window.planPrecioHumano(plan, current ? (planInfo?.subscription || {}) : { plan_code: plan?.code || '', status: 'active' })
        : String(plan?.price_ars || '');
      const descripcion = window.planDescripcionHumana
        ? window.planDescripcionHumana(plan, current ? (planInfo?.subscription || {}) : { plan_code: plan?.code || '', status: 'active' })
        : String(plan?.descripcion || '');
      const distritosText = limits.maxDistritosEmergencia > 0
        ? `${limits.maxDistritosNormales} principales + ${limits.maxDistritosEmergencia} de emergencia`
        : `Hasta ${limits.maxDistritos} distrito(s)`;

      return `
        <div style="margin-top:12px;padding:12px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:${current ? 'rgba(15,52,96,.04)' : '#fff'};">
          <div class="plan-pill-row">
            <span class="plan-pill">${window.esc ? window.esc(nombre) : nombre}</span>
            <span class="plan-pill plan-pill-neutral">${window.esc ? window.esc(precio) : precio}</span>
          </div>
          <div class="plan-pill-row" style="margin-top:8px;">
            <span class="plan-pill">${window.esc ? window.esc(distritosText) : distritosText}</span>
            <span class="plan-pill">Hasta ${limits.maxCargos} cargo(s)/materia(s)</span>
          </div>
          <p class="plan-note" style="margin-top:8px;">${window.esc ? window.esc(descripcion) : descripcion}</p>
          ${buildPlanFeatureList(plan)}
          <div style="margin-top:12px;">${planCardButtonHtml(plan, planInfo)}</div>
        </div>`;
    }).join('')}`;
  }

  function renderSelectorCard(planInfo, planes) {
    ensureSelectorCard();
    const body = selectorBody();
    if (!body) return;
    body.innerHTML = buildPlanCards(planInfo, planes);
    const note=selectorCard()?.querySelector('[data-plan-transition-note]');
    const commercial=!!planes?.length && planes.every(p=>p.commercial_model==='free_complete_v1');
    if (note) note.toggleAttribute('data-apd-commercial-terms',commercial);
    if (note) note.textContent=commercial
      ? (planes.every(p=>p.commercial_enrollment_open===true)?'14 días sin tarjeta para cuentas nuevas. Si no contratás, pasás a Gratis. No hay renovación automática del plan Completo; se conservan las condiciones anteriores.':(planes.some(p=>p.commercial_checkout_resume===true)?'Podés continuar tu contratación ya iniciada. Las nuevas contrataciones y pruebas siguen pausadas.':'Las nuevas contrataciones y pruebas están pausadas. Se mantienen los derechos vigentes.'))
      : 'Si subís de plan, pagás la diferencia ahora. Si bajás de plan, el cambio queda programado para el próximo ciclo.';
    if (typeof window.APD_refreshPanelTabs === 'function') {
      setTimeout(() => window.APD_refreshPanelTabs(), 0);
    }
  }

  function renderCompactActions() {
    const box = document.getElementById('panel-plan');
    if (!box) return;

    document.getElementById('plan-summary-actions')?.remove();
    box.insertAdjacentHTML('beforeend', `
      <div id="plan-summary-actions" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,52,96,.12);">
        <div class="plan-pill-row">
          <span class="plan-pill">Gestión de plan</span>
          <span class="plan-pill plan-pill-neutral">Separada del resumen</span>
        </div>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" data-plan-open-tab="1">Ver opciones de plan</button>
          <button type="button" class="btn btn-secondary" data-plan-refresh="1">Actualizar plan</button>
        </div>
      </div>
    `);

    document.getElementById(PLAN_MSG_ID)?.remove();
    box.insertAdjacentHTML('beforeend', `<div id="${PLAN_MSG_ID}" class="msg"></div>`);

    const mpMsg = mpReturnMessage();
    if (mpMsg) setPlanMsg(mpMsg.text, mpMsg.type);
  }

  function normalizePlanStateCard() {
    const box = document.getElementById('panel-plan');
    if (!box) return;

    stripRecurringVisuals(box);
    stripRecurringVisuals(selectorCard());

    if (!mpReturnMessage()) {
      const msgNode = document.getElementById(PLAN_MSG_ID);
      if (msgNode && matchesRecurringVisual(msgNode.textContent || '')) {
        clearMsg(msgNode);
      }
      const selectorMsgNode = document.getElementById(PLAN_SELECTOR_MSG_ID);
      if (selectorMsgNode && matchesRecurringVisual(selectorMsgNode.textContent || '')) {
        clearMsg(selectorMsgNode);
      }
    }
  }

  async function refreshPlanAndRender(userId, successMessage) {
    const planInfo = await window.obtenerMiPlan(userId);
    if (planInfo?.plan || planInfo?.subscription) window.planActual = planInfo;
    await window.renderPlanUI(window.planActual || planInfo);
    if (successMessage) {
      setPlanMsg(successMessage, 'ok');
      setSelectorMsg(successMessage, 'ok');
    }
  }

  async function refrescarPlanActual() {
    const userId = window.obtenerToken ? window.obtenerToken() : '';
    if (!userId || !window.obtenerMiPlan) {
      setPlanMsg('No se pudo refrescar el plan porque la sesión ya no está activa.', 'error');
      setSelectorMsg('No se pudo refrescar el plan porque la sesión ya no está activa.', 'error');
      return;
    }

    setPlanMsg('Actualizando plan...', 'info');
    setSelectorMsg('Actualizando plan...', 'info');

    try {
      const planInfo = await window.obtenerMiPlan(userId);
      if (planInfo?.plan || planInfo?.subscription) window.planActual = planInfo;
      await window.renderPlanUI(window.planActual || planInfo);
      setPlanMsg(planInfo?.billing_note || 'Plan actualizado.', 'ok');
      setSelectorMsg('Plan actualizado.', 'ok');
    } catch (err) {
      console.error('ERROR REFRESH PLAN:', err);
      setPlanMsg(err?.message || 'No se pudo actualizar el plan.', 'error');
      setSelectorMsg(err?.message || 'No se pudo actualizar el plan.', 'error');
    }
  }

  async function iniciarCheckoutPlan(planCode, button) {
    const userId = window.obtenerToken ? window.obtenerToken() : '';
    if (!userId) {
      setPlanMsg('Tu sesión venció. Volvé a ingresar para cambiar de plan.', 'error');
      setSelectorMsg('Tu sesión venció. Volvé a ingresar para cambiar de plan.', 'error');
      return;
    }

    clearPlanMsg();
    clearSelectorMsg();

    if (button && typeof window.btnLoad === 'function') window.btnLoad(button, 'Abriendo...');
    else if (button) button.disabled = true;

    try {
      const data = await window.workerFetchJson('/api/mercadopago/create-checkout-link', {
        method: 'POST',
        body: JSON.stringify(String(planCode || '').trim().toUpperCase()==='COMPLETO'
          ? {plan_code:'COMPLETO'} : {user_id:userId,plan_code:String(planCode || '').trim().toUpperCase()})
      });

      if (data?.scheduled) {
        await refreshPlanAndRender(userId, data?.message || 'El cambio quedó programado para el próximo ciclo.');
        return;
      }

      if (!data?.checkout_url) {
        const msg = data?.message || 'No se pudo generar el checkout de Mercado Pago.';
        const type = data?.configured === false ? 'info' : 'error';
        setPlanMsg(msg, type);
        setSelectorMsg(msg, type);
        return;
      }

      if (String(planCode || '').trim().toUpperCase()==='COMPLETO') {
        let url;
        try { url=new URL(data.checkout_url); } catch { throw Error('Enlace de pago no verificado'); }
        if (data.ok!==true || url.protocol!=='https:' || url.port || url.username || url.password || !((['mercadopago.com.ar','www.mercadopago.com.ar'].includes(url.hostname)&&url.pathname.startsWith('/checkout/'))||(url.hostname==='www.mercadopago.com'&&url.pathname==='/mla/checkout/start'))) throw Error('Enlace de pago no verificado');
      }
      const opened = window.open(data.checkout_url, '_blank', 'noopener');
      const successMsg = data?.message || 'Mercado Pago se abrió en una pestaña nueva.';

      if (opened) {
        setPlanMsg(successMsg, 'ok');
        setSelectorMsg(successMsg, 'ok');
        return;
      }

      const link = new URL(data.checkout_url);
      if (link.protocol !== 'https:' || link.username || link.password) throw Error('Enlace de pago no verificado');
      for (const node of [ensurePlanMsgNode(), ensureSelectorMsgNode()]) {
        if (!node) continue;
        setMsg(node, successMsg, 'info');
        const anchor = document.createElement('a');
        anchor.href=link.href; anchor.target='_blank'; anchor.rel='noopener noreferrer';
        anchor.textContent='Abrir Mercado Pago';
        node.append(document.createElement('br'),anchor);
      }
    } catch (err) {
      console.error('ERROR CHECKOUT PLAN:', err);
      const msg = err?.message || 'No se pudo iniciar el cambio de plan.';
      setPlanMsg(msg, 'error');
      setSelectorMsg(msg, 'error');
    } finally {
      if (button && typeof window.btnRestore === 'function') window.btnRestore(button);
      else if (button) button.disabled = false;
    }
  }

  function openPlanTab() {
    if (typeof window.APD_activatePanelTab === 'function') {
      window.APD_activatePanelTab('plan');
    }
    setTimeout(() => {
      const target = selectorCard() || document.getElementById('panel-plan');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  document.addEventListener('click', async ev => {
    const recurringBtn = ev.target.closest('[data-plan-recurring-action]');
    if (recurringBtn) {
      ev.preventDefault();
      return;
    }

    const openTabBtn = ev.target.closest('[data-plan-open-tab]');
    if (openTabBtn) {
      ev.preventDefault();
      openPlanTab();
      return;
    }

    const refreshBtn = ev.target.closest('[data-plan-refresh]');
    if (refreshBtn) {
      ev.preventDefault();
      await refrescarPlanActual();
      return;
    }

    const infoBtn = ev.target.closest('[data-plan-info]');
    if (infoBtn) {
      ev.preventDefault();
      const msg = decodeURIComponent(String(infoBtn.dataset.planInfo || ''));
      const mode = decodeURIComponent(String(infoBtn.dataset.planInfoMode || 'info'));
      const prefix = mode === 'trial_blocked'
        ? 'No podés volver a prueba gratis: '
        : mode === 'downgrade_wait'
          ? 'Baja de plan al próximo ciclo: '
          : 'Cambio de plan protegido: ';
      setPlanMsg(prefix + msg, 'info');
      setSelectorMsg(prefix + msg, 'info');
      return;
    }

    const checkoutBtn = ev.target.closest('[data-plan-checkout]');
    if (!checkoutBtn) return;
    ev.preventDefault();
    await iniciarCheckoutPlan(checkoutBtn.dataset.planCheckout, checkoutBtn);
  });

  function normalizeCommercialSummary(planInfo) {
    const code=normalizePlanCodeSafe(planInfo?.subscription?.plan_code);
    if (planInfo?.ok===false || planInfo?.access_active!==true ||
        normalizePlanCodeSafe(planInfo?.plan?.code)!==code ||
        String(planInfo?.subscription?.source||'').toLowerCase()==='fallback_frontend' ||
        !['FREE','TRIAL_14D','COMPLETO'].includes(code)) return;
    const row=document.querySelector('#panel-plan .plan-stack .plan-pill-row');
    const pills=row?.querySelectorAll('.plan-pill');
    if (!pills || pills.length!==2) return;
    if (code==='TRIAL_14D') pills[0].textContent='En prueba';
    pills[1].textContent=code==='COMPLETO'?'$2.000 por 30 días':'Gratis';
  }

  const originalRenderPlanUI = window.renderPlanUI;
  if (typeof originalRenderPlanUI === 'function') {
    window.renderPlanUI = function patchedRenderPlanUI(planInfo) {
      const result = originalRenderPlanUI(planInfo);
      normalizeCommercialSummary(planInfo);
      const currentRender = ++renderSeq;

      Promise.resolve().then(async () => {
        const box = document.getElementById('panel-plan');
        if (!box) return;

        renderCompactActions();
        const body = selectorBody();
        if (body) body.innerHTML = '<p class="ph">Cargando opciones de plan...</p>';
        else ensureSelectorCard();

        try {
          const planes = await obtenerPlanesDisponiblesUI();
          if (currentRender !== renderSeq) return;
          renderSelectorCard(planInfo || window.planActual || {}, planes);
          normalizePlanStateCard(planInfo || window.planActual || {});
          mountCanalesCleanup();
        } catch (err) {
          console.error('ERROR PLAN PATCH:', err);
          if (currentRender !== renderSeq) return;
          renderSelectorCard(planInfo || window.planActual || {}, []);
          normalizePlanStateCard(planInfo || window.planActual || {});
          mountCanalesCleanup();
          setPlanMsg('No se pudieron cargar los planes disponibles.', 'error');
          setSelectorMsg('No se pudieron cargar los planes disponibles.', 'error');
        }
      });

      return result;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountCanalesCleanup, { once: true });
  } else {
    mountCanalesCleanup();
  }

  window.APD_PLAN_PATCH_VERSION = PLAN_PATCH_VERSION;
})();

(function () {
  'use strict';

  function removeLegacyPidCard() {
    const card = document.getElementById('panel-listados-pid-card');
    if (card) card.remove();
  }

  if (window.__apdPidPlanGateLoaded) return;
  window.__apdPidPlanGateLoaded = true;

  let latestPlanInfo = null;
  let originalRenderAlertaActual = null;

  function norm(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function getCurrentPlanCode(planInfo) {
    const info = planInfo || latestPlanInfo || window.__apdPlanInfo || null;

    const direct = norm(
      info?.plan?.display_code ||
      info?.plan?.code ||
      info?.subscription?.plan_code ||
      ''
    );

    if (direct) return direct;

    const title = document.querySelector('#panel-plan .plan-title');
    const planText = norm(title?.textContent || '');
    if (planText.includes('INSIGNE')) return 'INSIGNE';

    return '';
  }

  function planAllowsPidMatch(planInfo) {
    return getCurrentPlanCode(planInfo) === 'INSIGNE';
  }

  function insigneDescription() {
    return 'Cobertura máxima: 3 distritos principales + 2 de emergencia/chusmeo, hasta 10 materias/cargos, alertas por email y match PID automático para detectar compatibilidad con tu perfil sin revisar todo manualmente. Próximamente WhatsApp.';
  }

  function lockedPidHtml() {
    return `
      <div class="alerta-meta-card alerta-pid-card alerta-pid-info">
        <div class="alerta-meta-head">Match PID exclusivo de Insigne</div>
        <div class="alerta-meta-note">
          Listados siguen habilitados y se siguen trayendo normalmente, pero el match PID automático queda reservado para el Plan Insigne.
        </div>
      </div>
    `;
  }

  function ensureListadosNote() {
    const card = document.getElementById('panel-listados-docente');
    if (!card) return;

    let note = document.getElementById('pid-match-plan-note');
    if (!note) {
      note = document.createElement('p');
      note.id = 'pid-match-plan-note';
      note.className = 'prefs-hint';
      note.style.marginTop = '8px';
      card.appendChild(note);
    }

    const nextText = planAllowsPidMatch()
      ? 'Tu plan actual incluye match PID automático dentro de Listados.'
      : 'Listados siguen habilitados. El match PID automático queda reservado para el Plan Insigne.';

    if (note.textContent !== nextText) {
      note.textContent = nextText;
    }
  }

  function updatePlanDescriptionDom() {
    if (!planAllowsPidMatch()) return;

    const note = document.querySelector('#panel-plan .plan-note');
    const nextText = insigneDescription();

    if (note && note.textContent !== nextText) {
      note.textContent = nextText;
    }
  }

  function removeMatchPidTagsIfNeeded() {
    if (planAllowsPidMatch()) return;

    document.querySelectorAll('.tag').forEach(tag => {
      if (norm(tag.textContent) === 'MATCH PID') {
        tag.remove();
      }
    });
  }

  function replacePidBoxIfNeeded() {
    if (planAllowsPidMatch()) return;

    document.querySelectorAll('#alerta-pid-box').forEach(box => {
      const nextHtml = lockedPidHtml().trim();
      if (box.innerHTML.trim() !== nextHtml) {
        box.innerHTML = nextHtml;
      }
    });
  }

  function enforceUi() {
    removeLegacyPidCard();
    ensureListadosNote();
    updatePlanDescriptionDom();
    removeMatchPidTagsIfNeeded();
    replacePidBoxIfNeeded();
  }

  function patchPlanDescripcionHumana() {
    const original = window.planDescripcionHumana;
    if (typeof original !== 'function' || original.__apdPidWrapped) return;

    function wrapped(plan, subscription) {
      const base = original.apply(this, arguments);
      const code = norm(plan?.display_code || plan?.code || subscription?.plan_code || '');
      if (code !== 'INSIGNE') return base;
      return insigneDescription();
    }

    wrapped.__apdPidWrapped = true;
    window.planDescripcionHumana = wrapped;
  }

  function patchRenderPlanUI() {
    const original = window.renderPlanUI;
    if (typeof original !== 'function' || original.__apdPidWrapped) return;

    function wrapped(planInfo) {
      latestPlanInfo = planInfo || latestPlanInfo;
      window.__apdPlanInfo = latestPlanInfo;

      const result = original.apply(this, arguments);

      setTimeout(() => {
        if (planAllowsPidMatch() && typeof originalRenderAlertaActual === 'function') {
          originalRenderAlertaActual();
        }
        enforceUi();
      }, 0);

      return result;
    }

    wrapped.__apdPidWrapped = true;
    window.renderPlanUI = wrapped;
  }

  function patchRenderPidMatchBlock() {
    const original = window.renderPidMatchBlock;
    if (typeof original !== 'function' || original.__apdPidWrapped) return;

    function wrapped() {
      if (!planAllowsPidMatch()) {
        return lockedPidHtml();
      }
      return original.apply(this, arguments);
    }

    wrapped.__apdPidWrapped = true;
    window.renderPidMatchBlock = wrapped;
  }

  function patchRenderAlertaActual() {
    const original = window.renderAlertaActual;
    if (typeof original !== 'function' || original.__apdPidWrapped) return;

    originalRenderAlertaActual = original;

    function wrapped() {
      const result = original.apply(this, arguments);
      enforceUi();
      return result;
    }

    wrapped.__apdPidWrapped = true;
    window.renderAlertaActual = wrapped;
  }

  function boot() {
    removeLegacyPidCard();
    patchPlanDescripcionHumana();
    patchRenderPlanUI();
    patchRenderPidMatchBlock();
    patchRenderAlertaActual();
    enforceUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      setTimeout(enforceUi, 300);
      setTimeout(enforceUi, 1200);
    }, { once: true });
  } else {
    boot();
    setTimeout(enforceUi, 300);
    setTimeout(enforceUi, 1200);
  }
})();

/* APDocentePBA · guía de activación contextual.
 * Solo lectura del resumen visible en el panel.
 * No consulta datos, no guarda preferencias y no modifica planes ni envíos.
 */
(function () {
  'use strict';
  if (window.__apdGrowthActivationGuideLoaded) return;
  window.__apdGrowthActivationGuideLoaded = true;

  var GUIDE_ID = 'apd-growth-activation-guide';
  var STYLE_ID = 'apd-growth-activation-style';

  function byId(id) { return document.getElementById(id); }

  function readValue(summary, label) {
    if (!summary || typeof summary.querySelectorAll !== 'function') return null;
    var rows = summary.querySelectorAll('p');
    for (var i = 0; i < rows.length; i++) {
      var p = rows[i];
      var strong = p.querySelector('strong');
      if (!strong) continue;
      var key = String(strong.textContent || '').replace(/:\s*$/, '').trim().toLowerCase();
      if (key === label) {
        var value = String(p.textContent || '').slice(String(strong.textContent || '').length).trim();
        return value;
      }
    }
    return null;
  }

  function isEmpty(value) {
    return !value || /^\(sin filtro\)$|^\(sin configurar\)$|^[-—]$|^no configurado$/i.test(String(value).trim());
  }

  function getState(summary) {
    var distrito = readValue(summary, 'distritos');
    var cargo = readValue(summary, 'cargos/materias');
    var alertas = readValue(summary, 'alertas');
    if (distrito === null || cargo === null || alertas === null) return null;
    return {
      missingDistrict: isEmpty(distrito),
      missingCargo: isEmpty(cargo),
      paused: /^pausadas?$/i.test(alertas.trim())
    };
  }

  function addStyles() {
    if (byId(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#' + GUIDE_ID + '[hidden]{display:none!important}' +
      '#' + GUIDE_ID + '{margin:18px 0 20px;border-radius:18px;border:1px solid #b4dbe3;' +
        'background:linear-gradient(110deg,#eafaff 0%,#f6fffc 100%);padding:22px;' +
        'color:#153d52;box-shadow:0 8px 26px rgba(10,65,82,.06)}' +
      '#' + GUIDE_ID + ' h3{font-size:clamp(19px,2.5vw,26px);line-height:1.2;margin:0 0 7px}' +
      '#' + GUIDE_ID + ' p{margin:0 0 12px;line-height:1.5;color:#38586a}' +
      '#' + GUIDE_ID + ' ol{display:flex;flex-wrap:wrap;gap:9px;list-style:none;margin:0 0 16px;padding:0}' +
      '#' + GUIDE_ID + ' li{background:white;border:1px solid #cce8e9;border-radius:10px;' +
        'padding:8px 11px;font-weight:700;font-size:12px}' +
      '#' + GUIDE_ID + ' button{min-height:44px;background:#0a5366;color:#fff;font:inherit;' +
        'font-size:14px;font-weight:800;padding:11px 17px;border:0;border-radius:10px;cursor:pointer}' +
      '#' + GUIDE_ID + ' button:focus-visible{outline:3px solid #f5b843;outline-offset:3px}' +
      '#' + GUIDE_ID + ' .apd-growth-note{font-size:12px;color:#56717d;margin:12px 0 0}' +
      '@media(max-width:600px){#' + GUIDE_ID + '{padding:17px}#' + GUIDE_ID + ' li{width:100%}#' + GUIDE_ID + ' button{width:100%}}';
    document.head.appendChild(style);
  }

  function openPreferences() {
    // No modificamos campos ni activamos alertas: cada persona decide y guarda.
    if (typeof window.APD_activatePanelTab === 'function') {
      window.APD_activatePanelTab('preferencias', true);
    }
    function focusEditor() {
      var form = byId('form-preferencias');
      if (!form) return;
      var target = byId('pref-distrito-principal') || form.querySelector('input,select');
      if (typeof form.scrollIntoView === 'function') form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target && typeof target.focus === 'function') {
        try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
      }
    }
    focusEditor();
    setTimeout(focusEditor, 120);
  }

  function createGuide() {
    var root = byId('panel-docente');
    var parent = root && root.querySelector('.container');
    if (!parent || byId(GUIDE_ID)) return byId(GUIDE_ID);
    var guide = document.createElement('section');
    guide.id = GUIDE_ID;
    guide.hidden = true;
    guide.setAttribute('aria-labelledby', 'apd-growth-guide-title');
    guide.innerHTML =
      '<h3 id="apd-growth-guide-title">Terminá de preparar tus alertas</h3>' +
      '<p id="apd-growth-guide-desc">Elegí tus criterios para organizar las búsquedas docentes.</p>' +
      '<ol><li>1. Elegí tus distritos</li><li>2. Elegí cargos o materias</li><li>3. Revisá los canales y guardá</li></ol>' +
      '<button id="apd-growth-guide-action" type="button">Configurar mis preferencias</button>' +
      '<p class="apd-growth-note">No necesitás compartir tu contraseña de ABC. Las alertas dependen de tu plan y siempre debés verificar las ofertas oficiales.</p>';
    var header = parent.querySelector('.panel-header');
    if (header && header.parentNode === parent) {
      parent.insertBefore(guide, header.nextSibling);
    } else {
      parent.insertBefore(guide, parent.firstChild);
    }
    byId('apd-growth-guide-action').addEventListener('click', openPreferences);
    return guide;
  }

  function render() {
    var guide = createGuide();
    var summary = byId('panel-preferencias-resumen');
    if (!guide || !summary) return;
    var state = getState(summary);
    if (!state) { guide.hidden = true; return; }
    var needsSetup = state.missingDistrict || state.missingCargo || state.paused;
    guide.hidden = !needsSetup;
    if (!needsSetup) return;

    var title = byId('apd-growth-guide-title');
    var desc = byId('apd-growth-guide-desc');
    var btn = byId('apd-growth-guide-action');
    if (!title || !desc || !btn) return;
    if (state.missingDistrict || state.missingCargo) {
      title.textContent = 'Completá tu búsqueda docente';
      desc.textContent = 'Te falta configurar ' +
        (state.missingDistrict && state.missingCargo ? 'al menos un distrito y un cargo o materia.' :
         state.missingDistrict ? 'al menos un distrito.' : 'al menos un cargo o materia.') +
        ' Después revisá los canales habilitados en tu plan.';
      btn.textContent = 'Elegir mis filtros';
    } else {
      title.textContent = 'Tus alertas figuran pausadas';
      desc.textContent = 'Revisá si querés activarlas y confirmá la vigencia de tu plan antes de esperar notificaciones.';
      btn.textContent = 'Revisar alertas y canales';
    }
  }

  function boot() {
    addStyles();
    var summary = byId('panel-preferencias-resumen');
    createGuide();
    if (!summary) return;
    render();
    if (typeof MutationObserver === 'function') {
      var observer = new MutationObserver(render);
      observer.observe(summary, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

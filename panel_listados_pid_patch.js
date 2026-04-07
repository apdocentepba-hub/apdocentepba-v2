(function () {
  'use strict';

  if (window.__apdPanelListadosPidPatchLoaded) return;
  window.__apdPanelListadosPidPatchLoaded = true;

  const PID_API_URL = 'https://jolly-haze-f505.apdocentepba.workers.dev';
  const PID_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1YKJgKvIlNInD_NbkuDc8xvrlDr6qKgAsJUQE1le4e8o/edit';
  const PID_LISTADOS = [
    ['oficial', 'Listado Oficial'],
    ['108a', '108 A'],
    ['108b', '108 B'],
    ['fines', 'FINES Listado 1'],
    ['108bfines', 'FINES Listado 2'],
    ['s108a', '108 A Terciario'],
    ['s108b', '108 B Terciario'],
    ['108ainfine', '108 A In Fine'],
    ['108bEncierro', '108 B Contextos de Encierro'],
    ['formacionProfesionalPrincipalPreceptores', 'FP Principal Preceptores'],
    ['formacionProfesionalComplementoPreceptores', 'FP Complementario Preceptores'],
    ['formacionProfesionalPrincipalPanol', 'FP Principal Pañol'],
    ['formacionProfesionalComplementarioPanol', 'FP Complementario Pañol'],
    ['formacionProfesionalPrincipalFp', 'Formación Profesional Principal'],
    ['formacionProfesionalComplementarioFp', 'Formación Profesional Complementario']
  ];

  function byId(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }
  function clean(v) {
    return String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function injectStyles() {
    if (byId('panel-listados-pid-style')) return;
    const style = document.createElement('style');
    style.id = 'panel-listados-pid-style';
    style.textContent = '\n      .panel-tab-grid > .pidlist-card{grid-column:1 / -1;width:100%}\n      .pidlist-card{background:#fff;border:1px solid #dbe3f0;border-radius:18px;padding:22px;display:grid;gap:16px;box-shadow:0 10px 28px rgba(15,52,96,.06)}\n      .pidlist-head{display:grid;gap:6px}\n      .pidlist-grid{display:grid;grid-template-columns:minmax(150px,1fr) minmax(240px,1.5fr) minmax(120px,.75fr) auto;gap:12px;align-items:end}\n      .pidlist-field{display:grid;gap:8px}\n      .pidlist-field label{font-size:13px;color:#5d7088;font-weight:700}\n      .pidlist-field input,.pidlist-field select{width:100%;min-height:46px;padding:12px 14px;border:1px solid #dbe3f0;border-radius:12px;font:inherit;background:#fff}\n      .pidlist-field input:focus,.pidlist-field select:focus{outline:none;border-color:#0f3460;box-shadow:0 0 0 3px rgba(15,52,96,.10)}\n      .pidlist-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:end}\n      .pidlist-actions .btn,.pidlist-actions a{min-height:46px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center}\n      .pidlist-msg{min-height:22px;font-weight:700;font-size:14px}.pidlist-info{color:#0f3460}.pidlist-ok{color:#0b7a44}.pidlist-err{color:#b42318}\n      .pidlist-empty{padding:20px 16px;border:1px dashed #dbe3f0;border-radius:14px;background:#f8fafc;color:#607086;text-align:center;line-height:1.6}\n      .pidlist-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.pidlist-box{background:#f8fafc;border:1px solid rgba(15,52,96,.10);border-radius:14px;padding:14px}\n      .pidlist-k{display:block;font-size:12px;color:#64748b;font-weight:700;margin-bottom:6px}.pidlist-v{display:block;font-size:15px;color:#10243d;font-weight:800;line-height:1.45}\n      .pidlist-table-wrap{overflow:auto;border:1px solid #dbe3f0;border-radius:14px}.pidlist-table{width:100%;border-collapse:collapse;background:#fff;min-width:680px}\n      .pidlist-table th,.pidlist-table td{padding:10px 12px;border-bottom:1px solid #edf2f7;text-align:left}.pidlist-table th{background:#f8fafc;color:#0f3460;font-size:13px;text-transform:uppercase}\n      @media (max-width:980px){.pidlist-grid{grid-template-columns:1fr 1fr}.pidlist-meta{grid-template-columns:1fr 1fr}}\n      @media (max-width:640px){.pidlist-grid,.pidlist-meta{grid-template-columns:1fr}.pidlist-actions{display:grid;grid-template-columns:1fr 1fr}}\n    ';
    document.head.appendChild(style);
  }

  function setMsg(text, type) {
    const el = byId('pidlist-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'pidlist-msg ' + (type || 'pidlist-info');
  }

  function fillListados(select) {
    if (!select) return;
    select.innerHTML = PID_LISTADOS.map(function (item) {
      return '<option value="' + esc(item[0]) + '">' + esc(item[1]) + '</option>';
    }).join('');
    select.value = 'oficial';
  }

  function renderIdle() {
    const out = byId('pidlist-out');
    if (!out) return;
    out.innerHTML = '<div class="pidlist-empty">Acá vas a ver el resultado del PID por DNI.</div>';
  }

  function renderResult(result, meta) {
    const out = byId('pidlist-out');
    if (!out) return;
    const rows = Array.isArray(result && result.items) ? result.items : [];
    out.innerHTML = '\n      <div class="pidlist-meta">\n        <div class="pidlist-box"><span class="pidlist-k">Apellido y nombre</span><strong class="pidlist-v">' + esc(result && result.apellido_nombre || '-') + '</strong></div>\n        <div class="pidlist-box"><span class="pidlist-k">Distrito de residencia</span><strong class="pidlist-v">' + esc(result && result.distrito_residencia || '-') + '</strong></div>\n        <div class="pidlist-box"><span class="pidlist-k">Distritos solicitados</span><strong class="pidlist-v">' + esc(result && result.distritos_solicitados || '-') + '</strong></div>\n        <div class="pidlist-box"><span class="pidlist-k">Oblea</span><strong class="pidlist-v">' + esc(result && result.oblea || '-') + '</strong></div>\n      </div>\n      <p class="prefs-hint">Consulta hecha para DNI ' + esc(meta.dni) + ' · listado ' + esc(meta.label) + ' · año ' + esc(meta.anio) + '.</p>\n      <div class="pidlist-table-wrap">\n        <table class="pidlist-table">\n          <thead><tr><th>Código</th><th>Rama</th><th>Puntaje</th><th>Fecha</th></tr></thead>\n          <tbody>\n            ' + (rows.length ? rows.map(function (it) { return '<tr><td>' + esc(it.codigo || '-') + '</td><td>' + esc(it.rama || '-') + '</td><td>' + esc(it.puntaje || '-') + '</td><td>' + esc(it.fecha || '-') + '</td></tr>'; }).join('') : '<tr><td colspan="4">No se encontraron filas.</td></tr>') + '\n          </tbody>\n        </table>\n      </div>\n    ';
  }

  async function runPid() {
    const dni = clean(byId('pidlist-dni') && byId('pidlist-dni').value || '').replace(/\D+/g, '');
    const listado = clean(byId('pidlist-listado') && byId('pidlist-listado').value || '');
    const anio = clean(byId('pidlist-anio') && byId('pidlist-anio').value || '');
    const btn = byId('pidlist-buscar');
    const label = (PID_LISTADOS.find(function (item) { return item[0] === listado; }) || [listado, listado])[1];

    if (!/^\d{7,8}$/.test(dni)) return setMsg('Ingresá un DNI válido.', 'pidlist-err');
    if (!/^\d{4}$/.test(anio)) return setMsg('Ingresá un año válido.', 'pidlist-err');

    if (btn) { btn.disabled = true; btn.textContent = 'Buscando...'; }
    setMsg('Consultando PID...', 'pidlist-info');
    const out = byId('pidlist-out');
    if (out) out.innerHTML = '<div class="pidlist-empty">Consultando PID...</div>';

    try {
      const res = await fetch(PID_API_URL + '/api/pid-consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni: dni, listado: listado, anio: Number(anio) })
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data || !data.ok) throw new Error(data && data.error || 'No se pudo consultar PID.');
      renderResult(data.result || {}, { dni: dni, anio: anio, label: label });
      setMsg('Consulta PID realizada correctamente.', 'pidlist-ok');
    } catch (err) {
      if (out) out.innerHTML = '<div class="pidlist-empty">' + esc(err && err.message || 'No se pudo consultar PID.') + '</div>';
      setMsg(err && err.message || 'No se pudo consultar PID.', 'pidlist-err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Buscar'; }
    }
  }

  function buildCardHtml() {
    return '\n      <div class="pidlist-card" id="pidlist-card-inner">\n        <div class="pidlist-head">\n          <div class="card-lbl-row"><span class="card-lbl">🪪 Consulta PID por DNI</span></div>\n          <p class="prefs-hint">Consulta por DNI, listado y año directamente dentro de Listados.</p>\n        </div>\n        <div class="pidlist-grid">\n          <div class="pidlist-field"><label for="pidlist-dni">DNI</label><input id="pidlist-dni" type="text" inputmode="numeric" placeholder="34535989"></div>\n          <div class="pidlist-field"><label for="pidlist-listado">Listado</label><select id="pidlist-listado"></select></div>\n          <div class="pidlist-field"><label for="pidlist-anio">Año</label><input id="pidlist-anio" type="number" min="2015" max="2100"></div>\n          <div class="pidlist-actions"><button id="pidlist-buscar" class="btn btn-primary" type="button">Buscar</button><a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="' + PID_SHEET_URL + '">Planilla</a></div>\n        </div>\n        <div id="pidlist-msg" class="pidlist-msg"></div>\n        <div id="pidlist-out"></div>\n      </div>\n    ';
  }

  function bindCard() {
    const btn = byId('pidlist-buscar');
    const dni = byId('pidlist-dni');
    const listado = byId('pidlist-listado');
    const anio = byId('pidlist-anio');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    fillListados(listado);
    if (anio && !anio.value) anio.value = String(new Date().getFullYear());
    btn.addEventListener('click', runPid);
    if (dni) {
      dni.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          runPid();
        }
      });
    }
    renderIdle();
  }

  function enforceListadosPane() {
    injectStyles();

    const wrongCard = byId('panel-listados-pid-card');
    if (wrongCard) wrongCard.remove();

    const tabBtn = document.querySelector('.panel-tab-btn[data-tab-key="perfil"]');
    if (tabBtn && tabBtn.textContent !== 'Listados') tabBtn.textContent = 'Listados';

    const grid = document.querySelector('#panel-tab-pane-perfil .panel-tab-grid');
    if (!grid) return;

    if (!byId('pidlist-card-inner')) {
      grid.innerHTML = buildCardHtml();
      bindCard();
    }
  }

  function bootPass() {
    enforceListadosPane();
  }

  let observer = null;
  function startObserver() {
    const host = byId('panel-tabs-wrap') || byId('panel-docente') || document.body;
    if (!host || observer) return;
    observer = new MutationObserver(function () { bootPass(); });
    observer.observe(host, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bootPass();
      setTimeout(bootPass, 500);
      setTimeout(bootPass, 1400);
      startObserver();
    }, { once: true });
  } else {
    bootPass();
    setTimeout(bootPass, 500);
    setTimeout(bootPass, 1400);
    startObserver();
  }
})();

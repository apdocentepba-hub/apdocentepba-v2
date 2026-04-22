(function () {
  'use strict';

  if (window.__apdPanelListadosPidPatchLoaded) return;
  window.__apdPanelListadosPidPatchLoaded = true;

  const PID_API_URL = 'https://jolly-haze-f505.apdocentepba.workers.dev';
  const PID_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1YKJgKvIlNInD_NbkuDc8xvrlDr6qKgAsJUQE1le4e8o/edit';
  const PID_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxN1cKD8SWvYpFe0xZ-NZuDe0362NVbaTZuCVRq1EgnsB2ykFZYQd3EZnQxGLFpogs2Yg/exec';
  const PID_TOKEN_KEY = 'apd_token_v2';
  const PID_STORAGE_KEY = 'apd_pid_panel_state_v4';
  const PID_LAST_OK_KEY = 'apd_pid_last_save_ok_v1';
  const PID_LISTADOS = [
    ['oficial', 'Listado Oficial'],
    ['108a', 'Listado 108 a'],
    ['fines', 'Listado FINES 1 (UNO)'],
    ['108bfines', 'Listado FINES 2 (DOS)'],
    ['108b', 'Listado 108 b'],
    ['s108a', 'Listado 108 a Terciario'],
    ['s108b', 'Listado 108 b Terciario'],
    ['108ainfine', 'Listado 108 a In Fine'],
    ['108binfine', 'Listado 108 b In Fine'],
    ['108aEncierro', 'Listado Contextos de Encierro'],
    ['108bEncierro', 'Listado 108 b Contextos de Encierro'],
    ['formacionProfesionalPrincipalPreceptores', 'Listado FP PRINCIPAL PRECEPTORES'],
    ['formacionProfesionalComplementoPreceptores', 'Listado Formacion FP Complementario Preceptores'],
    ['formacionProfesionalPrincipalPanol', 'Listado FP Principal Pañol'],
    ['formacionProfesionalComplementarioPanol', 'Listado FP Complementario Pañol'],
    ['formacionProfesionalPrincipalFp', 'Listado FP Principal Formacion Profesional'],
    ['formacionProfesionalComplementarioFp', 'Listado Complementario Formacion Profesional']
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
    return String(v || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function token() {
    try {
      return clean(localStorage.getItem(PID_TOKEN_KEY) || '');
    } catch (_) {
      return '';
    }
  }

  function readState() {
    try {
      const raw = localStorage.getItem(PID_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeState(patch) {
    const next = Object.assign({}, readState(), patch || {});
    try {
      localStorage.setItem(PID_STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function readLastOk() {
    try {
      const raw = localStorage.getItem(PID_LAST_OK_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeLastOk(meta) {
    try {
      localStorage.setItem(PID_LAST_OK_KEY, JSON.stringify({
        dni: clean(meta && meta.dni || ''),
        anio: clean(meta && meta.anio || ''),
        listado: clean(meta && meta.listado || ''),
        label: clean(meta && meta.label || ''),
        saved_at: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function fmtDateTime(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return clean(iso);
      return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
      return clean(iso);
    }
  }

  function renderLastOk() {
    const el = byId('pidlist-lastok');
    if (!el) return;
    const info = readLastOk();
    if (!info || !info.saved_at) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    const bits = ['Último guardado OK: ' + fmtDateTime(info.saved_at)];
    if (info.dni) bits.push('DNI ' + info.dni);
    if (info.label || info.listado) bits.push(info.label || info.listado);
    if (info.anio) bits.push('año ' + info.anio);
    el.textContent = bits.join(' · ');
    el.style.display = 'block';
  }

  function saveFormState() {
    const select = byId('pidlist-listado');
    writeState({
      dni: clean(byId('pidlist-dni') && byId('pidlist-dni').value || ''),
      listado: clean(select && select.value || ''),
      label: clean(select && select.selectedOptions && select.selectedOptions[0] && select.selectedOptions[0].textContent || select && select.value || ''),
      anio: clean(byId('pidlist-anio') && byId('pidlist-anio').value || '')
    });
  }

  function injectStyles() {
    if (byId('panel-listados-pid-style')) return;
    const style = document.createElement('style');
    style.id = 'panel-listados-pid-style';
    style.textContent = `
      .panel-tab-grid > .pidlist-card{grid-column:1 / -1;width:100%}
      .pidlist-card{background:#fff;border:1px solid #dbe3f0;border-radius:18px;padding:22px;display:grid;gap:16px;box-shadow:0 10px 28px rgba(15,52,96,.06)}
      .pidlist-head{display:grid;gap:6px}
      .pidlist-grid{display:grid;grid-template-columns:minmax(150px,1fr) minmax(240px,1.5fr) minmax(120px,.75fr) auto;gap:12px;align-items:end}
      .pidlist-field{display:grid;gap:8px}
      .pidlist-field label{font-size:13px;color:#5d7088;font-weight:700}
      .pidlist-field input,.pidlist-field select{width:100%;min-height:46px;padding:12px 14px;border:1px solid #dbe3f0;border-radius:12px;font:inherit;background:#fff}
      .pidlist-field input:focus,.pidlist-field select:focus{outline:none;border-color:#0f3460;box-shadow:0 0 0 3px rgba(15,52,96,.10)}
      .pidlist-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
      .pidlist-actions .btn,.pidlist-actions a{min-height:46px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center}
      .pidlist-lastok{display:none;padding:10px 12px;border:1px solid rgba(11,122,68,.18);background:#eefbf3;color:#0b7a44;border-radius:12px;font-size:13px;font-weight:700}
      .pidlist-msg{min-height:22px;font-weight:700;font-size:14px}.pidlist-info{color:#0f3460}.pidlist-ok{color:#0b7a44}.pidlist-err{color:#b42318}.pidlist-warn{color:#9a6700}
      .pidlist-empty{padding:20px 16px;border:1px dashed #dbe3f0;border-radius:14px;background:#f8fafc;color:#607086;text-align:center;line-height:1.6}
      .pidlist-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .pidlist-box{background:#f8fafc;border:1px solid rgba(15,52,96,.10);border-radius:14px;padding:14px}
      .pidlist-k{display:block;font-size:12px;color:#64748b;font-weight:700;margin-bottom:6px}
      .pidlist-v{display:block;font-size:15px;color:#10243d;font-weight:800;line-height:1.45}
      .pidlist-block{margin-top:12px}
      .pidlist-block-title{margin:0 0 6px;font-size:15px;font-weight:800;color:#10243d}
      .pidlist-table-wrap{overflow:auto;border:1px solid #dbe3f0;border-radius:14px}
      .pidlist-table{width:100%;border-collapse:collapse;background:#fff;min-width:420px}
      .pidlist-table th,.pidlist-table td{padding:10px 12px;border-bottom:1px solid #edf2f7;text-align:left;vertical-align:top}
      .pidlist-table th{background:#f8fafc;color:#0f3460;font-size:13px;text-transform:uppercase}
      .pidlist-table td:last-child,.pidlist-table th:last-child{text-align:right}
      @media (max-width:980px){.pidlist-grid{grid-template-columns:1fr 1fr}.pidlist-meta{grid-template-columns:1fr 1fr}}
      @media (max-width:640px){.pidlist-grid,.pidlist-meta{grid-template-columns:1fr}.pidlist-actions{display:grid;grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function setMsg(text, type) {
    const el = byId('pidlist-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'pidlist-msg ' + (type || 'pidlist-info');
  }

  async function fetchListadosFromWorker() {
    try {
      const res = await fetch(PID_API_URL + '/api/pid-listados');
      const data = await res.json().catch(function () { return {}; });
      if (res.ok && data && Array.isArray(data.listados) && data.listados.length) {
        return data.listados.map(function (item) {
          return [String(item.value || ''), String(item.label || '')];
        }).filter(function (item) { return item[0]; });
      }
    } catch (_) {}
    return PID_LISTADOS;
  }

  async function fillListados(select) {
    if (!select) return;
    const listados = await fetchListadosFromWorker();
    select.innerHTML = listados.map(function (item) {
      return '<option value="' + esc(item[0]) + '">' + esc(item[1]) + '</option>';
    }).join('');
    select.value = 'oficial';
  }

  function renderIdle() {
    const out = byId('pidlist-out');
    if (!out) return;
    out.innerHTML = '<div class="pidlist-empty">Acá vas a ver el resultado del PID por DNI.</div>';
  }

  function normalizePidRows(result) {
    const rows = Array.isArray(result && result.table_rows)
      ? result.table_rows
      : (Array.isArray(result && result.section_rows) ? result.section_rows : []);

    return rows.map(function (row) {
      return {
        bloque: clean(row && row.bloque || ''),
        area: clean(row && row.area || ''),
        puntaje_total: clean(row && row.puntaje_total || '')
      };
    }).filter(function (row) {
      return row.area || row.puntaje_total;
    });
  }

  function groupRowsByBlock(rows) {
    const groups = [];
    let current = null;

    rows.forEach(function (row) {
      const bloque = row.bloque || 'Otros puntajes';
      if (!current || current.bloque !== bloque) {
        current = { bloque: bloque, rows: [] };
        groups.push(current);
      }
      current.rows.push(row);
    });

    return groups;
  }

  function renderGroups(groups) {
    return groups.map(function (group) {
      return `
        <div class="pidlist-block">
          <div class="pidlist-block-title">${esc(group.bloque)}</div>
          <div class="pidlist-table-wrap">
            <table class="pidlist-table">
              <thead>
                <tr><th>Área</th><th>Puntaje total</th></tr>
              </thead>
              <tbody>
                ${group.rows.map(function (row) {
                  return `<tr><td>${esc(row.area || '-')}</td><td>${esc(row.puntaje_total || '-')}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderResult(result, meta) {
    const out = byId('pidlist-out');
    if (!out) return;

    const rows = normalizePidRows(result);
    const groups = groupRowsByBlock(rows);

    out.innerHTML = `
      <div class="pidlist-meta">
        <div class="pidlist-box"><span class="pidlist-k">Apellido y nombre</span><strong class="pidlist-v">${esc(result && result.apellido_nombre || '-')}</strong></div>
        <div class="pidlist-box"><span class="pidlist-k">Distrito de residencia</span><strong class="pidlist-v">${esc(result && result.distrito_residencia || '-')}</strong></div>
        <div class="pidlist-box"><span class="pidlist-k">Distritos solicitados</span><strong class="pidlist-v">${esc(result && result.distritos_solicitados || '-')}</strong></div>
        <div class="pidlist-box"><span class="pidlist-k">Oblea</span><strong class="pidlist-v">${esc(result && result.oblea || '-')}</strong></div>
      </div>
      <p class="prefs-hint">Consulta hecha para DNI ${esc(meta.dni)} · listado ${esc(meta.label)} · año ${esc(meta.anio)}.</p>
      ${groups.length ? renderGroups(groups) : '<div class="pidlist-empty">No se encontraron filas.</div>'}
    `;
  }

  function savePayload(data, meta) {
    const sourceRows = Array.isArray(data && data.result && data.result.table_rows)
      ? data.result.table_rows
      : Array.isArray(data && data.result && data.result.section_rows)
        ? data.result.section_rows
        : [];

    return {
      action: 'guardar_pid_consulta',
      docente_id: token(),
      dni: clean(data && data.dni || meta && meta.dni || ''),
      anio: Number(data && data.anio || meta && meta.anio || 0) || null,
      listado: clean(data && data.listado || meta && meta.listado || ''),
      version_worker: clean(data && data.version || ''),
      fetched_at: new Date().toISOString(),
      result: {
        apellido_nombre: clean(data && data.result && data.result.apellido_nombre || ''),
        distrito_residencia: clean(data && data.result && data.result.distrito_residencia || ''),
        distritos_solicitados: clean(data && data.result && data.result.distritos_solicitados || ''),
        oblea: clean(data && data.result && data.result.oblea || ''),
        table_rows: sourceRows.map(function (row) {
          const out = {};
          Object.keys(row || {}).forEach(function (k) {
            out[k] = clean(row[k]);
          });
          return out;
        })
      }
    };
  }

  async function savePidResult(data, meta) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, 8000);

    try {
      const res = await fetch(PID_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(savePayload(data, meta)),
        signal: controller.signal
      });

      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch (_) {
        throw new Error('El guardado no devolvió JSON válido');
      }

      if (!res.ok) {
        throw new Error(clean(parsed && (parsed.error || parsed.message) || ('HTTP ' + res.status)));
      }

      if (!parsed || parsed.ok !== true) {
        throw new Error(clean(parsed && (parsed.error || parsed.message) || 'El guardado no confirmó ok:true'));
      }

      return parsed;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('El guardado tardó demasiado en responder');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function restoreLastState() {
    const state = readState();
    const dni = byId('pidlist-dni');
    const listado = byId('pidlist-listado');
    const anio = byId('pidlist-anio');

    if (dni && state.dni) dni.value = state.dni;
    if (anio) anio.value = state.anio || String(new Date().getFullYear());
    if (listado) {
      if (state.listado) listado.value = state.listado;
      if (!listado.value) listado.value = 'oficial';
    }

    if (state && state.result) {
      renderResult(state.result, {
        dni: state.dni || '',
        anio: state.anio || '',
        listado: state.listado || '',
        label: state.label || clean(listado && listado.selectedOptions && listado.selectedOptions[0] && listado.selectedOptions[0].textContent || state.listado || '')
      });
      setMsg(state.msg || '', state.msgType || 'pidlist-info');
      renderLastOk();
      return;
    }

    renderIdle();
    if (state.msg) setMsg(state.msg, state.msgType || 'pidlist-info');
    renderLastOk();
  }

  async function runPid() {
    const dni = clean(byId('pidlist-dni') && byId('pidlist-dni').value || '').replace(/\D+/g, '');
    const listado = clean(byId('pidlist-listado') && byId('pidlist-listado').value || '');
    const anio = clean(byId('pidlist-anio') && byId('pidlist-anio').value || '');
    const btn = byId('pidlist-buscar');
    const label = clean(
      byId('pidlist-listado') &&
      byId('pidlist-listado').selectedOptions &&
      byId('pidlist-listado').selectedOptions[0] &&
      byId('pidlist-listado').selectedOptions[0].textContent || listado
    );
    const meta = { dni: dni, anio: anio, listado: listado, label: label };

    saveFormState();

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

      renderResult(data.result || {}, meta);
      writeState({
        dni: dni,
        listado: listado,
        label: label,
        anio: anio,
        result: data.result || {},
        msg: 'Consulta PID realizada. Guardando en planilla...',
        msgType: 'pidlist-info'
      });
      setMsg('Consulta PID realizada. Guardando en planilla...', 'pidlist-info');

      try {
        const saved = await savePidResult(data, meta);
        writeLastOk(meta);
        renderLastOk();
        writeState({
          dni: dni,
          listado: listado,
          label: label,
          anio: anio,
          result: data.result || {},
          msg: clean(saved && (saved.message || saved.msg) || 'Consulta PID realizada y guardada en planilla.'),
          msgType: 'pidlist-ok'
        });
        setMsg(clean(saved && (saved.message || saved.msg) || 'Consulta PID realizada y guardada en planilla.'), 'pidlist-ok');
      } catch (saveErr) {
        console.error('ERROR GUARDANDO PID EN PLANILLA:', saveErr);
        if (String(saveErr && saveErr.message || '').includes('tardó demasiado')) {
          writeLastOk(meta);
          renderLastOk();
          writeState({
            dni: dni,
            listado: listado,
            label: label,
            anio: anio,
            result: data.result || {},
            msg: 'La consulta probablemente se guardó, pero la confirmación del Web App tardó demasiado.',
            msgType: 'pidlist-warn'
          });
          setMsg('La consulta probablemente se guardó, pero la confirmación del Web App tardó demasiado.', 'pidlist-warn');
        } else {
          writeState({
            dni: dni,
            listado: listado,
            label: label,
            anio: anio,
            result: data.result || {},
            msg: 'Consulta PID realizada, pero no se pudo guardar en planilla.',
            msgType: 'pidlist-warn'
          });
          setMsg('Consulta PID realizada, pero no se pudo guardar en planilla.', 'pidlist-warn');
        }
      }
    } catch (err) {
      if (out) out.innerHTML = '<div class="pidlist-empty">' + esc(err && err.message || 'No se pudo consultar PID.') + '</div>';
      writeState({
        dni: dni,
        listado: listado,
        label: label,
        anio: anio,
        msg: err && err.message || 'No se pudo consultar PID.',
        msgType: 'pidlist-err'
      });
      setMsg(err && err.message || 'No se pudo consultar PID.', 'pidlist-err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Buscar'; }
    }
  }

  function buildCardHtml() {
    return `
      <div class="pidlist-card" id="pidlist-card-inner" data-apd-pid-card="1">
        <div class="pidlist-head">
          <div class="card-lbl-row"><span class="card-lbl">🪪 Consulta PID por DNI</span></div>
          <p class="prefs-hint">Consulta por DNI, listado y año directamente dentro de Listados.</p>
        </div>
        <div class="pidlist-grid">
          <div class="pidlist-field"><label for="pidlist-dni">DNI</label><input id="pidlist-dni" type="text" inputmode="numeric" placeholder="34535989"></div>
          <div class="pidlist-field"><label for="pidlist-listado">Listado</label><select id="pidlist-listado"></select></div>
          <div class="pidlist-field"><label for="pidlist-anio">Año</label><input id="pidlist-anio" type="number" min="2015" max="2100"></div>
          <div class="pidlist-actions"><button id="pidlist-buscar" class="btn btn-primary" type="button">Buscar</button><a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="${PID_SHEET_URL}">Planilla</a></div>
        </div>
        <div id="pidlist-lastok" class="pidlist-lastok"></div>
        <div id="pidlist-msg" class="pidlist-msg"></div>
        <div id="pidlist-out"></div>
      </div>
    `;
  }

  async function bindCard() {
    const btn = byId('pidlist-buscar');
    const dni = byId('pidlist-dni');
    const listado = byId('pidlist-listado');
    const anio = byId('pidlist-anio');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    await fillListados(listado);
    restoreLastState();
    if (anio && !anio.value) anio.value = String(new Date().getFullYear());
    btn.addEventListener('click', runPid);
    if (dni) {
      dni.addEventListener('input', saveFormState);
      dni.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          runPid();
        }
      });
    }
    if (listado) listado.addEventListener('change', saveFormState);
    if (anio) anio.addEventListener('input', saveFormState);
  }

  function moveCardToPerfil(grid) {
    const existing = byId('pidlist-card-inner');
    if (existing && grid && existing.parentElement !== grid) {
      grid.prepend(existing);
    }
  }

  function removeWrongPidCards() {
    document.querySelectorAll('#panel-tabs-wrap .panel-tab-pane:not(#panel-tab-pane-perfil) #panel-listados-pid-card').forEach(function (el) {
      el.remove();
    });

    document.querySelectorAll('#panel-tabs-wrap .panel-tab-pane:not(#panel-tab-pane-perfil) [data-apd-pid-card="1"]').forEach(function (el) {
      el.remove();
    });
  }

  function enforceListadosPane() {
    injectStyles();

    const legacyCard = byId('panel-listados-pid-card');
    if (legacyCard) legacyCard.remove();

    const tabBtn = document.querySelector('.panel-tab-btn[data-tab-key="perfil"]');
    if (tabBtn && tabBtn.textContent !== 'Listados') tabBtn.textContent = 'Listados';

    const grid = document.querySelector('#panel-tab-pane-perfil .panel-tab-grid');
    if (!grid) return;

    moveCardToPerfil(grid);
    removeWrongPidCards();

    if (!byId('pidlist-card-inner')) {
      const host = document.createElement('div');
      host.innerHTML = buildCardHtml();
      const card = host.firstElementChild;
      if (card) grid.prepend(card);
      bindCard();
      return;
    }

    moveCardToPerfil(grid);
    bindCard();
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

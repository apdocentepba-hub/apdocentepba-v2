(function () {
  if (window.__apdPidPanelV3) return;
  window.__apdPidPanelV3 = 1;

  const API = 'https://jolly-haze-f505.apdocentepba.workers.dev';
  const WEBAPP = 'https://script.google.com/macros/s/AKfycbxN1cKD8SWvYpFe0xZ-NZuDe0362NVbaTZuCVRq1EgnsB2ykFZYQd3EZnQxGLFpogs2Yg/exec';
  const TOK = 'apd_token_v2';
  const LAST_OK = 'apd_pid_last_save_ok_v1';

  const LIST = [
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

  const $ = (id) => document.getElementById(id);

  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const clean = (v) =>
    String(v ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const msg = (t, k = 'pidlist-info') => {
    const e = $('pidlist-msg');
    if (!e) return;
    e.textContent = t || '';
    e.className = 'pidlist-msg ' + k;
  };

  const idle = () => {
    const o = $('pidlist-out');
    if (o) {
      o.innerHTML = '<div class="pidlist-empty">Acá vas a ver el resultado del PID por DNI.</div>';
    }
  };

  const token = () => clean(localStorage.getItem(TOK) || '');

  const fmt = (iso) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return clean(iso);
      return d.toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
    } catch (_) {
      return clean(iso);
    }
  };

  const readLastOk = () => {
    try {
      const raw = localStorage.getItem(LAST_OK);
      if (!raw) return null;
      const j = JSON.parse(raw);
      return j && typeof j === 'object' ? j : null;
    } catch (_) {
      return null;
    }
  };

  const writeLastOk = (meta) => {
    try {
      localStorage.setItem(
        LAST_OK,
        JSON.stringify({
          dni: clean(meta?.dni || ''),
          anio: clean(meta?.anio || ''),
          listado: clean(meta?.listado || ''),
          label: clean(meta?.label || ''),
          saved_at: new Date().toISOString()
        })
      );
    } catch (_) {}
  };

  const renderLastOk = () => {
    const e = $('pidlist-lastok');
    if (!e) return;

    const j = readLastOk();
    if (!j || !j.saved_at) {
      e.style.display = 'none';
      e.textContent = '';
      return;
    }

    const bits = [`Último guardado OK: ${fmt(j.saved_at)}`];
    if (j.dni) bits.push(`DNI ${j.dni}`);
    if (j.label || j.listado) bits.push(j.label || j.listado);
    if (j.anio) bits.push(`año ${j.anio}`);

    e.textContent = bits.join(' · ');
    e.style.display = 'block';
  };

  const rows = (r) =>
    (
      (
        Array.isArray(r?.table_rows)
          ? r.table_rows
          : Array.isArray(r?.section_rows)
            ? r.section_rows
            : []
      ) || []
    )
      .map((x) => ({
        bloque: clean(x?.bloque || ''),
        area: clean(x?.area || ''),
        puntaje_total: clean(x?.puntaje_total || '')
      }))
      .filter((x) => x.area || x.puntaje_total);

  const byBlock = (a) => {
    const g = [];
    let c = null;

    (a || []).forEach((r) => {
      const b = r.bloque || 'Otros puntajes';
      if (!c || c.bloque !== b) {
        c = { bloque: b, rows: [] };
        g.push(c);
      }
      c.rows.push(r);
    });

    return g;
  };

  const render = (r, m) => {
    const o = $('pidlist-out');
    if (!o) return;

    const gs = byBlock(rows(r));

    o.innerHTML = `
      <div class="pidlist-meta">
        <div class="pidlist-box">
          <span class="pidlist-k">Apellido y nombre</span>
          <strong class="pidlist-v">${esc(r?.apellido_nombre || '-')}</strong>
        </div>
        <div class="pidlist-box">
          <span class="pidlist-k">Distrito de residencia</span>
          <strong class="pidlist-v">${esc(r?.distrito_residencia || '-')}</strong>
        </div>
        <div class="pidlist-box">
          <span class="pidlist-k">Distritos solicitados</span>
          <strong class="pidlist-v">${esc(r?.distritos_solicitados || '-')}</strong>
        </div>
        <div class="pidlist-box">
          <span class="pidlist-k">Oblea</span>
          <strong class="pidlist-v">${esc(r?.oblea || '-')}</strong>
        </div>
      </div>
      <p class="prefs-hint">
        Consulta hecha para DNI ${esc(m.dni)} · listado ${esc(m.label)} · año ${esc(m.anio)}.
      </p>
      ${
        gs.length
          ? gs
              .map(
                (g) => `
            <div class="pidlist-block">
              <div class="pidlist-block-title">${esc(g.bloque)}</div>
              <div class="pidlist-table-wrap">
                <table class="pidlist-table">
                  <thead>
                    <tr><th>Área</th><th>Puntaje total</th></tr>
                  </thead>
                  <tbody>
                    ${g.rows
                      .map(
                        (x) => `
                      <tr>
                        <td>${esc(x.area || '-')}</td>
                        <td>${esc(x.puntaje_total || '-')}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `
              )
              .join('')
          : '<div class="pidlist-empty">No se encontraron filas.</div>'
      }
    `;
  };

  const savePayload = (data, m) => ({
    action: 'guardar_pid_consulta',
    docente_id: token(),
    dni: clean(data?.dni || m.dni || ''),
    anio: Number(data?.anio || m.anio || 0) || null,
    listado: clean(data?.listado || m.listado || ''),
    version_worker: clean(data?.version || ''),
    fetched_at: new Date().toISOString(),
    result: {
      apellido_nombre: clean(data?.result?.apellido_nombre || ''),
      distrito_residencia: clean(data?.result?.distrito_residencia || ''),
      distritos_solicitados: clean(data?.result?.distritos_solicitados || ''),
      oblea: clean(data?.result?.oblea || ''),
      table_rows: (
        Array.isArray(data?.result?.table_rows)
          ? data.result.table_rows
          : Array.isArray(data?.result?.section_rows)
            ? data.result.section_rows
            : []
      ).map((r) =>
        Object.fromEntries(Object.keys(r || {}).map((k) => [k, clean(r[k])]))
      )
    }
  });

  const save = async (data, m) => {
    const res = await fetch(WEBAPP, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(savePayload(data, m))
    });

    const text = await res.text();

    let j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch (_) {
      throw new Error('El guardado no devolvió JSON válido');
    }

    if (!res.ok) {
      throw new Error(clean(j?.error || j?.message || ('HTTP ' + res.status)));
    }

    if (!j || j.ok !== true) {
      throw new Error(clean(j?.error || j?.message || 'El guardado no confirmó ok:true'));
    }

    return j;
  };

  const fill = async () => {
    const s = $('pidlist-listado');
    if (!s) return;

    let list = LIST;

    try {
      const res = await fetch(API + '/api/pid-listados');
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j?.listados) && j.listados.length) {
        list = j.listados
          .map((x) => [String(x.value || ''), String(x.label || '')])
          .filter((x) => x[0]);
      }
    } catch (_) {}

    s.innerHTML = list
      .map((x) => `<option value="${esc(x[0])}">${esc(x[1])}</option>`)
      .join('');

    s.value = 'oficial';
  };

  const clearForm = () => {
    const d = $('pidlist-dni');
    if (d) {
      d.value = '';
      d.focus();
    }
    idle();
    msg('');
    renderLastOk();
  };

  const run = async () => {
    const dni = clean($('pidlist-dni')?.value || '').replace(/\D+/g, '');
    const listado = clean($('pidlist-listado')?.value || '');
    const anio = clean($('pidlist-anio')?.value || '');
    const btn = $('pidlist-buscar');
    const label = clean($('pidlist-listado')?.selectedOptions?.[0]?.textContent || listado);
    const meta = { dni, anio, listado, label };

    if (!/^\d{7,8}$/.test(dni)) return msg('Ingresá un DNI válido.', 'pidlist-err');
    if (!/^\d{4}$/.test(anio)) return msg('Ingresá un año válido.', 'pidlist-err');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Buscando...';
    }

    msg('Consultando PID...');

    const o = $('pidlist-out');
    if (o) o.innerHTML = '<div class="pidlist-empty">Consultando PID...</div>';

    try {
      const res = await fetch(API + '/api/pid-consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni, listado, anio: Number(anio) })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo consultar PID.');
      }

      render(data.result || {}, meta);
      msg('Consulta PID realizada. Guardando en planilla...');

      try {
        const s = await save(data, meta);
        writeLastOk(meta);
        renderLastOk();
        msg(clean(s?.message || 'Consulta PID realizada y guardada en planilla.'), 'pidlist-ok');
      } catch (err) {
        console.error('ERROR GUARDANDO PID EN PLANILLA:', err);
        msg('Consulta PID realizada, pero no se pudo guardar en planilla.', 'pidlist-warn');
      }
    } catch (err) {
      if (o) {
        o.innerHTML =
          '<div class="pidlist-empty">' +
          esc(err?.message || 'No se pudo consultar PID.') +
          '</div>';
      }
      msg(err?.message || 'No se pudo consultar PID.', 'pidlist-err');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Buscar';
      }
    }
  };

  const styles = () => {
    if ($('panel-listados-pid-style')) return;

    const s = document.createElement('style');
    s.id = 'panel-listados-pid-style';
    s.textContent =
      '.panel-tab-grid>.pidlist-card{grid-column:1/-1;width:100%}' +
      '.pidlist-card{background:#fff;border:1px solid #dbe3f0;border-radius:18px;padding:22px;display:grid;gap:16px;box-shadow:0 10px 28px rgba(15,52,96,.06)}' +
      '.pidlist-head{display:grid;gap:6px}' +
      '.pidlist-grid{display:grid;grid-template-columns:minmax(150px,1fr) minmax(240px,1.5fr) minmax(120px,.75fr) auto;gap:12px;align-items:end}' +
      '.pidlist-field{display:grid;gap:8px}' +
      '.pidlist-field label{font-size:13px;color:#5d7088;font-weight:700}' +
      '.pidlist-field input,.pidlist-field select{width:100%;min-height:46px;padding:12px 14px;border:1px solid #dbe3f0;border-radius:12px;font:inherit;background:#fff}' +
      '.pidlist-field input:focus,.pidlist-field select:focus{outline:none;border-color:#0f3460;box-shadow:0 0 0 3px rgba(15,52,96,.10)}' +
      '.pidlist-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:end}' +
      '.pidlist-actions .btn{min-height:46px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center}' +
      '.pidlist-msg{min-height:22px;font-weight:700;font-size:14px}' +
      '.pidlist-info{color:#0f3460}' +
      '.pidlist-ok{color:#0b7a44}' +
      '.pidlist-err{color:#b42318}' +
      '.pidlist-warn{color:#9a6700}' +
      '.pidlist-lastok{display:none;padding:10px 12px;border:1px solid rgba(11,122,68,.18);background:#eefbf3;color:#0b7a44;border-radius:12px;font-size:13px;font-weight:700}' +
      '.pidlist-empty{padding:20px 16px;border:1px dashed #dbe3f0;border-radius:14px;background:#f8fafc;color:#607086;text-align:center;line-height:1.6}' +
      '.pidlist-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}' +
      '.pidlist-box{background:#f8fafc;border:1px solid rgba(15,52,96,.10);border-radius:14px;padding:14px}' +
      '.pidlist-k{display:block;font-size:12px;color:#64748b;font-weight:700;margin-bottom:6px}' +
      '.pidlist-v{display:block;font-size:15px;color:#10243d;font-weight:800;line-height:1.45}' +
      '.pidlist-block{margin-top:12px}' +
      '.pidlist-block-title{margin:0 0 6px;font-size:15px;font-weight:800;color:#10243d}' +
      '.pidlist-table-wrap{overflow:auto;border:1px solid #dbe3f0;border-radius:14px}' +
      '.pidlist-table{width:100%;border-collapse:collapse;background:#fff;min-width:420px}' +
      '.pidlist-table th,.pidlist-table td{padding:10px 12px;border-bottom:1px solid #edf2f7;text-align:left;vertical-align:top}' +
      '.pidlist-table th{background:#f8fafc;color:#0f3460;font-size:13px;text-transform:uppercase}' +
      '.pidlist-table td:last-child,.pidlist-table th:last-child{text-align:right}' +
      '@media (max-width:980px){.pidlist-grid{grid-template-columns:1fr 1fr}.pidlist-meta{grid-template-columns:1fr 1fr}}' +
      '@media (max-width:640px){.pidlist-grid,.pidlist-meta{grid-template-columns:1fr}.pidlist-actions{display:grid;grid-template-columns:1fr 1fr}}';

    document.head.appendChild(s);
  };

  const html = () => `
    <div class="pidlist-card" id="pidlist-card-inner">
      <div class="pidlist-head">
        <div class="card-lbl-row"><span class="card-lbl">🪪 Consulta PID por DNI</span></div>
        <p class="prefs-hint">Consulta por DNI, listado y año directamente dentro de Listados.</p>
      </div>

      <div class="pidlist-grid">
        <div class="pidlist-field">
          <label for="pidlist-dni">DNI</label>
          <input id="pidlist-dni" type="text" inputmode="numeric" placeholder="34535989">
        </div>

        <div class="pidlist-field">
          <label for="pidlist-listado">Listado</label>
          <select id="pidlist-listado"></select>
        </div>

        <div class="pidlist-field">
          <label for="pidlist-anio">Año</label>
          <input id="pidlist-anio" type="number" min="2015" max="2100">
        </div>

        <div class="pidlist-actions">
          <button id="pidlist-buscar" class="btn btn-primary" type="button">Buscar</button>
          <button id="pidlist-limpiar" class="btn btn-secondary" type="button">Limpiar</button>
        </div>
      </div>

      <div id="pidlist-msg" class="pidlist-msg"></div>
      <div id="pidlist-lastok" class="pidlist-lastok"></div>
      <div id="pidlist-out"></div>
    </div>
  `;

  const bind = async () => {
    const b = $('pidlist-buscar');
    const c = $('pidlist-limpiar');
    const d = $('pidlist-dni');
    const a = $('pidlist-anio');

    if (!b || b.dataset.bound === '1') return;
    b.dataset.bound = '1';

    await fill();

    if (a && !a.value) a.value = String(new Date().getFullYear());

    b.addEventListener('click', run);
    if (c) c.addEventListener('click', clearForm);

    if (d) {
      d.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          run();
        }
      });
    }

    idle();
    renderLastOk();
  };

  const boot = () => {
    styles();

    const w = $('panel-listados-pid-card');
    if (w) w.remove();

    const t = document.querySelector('.panel-tab-btn[data-tab-key="perfil"]');
    if (t && t.textContent !== 'Listados') t.textContent = 'Listados';

    const g = document.querySelector('#panel-tab-pane-perfil .panel-tab-grid');
    if (!g) return;

    if (!$('pidlist-card-inner')) {
      g.innerHTML = html();
      bind();
    } else {
      renderLastOk();
    }
  };

  let mo = null;

  const observe = () => {
    const h = $('panel-tabs-wrap') || $('panel-docente') || document.body;
    if (!h || mo) return;

    mo = new MutationObserver(() => boot());
    mo.observe(h, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        boot();
        setTimeout(boot, 500);
        setTimeout(boot, 1400);
        observe();
      },
      { once: true }
    );
  } else {
    boot();
    setTimeout(boot, 500);
    setTimeout(boot, 1400);
    observe();
  }
})();

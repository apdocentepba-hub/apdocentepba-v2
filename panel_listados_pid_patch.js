(function () {
  'use strict';

  if (window.__apdPidPanelV8Loaded) return;
  window.__apdPidPanelV8Loaded = true;

  const API = 'https://jolly-haze-f505.apdocentepba.workers.dev';
  const TOK = 'apd_token_v2';

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

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clean(v) {
    return String(v ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function currentYear() {
    return String(new Date().getFullYear());
  }

  function token() {
    return clean(localStorage.getItem(TOK) || '');
  }

  function hasSession() {
    return !!token();
  }

  function setMsg(text, type) {
    const el = byId('pidlist-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'pidlist-msg ' + (type || 'pidlist-info');
  }

  function renderIdle() {
    const out = byId('pidlist-out');
    if (!out) return;
    out.innerHTML = '<div class="pidlist-empty">Acá vas a ver el resultado del PID por DNI.</div>';
  }

  function normalizeRows(result) {
    const rows = Array.isArray(result?.table_rows)
      ? result.table_rows
      : Array.isArray(result?.section_rows)
        ? result.section_rows
        : [];

    return rows
      .map(function (row) {
        return {
          bloque: clean(row?.bloque || ''),
          area: clean(row?.area || ''),
          puntaje_total: clean(row?.puntaje_total || '')
        };
      })
      .filter(function (row) {
        return row.area || row.puntaje_total;
      });
  }

  function groupRowsByBlock(rows) {
    const groups = [];
    let current = null;

    (rows || []).forEach(function (row) {
      const bloque = row.bloque || 'Otros puntajes';
      if (!current || current.bloque !== bloque) {
        current = { bloque: bloque, rows: [] };
        groups.push(current);
      }
      current.rows.push(row);
    });

    return groups;
  }

  function renderResult(result, meta) {
    const out = byId('pidlist-out');
    if (!out) return;

    const rows = normalizeRows(result);
    const groups = groupRowsByBlock(rows);

    out.innerHTML = `
      <div class="pidlist-meta">
        <div class="pidlist-box">
          <span class="pidlist-k">Apellido y nombre</span>
          <strong class="pidlist-v">${esc(result?.apellido_nombre || '-')}</strong>
        </div>
        <div class="pidlist-box">
          <span class="pidlist-k">Distrito de residencia</span>
          <strong class="pidlist-v">${esc(result?.distrito_residencia || '-')}</strong>
        </div>
        <div class="pidlist-box">
          <span class="pidlist-k">Distritos solicitados</span>
          <strong class="pidlist-v">${esc(result?.distritos_solicitados || '-')}</strong>
        </div>
        <div class="pidlist-box">
          <span class="pidlist-k">Oblea</span>
          <strong class="pidlist-v">${esc(result?.oblea || '-')}</strong>
        </div>
      </div>

      <p class="prefs-hint">
        Consulta hecha para DNI ${esc(meta.dni)} · listado ${esc(meta.label)} · año ${esc(meta.anio)}.
      </p>

      ${
        groups.length
          ? groups.map(function (group) {
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
                          return `
                            <tr>
                              <td>${esc(row.area || '-')}</td>
                              <td>${esc(row.puntaje_total || '-')}</td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;
            }).join('')
          : '<div class="pidlist-empty">No se encontraron filas.</div>'
      }
    `;
  }

  function labelForListado(value) {
    const select = byId('pidlist-listado');
    if (select) {
      const opt = Array.from(select.options || []).find(function (o) {
        return String(o.value) === String(value);
      });
      if (opt) return clean(opt.textContent || value);
    }

    const found = LIST.find(function (item) {
      return String(item[0]) === String(value);
    });

    return found ? found[1] : clean(value);
  }

  function savePayload(data, meta) {
    const sourceRows = Array.isArray(data?.result?.table_rows)
      ? data.result.table_rows
      : Array.isArray(data?.result?.section_rows)
        ? data.result.section_rows
        : [];

    return {
      docente_id: token(),
      dni: clean(data?.dni || meta?.dni || ''),
      anio: Number(data?.anio || meta?.anio || 0) || null,
      listado: clean(data?.listado || meta?.listado || ''),
      version_worker: clean(data?.version || ''),
      fetched_at: new Date().toISOString(),
      result: {
        apellido_nombre: clean(data?.result?.apellido_nombre || ''),
        distrito_residencia: clean(data?.result?.distrito_residencia || ''),
        distritos_solicitados: clean(data?.result?.distritos_solicitados || ''),
        oblea: clean(data?.result?.oblea || ''),
        table_rows: sourceRows.map(function (row) {
          return Object.fromEntries(
            Object.keys(row || {}).map(function (k) {
              return [k, clean(row[k])];
            })
          );
        })
      }
    };
  }

  async function postApi(path, payload, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        throw new Error(clean(data?.error || ('HTTP ' + res.status)));
      }

      return data || {};
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error('La operación tardó demasiado en responder');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function save(data, meta) {
    const parsed = await postApi('/api/pid-guardar', savePayload(data, meta), 8000);

    if (parsed.ok !== true) {
      throw new Error(clean(parsed?.error || parsed?.message || 'El guardado no confirmó ok:true'));
    }

    return parsed;
  }

  async function restoreLastSaved(opts) {
    if (!hasSession()) return false;

    try {
      const parsed = await postApi('/api/pid-ultima', {
        docente_id: token()
      }, 8000);

      if (parsed.ok !== true) {
        throw new Error(clean(parsed?.error || parsed?.message || 'No se pudo obtener la última consulta'));
      }

      if (!parsed.found || !parsed.result) {
        return false;
      }

      const dni = clean(parsed.dni || '');
      const anio = clean(parsed.anio || '');
      const listado = clean(parsed.listado || '');
      const label = labelForListado(listado);

      const dniEl = byId('pidlist-dni');
      const anioEl = byId('pidlist-anio');
      const listadoEl = byId('pidlist-listado');

      if (dniEl) dniEl.value = dni;
      if (anioEl) anioEl.value = anio || currentYear();
      if (listadoEl && listado) listadoEl.value = listado;

      renderResult(parsed.result, {
        dni: dni,
        anio: anio,
        listado: listado,
        label: label
      });

      if (!opts || !opts.silent) {
        setMsg('Mostrando la última consulta guardada.', 'pidlist-info');
      }

      return true;
    } catch (err) {
      console.error('ERROR OBTENIENDO ÚLTIMA PID:', err);
      return false;
    }
  }

  async function fillListados(selectEl) {
    if (!selectEl) return;

    let listados = LIST;
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, 6000);

    try {
      const res = await fetch(API + '/api/pid-listados', {
        signal: controller.signal
      });

      const data = await res.json().catch(function () { return {}; });

      if (res.ok && Array.isArray(data?.listados) && data.listados.length) {
        listados = data.listados
          .map(function (item) {
            return [String(item.value || ''), String(item.label || '')];
          })
          .filter(function (item) {
            return item[0];
          });
      }
    } catch (_) {
      listados = LIST;
    } finally {
      clearTimeout(timer);
    }

    selectEl.innerHTML = listados.map(function (item) {
      return `<option value="${esc(item[0])}">${esc(item[1])}</option>`;
    }).join('');

    selectEl.value = 'oficial';
  }

  function clearForm() {
    const dni = byId('pidlist-dni');
    const listado = byId('pidlist-listado');
    const anio = byId('pidlist-anio');

    if (dni) {
      dni.value = '';
      dni.focus();
    }
    if (listado) listado.value = 'oficial';
    if (anio) anio.value = currentYear();

    renderIdle();
    setMsg('');
  }

  async function run() {
    const dni = clean(byId('pidlist-dni')?.value || '').replace(/\D+/g, '');
    const listado = clean(byId('pidlist-listado')?.value || '');
    const anio = clean(byId('pidlist-anio')?.value || '');
    const btn = byId('pidlist-buscar');
    const label = clean(byId('pidlist-listado')?.selectedOptions?.[0]?.textContent || listado);
    const meta = { dni, anio, listado, label };

    if (!/^\d{7,8}$/.test(dni)) {
      setMsg('Ingresá un DNI válido.', 'pidlist-err');
      return;
    }

    if (!/^\d{4}$/.test(anio)) {
      setMsg('Ingresá un año válido.', 'pidlist-err');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Buscando...';
    }

    setMsg('Consultando PID...', 'pidlist-info');

    const out = byId('pidlist-out');
    if (out) {
      out.innerHTML = '<div class="pidlist-empty">Consultando PID...</div>';
    }

    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, 12000);

    try {
      const res = await fetch(API + '/api/pid-consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dni: dni,
          listado: listado,
          anio: Number(anio)
        }),
        signal: controller.signal
      });

      const data = await res.json().catch(function () { return {}; });

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo consultar PID.');
      }

      renderResult(data.result || {}, meta);

      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Buscar';
      }

      setMsg('Consulta PID realizada. Guardando en planilla...', 'pidlist-info');

      save(data, meta)
        .then(function (saved) {
          setMsg(clean(saved?.message || 'Consulta PID realizada y guardada en planilla.'), 'pidlist-ok');
          setTimeout(function () {
            restoreLastSaved({ silent: true });
          }, 300);
        })
        .catch(function (err) {
          console.error('ERROR GUARDANDO PID EN PLANILLA:', err);

          if (String(err?.message || '').includes('demasiado')) {
            setMsg('La confirmación del guardado tardó demasiado. Voy a reintentar mostrar la última guardada.', 'pidlist-warn');
            setTimeout(function () {
              restoreLastSaved({ silent: true });
            }, 2000);
            setTimeout(function () {
              restoreLastSaved({ silent: true });
            }, 5000);
          } else {
            setMsg('Consulta PID realizada, pero no se pudo guardar en planilla.', 'pidlist-warn');
          }
        });
    } catch (err) {
      const text = err?.name === 'AbortError'
        ? 'La consulta PID tardó demasiado en responder.'
        : (err?.message || 'No se pudo consultar PID.');

      if (out) {
        out.innerHTML = '<div class="pidlist-empty">' + esc(text) + '</div>';
      }

      setMsg(text, 'pidlist-err');

      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Buscar';
      }
    } finally {
      clearTimeout(timer);
    }
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
      .pidlist-actions .btn{min-height:46px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center}
      .pidlist-msg{min-height:22px;font-weight:700;font-size:14px}
      .pidlist-info{color:#0f3460}
      .pidlist-ok{color:#0b7a44}
      .pidlist-err{color:#b42318}
      .pidlist-warn{color:#9a6700}
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

  function buildHtml() {
    return `
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
        <div id="pidlist-out"></div>
      </div>
    `;
  }

  async function bindCard() {
    const btn = byId('pidlist-buscar');
    const clearBtn = byId('pidlist-limpiar');
    const dni = byId('pidlist-dni');
    const listado = byId('pidlist-listado');
    const anio = byId('pidlist-anio');

    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    if (anio && !anio.value) anio.value = currentYear();

    await fillListados(listado);

    btn.addEventListener('click', run);

    if (clearBtn) {
      clearBtn.addEventListener('click', clearForm);
    }

    if (dni) {
      dni.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          run();
        }
      });
    }

    renderIdle();
    restoreLastSaved({ silent: true });
  }

  function panelGrid() {
    return document.querySelector('#panel-tab-pane-perfil .panel-tab-grid');
  }

  function boot() {
    injectStyles();

    const wrongCard = byId('panel-listados-pid-card');
    if (wrongCard) wrongCard.remove();

    if (!hasSession()) return;

    const tabBtn = document.querySelector('.panel-tab-btn[data-tab-key="perfil"]');
    if (tabBtn && tabBtn.textContent !== 'Listados') {
      tabBtn.textContent = 'Listados';
    }

    const grid = panelGrid();
    if (!grid) return;

    if (!byId('pidlist-card-inner')) {
      grid.innerHTML = buildHtml();
      bindCard();
    }
  }

  let observer = null;
  let bootTimer = null;

  function scheduleBoot() {
    clearTimeout(bootTimer);
    bootTimer = setTimeout(boot, 60);
  }

  function startObserver() {
    const host = document.body;
    if (!host || observer) return;

    observer = new MutationObserver(function () {
      scheduleBoot();
    });

    observer.observe(host, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      setTimeout(boot, 500);
      setTimeout(boot, 1400);
      startObserver();
    }, { once: true });
  } else {
    boot();
    setTimeout(boot, 500);
    setTimeout(boot, 1400);
    startObserver();
  }
})();

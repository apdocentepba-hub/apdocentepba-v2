(function () {
  'use strict';
  if (window.__apdPidLookupPatchLoaded) return;
  window.__apdPidLookupPatchLoaded = true;

  const LISTADOS = [
    { value: 'oficial', label: 'Listado Oficial' },
    { value: '108a', label: '108 A' },
    { value: '108b', label: '108 B' },
    { value: 'fines', label: 'FINES Listado 1' },
    { value: '108bfines', label: 'FINES Listado 2' },
    { value: 's108a', label: '108 A Terciario' },
    { value: 's108b', label: '108 B Terciario' },
    { value: '108ainfine', label: '108 A In Fine' },
    { value: '108bEncierro', label: '108 B Contextos de Encierro' },
    { value: 'formacionProfesionalPrincipalPreceptores', label: 'FP Principal Preceptores' },
    { value: 'formacionProfesionalComplementoPreceptores', label: 'FP Complementario Preceptores' },
    { value: 'formacionProfesionalPrincipalPanol', label: 'FP Principal Pañol' },
    { value: 'formacionProfesionalComplementarioPanol', label: 'FP Complementario Pañol' },
    { value: 'formacionProfesionalPrincipalFp', label: 'Formación Profesional Principal' },
    { value: 'formacionProfesionalComplementarioFp', label: 'Formación Profesional Complementario' }
  ];

  function byId(id) { return document.getElementById(id); }
  function esc(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  }
  function clean(v) { return String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
  function getApiBase() {
    try { if (typeof API_URL !== 'undefined' && API_URL) return API_URL; } catch (_) {}
    return window.location.origin;
  }
  function setMsg(text, type) {
    const node = byId('pid-lookup-msg');
    if (!node) return;
    node.textContent = String(text || '');
    node.className = `msg msg-${type || 'info'}`;
  }
  function ensureStyles() {
    if (byId('pid-lookup-inline-style')) return;
    const style = document.createElement('style');
    style.id = 'pid-lookup-inline-style';
    style.textContent = '.pid-toolbar{display:grid;grid-template-columns:1fr 1.1fr .7fr auto;gap:12px;align-items:end}.pid-meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pid-meta-item{padding:12px 14px;border-radius:14px;background:#f8fafc;border:1px solid rgba(15,52,96,.1)}.pid-meta-k{display:block;font-size:12px;color:#64748b;margin-bottom:4px}.pid-meta-v{display:block;font-size:15px;font-weight:700;color:#0f3460}.pid-table-wrap{overflow:auto;border:1px solid rgba(15,52,96,.12);border-radius:14px}.pid-table{width:100%;border-collapse:collapse;background:#fff}.pid-table th,.pid-table td{padding:10px 12px;border-bottom:1px solid rgba(15,52,96,.08);text-align:left;font-size:14px}.pid-table th{background:#f8fafc;color:#0f3460;font-weight:800}.pid-note{font-size:13px;color:#64748b;line-height:1.5}.pid-actions{display:flex;gap:8px;flex-wrap:wrap}@media (max-width:900px){.pid-toolbar,.pid-meta-grid{grid-template-columns:1fr 1fr}}@media (max-width:640px){.pid-toolbar,.pid-meta-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  function ensureCard() {
    const root = byId('panel-content');
    if (!root) return null;
    let card = byId('panel-pid-lookup-card');
    if (card) return card;
    const anchor = byId('panel-historico-apd-card') || byId('panel-preferencias-editor-card') || root.lastElementChild;
    const html = `<div id="panel-pid-lookup-card" class="panel-card span-12"><div class="card-lbl-row"><span class="card-lbl">🪪 Consulta PID por DNI</span></div><p class="prefs-hint">Consulta en vivo la oblea del PID por DNI, listado y año. No guarda nada en Supabase: solo trae y muestra el resultado.</p><div class="pid-toolbar"><div class="field"><label for="pid-dni">DNI</label><input type="text" id="pid-dni" inputmode="numeric" placeholder="Ej: 34535989" /></div><div class="field"><label for="pid-listado">Listado</label><select id="pid-listado"></select></div><div class="field"><label for="pid-anio">Año</label><input type="number" id="pid-anio" min="2015" max="2100" step="1" /></div><div class="pid-actions"><button id="btn-pid-consultar" class="btn btn-primary" type="button">Buscar</button></div></div><span id="pid-lookup-msg" class="msg"></span><div id="panel-pid-resultado"><p class="ph">Todavía no se consultó ningún DNI.</p></div></div>`;
    if (anchor && anchor !== root.lastElementChild) anchor.insertAdjacentHTML('beforebegin', html);
    else root.insertAdjacentHTML('beforeend', html);
    byId('pid-anio').value = String(new Date().getFullYear());
    const select = byId('pid-listado');
    select.innerHTML = LISTADOS.map(item => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('');
    select.value = 'oficial';
    bindEvents();
    return byId('panel-pid-lookup-card');
  }
  function render(data, meta) {
    const box = byId('panel-pid-resultado');
    if (!box) return;
    const rows = Array.isArray(data?.items) ? data.items : [];
    box.innerHTML = `<div class="pid-meta-grid"><div class="pid-meta-item"><span class="pid-meta-k">Apellido y nombre</span><strong class="pid-meta-v">${esc(data?.apellido_nombre || '-')}</strong></div><div class="pid-meta-item"><span class="pid-meta-k">Distrito de residencia</span><strong class="pid-meta-v">${esc(data?.distrito_residencia || '-')}</strong></div><div class="pid-meta-item"><span class="pid-meta-k">Distritos solicitados</span><strong class="pid-meta-v">${esc(data?.distritos_solicitados || '-')}</strong></div></div><div class="historico-box"><h4>${esc(data?.oblea || 'Oblea PID')}</h4><p class="pid-note">Consulta hecha para DNI ${esc(meta.dni)} · listado ${esc(meta.label)} · año ${esc(meta.anio)}.</p></div><div class="pid-table-wrap"><table class="pid-table"><thead><tr><th>Código</th><th>Rama</th><th>Puntaje</th><th>Fecha</th></tr></thead><tbody>${rows.length ? rows.map(item => `<tr><td>${esc(item.codigo || '-')}</td><td>${esc(item.rama || '-')}</td><td>${esc(item.puntaje || '-')}</td><td>${esc(item.fecha || '-')}</td></tr>`).join('') : '<tr><td colspan="4">No se encontraron filas de puntaje en la oblea.</td></tr>'}</tbody></table></div>`;
  }
  async function consultar() {
    const dni = clean(byId('pid-dni')?.value || '').replace(/\D+/g, '');
    const listado = clean(byId('pid-listado')?.value || '');
    const anio = clean(byId('pid-anio')?.value || '');
    const button = byId('btn-pid-consultar');
    const box = byId('panel-pid-resultado');
    const label = LISTADOS.find(item => item.value === listado)?.label || listado;

    if (!/^\d{7,8}$/.test(dni)) return setMsg('Ingresá un DNI válido de 7 u 8 dígitos.', 'error');
    if (!/^\d{4}$/.test(anio)) return setMsg('Ingresá un año válido de 4 dígitos.', 'error');
    if (!listado) return setMsg('Elegí un listado.', 'error');

    if (button && typeof window.btnLoad === 'function') window.btnLoad(button, 'Buscando...');
    else if (button) button.disabled = true;
    if (box) box.innerHTML = '<p class="ph">Consultando oblea PID...</p>';
    setMsg('Consultando oblea PID...', 'info');

    try {
      const res = await fetch(`${getApiBase()}/api/pid-consultar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni, listado, anio: Number(anio) })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo consultar PID.');
      render(data.result || {}, { dni, anio, label });
      setMsg('Consulta PID realizada correctamente.', 'ok');
    } catch (err) {
      if (box) box.innerHTML = `<div class="empty-state"><p>No se pudo consultar la oblea PID.</p><p class="empty-hint">${esc(err?.message || 'Error desconocido')}</p></div>`;
      setMsg(err?.message || 'No se pudo consultar PID.', 'error');
    } finally {
      if (button && typeof window.btnRestore === 'function') window.btnRestore(button);
      else if (button) button.disabled = false;
    }
  }
  function bindEvents() {
    const btn = byId('btn-pid-consultar');
    const dni = byId('pid-dni');
    if (btn && btn.dataset.bound !== '1') {
      btn.dataset.bound = '1';
      btn.addEventListener('click', consultar);
    }
    if (dni && dni.dataset.bound !== '1') {
      dni.dataset.bound = '1';
      dni.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); consultar(); } });
    }
  }
  function boot() {
    ensureStyles();
    ensureCard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

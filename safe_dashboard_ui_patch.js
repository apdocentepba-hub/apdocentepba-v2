(function () {
  'use strict';

  if (window.__apdStableDashboardBootstrapLoaded) return;
  window.__apdStableDashboardBootstrapLoaded = true;

  function byId(id) { return document.getElementById(id); }
  function panel() { return byId('panel-content'); }

  function ensureScript(src, markerId) {
    if (markerId && byId(markerId)) return;
    if ([...document.scripts].some(s => s.src && s.src.includes(src))) return;
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    if (markerId) s.id = markerId;
    document.body.appendChild(s);
  }

  function prefsCardHtml() {
    return `
      <div id="panel-preferencias-editor-card" class="panel-card span-12 prefs-card">
        <div class="card-lbl-row">
          <span class="card-lbl">🧩 Editar preferencias reales</span>
          <div class="mini-group">
            <button id="btn-clear-distritos" class="mini-btn" type="button">Limpiar distritos</button>
            <button id="btn-clear-cargos" class="mini-btn" type="button">Limpiar cargos</button>
          </div>
        </div>
        <p id="prefs-plan-hint" class="prefs-hint">Cargando límites del plan...</p>
        <form id="form-preferencias" novalidate>
          <div class="grid-2">
            <div class="field" id="field-distrito-1">
              <label id="label-distrito-1" for="pref-distrito-principal">Distrito principal</label>
              <input type="text" id="pref-distrito-principal" autocomplete="off" placeholder="Ej: LA MATANZA">
              <div id="sug-distrito-1" class="ac-list"></div>
            </div>
            <div class="field" id="field-distrito-2">
              <label id="label-distrito-2" for="pref-segundo-distrito">Segundo distrito</label>
              <input type="text" id="pref-segundo-distrito" autocomplete="off" placeholder="Opcional">
              <div id="sug-distrito-2" class="ac-list"></div>
            </div>
          </div>

          <div class="grid-3">
            <div class="field" id="field-distrito-3">
              <label id="label-distrito-3" for="pref-tercer-distrito">Tercer distrito</label>
              <input type="text" id="pref-tercer-distrito" autocomplete="off" placeholder="Opcional">
              <div id="sug-distrito-3" class="ac-list"></div>
            </div>
            <div class="field" id="field-distrito-4">
              <label id="label-distrito-4" for="pref-cuarto-distrito">Cuarto distrito</label>
              <input type="text" id="pref-cuarto-distrito" autocomplete="off" placeholder="Opcional">
              <div id="sug-distrito-4" class="ac-list"></div>
            </div>
            <div class="field" id="field-distrito-5">
              <label id="label-distrito-5" for="pref-quinto-distrito">Quinto distrito</label>
              <input type="text" id="pref-quinto-distrito" autocomplete="off" placeholder="Opcional">
              <div id="sug-distrito-5" class="ac-list"></div>
            </div>
          </div>

          <p id="districts-hint" class="prefs-hint">(hasta 1)</p>

          <div class="grid-2">
            <div class="field" id="field-cargo-1">
              <label id="label-cargo-1" for="pref-cargo-1">Cargo / Materia 1</label>
              <input type="text" id="pref-cargo-1" autocomplete="off" placeholder="Ej: (PR) PRECEPTOR">
              <div id="sug-cargo-1" class="ac-list"></div>
            </div>
            <div class="field" id="field-cargo-2">
              <label id="label-cargo-2" for="pref-cargo-2">Cargo / Materia 2</label>
              <input type="text" id="pref-cargo-2" autocomplete="off" placeholder="Ej: (NTI) NTICX">
              <div id="sug-cargo-2" class="ac-list"></div>
            </div>
          </div>

          <div class="grid-2">
            <div class="field" id="field-cargo-3">
              <label id="label-cargo-3" for="pref-cargo-3">Cargo / Materia 3</label>
              <input type="text" id="pref-cargo-3" autocomplete="off">
              <div id="sug-cargo-3" class="ac-list"></div>
            </div>
            <div class="field" id="field-cargo-4">
              <label id="label-cargo-4" for="pref-cargo-4">Cargo / Materia 4</label>
              <input type="text" id="pref-cargo-4" autocomplete="off">
              <div id="sug-cargo-4" class="ac-list"></div>
            </div>
          </div>

          <div class="grid-2">
            <div class="field" id="field-cargo-5">
              <label id="label-cargo-5" for="pref-cargo-5">Cargo / Materia 5</label>
              <input type="text" id="pref-cargo-5" autocomplete="off">
              <div id="sug-cargo-5" class="ac-list"></div>
            </div>
            <div class="field" id="field-cargo-6">
              <label id="label-cargo-6" for="pref-cargo-6">Cargo / Materia 6</label>
              <input type="text" id="pref-cargo-6" autocomplete="off">
              <div id="sug-cargo-6" class="ac-list"></div>
            </div>
          </div>

          <div class="grid-2">
            <div class="field" id="field-cargo-7">
              <label id="label-cargo-7" for="pref-cargo-7">Cargo / Materia 7</label>
              <input type="text" id="pref-cargo-7" autocomplete="off">
              <div id="sug-cargo-7" class="ac-list"></div>
            </div>
            <div class="field" id="field-cargo-8">
              <label id="label-cargo-8" for="pref-cargo-8">Cargo / Materia 8</label>
              <input type="text" id="pref-cargo-8" autocomplete="off">
              <div id="sug-cargo-8" class="ac-list"></div>
            </div>
          </div>

          <div class="grid-2">
            <div class="field" id="field-cargo-9">
              <label id="label-cargo-9" for="pref-cargo-9">Cargo / Materia 9</label>
              <input type="text" id="pref-cargo-9" autocomplete="off">
              <div id="sug-cargo-9" class="ac-list"></div>
            </div>
            <div class="field" id="field-cargo-10">
              <label id="label-cargo-10" for="pref-cargo-10">Cargo / Materia 10</label>
              <input type="text" id="pref-cargo-10" autocomplete="off">
              <div id="sug-cargo-10" class="ac-list"></div>
            </div>
          </div>

          <p id="cargos-hint" class="prefs-hint">(hasta 2)</p>

          <div class="grid-2">
            <div class="field">
              <label for="pref-turnos">Turno</label>
              <select id="pref-turnos">
                <option value="">Cualquier turno</option>
                <option value="M">Mañana</option>
                <option value="T">Tarde</option>
                <option value="V">Vespertino</option>
                <option value="N">Noche</option>
                <option value="ALTERNADO">Alternado</option>
              </select>
            </div>
            <div class="field">
              <label>Nivel / modalidad</label>
              <div class="checks-grid">
                <label><input type="checkbox" name="pref-nivel-modalidad" value="INICIAL"> Inicial</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="PRIMARIO"> Primario</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="SECUNDARIO"> Secundario</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="SUPERIOR"> Superior / Formación Docente</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="EDUCACION ESPECIAL"> Educación Especial</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="ADULTOS"> Jóvenes y Adultos</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="EDUCACION FISICA"> Educación Física</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="PSICOLOGIA"> Psicología Comunitaria y Pedagogía Social</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="EDUCACION ARTISTICA"> Educación Artística</label>
                <label><input type="checkbox" name="pref-nivel-modalidad" value="TECNICO PROFESIONAL"> Educación Técnico-Profesional</label>
              </div>
            </div>
          </div>

          <div class="checks-grid">
            <label><input type="checkbox" id="pref-alertas-activas"> Alertas activas</label>
            <label><input type="checkbox" id="pref-alertas-email"> Avisar por email</label>
            <label><input type="checkbox" id="pref-alertas-whatsapp"> Avisar por WhatsApp</label>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Guardar preferencias</button>
          </div>
          <span id="preferencias-msg" class="msg"></span>
        </form>
      </div>
    `;
  }

  function historicoCardHtml() {
    return `
      <div id="panel-historico-apd-card" class="panel-card span-12">
        <div class="card-lbl-row">
          <span class="card-lbl">🕘 Histórico APD / estadísticas</span>
          <button id="btn-refresh-historico" class="mini-btn" type="button">Actualizar histórico</button>
        </div>
        <div id="panel-historico-apd"><p class="ph">Cargando histórico APD...</p></div>
      </div>
    `;
  }

  function ensurePrefsCard() {
    const root = panel();
    if (!root || byId('form-preferencias')) return;
    const anchor = byId('panel-historial')?.closest('.panel-card');
    if (anchor) anchor.insertAdjacentHTML('afterend', prefsCardHtml());
    else root.insertAdjacentHTML('beforeend', prefsCardHtml());
  }

  function ensureHistoricoCard() {
    const root = panel();
    if (!root || byId('panel-historico-apd')) return;
    root.insertAdjacentHTML('beforeend', historicoCardHtml());
  }

  function trimLegacyUiNoise() {
    byId('panel-market-banner')?.remove();
    byId('panel-quick-actions')?.remove();
    byId('panel-premium-reasons')?.remove();
  }

  function loadUsefulPatches() {
    ensureScript('autocomplete_fast_patch.js?v=1', 'apd-fast-autocomplete-script');
    ensureScript('panel_tabs_patch.js?v=1', 'apd-panel-tabs-script');
    ensureScript('plan_checkout_patch.js?v=1', 'apd-plan-checkout-script');
  }

  function refreshTabs() {
    if (typeof window.APD_refreshPanelTabs === 'function') {
      setTimeout(() => window.APD_refreshPanelTabs(), 0);
    }
  }

  function bootPass() {
    ensurePrefsCard();
    ensureHistoricoCard();
    trimLegacyUiNoise();
    loadUsefulPatches();
    refreshTabs();
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      bootPass();
      if (tries < 12 && (!byId('form-preferencias') || !byId('panel-historico-apd'))) {
        setTimeout(tick, 700);
      }
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

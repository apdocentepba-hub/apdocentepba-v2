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

  function removeCardByBodyId(bodyId) {
    const body = byId(bodyId);
    const card = body?.closest('.panel-card');
    if (card) card.remove();
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
          <span class="card-lbl">📈 Estadísticas históricas</span>
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
    byId('panel-safe-quicknav')?.remove();
    byId('btn-logout')?.remove();
    removeCardByBodyId('panel-backfill-provincia');
    removeCardByBodyId('panel-historial');
    removeCardByBodyId('panel-radar-provincia');
    removeCardByBodyId('panel-historico-docente');
  }

 function loadUsefulPatches() {
  // no-op:
  // index.html ya carga los scripts vigentes.
  // no volver a inyectar loaders legacy desde acá.
}
  function bindDynamicPanelEvents() {
    const g = globalThis;
    const form = byId('form-preferencias');

    if (form && form.dataset.apdSubmitBound !== '1' && typeof g.guardarPreferencias === 'function') {
      form.addEventListener('submit', g.guardarPreferencias);
      form.dataset.apdSubmitBound = '1';
    }

    const btnDistritos = byId('btn-clear-distritos');
    if (btnDistritos && btnDistritos.dataset.apdClickBound !== '1' && typeof g.limpiarDistritos === 'function') {
      btnDistritos.addEventListener('click', g.limpiarDistritos);
      btnDistritos.dataset.apdClickBound = '1';
    }

    const btnCargos = byId('btn-clear-cargos');
    if (btnCargos && btnCargos.dataset.apdClickBound !== '1' && typeof g.limpiarCargos === 'function') {
      btnCargos.addEventListener('click', g.limpiarCargos);
      btnCargos.dataset.apdClickBound = '1';
    }

    const btnHistorico = byId('btn-refresh-historico');
    if (btnHistorico && btnHistorico.dataset.apdClickBound !== '1') {
      btnHistorico.addEventListener('click', async () => {
        const token = typeof g.obtenerToken === 'function' ? g.obtenerToken() : null;
        if (!token) return;

        if (typeof g.btnLoad === 'function') g.btnLoad(btnHistorico, 'Actualizando...');
        else btnHistorico.disabled = true;

        if (typeof g.setHTML === 'function') {
          g.setHTML('panel-historico-apd', '<p class="ph">Actualizando histórico APD...</p>');
        }

        try {
          if (typeof g.capturarHistoricoAPD === 'function') {
            await g.capturarHistoricoAPD(token);
          }
          if (typeof g.cargarHistoricoPanel === 'function') {
            await g.cargarHistoricoPanel(token);
          }
          if (typeof g.APD_mountStatisticsBanner === 'function') {
            g.APD_mountStatisticsBanner();
          }
        } catch (err) {
          console.error('ERROR CAPTURANDO HISTORICO:', err);
          if (typeof g.setHTML === 'function' && typeof g.esc === 'function') {
            g.setHTML('panel-historico-apd', `
              <div class="empty-state">
                <p>No pudimos actualizar el histórico.</p>
                <p class="empty-hint">${g.esc(err?.message || 'Intentá de nuevo en un rato.')}</p>
              </div>
            `);
          }
        } finally {
          if (typeof g.btnRestore === 'function') g.btnRestore(btnHistorico);
          else btnHistorico.disabled = false;
        }
      });
      btnHistorico.dataset.apdClickBound = '1';
    }

    if (form && form.dataset.apdAutocompleteBound !== '1') {
      if (typeof g.initPlanAutocompleteFields === 'function') {
        g.initPlanAutocompleteFields();
      }
      if (typeof g.cargarCatalogoDistritosAutocomplete === 'function') {
        g.cargarCatalogoDistritosAutocomplete().catch(err => {
          console.error('ERROR PRELOAD DISTRITOS DINAMICO:', err);
        });
      }
      form.dataset.apdAutocompleteBound = '1';
    }

    if (typeof g.applyPlanFieldVisibility === 'function') {
      g.applyPlanFieldVisibility();
    }
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
    bindDynamicPanelEvents();
    refreshTabs();
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      bootPass();
      if (tries < 12 && !byId('form-preferencias')) {
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

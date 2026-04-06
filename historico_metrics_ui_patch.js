(function () {
  'use strict';

  if (window.__apdHistoricoMetricsPatchLoaded) return;
  window.__apdHistoricoMetricsPatchLoaded = true;

  function parseMetricValue(text) {
    const raw = String(text || '').trim();
    if (!raw || raw === '-') return null;
    const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  function ensureClarification(box) {
    if (!box || box.querySelector('.historico-clarification')) return;
    const head = box.querySelector('.historico-head');
    if (!head) return;
    const note = document.createElement('p');
    note.className = 'historico-note historico-clarification';
    note.textContent = 'Competencia visible: estos datos se muestran solo cuando hay muestra suficiente. “1° visible” no significa adjudicado o ganador.';
    head.insertAdjacentElement('afterend', note);
  }

  function patchHistoricoBox() {
    const box = document.getElementById('panel-historico-apd');
    if (!box) return;

    ensureClarification(box);

    box.querySelectorAll('.historico-box h4').forEach(h4 => {
      const t = String(h4.textContent || '').trim();
      if (t === 'Lectura rápida') {
        h4.textContent = 'Lectura rápida del histórico';
      }
    });

    box.querySelectorAll('.historico-chip').forEach(chip => {
      const txt = String(chip.textContent || '').trim();

      if (/^Promedio postulantes:/i.test(txt)) {
        const value = parseMetricValue(txt.split(':').slice(1).join(':'));
        if (value == null || value <= 0) {
          chip.remove();
          return;
        }
        chip.textContent = txt.replace(/^Promedio postulantes:/i, 'Promedio de postulantes visibles:');
        return;
      }

      if (/^Puntaje del primero:/i.test(txt)) {
        const value = parseMetricValue(txt.split(':').slice(1).join(':'));
        if (value == null || value <= 0) {
          chip.remove();
          return;
        }
        chip.textContent = txt.replace(/^Puntaje del primero:/i, 'Promedio del 1° visible:');
      }
    });

    const lecturaBox = Array.from(box.querySelectorAll('.historico-box')).find(el => {
      const h4 = el.querySelector('h4');
      return h4 && /Lectura rápida del histórico/i.test(h4.textContent || '');
    });

    if (lecturaBox) {
      const comp = lecturaBox.querySelector('.historico-competition');
      if (comp) {
        const chips = comp.querySelectorAll('.historico-chip');
        const hasCompetition = Array.from(chips).some(chip => /postulantes visibles|1° visible/i.test(chip.textContent || ''));
        if (!hasCompetition && !comp.querySelector('.historico-chip-empty')) {
          const empty = document.createElement('span');
          empty.className = 'historico-chip historico-chip-empty';
          empty.textContent = 'Competencia visible: todavía no hay base suficiente.';
          comp.appendChild(empty);
        }
      }
    }
  }

  function patchPostulantesMeta() {
    const box = document.getElementById('alerta-postulantes-meta');
    if (!box) return;

    const head = box.querySelector('.alerta-meta-head');
    if (head) {
      head.textContent = 'Referencia de competencia visible';
    }

    box.querySelectorAll('.alerta-meta-item').forEach(item => {
      const k = item.querySelector('.alerta-meta-k');
      const v = item.querySelector('.alerta-meta-v');
      if (!k || !v) return;

      const label = String(k.textContent || '').trim();
      const valueText = String(v.textContent || '').trim();
      const numeric = parseMetricValue(valueText);

      if (/^Postulantes$/i.test(label)) {
        k.textContent = 'Postulantes visibles';
        if (numeric == null || numeric <= 0) item.remove();
        return;
      }

      if (/^Puntaje del primero$/i.test(label)) {
        k.textContent = 'Puntaje del 1° visible';
        if (numeric == null || numeric <= 0) item.remove();
        return;
      }

      if (/^Listado del primero$/i.test(label)) {
        k.textContent = 'Listado del 1° visible';
        if (!valueText || valueText === '-') item.remove();
      }
    });

    const grid = box.querySelector('.alerta-meta-grid');
    if (grid && !grid.children.length) {
      grid.remove();
    }

    if (!box.querySelector('.alerta-meta-grid') && !box.querySelector('.alerta-meta-empty')) {
      const empty = document.createElement('div');
      empty.className = 'alerta-meta-empty';
      empty.textContent = 'Todavía no hay base suficiente para mostrar competencia visible confiable.';
      box.appendChild(empty);
    }
  }

  function boot() {
    patchHistoricoBox();
    patchPostulantesMeta();

    const historico = document.getElementById('panel-historico-apd');
    if (historico && historico.dataset.metricsPatchObserved !== '1') {
      historico.dataset.metricsPatchObserved = '1';
      const obs = new MutationObserver(function () {
        patchHistoricoBox();
      });
      obs.observe(historico, { childList: true, subtree: true });
    }

    const panelAlertas = document.getElementById('panel-alertas');
    if (panelAlertas && panelAlertas.dataset.metricsPatchObserved !== '1') {
      panelAlertas.dataset.metricsPatchObserved = '1';
      const obs = new MutationObserver(function () {
        patchPostulantesMeta();
      });
      obs.observe(panelAlertas, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const src = readFileSync(new URL('../growth_activation_guide.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function harness(options = {}) {
  const defaults = {
    district: '(sin filtro)',
    cargo: '(sin filtro)',
    alerts: 'Pausadas',
    loading: false
  };
  const values = { ...defaults, ...options };
  const nav = [];
  const timers = [];
  const events = [];
  const registry = {};

  const button = {
    id: 'apd-growth-guide-action',
    handlers: {},
    addEventListener(type, callback) { this.handlers[type] = callback; },
    click() { assert.equal(typeof this.handlers.click, 'function'); this.handlers.click(); },
    textContent: ''
  };
  const title = { id: 'apd-growth-guide-title', textContent: '' };
  const description = { id: 'apd-growth-guide-desc', textContent: '' };
  const input = { focus() { events.push('focus'); } };
  const form = {
    querySelector() { return input; },
    scrollIntoView() { events.push('scroll'); }
  };
  registry[button.id] = button;
  registry[title.id] = title;
  registry[description.id] = description;
  registry['form-preferencias'] = form;
  registry['pref-distrito-principal'] = input;

  const header = {};
  const parent = {
    querySelector(selector) { return selector === '.panel-header' ? header : null; },
    insertBefore(node) { registry[node.id] = node; events.push('insert-guide'); },
    firstChild: header
  };
  header.parentNode = parent;
  const panel = {
    querySelector(selector) { return selector === '.container' ? parent : null; }
  };
  const summary = {
    querySelectorAll() {
      if (values.loading) return [];
      return [
        ['Distritos:', values.district],
        ['Cargos/Materias:', values.cargo],
        ['Alertas:', values.alerts]
      ].map(([name, value]) => ({
        textContent: name + ' ' + value,
        querySelector(selector) {
          return selector === 'strong' ? { textContent: name } : null;
        }
      }));
    }
  };

  registry['panel-docente'] = panel;
  registry['panel-preferencias-resumen'] = summary;
  const document = {
    readyState: 'complete',
    head: { appendChild(node) { registry[node.id] = node; } },
    getElementById(id) { return registry[id] || null; },
    createElement(tag) {
      return { tagName: tag, id: '', hidden: false, innerHTML: '', textContent: '',
        setAttribute() {}, addEventListener() {} };
    }
  };
  const window = {
    APD_activatePanelTab(id, selected) { nav.push([id, selected]); }
  };
  let onMutation = null;
  class MutationObserver {
    constructor(callback) { onMutation = callback; }
    observe() { events.push('observe'); }
  }
  const context = { window, document, MutationObserver, setTimeout(fn) { timers.push(fn); } };
  vm.runInNewContext(src, context, { filename: 'growth_activation_guide.js' });
  return {
    get guide() { return registry['apd-growth-activation-guide']; },
    get title() { return title.textContent; },
    get description() { return description.textContent; },
    get button() { return button; },
    get events() { return events; },
    get nav() { return nav; },
    rerender(changes) { Object.assign(values, changes); if (onMutation) onMutation(); },
    click() { button.click(); timers.forEach(fn => fn()); }
  };
}

test('el index carga la guía después de los parches del panel', () => {
  const guideScript = index.indexOf('growth_activation_guide.js?v=1');
  const patchScript = index.indexOf('panel_tabs_patch.js?');
  assert.ok(guideScript > patchScript);
  assert.equal(index.split('growth_activation_guide.js?v=1').length - 1, 1);
});

test('no consulta ni envía datos personales por su cuenta', () => {
  assert.doesNotMatch(src, /\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|navigator\.sendBeacon/);
  assert.doesNotMatch(src, /\.submit\s*\(|\.checked\s*=|\.value\s*=/);
});

test('se mantiene oculta hasta que el resumen tenga los datos', () => {
  const h = harness({ loading: true });
  assert.equal(h.guide.hidden, true);
  h.rerender({ loading: false });
  assert.equal(h.guide.hidden, false);
});

test('al faltar distrito y cargo ofrece completar ambos', () => {
  const h = harness();
  assert.equal(h.guide.hidden, false);
  assert.match(h.description, /distrito y un cargo o materia/);
  assert.equal(h.button.textContent, 'Elegir mis filtros');
});

test('detecta distrito vacío aunque el cargo esté configurado', () => {
  const h = harness({ cargo: '(NTI) NTICX', alerts: 'Activas' });
  assert.match(h.description, /al menos un distrito/);
  assert.doesNotMatch(h.description, /al menos un cargo o materia/);
});

test('detecta cargo vacío aunque haya distrito', () => {
  const h = harness({ district: 'AVELLANEDA', alerts: 'Activas' });
  assert.match(h.description, /al menos un cargo o materia/);
  assert.doesNotMatch(h.description, /al menos un distrito/);
});

test('para preferencias completas con alertas activas se oculta', () => {
  const h = harness({ district: 'AVELLANEDA', cargo: 'PRECEPTOR', alerts: 'Activas' });
  assert.equal(h.guide.hidden, true);
});

test('para alertas pausadas no promete entregas ni modifica la preferencia', () => {
  const h = harness({ district: 'AVELLANEDA', cargo: 'PRECEPTOR', alerts: 'Pausadas' });
  assert.equal(h.guide.hidden, false);
  assert.match(h.title, /pausadas/);
  assert.match(h.description, /vigencia de tu plan/);
  assert.equal(h.button.textContent, 'Revisar alertas y canales');
});

test('la guía se oculta tras completar preferencias y activar alertas', () => {
  const h = harness();
  assert.equal(h.guide.hidden, false);
  h.rerender({ district: 'AVELLANEDA', cargo: 'PR', alerts: 'Activas' });
  assert.equal(h.guide.hidden, true);
});

test('el CTA lleva a Preferencias y enfoca el editor, sin enviar formularios', () => {
  const h = harness();
  h.click();
  assert.deepEqual(h.nav, [['preferencias', true]]);
  assert.ok(h.events.includes('scroll'));
  assert.ok(h.events.includes('focus'));
});

test('la guía se crea una sola vez incluso ante varias actualizaciones', () => {
  const h = harness();
  h.rerender({ district: 'AVELLANEDA' });
  h.rerender({ cargo: 'PR' });
  h.rerender({ alerts: 'Activas' });
  assert.equal(h.events.filter(event => event === 'insert-guide').length, 1);
});

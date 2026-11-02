import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const app = readFileSync(new URL('../app_v2.js', import.meta.url), 'utf8');
const start = app.indexOf('async function registrarDocente(e) {');
const end = app.indexOf('\nasync function loginPassword(e) {', start);
if (start < 0 || end < 0) throw new Error('No se encontró la función de registro existente');
const registerSource = app.slice(start, end);

async function setup({ ok = true, serverMessage = 'Listo', fieldOverrides = {} } = {}) {
  const fields = {
    'reg-nombre': 'Docente',
    'reg-apellido': 'Ejemplo',
    'reg-email': 'Docente.Test@Ejemplo.org',
    'reg-celular': '',
    'reg-password': 'clave-prueba-no-real',
    ...fieldOverrides
  };
  const events = [];
  const loginEmail = {
    value: '',
    focus() { events.push('loginFocus'); }
  };
  const form = { reset() { events.push('registerReset'); } };
  const submitButton = { disabled: false };
  const messages = [];
  const network = [];
  const pending = [];
  const context = vm.createContext({
    API_URL: 'https://ejemplo.invalid',
    document: {
      getElementById(id) {
        if (id === 'login-email') return loginEmail;
        if (id === 'form-registro') return form;
        return null;
      },
      querySelector() { return submitButton; }
    },
    val(id) { return fields[id] || ''; },
    btnLoad(button, status) { events.push(['loading', status]); },
    showMsg(id, message, kind) { messages.push({ id, message, kind }); },
    mostrarSeccion(page) { events.push(['page', page]); },
    setTimeout(fn, delay) { pending.push({ fn, delay }); },
    async fetch(url, options) {
      network.push({ url, options });
      return {
        async text() { return JSON.stringify(ok ? { ok: true, message: serverMessage } : { ok: false, error: 'Ya existe la cuenta' }); }
      };
    },
    console: { error(...args) { events.push(['error', args.length]); } }
  });
  vm.runInContext(registerSource, context);
  const event = { submitter: submitButton, preventDefault() { events.push('preventDefault'); } };
  await context.registrarDocente(event);
  return { fields, loginEmail, form, events, messages, network, pending };
}

test('registro válido conserva el correo normalizado en el login, nunca la clave', async () => {
  const h = await setup();
  assert.equal(h.loginEmail.value, 'docente.test@ejemplo.org');
  assert.ok(!h.loginEmail.value.includes('clave-prueba'));
  assert.deepEqual(h.network.map(n => new URL(n.url).pathname), ['/api/register']);
  assert.deepEqual(h.events.filter(e => e === 'registerReset'), ['registerReset']);
  assert.match(h.messages[0].message, /Registrando|Procesando/);
  assert.equal(h.pending.length, 1);
  h.pending[0].fn();
  assert.deepEqual(h.events.filter(Array.isArray).filter(e => e[0] === 'page'), [['page', 'login']]);
  assert.ok(h.events.includes('loginFocus'));
});

test('login solo se abre después de una respuesta satisfactoria', async () => {
  const h = await setup({ ok: false });
  assert.equal(h.pending.length, 0);
  assert.equal(h.loginEmail.value, '');
  assert.ok(h.messages.some(m => m.kind === 'error'));
});

test('campos incompletos bloquean el registro antes del POST', async () => {
  for (const field of ['reg-nombre', 'reg-apellido', 'reg-email', 'reg-password']) {
    const h = await setup({ fieldOverrides: { [field]: '' } });
    assert.equal(h.network.length, 0, field + ' no bloqueó el POST');
    assert.equal(h.pending.length, 0);
    assert.ok(h.messages.some(m => m.kind === 'error'), field + ' sin error visible');
  }
});

test('el único POST del registro mantiene el contrato vigente', async () => {
  const h = await setup();
  assert.equal(h.network.length, 1);
  const body = JSON.parse(h.network[0].options.body);
  assert.equal(body.email, 'docente.test@ejemplo.org');
  assert.equal(body.password, 'clave-prueba-no-real');
  assert.equal(h.network[0].options.method, 'POST');
});

test('la UX no añade almacenamiento local ni alteraciones de auth', () => {
  assert.doesNotMatch(registerSource, /localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(registerSource, /login-password|guardarToken|apd_session_token/);
});

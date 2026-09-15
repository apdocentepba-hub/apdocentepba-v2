import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const PATCH_PATH = new URL('../auth_session_patch.js', import.meta.url);
const patchSource = fs.readFileSync(PATCH_PATH, 'utf8');
const WORKER_URL = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION = 'session-token-abc';

function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    dump() { return Object.fromEntries(map.entries()); }
  };
}

function response(status, body) {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return text; },
    async json() { return body; }
  };
}

function createHarness({ workerStatus = 200, workerBody = { ok: true, resultados: [{ id: 'a1' }] } } = {}) {
  const storage = makeStorage({
    apd_token_v2: USER_ID,
    apd_session_token_v1: SESSION
  });
  const fetchCalls = [];
  const workerCalls = [];
  const shownSections = [];
  let navRefreshes = 0;
  let userToken = USER_ID;

  const fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return response(workerStatus, workerBody);
  };

  const document = {
    readyState: 'complete',
    getElementById() { return null; },
    addEventListener() {}
  };

  const window = {
    obtenerToken() { return userToken; },
    guardarToken(value) {
      userToken = String(value || '').trim();
      storage.setItem('apd_token_v2', userToken);
      return true;
    },
    borrarToken() {
      userToken = '';
      storage.removeItem('apd_token_v2');
    },
    actualizarNav() { navRefreshes += 1; },
    mostrarSeccion(id) { shownSections.push(id); },
    filtrarAlertasVigentes(items) { return items; },
    async workerFetchJson(path, options = {}) {
      workerCalls.push({ path, options });
      const headers = { ...(options.headers || {}) };
      const res = await fetch(`${WORKER_URL}${path}`, { ...options, headers });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { throw new Error('El Worker no devolvió JSON válido'); }
      if (!res.ok || !data?.ok) throw new Error(data?.message || data?.error || `Worker ${res.status}`);
      return data;
    },
    async obtenerMisAlertas(userId) {
      const res = await fetch(`${WORKER_URL}/api/mis-alertas?user_id=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.message || data?.error || 'No se pudieron cargar las alertas');
      return Array.isArray(data.resultados) ? data.resultados : [];
    }
  };

  const context = vm.createContext({
    window,
    localStorage: storage,
    document,
    fetch,
    console,
    setTimeout,
    clearTimeout
  });

  new vm.Script(patchSource, { filename: 'auth_session_patch.js' }).runInContext(context);

  return {
    window,
    storage,
    fetchCalls,
    workerCalls,
    shownSections,
    get navRefreshes() { return navRefreshes; }
  };
}

async function testMisAlertasUsesSessionBearer() {
  const h = createHarness();
  const rows = await h.window.obtenerMisAlertas(USER_ID);

  assert.equal(rows.length, 1, 'mis-alertas should still return the alert rows');
  const call = h.fetchCalls.find(entry => entry.url.includes('/api/mis-alertas?'));
  assert.ok(call, 'mis-alertas must call the Worker endpoint');
  assert.equal(
    call.options.headers?.Authorization,
    `Bearer ${SESSION}`,
    'mis-alertas must send the session Bearer'
  );
}

async function test401ClearsSessionAndReturnsToLogin() {
  const h = createHarness({
    workerStatus: 401,
    workerBody: { ok: false, error: 'Sesión vencida' }
  });

  await assert.rejects(
    () => h.window.workerFetchJson('/api/mi-plan?user_id=' + encodeURIComponent(USER_ID)),
    /Sesión vencida|401/
  );

  const state = h.storage.dump();
  assert.equal(state.apd_session_token_v1, undefined, '401 must clear the session Bearer');
  assert.equal(state.apd_token_v2, undefined, '401 must clear the cached user UUID');
  assert.ok(h.shownSections.includes('login'), '401 must return the browser to the login section');
  assert.ok(h.navRefreshes >= 1, '401 must refresh logged-in/logged-out navigation');
}

await testMisAlertasUsesSessionBearer();
await test401ClearsSessionAndReturnsToLogin();
console.log('auth session regression contract: OK');

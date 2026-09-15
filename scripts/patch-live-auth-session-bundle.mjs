import fs from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('usage: node scripts/patch-live-auth-session-bundle.mjs <input> <output>');
}

const source = fs.readFileSync(inputPath, 'utf8');
if (source.includes('LIVE_SESSION_AUTH_GATE_V1')) {
  throw new Error('input already contains LIVE_SESSION_AUTH_GATE_V1');
}

const wrapperStart = source.indexOf('var worker_hotfix_default = {');
if (wrapperStart < 0) throw new Error('worker_hotfix_default wrapper not found');
const pathMarker = '    const path = url.pathname;';
const insertAtBase = source.indexOf(pathMarker, wrapperStart);
if (insertAtBase < 0) throw new Error('top-level path marker not found');
const wrapperEnd = source.indexOf('\nasync scheduled(', wrapperStart);
if (wrapperEnd < 0 || insertAtBase > wrapperEnd) throw new Error('path marker is outside top-level fetch wrapper');

const insertion = `

    // LIVE_SESSION_AUTH_GATE_V1: protected user routes must derive identity from an active session.
    const protectedSessionGetPaths = new Set([
      \`${'${API_URL_PREFIX3}'}/mi-plan\`,
      \`${'${API_URL_PREFIX3}'}/mis-alertas\`,
      \`${'${API_URL_PREFIX3}'}/historico-resumen\`
    ]);
    const protectedSessionPostPaths = new Set([
      \`${'${API_URL_PREFIX3}'}/guardar-preferencias\`,
      \`${'${API_URL_PREFIX3}'}/capturar-historico-apd\`,
      \`${'${API_URL_PREFIX3}'}/mercadopago/create-checkout-link\`,
      \`${'${API_URL_PREFIX3}'}/whatsapp/test-send\`
    ]);
    if (protectedSessionGetPaths.has(path) || protectedSessionPostPaths.has(path)) {
      const authUser = await getSessionUserByBearer(env, request);
      if (!authUser?.id) return json2({ ok: false, message: "No autenticado" }, 401);

      if (request.method === "GET" || request.method === "HEAD") {
        url.searchParams.set("user_id", authUser.id);
        request = new Request(url.toString(), {
          method: request.method,
          headers: new Headers(request.headers)
        });
      } else {
        const contentType = request.headers.get("Content-Type") || request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return json2({ ok: false, message: "Content-Type no soportado" }, 415);
        }
        const body = await request.clone().json().catch(() => ({}));
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        request = new Request(request.url, {
          method: request.method,
          headers,
          body: JSON.stringify({ ...(body || {}), user_id: authUser.id })
        });
      }
    }
`;

const insertAt = insertAtBase + pathMarker.length;
const patched = source.slice(0, insertAt) + insertion + source.slice(insertAt);
if (patched === source) throw new Error('patch produced no change');
if ((patched.match(/LIVE_SESSION_AUTH_GATE_V1/g) || []).length !== 1) {
  throw new Error('auth gate marker must occur exactly once');
}

fs.writeFileSync(outputPath, patched);
console.log(`patched ${inputPath} -> ${outputPath}; +${Buffer.byteLength(patched) - Buffer.byteLength(source)} bytes`);

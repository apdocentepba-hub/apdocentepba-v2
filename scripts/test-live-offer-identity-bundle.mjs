import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
assert.ok(file, 'usage: node scripts/test-live-offer-identity-bundle.mjs <worker_hotfix.js>');
const source = fs.readFileSync(file, 'utf8');

function extractNamedFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`could not extract ${name}`);
}

const names = ['canonicalOfferIdentity', 'getOfferId', 'normalizeOfferPayload'];
const helpers = names.filter(n => source.includes(`function ${n}(`)).map(extractNamedFunction).join('\n');
const context = {};
vm.createContext(context);
vm.runInContext(helpers, context);

const conflicting = {
  offer_id: '4294581',
  idoferta: '4294581',
  iddetalle: '4278473',
  source_offer_key: 'D_4278473',
  cargo: 'PRECEPTOR (/PR)',
  distrito: 'GENERAL SAN MARTIN'
};

assert.equal(context.getOfferId(conflicting), 'D_4278473', 'LIVE_OFFER_IDENTITY_V1: iddetalle must win over numeric offer_id');
const normalized = context.normalizeOfferPayload(conflicting);
assert.equal(normalized.offer_id, 'D_4278473', 'LIVE_OFFER_IDENTITY_V1: payload offer_id must be canonical');
assert.equal(normalized.source_offer_key, 'D_4278473', 'LIVE_OFFER_IDENTITY_V1: source_offer_key must be canonical');

assert.equal(context.getOfferId({ offer_id: '4294581', idoferta: '4294581', iddetalle: '4278473' }), 'D_4278473', 'LIVE_OFFER_IDENTITY_V1: caller cannot override detail identity by omitting source_offer_key');
assert.equal(context.getOfferId({ idoferta: '4302225' }), 'O_4302225', 'LIVE_OFFER_IDENTITY_V1: idoferta fallback must be namespaced');
assert.equal(context.getOfferId({ offer_id: 'D_123' }), 'D_123', 'LIVE_OFFER_IDENTITY_V1: existing D_ keys remain stable');

console.log('LIVE_OFFER_IDENTITY_V1: ok');

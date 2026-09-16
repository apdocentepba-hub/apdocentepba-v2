import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

function extractNamedFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist in worker.js`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `${name} must have a body`);

  let depth = 0;
  let inString = null;
  let escaped = false;

  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`Could not extract ${name}`);
}

const context = {};
vm.createContext(context);
vm.runInContext(`${extractNamedFunction('getOfferId')}\n${extractNamedFunction('normalizeOfferPayload')}`, context);

const sameOfferFromTwoPipelines = {
  offer_id: '4294581',
  idoferta: '4294581',
  iddetalle: '4278473',
  source_offer_key: 'D_4278473',
  cargo: 'PRECEPTOR (/PR)',
  distrito: 'GENERAL SAN MARTIN'
};

assert.equal(
  context.getOfferId(sameOfferFromTwoPipelines),
  'D_4278473',
  'user_offer_state must key the offer by the canonical detail identity, not the numeric idoferta supplied by another pipeline'
);

assert.equal(
  context.normalizeOfferPayload(sameOfferFromTwoPipelines).offer_id,
  'D_4278473',
  'stored offer_payload.offer_id must use the same canonical identity as user_offer_state.offer_id'
);

console.log('offer identity regression: ok');

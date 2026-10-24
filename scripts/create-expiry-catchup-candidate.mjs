// Isolated opt-in candidate; never overwrites the canonical production Worker.
import fs from 'node:fs';
import path from 'node:path';
const input = 'worker-live/worker_hotfix.js';
const output = 'tmp/expiry-catchup-candidate/worker_hotfix.js';
let s = fs.readFileSync(input, 'utf8');
const opening = 'async function apdProcessExpiryNotices(env) {';
const closing = '\n__name(apdProcessExpiryNotices, "apdProcessExpiryNotices");';
const a = s.indexOf(opening);
const b = s.indexOf(closing, a + opening.length);
if (a === -1 || b === -1) throw Error('Cannot isolate production expiry function; refusing to patch');
const oldClause = 'if (!Number.isFinite(endTs) || endTs >= now || now - endTs > 7 * 864e5) continue;';
const block = s.slice(a, b);
if (block.split(oldClause).length !== 2) throw Error('Expiry guard changed; no candidate generated');
const nextClause = [
  '// Historical catch-up is strictly off unless explicitly enabled in Cloudflare.',
  '// Standard 7-day expiry notices preserve their existing behavior.',
  'const elapsedMs = now - endTs;',
  'const allowHistoricalCatchup = String(env.APD_EXPIRY_LEGACY_CATCHUP_ENABLED || "").toLowerCase() === "true";',
  'if (!Number.isFinite(endTs) || elapsedMs <= 0 || elapsedMs > (allowHistoricalCatchup ? 365 : 7) * 864e5) continue;'
].join('\n    ');
const changedBlock = block.replace(oldClause, nextClause);
s = s.slice(0, a) + changedBlock + s.slice(b);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, s);
console.log('Built isolated, disabled-by-default expiry catch-up candidate; no mails and no traffic changes.');

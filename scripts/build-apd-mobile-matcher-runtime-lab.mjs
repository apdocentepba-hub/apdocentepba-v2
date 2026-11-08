/**
 * Build ONLY the disposable workerd matcher fixture from current worker.js.
 * No production Worker, source project or public asset is modified.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {extractAPDMatcherWorkerRuntimeLab}
 from './apd-mobile-worker-matcher-readonly-lab.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const workerSource=readFileSync(resolve(root,'worker.js'),'utf8');
const generated=extractAPDMatcherWorkerRuntimeLab(workerSource);
const out=resolve(root,'scripts/fixtures/generated-apd-matcher-lab.mjs');
writeFileSync(out,generated,{encoding:'utf8',flag:'w',mode:0o600});
console.log(JSON.stringify({
 generated_only_in_ci:true,
 source:'worker.js',
 source_sha256:createHash('sha256').update(workerSource).digest('hex'),
 matcher_sha256:createHash('sha256').update(generated).digest('hex'),
 no_production_change:true
}));

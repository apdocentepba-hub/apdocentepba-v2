# Canonical Live Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the exact active AlertasAPD Worker bundle, commit it as a hash-verified canonical snapshot, and prove a future repository deploy can reproduce its structure without deploying during this migration.

**Architecture:** The existing read-only production smoke becomes the capture boundary. It exports the active modules and a sanitized manifest as an artifact; repository tests compare that artifact/snapshot deterministically. Only after equivalence is proven does Wrangler point at the canonical snapshot, while the production deploy guard remains active until dry-run packaging is verified.

**Tech Stack:** GitHub Actions, Node.js 22, Cloudflare Workers API, Wrangler 4.x, JavaScript ES modules.

**Spec:** `docs/superpowers/specs/2026-09-16-canonical-live-worker-design.md`

## Global Constraints

- Do not deploy or mutate the production Worker during this migration.
- Do not write secret binding values to artifacts, logs, manifests, or repository files.
- Keep `PRODUCTION_SOURCE_GUARD_V1` active until canonical snapshot equivalence and Wrangler dry-run checks are green.
- Active production selection must require exactly one version receiving 100% traffic.
- Canonical required modules are `worker_hotfix.js`, `email_queue_hotfix.js`, and `worker_email_queue_hotfix.js`.
- A source/hash mismatch must fail closed.

---

### Task 1: Persist the live bundle as a sanitized CI artifact

**Files:**
- Modify: `.github/workflows/smoke-live-worker-contracts.yml`
- Create: `scripts/test-live-capture-contract.mjs`

**Interfaces:**
- Consumes: active Worker JSON already downloaded to `tmp/live-worker-contract-smoke/active.json` and decoded module files in that directory.
- Produces: `tmp/live-worker-contract-smoke/manifest.json` and GitHub artifact `live-worker-canonical-capture`.

- [ ] **Step 1: Write the failing static contract**

Create `scripts/test-live-capture-contract.mjs` asserting that the smoke workflow contains:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/smoke-live-worker-contracts.yml', import.meta.url), 'utf8');
assert.match(workflow, /live-worker-canonical-capture/);
assert.match(workflow, /manifest\.json/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /module_sha256/);
assert.doesNotMatch(workflow, /content_base64.*manifest/i);
console.log('live capture contract: OK');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/test-live-capture-contract.mjs`
Expected: FAIL because the workflow does not yet upload `live-worker-canonical-capture` or produce `manifest.json`.

- [ ] **Step 3: Add sanitized manifest generation and artifact upload**

After decoding active modules, generate a manifest containing `version_id`, `main_module`, module names/hashes, binding `name`/`type`, Worker name, account id, and capture timestamp. Never include binding values. Upload only `manifest.json` and decoded `.js` files with `actions/upload-artifact@v4`, artifact name `live-worker-canonical-capture`.

- [ ] **Step 4: Verify GREEN and existing smoke**

Run: `node scripts/test-live-capture-contract.mjs`
Expected: PASS.

The PR-triggered smoke must also finish GREEN against the live Worker.

- [ ] **Step 5: Commit**

Commit message: `ci: persist sanitized live Worker capture`

---

### Task 2: Retrieve and inspect a fresh production capture

**Files:**
- No production code changes.
- Artifact consumed from the Task 1 PR workflow run.

**Interfaces:**
- Consumes: GitHub artifact `live-worker-canonical-capture`.
- Produces: verified local/canonical candidate with three required modules and manifest.

- [ ] **Step 1: Fetch the PR workflow run and artifact metadata**

Use the GitHub Actions run associated with the Task 1 head SHA. Require the smoke conclusion to be `success`.

- [ ] **Step 2: Download the artifact**

Download `live-worker-canonical-capture` and inspect its ZIP contents.

- [ ] **Step 3: Verify artifact invariants before committing source**

Require:

```text
manifest.json
worker_hotfix.js
email_queue_hotfix.js
worker_email_queue_hotfix.js
```

For every module, recompute SHA-256 and compare with `manifest.json`. Require `main_module === "worker_hotfix.js"` and exactly one captured `version_id`.

- [ ] **Step 4: Stop on any mismatch**

Do not create `worker-live/` if any invariant fails. Fix capture logic instead.

---

### Task 3: Add canonical snapshot and equivalence contract

**Files:**
- Create: `worker-live/worker_hotfix.js`
- Create: `worker-live/email_queue_hotfix.js`
- Create: `worker-live/worker_email_queue_hotfix.js`
- Create: `worker-live/manifest.json`
- Create: `scripts/test-live-source-equivalence.mjs`

**Interfaces:**
- Consumes: verified Task 2 capture files.
- Produces: canonical repository snapshot and deterministic equivalence test.

- [ ] **Step 1: Write the failing equivalence test first**

`test-live-source-equivalence.mjs` must:

```js
// 1. read worker-live/manifest.json
// 2. require main_module worker_hotfix.js
// 3. require the three canonical module names
// 4. SHA-256 each worker-live/*.js and compare to manifest
// 5. optionally accept a capture directory argument and compare version/module hashes
```

Expected initial failure: `worker-live/manifest.json` is absent.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-live-source-equivalence.mjs`
Expected: FAIL due to missing canonical snapshot.

- [ ] **Step 3: Copy only verified capture content**

Populate `worker-live/` byte-for-byte from the fresh artifact. Do not manually rewrite/minify source.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node scripts/test-live-source-equivalence.mjs
node --check worker-live/worker_hotfix.js
node --check worker-live/email_queue_hotfix.js
node --check worker-live/worker_email_queue_hotfix.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: snapshot active production Worker source`

---

### Task 4: Point packaging at the canonical snapshot while keeping deploy blocked

**Files:**
- Modify: `wrangler.toml`
- Modify: `scripts/test-production-worker-source-guard.mjs`
- Create: `scripts/test-canonical-worker-package.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `worker-live/worker_hotfix.js` and its relative imports.
- Produces: a dry-run packaging contract; no production deployment.

- [ ] **Step 1: Write failing packaging contract**

Require `wrangler.toml` to point to:

```toml
main = "worker-live/worker_hotfix.js"
```

and require `package.json` to expose a non-deploying command:

```json
"package:worker": "wrangler deploy --dry-run --outdir tmp/wrangler-dry-run"
```

The existing `deploy:worker` guard must remain blocked.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-canonical-worker-package.mjs`
Expected: FAIL because Wrangler still points at the root source.

- [ ] **Step 3: Change only packaging configuration**

Update `wrangler.toml` main and add the dry-run script. Do not enable `wrangler deploy`.

- [ ] **Step 4: Run dry-run and inspect output**

Run:

```bash
npm install
npm run package:worker
```

Require exit 0 and generated package metadata/source to include the canonical entrypoint and imports. No API deployment command is allowed.

- [ ] **Step 5: Verify all static contracts**

Run:

```bash
node scripts/test-production-worker-source-guard.mjs
node scripts/test-live-capture-contract.mjs
node scripts/test-live-source-equivalence.mjs
node scripts/test-canonical-worker-package.mjs
```

Expected: all PASS.

- [ ] **Step 6: Commit**

Commit message: `build: package Worker from canonical live source`

---

### Task 5: Full regression and live equivalence gate

**Files:**
- Modify: `.github/workflows/smoke-live-worker-contracts.yml` only if needed to invoke the new equivalence contract against the capture.

**Interfaces:**
- Consumes: fresh live artifact plus `worker-live/` snapshot.
- Produces: CI gate that fails when production drifts from repository canonical source.

- [ ] **Step 1: Add the equivalence invocation to CI**

After capture generation, run:

```bash
node scripts/test-live-source-equivalence.mjs tmp/live-worker-contract-smoke
```

- [ ] **Step 2: Run the PR smoke**

Require GREEN for:

```text
Production Worker source guard
Smoke active production Worker contracts
Check worker router duplicates
```

and the new source-equivalence contract.

- [ ] **Step 3: Verify production behavior contracts remain green**

The existing tests for cron isolation, observability, manual-email dedupe, offer identity, authentication, version/planes endpoints, OPTIONS and site availability must all remain green.

- [ ] **Step 4: Commit**

Commit message: `ci: gate repository source against live Worker`

---

### Task 6: Review and merge without deploying production

**Files:**
- PR only; no new production source edits unless review finds an issue.

**Interfaces:**
- Consumes: completed canonicalization branch and green checks.
- Produces: merged canonical source with deploy guard still active.

- [ ] **Step 1: Review the full diff**

Reject any secret material, unexpected Worker behavior changes, or direct deployment step.

- [ ] **Step 2: Request code review**

Request review on the canonicalization PR and resolve Critical/Important findings.

- [ ] **Step 3: Run fresh verification**

Require all CI checks green on the final head SHA and confirm the live capture still matches `worker-live/`.

- [ ] **Step 4: Merge**

Merge to `main` while leaving `PRODUCTION_SOURCE_GUARD_V1` active. A later, separately reviewed task may remove the guard and perform the first repository-driven production deployment after an explicit production rollout check.
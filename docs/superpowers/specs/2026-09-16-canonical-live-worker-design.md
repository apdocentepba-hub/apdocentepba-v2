# Canonical Live Worker Source Design

## Goal

Make the repository a reproducible source of truth for the Cloudflare Worker currently serving AlertasAPD, without changing production behavior during the migration.

## Current problem

Production is known to be healthy, but the modular repository source is not source-identical to the active Worker bundle. Direct `wrangler deploy` from the repository is therefore guarded because it can reintroduce already-fixed bugs.

The live smoke already proves that the active production deployment exposes a single 100%-traffic version and contains the required modules `worker_hotfix.js`, `email_queue_hotfix.js`, and `worker_email_queue_hotfix.js`. The missing piece is a reproducible, versioned copy of the exact active bundle plus a deterministic equivalence check against repository source.

## Architecture

### 1. Capture the active bundle without deploying

Extend the read-only production smoke so every pull-request/manual run uploads the exact active Worker version metadata and decoded JavaScript modules as a GitHub Actions artifact. The artifact is evidence only; it must not mutate Cloudflare or Supabase.

The capture must include:

- active `version_id`;
- `main_module`;
- module file names and contents;
- binding names/types, with secret values excluded;
- SHA-256 for every module;
- a manifest identifying the Cloudflare account, Worker name, capture timestamp, and active version.

### 2. Commit a canonical snapshot

After downloading a fresh artifact from CI, commit the active modules under `worker-live/`:

- `worker-live/worker_hotfix.js`
- `worker-live/email_queue_hotfix.js`
- `worker-live/worker_email_queue_hotfix.js`
- `worker-live/manifest.json`

`manifest.json` records hashes and structural metadata but no secrets.

The snapshot represents the production source of truth at a specific active version. Existing legacy/modular files remain in place initially so the migration is reversible and reviewable.

### 3. Equivalence contract

Add `scripts/test-live-source-equivalence.mjs` that compares the canonical snapshot against a freshly captured artifact. It must fail when:

- the active version is not represented by the snapshot;
- a required module is missing;
- module SHA-256 differs;
- `main_module` differs;
- required bindings disappear.

Add a separate static test that verifies deployment configuration points to `worker-live/worker_hotfix.js` only after the snapshot is proven equivalent.

### 4. Reproducible deploy path

Once equivalence is green, change Wrangler `main` to `worker-live/worker_hotfix.js` and add module imports exactly as present in the live snapshot. Keep the production-source guard in place until a dry-run packaging check proves the resulting Wrangler bundle matches the canonical snapshot structurally.

The guard is removed only when all of the following are green:

1. canonical snapshot equals the latest active production capture;
2. syntax checks pass for every live module;
3. existing production contract smoke passes;
4. offer identity, email dedupe, observability and cron-isolation contracts pass;
5. Wrangler dry-run/package output contains the expected main module and required modules;
6. no production deploy is performed as part of this migration PR.

## Data flow

Cloudflare active Worker -> read-only GitHub Actions capture -> artifact -> `worker-live/` snapshot -> equivalence tests -> Wrangler dry-run -> future controlled deploy.

There is no write path to Cloudflare in the capture or equivalence stages.

## Error handling

- Multiple accessible Cloudflare accounts remain an error unless `CLOUDFLARE_ACCOUNT_ID` is configured.
- Split traffic or absence of exactly one 100%-traffic version remains an error.
- Missing module contents, invalid base64, missing `main_module`, or a hash mismatch fail the workflow.
- Binding comparison is structural and never serializes secret values.
- A mismatch keeps the deploy guard active.

## Testing strategy

Use TDD for every new contract. Tests first fail against the current repository because no canonical snapshot/artifact manifest exists. The implementation then makes those tests green.

Verification layers:

- static source-guard contract;
- manifest/schema test;
- source-equivalence test;
- JavaScript syntax checks;
- existing live production contracts;
- Wrangler dry-run/package inspection.

## Rollback

This migration does not deploy production. Reverting the branch/PR restores the previous guarded repository state. The current live Worker remains untouched throughout.

## Success criteria

The repository contains an exact, hash-verified snapshot of the active production modules and a CI path that can prove whether that snapshot is still identical to the currently active Worker. Direct deploy stays blocked until that proof and a reproducible Wrangler package are both green.
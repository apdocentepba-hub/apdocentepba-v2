# Email Sweep Runtime Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the ALERTASAPD email sweep so an eligible user with five stored alerts can complete dry-run and production digest processing without a Worker 503, while preserving PID and postulantes information when available.

**Architecture:** Treat the deployed `worker-live/worker_hotfix.js` as the canonical production source. First capture the exact 503 boundary with a read-only targeted probe. Then add a regression contract for the identified runtime failure, apply the smallest change to the per-user digest path, and deploy through the existing Cloudflare-token GitHub Actions pipeline with targeted dry-run and rollback verification.

**Tech Stack:** Cloudflare Workers, JavaScript/Node 20, GitHub Actions, Supabase/PostgREST, ABC APD APIs, Brevo.

**Spec:** Production incident observed 2026-09-16 22:00 America/Argentina/Buenos_Aires: the sweep refreshed user `3a300893-a552-43c2-9189-071ab4a23198` and five active `user_offer_state` rows but produced no delivery reservation/log and no email; a targeted production dry-run currently returns HTTP 503.

## Global Constraints

- Do not alter SMTP/Brevo configuration or user preferences.
- Preserve the five-offer email cap and PID visibility rules.
- Preserve postulantes reference fields when the ABC endpoint succeeds; external enrichment must not be allowed to abort the digest.
- Do not mark offers emailed before a successful provider send.
- Keep slot/idempotency behavior intact.
- Use one targeted production dry-run before any real send.
- Production deployment must have automatic rollback or an immediately verifiable previous-version rollback path.
- Avoid repeated diagnostic CI runs: one focused probe, one regression gate, one final deployment gate.

---

### Task 1: Capture the exact production 503

**Files:**
- Create: `.github/workflows/probe-email-sweep-runtime.yml`
- No production code changes.

**Interfaces:**
- Consumes: production endpoint `/test-email-sweep?dry_run=1&debug=1&limit=1&target_user_id=...`.
- Produces: HTTP status, headers, response body, wall time, and a downloadable artifact for the failing request.

- [ ] **Step 1: Add a read-only probe workflow**

Create a Node/curl GitHub Action that calls the targeted dry-run, records `headers.txt`, `body.txt`, and `timing.txt`, and deliberately does not convert HTTP 503 into a workflow transport failure before artifacts are uploaded.

- [ ] **Step 2: Run the probe once**

Expected current result: targeted dry-run is not HTTP 200. The artifact must identify whether the failure is a Cloudflare runtime/limits response or an application response.

- [ ] **Step 3: Trace the failure boundary in the live source**

Use the probe evidence together with `refreshEmailUserOfferStateFromAbc`, `enrichEmailVisibleAlertsWithPostulantes`, and `runEmailAlertsSweep`. Confirm the single root cause before editing production code.

### Task 2: Add the failing regression contract

**Files:**
- Create: `scripts/test-email-sweep-runtime-budget.mjs`
- Create or modify: `.github/workflows/test-email-sweep-runtime-budget.yml`

**Interfaces:**
- Consumes: `worker-live/worker_hotfix.js`.
- Produces: a deterministic RED/GREEN contract for the exact failure mechanism identified in Task 1.

- [ ] **Step 1: Write the smallest failing regression**

The test must assert the required production behavior at the exact failing boundary, not merely search for an unrelated marker. It must fail on the current canonical Worker.

- [ ] **Step 2: Run it and verify RED**

Expected: FAIL for the incident-specific reason identified in Task 1.

### Task 3: Apply the minimal Worker fix

**Files:**
- Modify: `worker-live/worker_hotfix.js`
- Modify only if packaging requires it: `worker-live/manifest.json`

**Interfaces:**
- Consumes: existing `runEmailAlertsSweep` and helper contracts.
- Produces: the same digest payload/idempotency semantics with the failure boundary made bounded/fail-open for the affected external enrichment or runtime operation.

- [ ] **Step 1: Implement only the root-cause fix**

Do not refactor unrelated cron, authentication, scanner, or rendering code.

- [ ] **Step 2: Run the regression and existing email contracts**

Expected: new regression GREEN; existing email cron isolation, observability, manual dedupe, source guard, and packaging contracts remain GREEN.

### Task 4: Verify and deploy safely

**Files:**
- Reuse the existing Cloudflare-token candidate/deploy pipeline or create one incident-scoped workflow if the existing workflow has hard-coded old version IDs.

**Interfaces:**
- Consumes: `CLOUDFLARE_API_TOKEN`, `ancient-wildflower-cd37`, canonical `worker-live` bundle.
- Produces: a new Cloudflare Worker version and deployment with rollback metadata.

- [ ] **Step 1: Build the candidate without sending mail**

Verify module/binding parity with the currently active version.

- [ ] **Step 2: Promote with rollback protection**

Record active version before deploy and ensure rollback can restore it immediately.

- [ ] **Step 3: Run one targeted production dry-run**

Request the affected user only. Expected: HTTP 200, `ok=true`, `dry_run=true`, `failed_count=0`, and at least one visible alert.

- [ ] **Step 4: Validate production observability**

Confirm `/api/version`, public site health, and that the Worker remains on the new version after smoke checks.

- [ ] **Step 5: Perform one controlled real-user verification only if dry-run is green**

Trigger the affected user once through the production email path, then verify `notification_delivery_logs`, provider result, and `user_offer_state.first_emailed_at/last_emailed_at`. Do not resend if a reservation/dedupe record already exists.

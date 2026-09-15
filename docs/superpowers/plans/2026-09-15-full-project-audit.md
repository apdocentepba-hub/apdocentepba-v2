# AlertasAPD Full Project Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exhaustively audit AlertasAPD/APDocentePBA production and repository for reliability, correctness, security, data-loss, notification, deployment, and observability defects, then fix only reproduced defects with regression tests and rollback-safe deployment.

**Architecture:** Treat the live Cloudflare Worker as the production source of truth and the GitHub repository as deployment/audit infrastructure. Cross-check live code, Cloudflare configuration, Supabase state, ABC capture data, Brevo delivery logs, frontend routes, and GitHub workflows. Every production change must be built from the currently active Worker version, preserve bindings, pass a failing-then-green regression contract, and deploy with automatic rollback.

**Tech Stack:** Cloudflare Workers, Cloudflare KV, Supabase/Postgres, Brevo transactional email, GitHub Actions, JavaScript/ES modules, static frontend, ABC APD public APIs.

**Spec:** User request on 2026-09-15 to re-audit the entire project and find errors after the email reliability hotfix.

## Global Constraints

- Do not expose or rotate secrets during audit.
- Do not use destructive production database operations.
- Do not send test email except when required to reproduce a confirmed delivery bug, and target only the owner's account.
- Do not deploy code derived from stale repository snapshots over the active Worker.
- All live Worker fixes must preserve the active binding shape and modules unless the defect explicitly requires otherwise.
- Production deploys require post-deploy smoke tests and automatic rollback.
- Distinguish observed defects from speculative risks.

---

### Task 1: Inventory and production drift
**Files:** review repository tree, workflows, Worker sources, frontend, migrations, docs; compare against active Cloudflare Worker.
- [ ] Enumerate repository files and classify runtime/deploy/test/legacy assets.
- [ ] Fetch active Worker version, modules, bindings, schedules and route health.
- [ ] Compare repository main to live Worker and record drift.
- [ ] Verify production domain and workers.dev endpoint parity.

### Task 2: Notification pipeline correctness
**Files:** live `worker_hotfix.js`, `worker_email_queue_hotfix.js`, `email_queue_hotfix.js` and notification tables.
- [ ] Audit slot calculation, cursoring, retries, dedupe timing and completion markers.
- [ ] Audit Brevo success/failure classification and provider response handling.
- [ ] Cross-check `notification_delivery_logs`, pending notifications, user preferences, subscriptions and actual Gmail receipt.
- [ ] Reproduce each defect with a failing contract before patching.

### Task 3: ABC capture and offer lifecycle
**Files:** capture/backfill code and Supabase APD snapshot/history tables.
- [ ] Compare recent ABC source data with stored active offers.
- [ ] Verify activation/deactivation, stale offer expiry, duplicate identifiers and pagination.
- [ ] Verify all user filters against current active offers and historical captures.
- [ ] Detect gaps where valid offers could be silently omitted.

### Task 4: Authentication and authorization
**Files:** login/session/admin handlers, frontend auth calls, session/user tables.
- [ ] Review authentication, session expiry, bearer fallback, admin authorization and user data exposure.
- [ ] Search for plaintext credentials/password handling and insecure fallback behavior.
- [ ] Verify admin and test endpoints cannot mutate/send without appropriate authorization where required.
- [ ] Create regression tests for any confirmed auth defect.

### Task 5: Frontend/API contract
**Files:** root HTML/JS/CSS and Worker routing.
- [ ] Enumerate frontend API calls and confirm every route exists in production.
- [ ] Verify CORS, HTTP methods, error responses, loading states and malformed input handling.
- [ ] Find dead endpoints, stale route names and schema mismatches.

### Task 6: Database integrity and observability
**Files:** Supabase schema/migrations plus live tables.
- [ ] Inspect worker run/error/log tables and recent failures.
- [ ] Check indexes/constraints relevant to dedupe, delivery and active-offer uniqueness.
- [ ] Check queue backlog and orphan states.
- [ ] Verify monitoring can detect stale cron, provider failure and capture failure.

### Task 7: Deployment and CI safety
**Files:** `.github/workflows/**`, scripts, Wrangler config.
- [ ] Audit all production-capable workflows for stale hard-coded version IDs, accidental push triggers and missing rollback.
- [ ] Check branch protection and main deployment risk.
- [ ] Ensure candidate workflows preserve bindings and production remains unchanged before promotion.
- [ ] Identify obsolete or dangerous test/deploy workflows.

### Task 8: Consolidated fixes and verification
**Files:** only confirmed defect paths plus regression tests/workflows.
- [ ] Rank confirmed findings Critical/High/Medium/Low.
- [ ] Fix Critical/High defects first with RED→GREEN tests.
- [ ] Re-run production parity, dry-run, site/API, database and notification checks.
- [ ] Produce final audit report with evidence, unresolved risks and recommended watchdogs.

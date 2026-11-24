# Insigne: planificación de carrera docente — 24/11/2026
Approved scope: module sync, simulation, pay, commute economics, evidence-based adjudication statistics, favorites, recommendation, personal history.

Existing foundation: module grid, private tab storage, account home reference, comparator, PID/district/turn/expiry decision signals, offer history. Do not duplicate existing routes or weaken expiry filtering.

Phase 1 candidate (not deployed): dedicated account table; versioned GET/PUT; optimistic concurrency; server-derived ownership; Insigne checks for nonempty writes; empty selection explicitly erasable even after plan expiration; no addresses or schools stored; no automatic migration of local selection. Frontend bridge is not wired until backend verified. SQL must be tested on isolated PG17; exact active Worker must be captured, diff reviewed, CORS GET/PUT checked; zero-traffic candidate and rollback before production. Test two synthetic accounts and concurrent writes before real account use.

Next phases:
- Simulator: show existing modules plus proposed offer, distinguish real time and unverified module mapping (afternoon unknown). Never label unverified schedule compatible.
- Pay: versioned official DGCyE salary scales, role/category, modules, seniority, gross vs net, explicit assumptions.
- Economics: verified route or clearly labeled estimate, user transport cost, monthly workdays, net gain, time; never present straight-line distance as route.
- Favorites: private stable offer identity, clear expired state; notification opt-in/deduplication.
- Adjudication: only calibrated aggregate evidence with sample size and recency; no invented probability.
- Recommendation: transparent ranking based on observed matches and missing data, no legal eligibility claim.
- Personal history: authenticated preferences and historical records; expired records visibly separate from active alerts.

Acceptance: no production changes until actual baseline, schema/permission verification and staging. Regression checks on login, expiry, alerts, all plans and all notification channels.

Phase 1 follow-up: existing form supports an explicitly injected account client; production mount remains unchanged until release. Reads never upload tab drafts. Existing account record is authoritative after retrieval, server error preserves selection, conflict blocks save until retrieval. SQL constraints reject duplicates, noncanonical dimensions and invalid IDs. Isolated PG17 workflow validates permissions, CAS predicate and cascade, not production storage.

24/11 follow-up: production table created empty with RLS, no direct anon/authenticated grants; Cloudflare candidate 6c58c497-e362-4b03-8324-39064c39fdf7 validated at 0% traffic. Complete captured Worker auth/router exercised with two synthetic identities and mock PostgREST. This does not constitute authenticated Cloudflare + live database proof. Do not create paid or real customer accounts for QA. Keep existing production mount unchanged until verified.

## Authenticated QA release gate
Operator-only `node scripts/check-apd-account-schedule-authenticated.mjs --execute-dedicated-qa` requires two existing dedicated accounts with reserved example.invalid emails apd-schedule-qa-a/b@example.invalid, distinct configured IDs and bearer credentials in environment. The script verifies identity, active Insigne and empty schedules before any write. It checks CAS, readback and ownership; cleanup restores empty schedules only when the test value/revision matches. On unexpected concurrent data or failed cleanup, stop promotion. No account, plan, or session creation; no tokens logged; no notification APIs. CI exercises a simulated fixture only. Live execution pending provisioned QA identities; do not use customer sessions. Latest branch reconciles main 35c6e35.

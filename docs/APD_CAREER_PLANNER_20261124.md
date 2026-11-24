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

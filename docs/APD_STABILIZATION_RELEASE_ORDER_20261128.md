# Candidate #361 — release order and incident recovery
Status: NOT AUTHORIZED FOR PRODUCTION. No automation executes these steps.
 
## Admission (all required)
- Pin active Worker version, module hash, binding inventory, schedules and existing routes; run private GET-only preflight. Stop on drift. Current historical snapshot is not the active baseline.
- Obtain and verify a persistent private backup of the active module/config and database, with isolated restore evidence and operator-approved retention. Temporary readback does not satisfy this requirement.
- Review exact current database ACL, schemas, policies, catalog and dependent callers. Reconcile the actual active commercial resolver and routes. Compare current candidate hashes and validate the full active-derived module in an isolated environment. Separate explicit approvals for database, Worker and frontend changes.

## Ordered change groups (proposed, not executed)
1. Establish backup and a maintenance/change window; record old Worker/frontend version and database observations.
2. Install additive career schema and session maintenance function only after prerequisites match; do not invoke maintenance. Index is independent, optional and reversible; reassess size and need.
3. Verify new Worker candidate against actual active source; retain existing schedule/diary/favorites and payment routes. Test zero-production-traffic candidate only if supported and approved, then route promotion requires separate approval.
4. Apply private-table ACL hardening only after confirming backend callers and no legitimate direct browser access. Check authenticated reads/writes and access denial.
5. Legacy transition RPC and public-catalog restriction only after compatible resolver is proven. Do not invoke bulk grants automatically; reconcile provider rights and pending checkouts first. Never delete legacy history or change prices.
6. Publish frontend only when all APIs it uses are ready; keep career release flag off until catalog and authenticated integration approved. Verify post-release anonymous and authenticated flows, channels without sending real notifications, and payment routes without real charges.

## Incident handling
- Freeze further changes, stop newly introduced jobs/invocations, and preserve logs and data.
- Restore previous compatible frontend and Worker versions only with operator approval and verified identifiers. Confirm compatibility with additive schema and new grants before routing traffic.
- New RPC suspension/resume scripts revoke/grant only service_role EXECUTE on the two new RPCs; no rows deleted or reactivated. In-flight calls are not cancelled by ACL changes. No automatic grant rollback. Preserve career rows and CAS; do not drop tables with user data.
- Optional index reversal is exact-identity guarded. Catalog and private ACL emergency revert are exceptional, not routine: they reopen previous visibility or permissions and require explicit security review.
- Never roll back the database wholesale over new payments, grants or user writes. Use targeted compensation and reconciliation; restore backup only into isolation unless a separately approved incident plan addresses data loss.
 
Current evidence: six SQL migrations passed together in disposable PG17 at e4b9e08e8973f5bfb9f5968b2258fbbb467ee4b8. Live baseline, persistent restore, runtime on active-derived Worker and production approval remain pending.
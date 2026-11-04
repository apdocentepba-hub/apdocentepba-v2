APDOCENTEPBA_WORKER_VERSION_UPLOAD_ONCE
approved_by_user_turn: dale go
date: 2026-11-04
branch: staging/apd-worker-zero-traffic-20261104
allowed_action: Cloudflare Workers versions upload only; do not deploy or route traffic
guarded_worker: ancient-wildflower-cd37
expected_active_version: da0632dd-1b9e-4332-9c4a-75b5eade8d74
expected_canonical_sha256: 335a62e1ab6127cf50b38000845766c7d7d5e2c314e2e002e996e41ace146a9c
expected_candidate_sha256: 6ee13869ec0d6363806e1bfc8990d529f7386b956c7bd30530f5e0109c861b6e
required_bindings: 29
required_cron_triggers: 4
candidate_percent: 0
production_percent: 100
no_database_migration: true
no_user_notifications: true
no_payments: true

retry_after_safe_preflight_abort: 2
wrangler_pinned_version: 4.157.0
reason: 4.20.3 CLI defensive flags check failed before any upload; retain strict+keep-vars

retry_after_safe_preflight_abort: 3
reason: fixed Cloudflare API URL origin comparison; no previous upload attempted

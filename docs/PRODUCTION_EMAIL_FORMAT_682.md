# APDocentePBA — production email baseline #682

Production Worker: `ancient-wildflower-cd37`

Active Cloudflare version after the email-format deployment:
`3e26319d-8e9a-4bdf-81dd-c9e78b15fbf0` (Worker version #682).

## What #682 changes

- Renders situation of record as readable `SUPLENCIA` / `PROVISIONAL` instead of raw `S` / `P`.
- Preserves and displays `ESTADO` in the offer card.
- Keeps course/division, modules, days/hours, validity and closing date visible.
- Prevents the PID reason from saying `Compatible con tu PID` when `pid_compatible` is false.
- Uses the correct PID residence bonus fields and PID list/year fields.
- Makes the Top-5 renderer reuse the same main digest identity.
- Removes internal queue wording such as `Hotfix de alertas por mail` and `cola pendiente para no perder avisos`.

## Verification performed

The candidate was built from the live Worker, not from the stale modular source in the repository. Before production promotion it passed:

- JavaScript syntax checks for the three Worker modules.
- `scripts/test-email-format-live.mjs` contract checks.
- Cloudflare candidate upload with the same 27 binding shapes and the same three modules.
- Post-deploy `/api/version` smoke check.
- `/test-email-sweep?dry_run=1` with 10 processed users, 0 real sends and 0 failures.
- Public site HTTP 200.
- Automatic rollback was armed and was not triggered.

## Important source-of-truth note

The root modular source in this repository is not source-identical to the currently deployed Worker. The email-format change is therefore represented by the deterministic patch script and contract test:

- `scripts/apply-email-format-live.py`
- `scripts/test-email-format-live.mjs`

The temporary candidate/deployment workflows capture the exact procedure used for #682. Do not assume that a plain `wrangler deploy` from the old modular root files reproduces production.

A future cleanup should export the active production modules into a canonical source snapshot or rebuild the modular source until it is byte/behavior equivalent to the live Worker.

# Favoritos permanentes — evidencia de release 2026-11-24
- Tabla Supabase creada con RLS y grants mínimos, sin acceso anon/authenticated.
- QA real: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/45443611714 (dos cuentas, lectura, CAS, aislamiento, alta/baja; accesos revocados).
- Worker 7685b89f-3535-4e2a-b2c3-082d1e8c857e, 100% productivo: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/45443946690 (13 controles, 29 bindings, 4 cron).
- Rollback Worker 49a33cc8-0b0a-4c07-9b8b-3492bf0c2132. Desactivar flag frontend antes de rollback.
- Sin recordatorios automáticos. Índice no demuestra vigencia en vivo.
- Flujos one-shot de preflight/stage retirados del PR después de promoción; evidencia histórica en commits y runs.

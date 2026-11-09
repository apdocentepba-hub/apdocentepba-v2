#!/usr/bin/env bash
# APD BACKUP/RESTORE LAB ONLY. Refuses non-disposable PG17 contexts.
# Reads apd_ci lab and writes ONLY to apd_restore_lab scratch DB.
set -euo pipefail

if [[ "${PGHOST:-}" != "localhost" || "${PGDATABASE:-}" != "apd_ci" ||
      "${PGUSER:-}" != "apd_ci" ||
      -z "${PG_SERVICE_CONTAINER:-}" ]]; then
  echo 'APD_RESTORE_DISABLED: disposable PG17 service context required' >&2
  exit 2
fi
cid="$PG_SERVICE_CONTAINER"
image="$(docker inspect --format '{{.Config.Image}}' "$cid")"
if [[ "$image" != "postgres:17" ]]; then
  echo 'APD_RESTORE_DISABLED: expected exact postgres:17 service image' >&2
  exit 2
fi

scratch="apd_restore_lab"
backup="$(mktemp /tmp/apd-pg17-snapshot.XXXXXXXX.dump)"
cleanup() {
  rm -f "$backup"
  # Only drop the scratch database inside the disposable PG17 service.
  docker exec "$cid" dropdb --if-exists -U apd_ci "$scratch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

summary_sql="$(cat <<'SQL'
SELECT
  (SELECT count(*) FROM apd_change_lab.captures),
  (SELECT count(*) FROM apd_change_lab.audit_events),
  (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.scope,c.captured_at),'')) FROM apd_change_lab.captures c),
  (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.scope,e.event_key),'')) FROM apd_change_lab.audit_events e),
  (SELECT count(*) FROM apd_change_lab.transition_candidates),
  (SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.scope,t.evidence_hash),''))
   FROM apd_change_lab.transition_candidates t);
SQL
)"
state() {
  docker exec "$cid" psql -X -qAt -F '|' -v ON_ERROR_STOP=1 \
    -U apd_ci -d "$1" -c "$summary_sql" | tr -d '\r'
}
original="$(state apd_ci)"
if [[ ! "$original" =~ ^[0-9]+\|[0-9]+\|[0-9a-f]{32}\|[0-9a-f]{32}\|[0-9]+\|[0-9a-f]{32}$ ]]; then
  echo 'APD_RESTORE_FAIL: invalid original fingerprint' >&2
  exit 1
fi
IFS='|' read -r captures events _ _ candidates _ <<<"$original"
if ((captures<2 || events<1 || candidates!=501)); then
  echo 'APD_RESTORE_FAIL: source lab lacks captured and audit evidence' >&2
  exit 1
fi

# Dump within the PostgreSQL 17 container (no old pg_dump client mismatch).
docker exec "$cid" pg_dump -U apd_ci -d apd_ci --format=custom \
  --schema=apd_change_lab --schema=apd_change_api > "$backup"
backup_bytes="$(wc -c < "$backup" | tr -d '[:space:]')"
if ((backup_bytes<1024)); then
  echo 'APD_RESTORE_FAIL: suspiciously empty backup' >&2
  exit 1
fi

restore_clean() {
  docker exec "$cid" dropdb --if-exists -U apd_ci "$scratch" >/dev/null
  docker exec "$cid" createdb -U apd_ci "$scratch"
  docker exec -i "$cid" pg_restore -U apd_ci -d "$scratch" \
    --exit-on-error < "$backup"
}

restore_clean
if [[ "$(state "$scratch")" != "$original" ]]; then
  echo 'APD_RESTORE_FAIL: recovered rows do not match backup' >&2
  exit 1
fi

# RLS, schema privileges and audit-only states must survive restoration.
posture_sql="$(cat <<'SQL'
SELECT CASE WHEN
  (SELECT relrowsecurity FROM pg_class WHERE oid='apd_change_lab.captures'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='apd_change_lab.audit_events'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='apd_change_lab.transition_candidates'::regclass)
  AND NOT has_table_privilege('apd_lab_ingest',
     'apd_change_lab.transition_candidates','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_function_privilege('apd_lab_ingest',
     'apd_change_lab.record_transition_candidate(jsonb,text,boolean)','EXECUTE')
  AND NOT EXISTS(SELECT 1 FROM apd_change_lab.transition_candidates
     WHERE status<>'review_only' OR delivery_allowed OR source_attested
        OR historic_transition_proven)
  AND NOT EXISTS(SELECT 1 FROM (
     SELECT scope,count(*) AS n FROM apd_change_lab.transition_candidates
     GROUP BY scope
   ) capped WHERE n>500)
  AND (SELECT count(*) FROM apd_change_lab.transition_candidates
       WHERE scope='ENSENADA')=500
  AND (SELECT count(*) FROM apd_change_lab.transition_candidates
       WHERE scope='MERLO')=1
  AND NOT has_schema_privilege('apd_lab_ingest','apd_change_lab','USAGE')
  AND has_schema_privilege('apd_lab_ingest','apd_change_api','USAGE')
  AND NOT has_table_privilege('apd_lab_ingest','apd_change_lab.captures','SELECT,INSERT,DELETE')
  AND has_function_privilege('apd_lab_ingest','apd_change_api.submit_compact(jsonb)','EXECUTE')
  AND has_function_privilege('apd_lab_ingest','apd_change_api.submit_audit(jsonb)','EXECUTE')
  AND NOT has_function_privilege('apd_lab_observer','apd_change_api.submit_compact(jsonb)','EXECUTE')
  AND NOT has_schema_privilege('apd_change_lab_guest','apd_change_lab','USAGE')
  AND NOT has_table_privilege('apd_change_lab_guest','apd_change_lab.captures','SELECT')
  AND NOT has_table_privilege('apd_change_audit_guest','apd_change_lab.audit_events','SELECT')
  AND NOT has_function_privilege('apd_change_lab_guest',
    'apd_change_lab.save_compact(jsonb,boolean)','EXECUTE')
  AND NOT has_function_privilege('apd_change_audit_guest',
    'apd_change_lab.record_audit_batch(jsonb,boolean)','EXECUTE')
  AND NOT EXISTS(SELECT 1 FROM apd_change_lab.audit_events WHERE status<>'audit_only')
  AND NOT EXISTS(SELECT 1 FROM (
    SELECT scope,count(*) AS n FROM apd_change_lab.captures GROUP BY scope
  ) x WHERE n>2)
THEN 'PASS' ELSE 'FAIL' END;
SQL
)"
posture="$(docker exec "$cid" psql -X -qAt -v ON_ERROR_STOP=1 \
  -U apd_ci -d "$scratch" -c "$posture_sql" | tr -d '\r')"
if [[ "$posture" != "PASS" ]]; then
  echo 'APD_RESTORE_FAIL: restored permissions, RLS or retention invalid' >&2
  exit 1
fi

# ACTUAL simulated damage to SCRATCH ONLY. Source lab is untouched.
docker exec "$cid" psql -X -q -v ON_ERROR_STOP=1 -U apd_ci -d "$scratch" \
  -c "UPDATE apd_change_lab.audit_events
      SET before_value='CORRUPTED_SCRATCH_ONLY'
      WHERE (scope,event_key) IN
       (SELECT scope,event_key FROM apd_change_lab.audit_events
        ORDER BY scope,event_key LIMIT 1);" >/dev/null
if [[ "$(state "$scratch")" == "$original" ]]; then
  echo 'APD_RESTORE_FAIL: scratch corruption not detected' >&2
  exit 1
fi

# Drop damaged scratch and restore again from same real backup.
restore_clean
if [[ "$(state "$scratch")" != "$original" ]]; then
  echo 'APD_RESTORE_FAIL: second restoration did not recover initial state' >&2
  exit 1
fi
if [[ "$(state apd_ci)" != "$original" ]]; then
  echo 'APD_RESTORE_FAIL: original isolated lab changed' >&2
  exit 1
fi
posture="$(docker exec "$cid" psql -X -qAt -v ON_ERROR_STOP=1 \
  -U apd_ci -d "$scratch" -c "$posture_sql" | tr -d '\r')"
if [[ "$posture" != "PASS" ]]; then
  echo 'APD_RESTORE_FAIL: permissions not restored after recovery' >&2
  exit 1
fi
echo "APD_RESTORE_PG17_PASSED captures=$captures audit_events=$events transition_candidates=$candidates backup_bytes=$backup_bytes"

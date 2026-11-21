#!/usr/bin/env bash
# CI only: restore private fictitious PG17 data into a NEW isolated database.
# Never use against user / production Supabase databases.
set -euo pipefail
if [[ "$GITHUB_ACTIONS" != "true" ||
      "$GITHUB_REPOSITORY" != "apdocentepba-hub/apdocentepba-v2" ||
      "$PGHOST" != "127.0.0.1" ||
      "$PGPORT" != "5432" ||
      "$PGDATABASE" != "apd_ci" ||
      "$PGUSER" != "apd_ci" ||
      "$PGPASSWORD" != "fake_pg17_pairs_ci_only" ||
      "$APD_CI_FAKE_JWT_SECRET" != "CI-only-identity-pairs-test-key-0123456789" ]]; then
  echo "FAIL: refusing to run outside the pinned disposable PG17 CI environment" >&2
  exit 1
fi
source_db="apd_ci"
restore_db="apd_ci_restore_scratch"
restore_container="apd-pairs-restore-postgrest"
src_ping="$(psql -X -A -t -d "$source_db" -v ON_ERROR_STOP=1 -c \
 "SELECT current_setting('server_version_num')::integer / 10000")"
[[ "$src_ping" == "17" ]] || { echo "FAIL: source is not PG17" >&2; exit 1; }
existing="$(psql -X -A -t -d postgres -v ON_ERROR_STOP=1 -c \
 "SELECT count(*) FROM pg_database WHERE datname='$restore_db'")"
[[ "$existing" == "0" ]] || { echo "FAIL: scratch database already exists; no overwrite" >&2; exit 1; }
test_dir="$(mktemp -d)"
scratch_created=false
cleanup(){
  docker rm -f "$restore_container" >/dev/null 2>&1 || true
  if [[ "$scratch_created" == true ]]; then
    dropdb "$restore_db" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

fingerprint(){
  local db="$1" dest="$2"
  psql -X -A -t -F '|' -d "$db" -v ON_ERROR_STOP=1 \
    -f scripts/apd-pg17-restore-fingerprints.sql | LC_ALL=C sort >"$dest"
  [[ -s "$dest" ]] || { echo "FAIL: private table fingerprint list empty" >&2; exit 1; }
}
fingerprint "$source_db" "$test_dir/original.tsv"
# Capture both private schemas, including staged runs, manifests, constraints,
# SECURITY DEFINER function owner/ACLs. Cluster-scoped roles exist in this CI
# service; global roles are NOT contained in a normal pg_dump.
pg_dump -Fc --no-password -d "$source_db" \
  -n apd_scanner_pilot -n apd_scanner_api \
  --file "$test_dir/lab-private.dump"
[[ -s "$test_dir/lab-private.dump" ]] || { echo "FAIL: empty archive" >&2; exit 1; }
pg_restore --list "$test_dir/lab-private.dump" >/dev/null

# A damaged archive must fail validation before anyone attempts a restore.
cp "$test_dir/lab-private.dump" "$test_dir/corrupt.dump"
printf X | dd of="$test_dir/corrupt.dump" bs=1 count=1 conv=notrunc status=none
if pg_restore --list "$test_dir/corrupt.dump" >/dev/null 2>&1; then
  echo "FAIL: damaged pg_dump archive went undetected" >&2
  exit 1
fi
echo "PASS: deliberately corrupted backup rejected (read-only inspection)"

createdb --template=template0 "$restore_db"
scratch_created=true
if ! pg_restore --exit-on-error --single-transaction \
    -d "$restore_db" "$test_dir/lab-private.dump" \
    > "$test_dir/restore.log" 2>&1; then
  tail -n 50 "$test_dir/restore.log" >&2
  echo "FAIL: isolated restore aborted, source database untouched" >&2
  exit 1
fi
fingerprint "$restore_db" "$test_dir/restored.tsv"
diff -u "$test_dir/original.tsv" "$test_dir/restored.tsv" ||
  { echo "FAIL: restored table counts or content digests differ" >&2; exit 1; }
echo "PASS: all private PG17 table row counts and content digests identical"

# Verify the function owner, definer flag, restricted ACL, and absence of
# direct private SQL privileges on a DIFFERENT database after restore.
psql -X -v ON_ERROR_STOP=1 -d "$restore_db" <<'SQL'
DO $restore_security$
DECLARE bad_functions integer;
BEGIN
  SELECT count(*)::integer INTO bad_functions
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='apd_scanner_api'
    AND (NOT p.prosecdef
      OR p.proowner<>'apd_ci_executor'::regrole
      OR NOT coalesce(array_to_string(p.proconfig,','),'')
        LIKE '%search_path=pg_catalog, apd_scanner_api, apd_scanner_pilot, pg_temp%'
      OR has_function_privilege('apd_api_anon',p.oid,'EXECUTE')
      OR has_function_privilege('apd_api_authenticated',p.oid,'EXECUTE'));
  IF bad_functions<>0
    OR has_schema_privilege('apd_api_scanner','apd_scanner_pilot','USAGE')
    OR pg_has_role('apd_api_scanner','apd_ci_executor','MEMBER')
    OR has_table_privilege('apd_api_scanner',
        'apd_scanner_pilot.current_offers_full','UPDATE')
    OR NOT has_function_privilege('apd_api_scanner',
        'apd_scanner_api.commit_capture(uuid)','EXECUTE')
    OR (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='apd_scanner_api')<>11 THEN
    RAISE EXCEPTION 'Restored privilege / SECURITY DEFINER contract differs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM apd_scanner_pilot.current_offers_full
    WHERE source_offer_key='D_9701' AND distrito='AZUL'
      AND cargo='INFORMATICA') THEN
    RAISE EXCEPTION 'Prior finalized synthetic capture missing after restore';
  END IF;
END
$restore_security$;
SELECT 'PASS: restored schema owners, ACL, SECURITY DEFINER and historical rows intact' AS result;
SQL

# Prove the restored database also serves real guarded PostgREST RPC calls.
docker run -d --rm --name "$restore_container" --network host \
  -e PGRST_DB_URI="postgres://apd_ci:fake_pg17_pairs_ci_only@127.0.0.1:5432/$restore_db" \
  -e PGRST_DB_SCHEMAS="apd_scanner_api" \
  -e PGRST_DB_ANON_ROLE="apd_api_anon" \
  -e PGRST_JWT_SECRET="$APD_CI_FAKE_JWT_SECRET" \
  -e PGRST_SERVER_PORT="3301" \
  postgrest/postgrest:v16.3 >/dev/null
ready=false
for i in $(seq 1 40); do
  if curl --silent --fail http://127.0.0.1:3301/ >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo "FAIL: restored PostgREST did not become ready" >&2; exit 1; }
node --check scripts/test-apd-restored-pg17-http.mjs
node scripts/test-apd-restored-pg17-http.mjs

# Restore smoke test must have modified ONLY the restored database.
fingerprint "$source_db" "$test_dir/source-after.tsv"
diff -u "$test_dir/original.tsv" "$test_dir/source-after.tsv" ||
  { echo "FAIL: original PG17 source changed during restore smoke" >&2; exit 1; }
count="$(wc -l < "$test_dir/original.tsv" | tr -d ' ')"
echo "PASS: fresh isolated PG17 restore, $count private tables identical before HTTP smoke; source unchanged after"

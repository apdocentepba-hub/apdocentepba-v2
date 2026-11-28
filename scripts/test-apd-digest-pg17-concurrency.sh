#!/usr/bin/env bash
# APD-013: reproduce bigint and partial unique index in disposable PG17.
set -euo pipefail
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGDATABASE=apd_delivery_fixture PGPASSWORD=apd_fixture_only
unset DATABASE_URL SUPABASE_DB_URL PGURI PGSERVICE PGSERVICEFILE PGOPTIONS
q(){ psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
q <<'SQL'
DO $$ BEGIN
 IF current_database()<>'apd_delivery_fixture' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN
  RAISE EXCEPTION 'unexpected fixture';
 END IF;
END $$;
CREATE TABLE notification_delivery_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, dedupe_key text, status text NOT NULL);
CREATE UNIQUE INDEX notification_delivery_logs_dedupe_key_uidx ON notification_delivery_logs(dedupe_key) WHERE dedupe_key IS NOT NULL;
SQL
for i in $(seq 1 8); do
 key="fixture-slot-$i"
 set +e
 q -c "\set VERBOSITY verbose" -c "BEGIN; INSERT INTO notification_delivery_logs(dedupe_key,status) VALUES ('$key','sending_alert_digest') RETURNING id; SELECT pg_sleep(0.1); COMMIT;" >"$tmp/a" 2>"$tmp/ae" &
 a=$!
 q -c "\set VERBOSITY verbose" -c "BEGIN; INSERT INTO notification_delivery_logs(dedupe_key,status) VALUES ('$key','sending_alert_digest') RETURNING id; SELECT pg_sleep(0.1); COMMIT;" >"$tmp/b" 2>"$tmp/be" &
 b=$!
 wait "$a"; ra=$?
 wait "$b"; rb=$?
 set -e
 if [[ "$ra" == 0 && "$rb" != 0 ]]; then grep -q '23505' "$tmp/be"; elif [[ "$rb" == 0 && "$ra" != 0 ]]; then grep -q '23505' "$tmp/ae"; else echo "unexpected race outcome"; exit 1; fi
 [[ $(q -c "SELECT count(*) FROM notification_delivery_logs WHERE dedupe_key='$key' AND id>0") == 1 ]]
done
q -c "UPDATE notification_delivery_logs SET status='failed_alert_digest' WHERE dedupe_key='fixture-slot-1'"
if q -c "INSERT INTO notification_delivery_logs(dedupe_key,status) VALUES ('fixture-slot-1','sending_alert_digest')" >"$tmp/retry" 2>&1; then exit 1; fi
[[ $(q -c 'SELECT count(*) FROM notification_delivery_logs') == 8 ]]
echo 'APD_DIGEST_PG17_CONCURRENCY_PASS races=8 unique_winners=8 blind_retry_denied=true provider_calls=0'

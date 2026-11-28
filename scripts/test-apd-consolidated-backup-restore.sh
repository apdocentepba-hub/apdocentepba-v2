#!/usr/bin/env bash
# Synthetic PostgreSQL 17 service only. Never connect to Supabase or other hosts.
set -euo pipefail
umask 077
[[ "$#" == 1 && "$1" =~ ^[a-f0-9]{64}$ && "${APD_FIXTURE_RESTORE_ACK:-}" == "DISPOSABLE_PG17_ONLY" ]] || exit 2
cid="$1"
[[ "$(docker inspect --format '{{.Config.Image}}' "$cid")" == "postgres:17" ]] || exit 2
src=apd_consolidated_fixture
dst=apd_consolidated_restored
dir="$(mktemp -d)"
trap 'rm -rf -- "$dir"' EXIT
run_pg() { docker exec -i "$cid" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" "${@:2}"; }
[[ "$(run_pg "$src" -c 'SELECT current_database()')" == "$src" ]]
[[ "$(run_pg "$src" -c "SELECT count(*) FROM public.user_career_profile WHERE revision=2")" == 1 ]]
[[ "$(run_pg postgres -c "SELECT count(*) FROM pg_database WHERE datname='$dst'")" == 0 ]]
# Both processes operate within the exact CI service container.
docker exec "$cid" pg_dump -U postgres -d "$src" --format=custom > "$dir/backup.dump"
[[ -s "$dir/backup.dump" ]]
(cd "$dir" && sha256sum backup.dump > backup.sha256 && sha256sum -c backup.sha256)
docker exec "$cid" createdb -U postgres "$dst"
docker exec -i "$cid" pg_restore -U postgres -d "$dst" --exit-on-error --single-transaction < "$dir/backup.dump"
(cd "$dir" && sha256sum -c backup.sha256)
for db in "$src" "$dst"; do
  # PG17 pg_dump includes randomized restrict keys; compare all remaining schema/ACL text.
  docker exec "$cid" pg_dump -U postgres -d "$db" --schema-only |
    sed -E '/^\\(un)?restrict /d' > "$dir/$db.schema"
  run_pg "$db" > "$dir/$db.data" <<'SQL'
SET timezone='UTC';
SET datestyle='ISO, YMD';
SELECT format('SELECT %L, count(*), encode(sha256(convert_to(coalesce(string_agg(row_to_json(x)::text, E''\n'' ORDER BY row_to_json(x)::text), ''''), ''UTF8'')), ''hex'') FROM %I.%I x',tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
SQL
done
cmp "$dir/$src.schema" "$dir/$dst.schema"
cmp "$dir/$src.data" "$dir/$dst.data"
run_pg "$dst" < tests/sql/apd_consolidated_restore_assert.sql
printf '%s\n' 'APD_CONSOLIDATED_BACKUP_RESTORE_PG17_PASS'

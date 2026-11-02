#!/usr/bin/env bash
# CI-only. Uses fake rows and a disposable PG17 database; NO Supabase credentials.
set -euo pipefail
umask 077
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
export PGPASSWORD=apd_mock_test_only
source_uri='postgresql://postgres@127.0.0.1:5432/apd_backup_test'
restored_uri='postgresql://postgres@127.0.0.1:5432/apd_backup_restore'
psql "$source_uri" -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE public.apd_mock_preferences (docente text PRIMARY KEY, distrito text NOT NULL);
INSERT INTO public.apd_mock_preferences VALUES ('fake-a','Avellaneda'), ('fake-b','La Matanza');
CREATE TABLE public.apd_mock_ofertas (id integer PRIMARY KEY, descripcion text NOT NULL);
INSERT INTO public.apd_mock_ofertas VALUES (1,'Ficticia A'), (2,'Ficticia B');
SQL
createdb -h 127.0.0.1 -U postgres apd_backup_restore
# Exactly ONE pg_dump command for DDL and rows, using PostgreSQL 17 client.
# On the GitHub hosted runner, docker is available. Postgres17 service stays isolated.
docker run --rm --network host --user "$(id -u):$(id -g)" \
  --volume "$tmp:/backup" \
  --env PGPASSWORD \
  postgres:17-alpine \
  sh -ec 'pg_dump --dbname=postgresql://postgres@127.0.0.1:5432/apd_backup_test --format=plain --schema=public --no-owner --file=/backup/app.sql'
test -s "$tmp/app.sql"
# A restored Supabase/local PG database already owns the public schema.
[[ "$(grep -Fxc 'CREATE SCHEMA public;' "$tmp/app.sql")" == 1 ]]
sed -i 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' "$tmp/app.sql"
grep -q 'COPY public.apd_mock_preferences' "$tmp/app.sql"
grep -q 'CREATE TABLE public.apd_mock_ofertas' "$tmp/app.sql"
psql "$restored_uri" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$tmp/app.sql" >/dev/null
result="$(psql "$restored_uri" -X -q -t -A -v ON_ERROR_STOP=1 -c \
  "SELECT (SELECT count(*) FROM public.apd_mock_preferences)::text || ':' || (SELECT count(*) FROM public.apd_mock_ofertas)::text")"
[[ "$result" == '2:2' ]] || { echo 'Inconsistent restored application snapshot' >&2; exit 1; }
echo 'APD_PG17_ONE_DUMP_ONE_SNAPSHOT_RESTORE_OK'

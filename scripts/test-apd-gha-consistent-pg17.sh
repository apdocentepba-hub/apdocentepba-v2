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
CREATE EXTENSION unaccent WITH SCHEMA public;
CREATE TABLE public.apd_mock_preferences (docente text PRIMARY KEY, distrito text NOT NULL);
INSERT INTO public.apd_mock_preferences VALUES ('fake-a','Avellaneda'), ('fake-b','La Matanza');
CREATE TABLE public.apd_mock_ofertas (id integer PRIMARY KEY, descripcion text NOT NULL, normalizado text DEFAULT public.unaccent('á'));
INSERT INTO public.apd_mock_ofertas (id,descripcion) VALUES (1,'Ficticia A'), (2,'Ficticia B');
SQL
APD_INVENTORY_DB_URL="$source_uri" bash scripts/apd_gha_public_inventory.sh > "$tmp/source-inventory.tsv"
[[ "$(wc -l < "$tmp/source-inventory.tsv")" -ge 2 ]]
grep -q $'public.apd_mock_preferences\t2' "$tmp/source-inventory.tsv"
grep -q $'public.apd_mock_ofertas\t2' "$tmp/source-inventory.tsv"
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
python3 scripts/apd_gha_prepare_public_dump.py "$tmp/app.sql" 'unaccent:1.1'
grep -q "^CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public VERSION '1.1';$" "$tmp/app.sql"
if python3 scripts/apd_gha_prepare_public_dump.py "$tmp/app.sql" 'unknown:1.0'; then echo 'Unsupported extension accepted'; exit 1; fi
grep -q 'COPY public.apd_mock_preferences' "$tmp/app.sql"
grep -q 'CREATE TABLE public.apd_mock_ofertas' "$tmp/app.sql"
psql "$restored_uri" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$tmp/app.sql" >/dev/null
[[ "$(psql "$restored_uri" -X -Atq -c "SELECT public.unaccent('á')")" == a ]]
printf '%s\n' 'psql:/tmp/private/app.sql:42: ERROR:  42704' 'PRIVATE_TEST_ROW never output' > "$tmp/diagnostic.log"
[[ "$(python3 scripts/apd_gha_restore_diagnostic.py "$tmp/diagnostic.log")" == 'APD_RESTORE_DIAGNOSTIC file=app.sql line=42 sqlstate=42704' ]]
result="$(psql "$restored_uri" -X -q -t -A -v ON_ERROR_STOP=1 -c \
  "SELECT (SELECT count(*) FROM public.apd_mock_preferences)::text || ':' || (SELECT count(*) FROM public.apd_mock_ofertas)::text")"
[[ "$result" == '2:2' ]] || { echo 'Inconsistent restored application snapshot' >&2; exit 1; }
APD_INVENTORY_DB_URL="$restored_uri" bash scripts/apd_gha_public_inventory.sh > "$tmp/restore-inventory.tsv"
cmp "$tmp/source-inventory.tsv" "$tmp/restore-inventory.tsv"
psql "$restored_uri" -X -q -v ON_ERROR_STOP=1 -c "INSERT INTO public.apd_mock_ofertas(id,descripcion) VALUES (3,'Extra ficticia')" >/dev/null
APD_INVENTORY_DB_URL="$restored_uri" bash scripts/apd_gha_public_inventory.sh > "$tmp/tampered-inventory.tsv"
if cmp -s "$tmp/source-inventory.tsv" "$tmp/tampered-inventory.tsv"; then
  echo 'Changed restored count went unnoticed' >&2
  exit 1
fi
echo 'APD_PG17_ONE_DUMP_ONE_SNAPSHOT_RESTORE_AND_ALL_TABLES_OK'

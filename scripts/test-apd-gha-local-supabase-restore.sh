#!/usr/bin/env bash
# Real local Supabase, fake data only, same production restore helper.
set -euo pipefail
umask 077
repo="$PWD"
root="$(mktemp -d)"
mkdir "$root/restore_project" "$root/fixture"
cd "$root/restore_project"
trap 'supabase stop --no-backup >/dev/null 2>&1 || true; rm -rf -- "$root"' EXIT
if docker inspect supabase_db_restore_project >/dev/null 2>&1; then exit 2; fi
supabase init >/dev/null
supabase start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >/dev/null
localdb="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
[[ "$(psql "$localdb" -X -Atq -c "SHOW server_version_num")" =~ ^17[0-9]{4}$ ]]
before="$(psql "$localdb" -X -Atq -c "SELECT rolsuper FROM pg_roles WHERE rolname='postgres'")"
printf '%s\n' '-- mock roles' > "$root/fixture/roles.sql"
cat > "$root/fixture/app.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE TABLE public.apd_restore_fixture(id int PRIMARY KEY, text_value text);
INSERT INTO public.apd_restore_fixture VALUES (1,'synthetic');
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT ON TABLES TO anon;
SQL
# If the installed CLI postgres is restricted, reproduce the original 42501.
if [[ "$before" == f ]]; then
  if psql "$localdb" -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate --single-transaction -f "$root/fixture/app.sql" >/dev/null 2>"$root/expected.log"; then
    echo 'Expected restricted restore to fail'; exit 1
  fi
  grep -q '42501' "$root/expected.log"
  echo 'APD_REPRODUCED_42501_LOCAL_SUPABASE'
fi
bash "$repo/scripts/apd_gha_local_restore.sh" supabase_db_restore_project "$root/fixture" "$root/diagnostic.log"
[[ "$(psql "$localdb" -X -Atq -c 'SELECT count(*) FROM public.apd_restore_fixture')" == 1 ]]
[[ "$(psql "$localdb" -X -Atq -c "SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='apd_restore_fixture'")" == postgres ]]
[[ "$(psql "$localdb" -X -Atq -c "SELECT rolsuper FROM pg_roles WHERE rolname='postgres'")" == "$before" ]]
# Failure must roll back data and restore original privileges.
printf '%s\n' 'CREATE TABLE public.apd_rollback_fixture(id int);' 'SELECT 1/0;' > "$root/fixture/app.sql"
if bash "$repo/scripts/apd_gha_local_restore.sh" supabase_db_restore_project "$root/fixture" "$root/diagnostic.log"; then exit 1; fi
grep -q 22012 "$root/diagnostic.log"
[[ "$(psql "$localdb" -X -Atq -c "SELECT to_regclass('public.apd_rollback_fixture') IS NULL")" == t ]]
[[ "$(psql "$localdb" -X -Atq -c "SELECT rolsuper FROM pg_roles WHERE rolname='postgres'")" == "$before" ]]
echo 'APD_REAL_SUPABASE_LOCAL_PRIVILEGED_RESTORE_AND_ROLLBACK_OK'

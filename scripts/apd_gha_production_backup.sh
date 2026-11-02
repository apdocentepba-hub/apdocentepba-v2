#!/usr/bin/env bash
# Manual, READ-ONLY production export; isolated restoration; encrypted-only upload.
set -euo pipefail
umask 077
[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" && "$GITHUB_REF" == "refs/heads/main" ]] ||
  { echo 'This job must be manually started from main.' >&2; exit 2; }
[[ "$APD_CONFIRM_BACKUP" == "RESPALDAR_APDOCENTEPBA" ]] ||
  { echo 'Explicit APD backup confirmation missing.' >&2; exit 2; }
: "$SUPABASE_DB_URL"
: "$APD_BACKUP_ENCRYPTION_PASSPHRASE"

python3 - <<'PY'
import os
from urllib.parse import urlparse
p=urlparse(os.environ["SUPABASE_DB_URL"])
ref="vvgkinkvojqwfuqaxijh"
host=p.hostname or ""
user=p.username or ""
direct=(host==f"db.{ref}.supabase.co" and user=="postgres")
pooler=(host.endswith(".pooler.supabase.com") and user==f"postgres.{ref}")
assert p.scheme in ("postgres", "postgresql") and (direct or pooler), "Unexpected database target"
assert p.path=="/postgres", "Unexpected database name"
assert p.password and len(p.password)>0, "Database URL must include password"
assert len(os.environ["APD_BACKUP_ENCRYPTION_PASSPHRASE"])>=32, "Encryption secret too short"
print("APDocentePBA production project target validated; secret values hidden.")
PY

command -v supabase >/dev/null
command -v psql >/dev/null
command -v docker >/dev/null
command -v gpg >/dev/null
docker info >/dev/null 2>&1 || { echo 'Docker daemon unavailable.' >&2; exit 2; }

root="$(mktemp -d)"
# Local encrypted output is the ONLY item later uploaded by GitHub.
ready="$GITHUB_WORKSPACE/_apd-encrypted-backup"
mkdir -m 700 -p "$ready"
cleanup() {
  [[ -d "$root" ]] && rm -rf -- "$root"
}
trap cleanup EXIT
mkdir -m 700 "$root/plain"
mkdir -m 700 "$root/restore_project"

counts_sql="SELECT (SELECT count(*) FROM public.users)::text || E'\t' || (SELECT count(*) FROM public.user_subscriptions)::text || E'\t' || (SELECT count(*) FROM public.apd_ofertas_global_current)::text;"
read_counts() {
  psql "$1" -X -q -A -t -v ON_ERROR_STOP=1 -c "$counts_sql" 2>/dev/null
}
# Never output raw database URLs or data. Unexpected connections fail closed.
baseline="$(read_counts "$SUPABASE_DB_URL")" ||
  { echo 'Could not read required production table counts.' >&2; exit 3; }
[[ "$baseline" =~ ^[0-9]+$'\t'[0-9]+$'\t'[0-9]+$ ]] ||
  { echo 'Invalid production counts.' >&2; exit 3; }

echo 'Exporting user-managed Supabase schema/roles/data (not Supabase-managed Auth/Storage objects).'
cd "$root/restore_project"
dump() {
  local name="$1"; shift
  if ! supabase db dump --db-url "$SUPABASE_DB_URL" --file "$root/plain/$name" "$@" \
       >/dev/null 2>"$root/dump.log"; then
    echo "Supabase CLI export of $name failed. No artifact will be uploaded." >&2
    exit 4
  fi
  [[ -s "$root/plain/$name" ]] || { echo "Empty export $name; refused." >&2; exit 4; }
}
# Export globals separately; the application public schema AND its rows are
# exported in ONE pg_dump operation / ONE PostgreSQL consistent snapshot.
dump roles.sql --role-only
if ! docker run --rm --network host \
      --user "$(id -u):$(id -g)" \
      --volume "$root/plain:/backup" \
      --env SUPABASE_DB_URL \
      postgres:17-alpine \
      sh -ec 'pg_dump --dbname="$SUPABASE_DB_URL" --format=plain --schema=public --no-owner --file=/backup/app.sql' \
      >/dev/null 2>"$root/dump-snapshot.log"; then
  echo 'Postgres 17 consistent public schema/data export failed. No artifact will be uploaded.' >&2
  exit 4
fi
[[ -s "$root/plain/app.sql" ]] ||
  { echo 'Empty combined application SQL snapshot; refused.' >&2; exit 4; }
after_dump="$(read_counts "$SUPABASE_DB_URL")" ||
  { echo 'Post-export count read failed.' >&2; exit 4; }
[[ "$baseline" == "$after_dump" ]] ||
  { echo 'Source table counts changed during export. Refusing inconsistent backup.' >&2; exit 4; }
printf '%s\n' "$baseline" > "$root/plain/counts.tsv"
(cd "$root/plain" && sha256sum roles.sql app.sql counts.tsv > SHA256SUMS)

encrypted="$ready/APDocentePBA_pre_migracion_$(date -u +%Y%m%dT%H%M%SZ).tar.gpg"
bash "$GITHUB_WORKSPACE/scripts/apd_gha_backup_crypto.sh" seal "$root/plain" "$encrypted"
bash "$GITHUB_WORKSPACE/scripts/apd_gha_backup_crypto.sh" verify "$encrypted" "$root/restored"

echo 'Starting isolated Supabase local Postgres restore; production will NOT be modified.'
supabase init >/dev/null 2>"$root/local-init.log" ||
  { echo 'Could not initialize isolated Supabase project.' >&2; exit 5; }
supabase start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
  >/dev/null 2>"$root/local-start.log" ||
  { echo 'Isolated Supabase Postgres could not start; restore NOT verified.' >&2; exit 5; }

# Same major version as production (Postgres 17) is required for a meaningful restore.
local_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
major="$(psql "$local_url" -X -A -t -q -v ON_ERROR_STOP=1 -c "SHOW server_version_num" 2>/dev/null)"
[[ "$major" =~ ^17[0-9]{4}$ ]] ||
  { echo 'Isolated PostgreSQL version is not 17; cannot approve restoration.' >&2; exit 5; }

if ! psql "$local_url" -X -q -v ON_ERROR_STOP=1 --single-transaction \
      -f "$root/restored/roles.sql" \
      -f "$root/restored/app.sql" \
      >/dev/null 2>"$root/restore-error.log"; then
  echo 'Isolated PostgreSQL restore failed. No artifact will be uploaded.' >&2
  exit 6
fi
actual="$(read_counts "$local_url")" ||
  { echo 'Restore completed but application count validation failed.' >&2; exit 6; }
[[ "$baseline" == "$actual" ]] ||
  { echo 'Restored application row counts do not match production baseline.' >&2; exit 6; }

# Independent encrypted package can be unsealed and used to restore those tables.
echo 'Verified: roles/schema/data encrypted, SHA-256 valid, PostgreSQL 17 isolated restore successful, core table counts equal.'
# The combined app.sql is a consistent snapshot; the auxiliary role export is not\n# transactionally synchronized. This is NOT an entire Supabase platform backup.\n# This marker never contains credentials or private records.
printf 'APD_BACKUP_APP_RESTORE_VERIFIED=true\n' >> "$GITHUB_STEP_SUMMARY"
printf 'Scope: public app schema and data from one PG17 snapshot; auxiliary roles export. Managed auth/storage/other schemas and Storage API objects NOT included.\n' >> "$GITHUB_STEP_SUMMARY"

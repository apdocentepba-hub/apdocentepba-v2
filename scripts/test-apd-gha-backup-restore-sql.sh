#!/usr/bin/env bash
# Restores encrypted MOCK Supabase application SQL to a disposable PostgreSQL 17 service.
# Never uses project secrets or connects to Supabase.
set -euo pipefail
umask 077
temp="$(mktemp -d)"
trap 'rm -rf -- "$temp"' EXIT
mkdir "$temp/plain"
printf '%s\n' '-- mocked roles, no live credentials' > "$temp/plain/roles.sql"
cat > "$temp/plain/app.sql" <<'SQL'
CREATE TABLE public.users (id text PRIMARY KEY);
CREATE TABLE public.user_subscriptions (id text PRIMARY KEY);
CREATE TABLE public.apd_ofertas_global_current (source_offer_key text PRIMARY KEY);
SQL
# combined with schema in the same snapshot
cat >> "$temp/plain/app.sql" <<'SQL'
COPY public.users (id) FROM stdin;
fake-user
\.
COPY public.user_subscriptions (id) FROM stdin;
fake-sub
\.
COPY public.apd_ofertas_global_current (source_offer_key) FROM stdin;
fake-offer-1
fake-offer-2
\.
SQL
printf '1\t1\t2\n' > "$temp/plain/counts.tsv"
(cd "$temp/plain" && sha256sum roles.sql app.sql counts.tsv > SHA256SUMS)
export APD_BACKUP_ENCRYPTION_PASSPHRASE='MOCK_ONLY_OFFLINE_GH_ACTIONS_RESTORE_32_CHARS'
bash scripts/apd_gha_backup_crypto.sh seal "$temp/plain" "$temp/safe.tar.gpg"
bash scripts/apd_gha_backup_crypto.sh verify "$temp/safe.tar.gpg" "$temp/unpacked"
export PGPASSWORD='apd_mock_test_only'
local_uri='postgresql://postgres@127.0.0.1:5432/apd_backup_test'
major="$(psql "$local_uri" -X -A -t -q -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')"
[[ "$major" =~ ^17[0-9]{4}$ ]]
psql "$local_uri" -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -f "$temp/unpacked/roles.sql" -f "$temp/unpacked/app.sql" >/dev/null
counts="$(psql "$local_uri" -X -A -t -q -v ON_ERROR_STOP=1 -c \
"SELECT (SELECT count(*) FROM public.users)::text || E'\t' || (SELECT count(*) FROM public.user_subscriptions)::text || E'\t' || (SELECT count(*) FROM public.apd_ofertas_global_current)::text;")"
[[ "$counts" == "$(cat "$temp/unpacked/counts.tsv")" ]]
echo 'APD_OFFLINE_PG17_RESTORE_OF_ENCRYPTED_MOCK_BACKUP_OK'

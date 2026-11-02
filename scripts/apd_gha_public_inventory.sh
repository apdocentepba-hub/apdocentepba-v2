#!/usr/bin/env bash
# Generate a deterministic row-count inventory of ALL public base tables.
# Only SELECT statements, no production DDL/DML and no private row contents.
set -euo pipefail
: "${APD_INVENTORY_DB_URL:?Missing read-only inventory database URL}"
rows="$(psql "$APD_INVENTORY_DB_URL" -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 <<'SQL'
SELECT format(
  'SELECT %L::text, count(*)::bigint FROM %I.%I;',
  n.nspname || '.' || c.relname, n.nspname, c.relname
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY n.nspname, c.relname
\gexec
SQL
)"
[[ -n "$rows" ]] || { echo 'Empty public table inventory; refusing.' >&2; exit 1; }
while IFS=$'\t' read -r table count; do
  [[ "$table" == public.* && "$count" =~ ^[0-9]+$ ]] ||
    { echo 'Malformed table inventory; refusing.' >&2; exit 1; }
done <<< "$rows"
printf '%s\n' "$rows" | LC_ALL=C sort

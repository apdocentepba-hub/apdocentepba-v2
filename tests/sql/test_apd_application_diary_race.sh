#!/usr/bin/env bash
set -euo pipefail
p=(psql -h localhost -U postgres -d fixture -v ON_ERROR_STOP=1 -Atq)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
q="SET ROLE service_role; WITH won AS (UPDATE public.user_application_diary SET revision=3 WHERE user_id='00000000-0000-0000-0000-000000000001' AND revision=2 RETURNING 1) SELECT count(*) FROM won;"
"${p[@]}" -c "$q" > "$tmp/a" & a=$!
"${p[@]}" -c "$q" > "$tmp/b" & b=$!
wait "$a"; wait "$b"
test "$(cat "$tmp/a" "$tmp/b" | sort | tr '\n' ' ')" = '0 1 '
echo 'PASS concurrent diary CAS: exactly one writer'

#!/usr/bin/env bash
set -euo pipefail
p=(psql -h localhost -U postgres -d fixture -v ON_ERROR_STOP=1 -Atq)
"${p[@]}" -c "UPDATE public.user_favorite_offers SET keys=ARRAY['D_1'], revision=3 WHERE user_id='00000000-0000-0000-0000-000000000001'"
d=$("${p[@]}" -c "select now()+interval '1 hour'")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
q="SET ROLE service_role; SELECT public.apd_claim_favorite_reminder('00000000-0000-0000-0000-000000000001','D_1','$d',clock_timestamp());"
"${p[@]}" -c "$q" > "$tmp/a" & a=$!
"${p[@]}" -c "$q" > "$tmp/b" & b=$!
wait "$a"; wait "$b"
test "$(cat "$tmp/a" "$tmp/b" | sort | tr '\n' ' ')" = '2h already_claimed '
echo 'PASS concurrent claim: exactly one dispatch permit'

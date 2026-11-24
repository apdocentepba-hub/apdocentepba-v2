#!/usr/bin/env bash
set -euo pipefail
p=(psql -h localhost -U postgres -d fixture -X -qAt -v ON_ERROR_STOP=1)
a=00000000-0000-0000-0000-000000000001
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
race() {
 local q1="$1" q2="$2"
 "${p[@]}" -c "SET ROLE service_role; $q1" >"$tmp/a" & local p1=$!
 "${p[@]}" -c "SET ROLE service_role; $q2" >"$tmp/b" & local p2=$!
 wait "$p1"; wait "$p2"
 local hits; hits=$(cat "$tmp/a" "$tmp/b" | grep -c '^1$' || true)
 test "$hits" = 1
}
race "INSERT INTO public.user_favorite_offers(user_id,keys,revision) VALUES('$a',ARRAY['D_1'],1) ON CONFLICT DO NOTHING RETURNING 1;" "INSERT INTO public.user_favorite_offers(user_id,keys,revision) VALUES('$a',ARRAY['D_2'],1) ON CONFLICT DO NOTHING RETURNING 1;"
race "UPDATE public.user_favorite_offers SET keys=ARRAY['D_3'],revision=2 WHERE user_id='$a' AND revision=1 RETURNING 1;" "UPDATE public.user_favorite_offers SET keys=ARRAY['D_4'],revision=2 WHERE user_id='$a' AND revision=1 RETURNING 1;"
test "$("${p[@]}" -c "SELECT count(*) FROM public.user_favorite_offers WHERE user_id='$a' AND revision=2 AND keys IN (ARRAY['D_3'],ARRAY['D_4']);")" = 1
echo 'PASS two independent PostgreSQL sessions: one initial insert and one CAS winner'

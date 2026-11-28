#!/usr/bin/env bash
# Only the dedicated disposable CI PostgreSQL service. No provider requests.
set -euo pipefail
umask 077
[[ "${APD_FIXTURE_ACK:-}" == "DISPOSABLE_COMMERCIAL_CONCURRENCY" && "${PGHOST:-}" == "127.0.0.1" && "${PGDATABASE:-}" == "apd_commercial_race_fixture" ]] || exit 2
psqlq(){ psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
[[ "$(psqlq -c 'SELECT current_database()')" == "$PGDATABASE" ]]
dir="$(mktemp -d)"
trap 'rm -rf -- "$dir"' EXIT
psqlq -f tests/sql/apd_commercial_legacy_concurrency_fixture.sql
wait_state(){
 local app="$1" event="$2"
 for _ in $(seq 1 100); do
  if [[ "$(psqlq -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='$app' AND wait_event_type='$event'")" == 1 ]]; then return 0; fi
  sleep .05
 done
 return 1
}
race(){
 local name="$1" first="$2" second="$3" expected1="$4" expected2="$5" a b
 PGAPPNAME="apd_race_${name}_first" psqlq -c "BEGIN; SET LOCAL ROLE service_role; $first; SELECT pg_sleep(6); COMMIT;" > "$dir/$name.first" & a=$!
 wait_state "apd_race_${name}_first" Timeout
 PGAPPNAME="apd_race_${name}_second" psqlq -c "BEGIN; SET LOCAL ROLE service_role; $second; COMMIT;" > "$dir/$name.second" & b=$!
 wait_state "apd_race_${name}_second" Lock
 wait "$a"; wait "$b"
 grep -Fq "$expected1" "$dir/$name.first"
 grep -Fq "$expected2" "$dir/$name.second"
 printf 'APD_RACE_%s_PASS\n' "$name"
}
a=00000000-0000-4000-8000-000000000011
b=00000000-0000-4000-8000-000000000012
c=00000000-0000-4000-8000-000000000013
race COURTESY_FIRST "SELECT public.apd_grant_legacy_complete_30d('$a')" "SELECT public.apd_reserve_complete_checkout('$a')" '"duplicate": false' '"reason": "existing_contract"'
race CHECKOUT_FIRST "SELECT public.apd_reserve_complete_checkout('$b')" "SELECT public.apd_grant_legacy_complete_30d('$b')" '"mode": "create"' '"reason": "checkout_requires_reconciliation"'
race DUPLICATE_GRANT "SELECT public.apd_grant_legacy_complete_30d('$c')" "SELECT public.apd_grant_legacy_complete_30d('$c')" '"duplicate": false' '"duplicate": true'
psqlq <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE v uuid:='00000000-0000-4000-8000-000000000012'; ref text; r jsonb;
BEGIN
 SELECT external_reference INTO STRICT ref FROM public.mercadopago_checkout_sessions WHERE user_id=v AND plan_code='COMPLETO';
 r:=public.apd_finalize_complete_checkout(v,ref,'https://www.mercadopago.com.ar/checkout/fixture','fixture-preference');
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Synthetic finalization failed'; END IF;
 r:=public.apd_apply_complete_approval('901',ref,'approved',2000,'ARS',clock_timestamp());
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Synthetic approval failed'; END IF;
 r:=public.apd_grant_legacy_complete_30d(v);
 IF r->>'reason' IS DISTINCT FROM 'existing_or_indefinite_right' THEN RAISE EXCEPTION 'Paid account granted courtesy'; END IF;
 IF public.apd_claim_complete_trial(v)->>'reason' IS DISTINCT FROM 'existing_history' THEN RAISE EXCEPTION 'Existing account granted trial'; END IF;
 IF public.apd_apply_complete_approval('901',ref,'approved',2000,'ARS',clock_timestamp())->>'duplicate' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Duplicate payment not idempotent'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.user_subscriptions WHERE source='legacy_transition_30d')<>2 THEN RAISE EXCEPTION 'Unexpected courtesy count'; END IF;
 IF (SELECT count(*) FROM public.apd_complete_payment_ledger WHERE payment_id='901')<>1 THEN RAISE EXCEPTION 'Unexpected payment count'; END IF;
 IF (SELECT count(*) FROM public.user_subscriptions WHERE user_id='00000000-0000-4000-8000-000000000012' AND plan_code='COMPLETO')<>1 THEN RAISE EXCEPTION 'Conflicting paid rights'; END IF;
 IF EXISTS(SELECT * FROM original_legacy EXCEPT ALL SELECT * FROM public.user_subscriptions) THEN RAISE EXCEPTION 'Historical subscriptions changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_subscriptions WHERE source='legacy_transition_30d' AND (mercadopago_preapproval_id IS NOT NULL OR current_period_ends_at-started_at<>interval '720 hours')) THEN RAISE EXCEPTION 'Courtesy duration or billing drift'; END IF;
END $$;
COMMIT;
SELECT 'APD_COMMERCIAL_LEGACY_CONCURRENCY_PG17_PASS';
SQL

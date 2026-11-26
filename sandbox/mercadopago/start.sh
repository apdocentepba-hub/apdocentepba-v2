#!/bin/bash
set -euo pipefail
cd /app
export PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=apd_commercial_full_qa PGUSER=postgres PGPASSWORD=fixture_only
export POSTGRES_DB=apd_commercial_full_qa POSTGRES_PASSWORD=fixture_only
/usr/local/bin/docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1 -c shared_buffers=16MB -c max_connections=20 > /tmp/apd-postgres.log 2>&1 &
pg_pid=$!
node_pid=''
stop(){ if [[ -n "$node_pid" ]]; then kill -TERM "$node_pid" 2>/dev/null || true; fi; kill -TERM "$pg_pid" 2>/dev/null || true; }
trap stop EXIT TERM INT
for i in $(seq 1 60); do if pg_isready -h 127.0.0.1 -U postgres -d apd_commercial_full_qa >/dev/null 2>&1; then break; fi; sleep 1; done
psql -X -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
if [[ $(psql -XAtqc "SELECT to_regclass('public.apd_commercial_qa_guard') IS NULL") == t ]]; then
 sql(){ psql -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null; }
 sql -f scripts/apd-commercial-db-fixture.sql
 sql -c 'ALTER TABLE public.subscription_plans ADD COLUMN mercadopago_plan_id text;'
 sql -f docs/sql/APD_COMMERCIAL_CONSOLIDATION_CANDIDATE.sql
 sql -f scripts/apd-commercial-payment-fixture.sql
 sql -c "DELETE FROM public.mercadopago_checkout_sessions; INSERT INTO public.users(id) VALUES('00000000-0000-4000-8000-000000000005');"
 sql -f docs/sql/APD_COMMERCIAL_PAYMENT_CANDIDATE.sql
 sql -f docs/sql/APD_COMMERCIAL_CHECKOUT_CANDIDATE.sql
 sql -f scripts/apd-commercial-preferences-fixture.sql
 sql -f docs/sql/APD_COMMERCIAL_PREFERENCES_CANDIDATE.sql
 sql -f docs/sql/APD_COMMERCIAL_ACTIVATE_CATALOG_CANDIDATE.sql
 sql -f scripts/apd-commercial-full-pg-fixture.sql
 sql -c "UPDATE public.user_subscriptions SET started_at=clock_timestamp()-interval '15 days',trial_ends_at=clock_timestamp()-interval '1 day' WHERE user_id='00000000-0000-4000-8000-000000000007' AND plan_code='TRIAL_14D';"
fi
node sandbox/mercadopago/server.mjs &
node_pid=$!
wait "$node_pid"

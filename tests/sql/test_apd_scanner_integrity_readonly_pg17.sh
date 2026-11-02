#!/usr/bin/env bash
# PostgreSQL 17 CI-only integrity checks with invented rows.
set -euo pipefail
: "${PGHOST:?missing disposable PGHOST}"
: "${PGUSER:?missing disposable PGUSER}"
: "${PGPASSWORD:?missing disposable PGPASSWORD}"
: "${PGDATABASE:?missing disposable PGDATABASE}"
sql=scripts/apd-scanner-integrity-readonly.sql
sql_key=scripts/apd-scanner-source-key-parity-readonly.sql
test -s "$sql"
test -s "$sql_key"

# Fail on any accidentally inserted SQL writing operation (exclude comments).
if grep -Ev '^\s*--' "$sql" | grep -Eiq '\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b'; then
  echo 'Preflight must remain SELECT-only' >&2
  exit 10
fi

psql -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TABLE public.apd_ofertas_global_current (
  source_offer_key text, idoferta text, iddetalle text, estado text, distrito text,
  escuela text, cargo text, area text, nivel_modalidad text, turno text,
  jornada text, hsmodulos text, cursodivision text, supl_desde text, supl_hasta text,
  finoferta text, ult_movimiento text, first_seen_at timestamptz,
  last_seen_at timestamptz, last_state_change_at timestamptz,
  times_seen bigint, state_changes bigint, raw jsonb, updated_at timestamptz
);
INSERT INTO public.apd_ofertas_global_current
(source_offer_key,idoferta,iddetalle,distrito,first_seen_at,last_seen_at,
 last_state_change_at,times_seen,state_changes)
VALUES
('D_100','100','100','AVELLANEDA','2026-11-01T10:00:00Z','2026-11-02T10:00:00Z',
 '2026-11-02T09:00:00Z',2,0),
('D_101','101','101','LA MATANZA','2026-11-01T10:00:00Z','2026-11-02T10:00:00Z',
 '2026-11-02T09:00:00Z',2,1);
SQL

# Same two fake offers keep their original Solr ID only in disposable JSON.
psql -X -q -v ON_ERROR_STOP=1 -c "
UPDATE public.apd_ofertas_global_current
SET raw = jsonb_build_object('id', iddetalle)" >/dev/null

check_key() {
  PGOPTIONS="-c default_transaction_read_only=on" psql -X -q -v ON_ERROR_STOP=1 -At -F '|' -f "$sql_key"
}

check() {
  PGOPTIONS="-c default_transaction_read_only=on" psql -X -q -v ON_ERROR_STOP=1 -At -F '|' -f "$sql"
}
snapshot="$(check)"
[[ "$snapshot" == 2\|2\|2\|*\|t ]] ||
  { echo 'Valid 24-column mock offer snapshot rejected' >&2; exit 2; }

# Prove the session is read-only: a write must fail even if someone modifies the script.
if PGOPTIONS="-c default_transaction_read_only=on" psql -X -q -v ON_ERROR_STOP=1   -c "INSERT INTO public.apd_ofertas_global_current(source_offer_key) VALUES ('forbidden')" >/dev/null 2>&1; then
  echo 'Read-only DB session unexpectedly accepted a write' >&2
  exit 3
fi
[[ "$(check)" == "$snapshot" ]] || { echo 'Read-only injection changed data' >&2; exit 4; }

# Simulate duplicate current-offer source key: must fail closed.
psql -X -q -v ON_ERROR_STOP=1 -c "
INSERT INTO public.apd_ofertas_global_current
(source_offer_key,idoferta,iddetalle,distrito,first_seen_at,last_seen_at,times_seen,state_changes)
VALUES ('D_101','102','102','LA MATANZA',now(),now(),1,0)" >/dev/null
duplicate="$(check)"
[[ "$duplicate" == 3\|2\|*\|f ]] ||
  { echo 'Duplicate source key went unnoticed' >&2; exit 5; }

# Restore mock fixture and simulate inverted timestamps.
psql -X -q -v ON_ERROR_STOP=1 -c "DELETE FROM public.apd_ofertas_global_current WHERE idoferta='102'" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE public.apd_ofertas_global_current SET first_seen_at='2026-11-03T00:00:00Z' WHERE idoferta='100'" >/dev/null
inverted="$(check)"
[[ "$inverted" == 2\|2\|*\|f ]] ||
  { echo 'Inverted first/last seen timestamp went unnoticed' >&2; exit 6; }

# Test canonical primary identity from real Worker: D_<digits(iddetalle)>.
parity="$(check_key)"
[[ "$parity" == '2|2|0|2|0|2|0|t' ]] ||
  { echo 'Valid canonical keys rejected by primary parity preflight' >&2; exit 7; }

psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE public.apd_ofertas_global_current SET source_offer_key='D_999' WHERE idoferta='100'" >/dev/null
[[ "$(check_key)" == '2|2|0|1|1|2|0|f' ]] ||
  { echo 'Wrong persisted source key went unnoticed' >&2; exit 8; }
psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE public.apd_ofertas_global_current SET source_offer_key='D_100' WHERE idoferta='100'" >/dev/null

psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE public.apd_ofertas_global_current SET raw=jsonb_build_object('id','777') WHERE idoferta='100'" >/dev/null
[[ "$(check_key)" == '2|2|0|2|0|2|1|f' ]] ||
  { echo 'Divergent raw Solr ID went unnoticed' >&2; exit 9; }
psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE public.apd_ofertas_global_current SET raw=jsonb_build_object('id','100') WHERE idoferta='100'" >/dev/null

psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE public.apd_ofertas_global_current SET iddetalle='no-numeric-key' WHERE idoferta='100'" >/dev/null
fallback="$(check_key)"
[[ "$fallback" == 2\|1\|1\|1\|0\|2\|1\|f ]] ||
  { echo 'Fallback requiring explicit review went unnoticed' >&2; exit 10; }
psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE public.apd_ofertas_global_current SET iddetalle='100' WHERE idoferta='100'" >/dev/null

[[ "$(check_key)" == "$parity" ]] ||
  { echo 'Restoring fake canonical keys did not restore parity' >&2; exit 11; }

echo 'APD_WORKER_PRIMARY_KEY_PARITY_PG17_PASSED: matching, wrong-key, raw mismatch, fallback review, readonly'

echo 'APD_SCANNER_READONLY_PG17_INTEGRITY_PRECHECK_PASSED: valid/duplicate/inverted/read-only'

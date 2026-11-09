#!/usr/bin/env bash
# APD database auth lab: REAL TCP/PostgreSQL connections as fresh LOGIN users.
# Disposable CI Docker postgres:17 only. NO Supabase, no production credentials.
set -euo pipefail
if [[ "${PGHOST:-}" != "localhost" || "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "apd_ci" || "${PGUSER:-}" != "apd_ci" ||
      -z "${PG_SERVICE_CONTAINER:-}" ]]; then
 echo 'APD_TCP_ROLE_DISABLED: requires disposable PG17 CI service' >&2
 exit 2
fi
image="$(docker inspect --format '{{.Config.Image}}' "$PG_SERVICE_CONTAINER")"
if [[ "$image" != 'postgres:17' ]]; then
 echo 'APD_TCP_ROLE_DISABLED: not a postgres:17 Docker service' >&2
 exit 2
fi

# Passwords exist in memory only and are never printed or committed as files.
app_pw="$(openssl rand -hex 32)"
observer_pw="$(openssl rand -hex 32)"
testuser="apd_lab_tcp_ingest"
observer="apd_lab_tcp_observer"
psql -X -q -v ON_ERROR_STOP=1 -v apppw="$app_pw" -v observepw="$observer_pw" <<'SQL'
CREATE ROLE apd_lab_tcp_ingest LOGIN INHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'apppw';
CREATE ROLE apd_lab_tcp_observer LOGIN INHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'observepw';
GRANT apd_lab_ingest TO apd_lab_tcp_ingest WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
GRANT apd_lab_observer TO apd_lab_tcp_observer WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
-- Existing test-only constructors must not accidentally be exposed to application sessions.
REVOKE EXECUTE ON FUNCTION apd_change_lab.fixture(text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apd_change_lab.fixture_row(text,text,text) FROM PUBLIC;
SQL

app() { env PGUSER="$testuser" PGPASSWORD="$app_pw" psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
observe() { env PGUSER="$observer" PGPASSWORD="$observer_pw" psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }

# Validate AUTHENTICATION at PostgreSQL boundary, not a simulated SET ROLE.
first="$(app -c 'SELECT current_user||chr(124)||session_user;')"
second="$(observe -c 'SELECT current_user||chr(124)||session_user;')"
if [[ "$first" != "$testuser|$testuser" || "$second" != "$observer|$observer" ]]; then
 echo 'APD_TCP_ROLE_FAIL: independent database logins did not authenticate' >&2
 exit 1
fi

# Check catalog permissions as disposable CI administrator; the authenticated
# role has no USAGE of the internal schema, and must not be able to inspect it.
# No direct table access, no original procedures, no test-only constructors,
# no schema ownership and no ability to elevate by SET ROLE.
privs="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN
 NOT has_table_privilege('apd_lab_tcp_ingest','apd_change_lab.captures','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('apd_lab_tcp_ingest','apd_change_lab.audit_events','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_schema_privilege('apd_lab_tcp_ingest','apd_change_lab','CREATE')
 AND NOT has_schema_privilege('apd_lab_tcp_ingest','apd_change_lab','USAGE')
 AND has_schema_privilege('apd_lab_tcp_ingest','apd_change_api','USAGE')
 AND NOT has_schema_privilege('apd_lab_tcp_ingest','apd_change_api','CREATE')
 AND NOT pg_has_role('apd_lab_tcp_ingest','apd_lab_ingest','SET')
 AND pg_has_role('apd_lab_tcp_ingest','apd_lab_ingest','USAGE')
 AND NOT has_function_privilege('apd_lab_tcp_ingest',
  'apd_change_lab.save_compact(jsonb,boolean)','EXECUTE')
 AND NOT has_function_privilege('apd_lab_tcp_ingest',
  'apd_change_lab.record_audit_batch(jsonb,boolean)','EXECUTE')
 AND NOT has_function_privilege('apd_lab_tcp_ingest',
  'apd_change_lab.fixture(text,text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('apd_lab_tcp_ingest',
  'apd_change_lab.fixture_row(text,text,text)','EXECUTE')
 AND has_function_privilege('apd_lab_tcp_ingest',
  'apd_change_api.submit_compact(jsonb)','EXECUTE')
 AND has_function_privilege('apd_lab_tcp_ingest',
  'apd_change_api.submit_audit(jsonb)','EXECUTE')
 THEN 'PASS' ELSE 'FAIL' END;")"
if [[ "$privs" != "PASS" ]]; then
 echo 'APD_TCP_ROLE_FAIL: permission contract invalid' >&2
 exit 1
fi

assert_permission_denied() {
 local label="$1" sql="$2" err rc=0
 err="$(mktemp /tmp/apd-tcp-deny.XXXXXXXX)"
 app -c "$sql" >/dev/null 2>"$err" || rc=$?
 if ((rc==0)) || ! grep -Eq 'permission denied|42501' "$err"; then
  echo "APD_TCP_ROLE_FAIL: $label was not rejected by privileges" >&2
  rm -f "$err"
  exit 1
 fi
 rm -f "$err"
}
assert_permission_denied 'read captures' 'SELECT count(*) FROM apd_change_lab.captures;'
assert_permission_denied 'delete audit events' 'DELETE FROM apd_change_lab.audit_events;'
assert_permission_denied 'direct internal procedure' \
 "SELECT * FROM apd_change_lab.save_compact('{}'::jsonb,true);"
assert_permission_denied 'test-only fixture' \
 "SELECT apd_change_lab.fixture('MAGDALENA','2026-11-09T07:00:00Z','[]'::jsonb);"
assert_permission_denied 'escalation by SET ROLE' 'SET ROLE apd_lab_ingest;'

# A separately authenticated reader cannot access ingest functions.
obs=0
obs_err="$(mktemp /tmp/apd-tcp-observer.XXXXXXXX)"
observe -c "SELECT * FROM apd_change_api.submit_compact('{}'::jsonb);" \
 >/dev/null 2>"$obs_err" || obs=$?
if ((obs==0)) || ! grep -Eq 'permission denied|42501' "$obs_err"; then
 echo 'APD_TCP_ROLE_FAIL: observer can execute private ingest functions' >&2
 rm -f "$obs_err"
 exit 1
fi
rm -f "$obs_err"

# Generate actual compact + audit envelopes via same Node code as production candidate,
# but using synthetic offers only. No secrets or external data stored.
payload="$(node --input-type=module <<'JS'
import {compactCaptureFromPages} from './scripts/apd-offer-compact-capture.mjs';
import {prepareOfferAuditBatch} from './scripts/apd-offer-audit-batch.mjs';
const offer={source_offer_key:'D_TCP_1',estado:'Publicada',distrito:'MAGDALENA',
  finoferta:'2026-11-12T07:30:00Z',turno:'Mañana',cargo:'Preceptor'};
const take=(o,t)=>compactCaptureFromPages({scope:'MAGDALENA',capturedAt:t,
  pages:[{offset:0,sourceTotal:1,rows:[o]}]});
const previous=take(offer,'2026-11-09T08:00:00Z');
const current=take({...offer,turno:'Tarde'},'2026-11-09T09:00:00Z');
const batch=prepareOfferAuditBatch(previous,current,{
  nowMs:Date.parse('2026-11-09T09:03:00Z')});
if(!previous.complete||!current.complete||!batch.verified||batch.events.length!==1)
 throw Error('Bad isolated test payload');
console.log(JSON.stringify({previous,current,batch}));
JS
)"

# Each call runs over a different AUTHENTICATED CLIENT CONNECTION (never SET ROLE).
s1="$(app -v obj="$payload" <<'SQL'
SELECT applied::text||chr(124)||retained::text
 FROM apd_change_api.submit_compact(:'obj'::jsonb->'previous');
SQL
)"
s2="$(app -v obj="$payload" <<'SQL'
SELECT applied::text||chr(124)||retained::text
 FROM apd_change_api.submit_compact(:'obj'::jsonb->'current');
SQL
)"
a1="$(app -v obj="$payload" <<'SQL'
SELECT added::text||chr(124)||retained::text
 FROM apd_change_api.submit_audit(:'obj'::jsonb->'batch');
SQL
)"
a2="$(app -v obj="$payload" <<'SQL'
SELECT added::text||chr(124)||retained::text
 FROM apd_change_api.submit_audit(:'obj'::jsonb->'batch');
SQL
)"
if [[ "$s1" != 'true|1' || "$s2" != 'true|2' ||
      "$a1" != '1|1' || "$a2" != '0|1' ]]; then
 echo "APD_TCP_ROLE_FAIL: staged results not idempotent $s1/$s2/$a1/$a2" >&2
 exit 1
fi

# Another actual authenticated connection must not forge before/after values.
fake=0
fake_err="$(mktemp /tmp/apd-tcp-fake.XXXXXXXX)"
app -v obj="$payload" <<'SQL' >/dev/null 2>"$fake_err" || fake=$?
SELECT * FROM apd_change_api.submit_audit(jsonb_set(
 :'obj'::jsonb->'batch',
 '{events,0,before}',
 '"FORGED"'::jsonb
));
SQL
if ((fake==0)) || ! grep -Eq 'Event values not proven by two snapshots' "$fake_err"; then
 echo 'APD_TCP_ROLE_FAIL: forged event was not rejected by real connection' >&2
 rm -f "$fake_err"
 exit 1
fi
rm -f "$fake_err"

# Verify with separate trusted CI admin, not through the restricted login.
proof="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
SELECT (SELECT count(*) FROM apd_change_lab.captures WHERE scope='MAGDALENA')
||chr(124)||
(SELECT count(*) FROM apd_change_lab.audit_events
 WHERE scope='MAGDALENA' AND status='audit_only')||chr(124)||
(SELECT count(*) FROM apd_change_lab.audit_events
 WHERE scope='MAGDALENA' AND before_value='FORGED');")"
if [[ "$proof" != '2|1|0' ]]; then
 echo 'APD_TCP_ROLE_FAIL: unexpected private records after authenticated requests' >&2
 exit 1
fi
echo 'APD_TCP_ROLE_PG17_PASSED independent_logins=2 compact_captures=2 audit_events=1 unauthorized_writes=0'

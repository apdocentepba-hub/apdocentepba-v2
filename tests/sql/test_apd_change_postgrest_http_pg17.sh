#!/usr/bin/env bash
# APD: PostgREST HTTP + JWT against ephemeral PostgreSQL 17 only.
# NO production Supabase / Cloudflare / authenticated users.
set -euo pipefail
if [[ "${PGHOST:-}" != "localhost" || "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "apd_ci" || "${PGUSER:-}" != "apd_ci" ||
      -z "${PG_SERVICE_CONTAINER:-}" ]]; then
 echo 'APD_POSTGREST_DISABLED: disposable CI database required' >&2
 exit 2
fi
image="$(docker inspect --format '{{.Config.Image}}' "$PG_SERVICE_CONTAINER")"
if [[ "$image" != "postgres:17" ]]; then
 echo 'APD_POSTGREST_DISABLED: not PostgreSQL 17 disposable CI service' >&2
 exit 2
fi

# Secret values are generated each run, never printed or committed.
auth_pw="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 48)"
psql -X -q -v ON_ERROR_STOP=1 -v auth_pw="$auth_pw" <<'SQL'
CREATE ROLE apd_lab_pgrst_auth LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'auth_pw';
GRANT apd_lab_ingest TO apd_lab_pgrst_auth WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT apd_lab_observer TO apd_lab_pgrst_auth WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
DO $verify$
BEGIN
 IF has_schema_privilege('apd_lab_pgrst_auth','apd_change_lab','USAGE') OR
    pg_has_role('apd_lab_pgrst_auth','apd_lab_ingest','USAGE') OR
    NOT pg_has_role('apd_lab_pgrst_auth','apd_lab_ingest','SET') OR
    NOT pg_has_role('apd_lab_pgrst_auth','apd_lab_observer','SET') THEN
  RAISE EXCEPTION 'PostgREST authenticator has unapproved grants';
 END IF;
END $verify$;
SQL

pgrst_image="postgrest/postgrest:v14.18"
name="apd_pgrst_lab_${GITHUB_RUN_ID:-local}"
cleanup() {
 docker rm -f "$name" >/dev/null 2>&1 || true
 unset auth_pw jwt_secret
}
trap cleanup EXIT

# Linux Github hosted runner: host networking can reach disposable PG17
# via its forwarded localhost:5432 port.
docker run -d --rm --name "$name" --network host \
 -e "PGRST_DB_URI=postgres://apd_lab_pgrst_auth:${auth_pw}@localhost:5432/apd_ci" \
 -e "PGRST_DB_SCHEMAS=apd_change_lab" \
 -e "PGRST_DB_ANON_ROLE=apd_lab_observer" \
 -e "PGRST_JWT_SECRET=${jwt_secret}" \
 -e "PGRST_SERVER_HOST=127.0.0.1" \
 -e "PGRST_SERVER_PORT=3000" \
 -e "PGRST_DB_CHANNEL_ENABLED=false" \
 "$pgrst_image" >/dev/null

ready=0
for _ in $(seq 1 40); do
 http_status="$(curl --silent --max-time 2 -o /dev/null -w '%{http_code}' \
  http://127.0.0.1:3000/ || true)"
 if [[ "$http_status" =~ ^[1-4][0-9][0-9]$ ]]; then ready=1; break; fi
 sleep 1
done
if [[ "$ready" != 1 ]]; then
 echo 'APD_POSTGREST_FAIL: local API not ready' >&2
 # No raw Docker environment or logs: credentials remain private.
 exit 1
fi

APD_LAB_POSTGREST_URL="http://127.0.0.1:3000" \
 APD_LAB_JWT_SECRET="$jwt_secret" \
 node scripts/test-apd-postgrest-http.mjs

echo 'APD_POSTGREST_HTTP_PG17_PASSED isolated_http=1 real_jwt=1 no_production=1'

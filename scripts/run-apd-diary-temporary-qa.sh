#!/usr/bin/env bash
# One-off QA only. Synthetic data; temporary unclaimed Cloudflare account.
set -euo pipefail
umask 077
[[ "${APD_QA_TEMPORARY_AUTHORIZED:-}" == "yes" ]] || { echo 'Explicit temporary-preview approval required'; exit 1; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${PGHOST:-}" == "127.0.0.1" && "${PGDATABASE:-}" == "apd_diary_qa" ]] || exit 1
[[ -z "${CLOUDFLARE_API_TOKEN:-}" && -z "${CLOUDFLARE_ACCOUNT_ID:-}" && -z "${CLOUDFLARE_API_KEY:-}" && -z "${CF_API_TOKEN:-}" ]] || exit 1
work="$(mktemp -d)"
gateway_pid=""
tunnel_pid=""
cleanup(){
  [[ -z "$tunnel_pid" ]] || kill "$tunnel_pid" 2>/dev/null || true
  [[ -z "$gateway_pid" ]] || kill "$gateway_pid" 2>/dev/null || true
  docker rm -f apd-diary-qa-postgrest >/dev/null 2>&1 || true
  rm -rf "$work" tmp/apd-career
  echo APD_DIARY_TEMPORARY_LOCAL_CLEANUP_DONE
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export HOME="$work/home" XDG_CONFIG_HOME="$work/home/config"
mkdir -p "$HOME" "$XDG_CONFIG_HOME"
export APD_DIARY_QA_DB_KEY="$(openssl rand -hex 32)"
export APD_DIARY_QA_ACCESS_KEY="$(openssl rand -hex 32)"
export APD_DIARY_QA_SESSION_A="$(openssl rand -hex 32)"
export APD_DIARY_QA_SESSION_A_NEW="$(openssl rand -hex 32)"
export APD_DIARY_QA_SESSION_B="$(openssl rand -hex 32)"
for v in APD_DIARY_QA_DB_KEY APD_DIARY_QA_ACCESS_KEY APD_DIARY_QA_SESSION_A APD_DIARY_QA_SESSION_A_NEW APD_DIARY_QA_SESSION_B; do
  printf '::add-mask::%s\n' "${!v}"
done
node scripts/apd-diary-qa-db-gateway.mjs --self-test
node scripts/test-apd-diary-qa-worker-guard.mjs
node scripts/test-apd-diary-temporary-hosted.mjs --self-test
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
SQL
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_career_http_fixture.sql
psql -X -v ON_ERROR_STOP=1 -f docs/sql/APD_APPLICATION_DIARY_CANDIDATE.sql
psql -X -v ON_ERROR_STOP=1 -v t1="$APD_DIARY_QA_SESSION_A" -v t2="$APD_DIARY_QA_SESSION_A_NEW" -v t3="$APD_DIARY_QA_SESSION_B" <<'SQL'
INSERT INTO public.sessions(token,user_id,metodo,created_at,expires_at,activo) VALUES
 (:'t1','11111111-1111-4111-8111-111111111111','password',now(),now()+interval '15 minutes',true),
 (:'t2','11111111-1111-4111-8111-111111111111','password',now(),now()+interval '15 minutes',true),
 (:'t3','22222222-2222-4222-8222-222222222222','password',now(),now()+interval '15 minutes',true);
SQL
docker run -d --rm --name apd-diary-qa-postgrest --network host \
 -e PGRST_DB_URI=postgres://postgres:test_only@127.0.0.1:5432/apd_diary_qa \
 -e PGRST_DB_ANON_ROLE=service_role -e PGRST_DB_SCHEMAS=public \
 -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT=3301 \
 postgrest/postgrest:v16.3 >/dev/null
curl --silent --fail --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:3301/ >/dev/null
node scripts/apd-diary-qa-db-gateway.mjs >"$work/gateway.log" 2>&1 &
gateway_pid=$!
curl --silent --retry 10 --retry-connrefused --retry-delay 1 -o /dev/null http://127.0.0.1:3302/rest/v1/sessions
[[ "$(curl --silent -o /dev/null -w '%{http_code}' http://127.0.0.1:3302/rest/v1/sessions)" == 401 ]]
curl --silent --show-error --fail --location --max-time 60 \
 https://github.com/cloudflare/cloudflared/releases/download/2026.11.0/cloudflared-linux-amd64 -o "$work/cloudflared"
printf '%s  %s\n' 51f7c68b57ed7269164075d7e789efce5b59355982f06392deeb037d982a51fd "$work/cloudflared" | sha256sum -c -
chmod 700 "$work/cloudflared"
"$work/cloudflared" tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:3302 >"$work/tunnel.log" 2>&1 &
tunnel_pid=$!
for i in $(seq 1 35); do
 export APD_QA_DB_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$work/tunnel.log" | head -n1 || true)"
 [[ -n "$APD_QA_DB_URL" ]] && break
 kill -0 "$tunnel_pid" 2>/dev/null || break
 sleep 1
done
[[ "$APD_QA_DB_URL" =~ ^https://[a-z0-9-]+\.trycloudflare\.com$ ]] || { echo 'Quick Tunnel failed'; exit 1; }
printf '::add-mask::%s\n' "$APD_QA_DB_URL"
for i in $(seq 1 20); do
 code="$(curl --silent --max-time 5 -o /dev/null -w '%{http_code}' "$APD_QA_DB_URL/rest/v1/sessions" || true)"
 [[ "$code" == 401 ]] && break
 sleep 1
done
[[ "$code" == 401 ]] || { echo 'Tunnel authentication check failed'; exit 1; }
echo APD_DIARY_QA_TUNNEL_AUTH_PASS
test -s tmp/apd-career/active-worker.mjs
APD_CAREER_LIVE_SOURCE=tmp/apd-career/active-worker.mjs node scripts/build-apd-career-worker-candidate.mjs
node --check tmp/apd-career/worker-career-candidate.mjs
cp tmp/apd-career/worker-career-candidate.mjs "$work/candidate.mjs"
cp scripts/apd-diary-qa-worker-guard.mjs "$work/guard.mjs"
printf '%s\n' "import worker from './candidate.mjs'; import {wrapDiaryQA} from './guard.mjs'; export default wrapDiaryQA(worker);" >"$work/worker.mjs"
export APD_QA_WORKER_NAME="apd-diary-qa-$(openssl rand -hex 6)"
export APD_QA_WORKDIR="$work"
node --input-type=module <<'JS'
import fs from 'node:fs';
const start=Date.now();
fs.writeFileSync(process.env.APD_QA_WORKDIR+'/wrangler.json',JSON.stringify({
 name:process.env.APD_QA_WORKER_NAME, main:'worker.mjs', compatibility_date:'2026-04-01',
 workers_dev:true, preview_urls:false,
 vars:{APD_QA_START_MS:String(start),APD_QA_EXPIRES_MS:String(start+15*60*1000),
 APD_QA_ACCESS_KEY:process.env.APD_DIARY_QA_ACCESS_KEY,APD_QA_DB_KEY:process.env.APD_DIARY_QA_DB_KEY,
 APD_QA_DB_URL:process.env.APD_QA_DB_URL}
}));
JS
# Do not echo Wrangler output: it contains a bearer claim URL. No account is claimed.
if ! (cd "$work" && npm exec --yes --package=wrangler@4.102.0 -- wrangler deploy --temporary --config wrangler.json >"$work/deploy.log" 2>&1); then
  echo 'Temporary deployment failed (private CLI output withheld)'
  exit 1
fi
export APD_DIARY_QA_URL="$(node --input-type=module <<'JS'
import fs from 'node:fs';
const text=fs.readFileSync(process.env.APD_QA_WORKDIR+'/deploy.log','utf8');
const host=new RegExp('https://'+process.env.APD_QA_WORKER_NAME+'\\.[a-z0-9-]+\\.workers\\.dev','g');
const urls=[...new Set(text.match(host)||[])];
if(urls.length!==1||urls[0].endsWith('.apdocentepba.workers.dev'))process.exit(1);
console.log(urls[0]);
JS
)"
printf '::add-mask::%s\n' "$APD_DIARY_QA_URL"
echo APD_DIARY_TEMPORARY_WORKER_DEPLOYED
node scripts/test-apd-diary-temporary-hosted.mjs
test "$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.user_application_diary WHERE jsonb_array_length(entries)>0")" = 0
echo APD_DIARY_TEMPORARY_FIXTURE_CLEAN_PASS

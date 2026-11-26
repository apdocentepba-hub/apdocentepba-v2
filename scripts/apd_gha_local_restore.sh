#!/usr/bin/env bash
# Only a freshly created, disposable Supabase CLI container on the hosted runner.
# Never accepts a remote URL or a production credential.
set -euo pipefail
umask 077
[[ "$#" == 3 ]] || exit 2
container="$1"; restored="$2"; diagnostic="$3"
[[ "$container" == supabase_db_restore_project ]] || { echo 'Unexpected local container'; exit 2; }
[[ "$(docker inspect -f '{{.State.Running}}' "$container")" == true ]] || exit 2
[[ "$(docker port "$container" 5432/tcp)" =~ :54322($|$'\n') ]] || { echo 'Unexpected local database port'; exit 2; }
# Exec uses the local Unix socket. No remote URI or source password is accepted.
admin() {
  docker exec -i "$container" psql -U supabase_admin -d postgres -X -q -At -v ON_ERROR_STOP=1 "$@"
}
identity="$(admin -c "SELECT current_user||':'||rolsuper::text||':'||(inet_server_addr() IS NULL)::text FROM pg_roles WHERE rolname=current_user" 2>"$diagnostic")" ||
  { echo 'Local administrative connection failed'; exit 5; }
[[ "$identity" == 'supabase_admin:true:true' ]] || { echo 'Local administrative identity not verified'; exit 5; }
initial="$(admin -c "SELECT rolsuper::text FROM pg_roles WHERE rolname='postgres'" 2>"$diagnostic")"
[[ "$initial" == true || "$initial" == false ]] || exit 5
# Elevate only the disposable local postgres role. Restore using postgres so
# --no-owner objects retain their expected ownership. Revert even on failure.
revert() {
  if [[ "$initial" == false ]]; then
    admin -c 'ALTER ROLE postgres NOSUPERUSER' >/dev/null 2>>"$diagnostic" || return 1
  fi
  [[ "$(admin -c "SELECT rolsuper::text FROM pg_roles WHERE rolname='postgres'" 2>>"$diagnostic")" == "$initial" ]]
}
trap 'revert || echo "Local privilege cleanup failed" >&2' EXIT
if [[ "$initial" == false ]]; then
  admin -c 'ALTER ROLE postgres SUPERUSER' >/dev/null 2>"$diagnostic" || { echo 'Local restore privilege setup failed'; exit 5; }
fi
[[ "$(admin -c "SELECT rolsuper::text FROM pg_roles WHERE rolname='postgres'" 2>"$diagnostic")" == true ]] || exit 5
# No stripping grants, no ignoring SQL errors. File arguments retain line numbers.
docker cp "$restored/roles.sql" "$container:/tmp/apd_restore_roles.sql" >/dev/null
docker cp "$restored/app.sql" "$container:/tmp/apd_restore_app.sql" >/dev/null
# psql runs as root in this disposable container, reading mode 0600 copies.
if ! docker exec -i "$container" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate --single-transaction \
   -f /tmp/apd_restore_roles.sql -f /tmp/apd_restore_app.sql >/dev/null 2>"$diagnostic"; then
  # Diagnostic helper expects canonical roles.sql/app.sql names.
  sed -i 's@/tmp/apd_restore_\(roles\|app\)\.sql:@/tmp/\1.sql:@' "$diagnostic"
  docker exec "$container" rm -f /tmp/apd_restore_roles.sql /tmp/apd_restore_app.sql >/dev/null
  exit 6
fi
docker exec "$container" rm -f /tmp/apd_restore_roles.sql /tmp/apd_restore_app.sql >/dev/null
revert || { echo 'Local privilege cleanup failed'; exit 6; }
trap - EXIT
echo 'APD_LOCAL_ADMIN_RESTORE_PRIVILEGES_REVERTED'

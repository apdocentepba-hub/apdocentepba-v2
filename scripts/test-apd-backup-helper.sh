#!/usr/bin/env bash
# Aislamiento estricto: Supabase CLI y Docker se reemplazan por dobles sin red.
set -euo pipefail
command -v pwsh >/dev/null
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/fakebin" "$tmp/export-root"
cat > "$tmp/fakebin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
if [[ "$1" == "info" ]]; then echo "mock"; exit 0; fi
exit 24
FAKE_DOCKER
cat > "$tmp/fakebin/supabase" <<'FAKE_SUPABASE'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "--version" ]]; then echo "2.0.0-mock"; exit 0; fi
if [[ "$1" == "init" ]]; then exit 0; fi
if [[ "$1" == "link" ]]; then
  [[ "$2" == "--project-ref" && "$3" == "vvgkinkvojqwfuqaxijh" ]]
  exit
fi
if [[ "$1" == "db" && "$2" == "dump" ]]; then
  shift 2
  file=""
  while (( $# )); do
    if [[ "$1" == "--file" ]]; then file="$2"; shift 2; else shift; fi
  done
  [[ -n "$file" ]]
  printf -- '-- FAKE CI DATA ONLY: %s\n' "$(basename "$file")" > "$file"
  exit 0
fi
echo "Unexpected fake CLI command" >&2
exit 1
FAKE_SUPABASE
chmod +x "$tmp/fakebin/docker" "$tmp/fakebin/supabase"
export PATH="$tmp/fakebin:$PATH"

script="scripts/APDocentePBA_respaldo_pre_migracion.ps1"
pwsh -NoProfile -NonInteractive -File "$script" -CheckOnly
if [[ -n "$(ls -A "$tmp/export-root")" ]]; then
  echo "CheckOnly must not create backups" >&2
  exit 1
fi
pwsh -NoProfile -NonInteractive -File "$script" -DestinationRoot "$tmp/export-root"
count="$(find "$tmp/export-root" -mindepth 1 -maxdepth 1 -type d | wc -l)"
[[ "$count" -eq 1 ]]
backup="$(find "$tmp/export-root" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[[ ! -e "$backup/EXPORTACION_INCOMPLETA.txt" ]]
[[ ! -d "$backup/workspace_temporal_cli" ]]
[[ -s "$backup/manifest.json" ]]
pwsh -NoProfile -NonInteractive -File "$script" -VerifyPath "$backup"
printf '\nTAMPERED\n' >> "$backup/data.sql"
if pwsh -NoProfile -NonInteractive -File "$script" -VerifyPath "$backup"; then
 echo "Tampered backup was incorrectly accepted" >&2
 exit 1
fi
echo "APD_POWERSHELL_MOCK_BACKUP_AND_TAMPER_TEST_OK"

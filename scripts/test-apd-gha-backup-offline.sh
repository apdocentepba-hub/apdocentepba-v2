#!/usr/bin/env bash
# No Supabase connection, real credentials, or user data. Safe for PR CI.
set -euo pipefail
umask 077
dir="$(mktemp -d)"
trap 'rm -rf -- "$dir"' EXIT
mkdir "$dir/plain"
printf '%s\n' '-- ONLY MOCK ROLE FIXTURE' > "$dir/plain/roles.sql"
printf '%s\n' '-- ONLY MOCK SCHEMA + DATA SNAPSHOT' > "$dir/plain/app.sql"

printf '50\t55\t2609\n' > "$dir/plain/counts.tsv"
(cd "$dir/plain" && sha256sum roles.sql app.sql counts.tsv > SHA256SUMS)

export APD_BACKUP_ENCRYPTION_PASSPHRASE='MOCK_ONLY_OFFLINE_ENCRYPTION_KEY_20261102_NOT_REAL'
script='scripts/apd_gha_backup_crypto.sh'
bash "$script" seal "$dir/plain" "$dir/archive.tar.gpg"
[[ -s "$dir/archive.tar.gpg" ]]
# Explicitly verify the artifact does not reveal dump contents.
if grep -qa 'ONLY MOCK SCHEMA + DATA SNAPSHOT' "$dir/archive.tar.gpg"; then
  echo 'Plaintext leaked into encrypted artifact.' >&2
  exit 1
fi
bash "$script" verify "$dir/archive.tar.gpg" "$dir/recovered"
cmp "$dir/plain/app.sql" "$dir/recovered/app.sql"
cmp "$dir/plain/SHA256SUMS" "$dir/recovered/SHA256SUMS"

# Wrong key and altered ciphertext MUST fail without creating an accepted backup.
export APD_BACKUP_ENCRYPTION_PASSPHRASE='WRONG_MOCK_ONLY_OFFLINE_KEY_OF_32_OR_MORE_CHARACTERS'
if bash "$script" verify "$dir/archive.tar.gpg" "$dir/wrong-key" > /dev/null 2>&1; then
  echo 'Wrong key unexpectedly accepted.' >&2
  exit 1
fi
export APD_BACKUP_ENCRYPTION_PASSPHRASE='MOCK_ONLY_OFFLINE_ENCRYPTION_KEY_20261102_NOT_REAL'
cp "$dir/archive.tar.gpg" "$dir/altered.tar.gpg"
python3 - "$dir/altered.tar.gpg" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
data=bytearray(p.read_bytes())
assert len(data)>100
data[len(data)//2] ^= 1
p.write_bytes(data)
PY
if bash "$script" verify "$dir/altered.tar.gpg" "$dir/altered" >/dev/null 2>&1; then
  echo 'Altered ciphertext unexpectedly accepted.' >&2
  exit 1
fi
printf 'tampered\n' >> "$dir/plain/app.sql"
if bash "$script" seal "$dir/plain" "$dir/should-not-exist.tar.gpg" >/dev/null 2>&1; then
  echo 'Changed plaintext with outdated SHA-256 unexpectedly sealed.' >&2
  exit 1
fi
echo 'APD_GHA_OFFLINE_BACKUP_CRYPTO_TESTS_PASSED'

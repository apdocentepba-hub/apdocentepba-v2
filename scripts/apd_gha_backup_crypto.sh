#!/usr/bin/env bash
# APDocentePBA encrypted artifact operations. Never logs or uploads plaintext.
set -euo pipefail
umask 077

usage() { echo 'Use: apd_gha_backup_crypto.sh seal <folder> <encrypted-file> | verify <encrypted-file> <restore-folder>' >&2; exit 2; }
[[ $# == 3 ]] || usage
mode="$1"; source="$2"; destination="$3"
: "$APD_BACKUP_ENCRYPTION_PASSPHRASE"
if (( $(printf '%s' "$APD_BACKUP_ENCRYPTION_PASSPHRASE" | wc -c) < 32 )); then
  echo 'Encryption passphrase must contain at least 32 characters.' >&2
  exit 2
fi
command -v gpg >/dev/null
command -v tar >/dev/null
command -v sha256sum >/dev/null

case "$mode" in
  seal)
    [[ -d "$source" && ! -e "$destination" ]] || { echo 'Invalid source directory or output exists.' >&2; exit 2; }
    for f in roles.sql schema.sql data.sql counts.tsv SHA256SUMS; do
      [[ -s "$source/$f" ]] || { echo 'Missing or empty backup component.' >&2; exit 3; }
    done
    (cd "$source" && sha256sum --status --check SHA256SUMS)
    mkdir -p "$(dirname "$destination")"
    encrypted_parent="$(cd "$(dirname "$destination")" && pwd -P)"
    output="$encrypted_parent/$(basename "$destination")"
    tarfile="$(mktemp "$encrypted_parent/apd-archive.XXXXXXXX.tar")"
    trap 'rm -f "$tarfile"' EXIT
    tar --create --file="$tarfile" --directory="$source" roles.sql schema.sql data.sql counts.tsv SHA256SUMS
    # Passphrase travels only through file descriptor 3 (never CLI arguments or logs).
    gpg --batch --yes --no-tty --pinentry-mode loopback --cipher-algo AES256 \
      --s2k-digest-algo SHA512 --s2k-count 65011712 --compress-algo none \
      --passphrase-fd 3 --symmetric --output "$output" "$tarfile" \
      3<<<"$APD_BACKUP_ENCRYPTION_PASSPHRASE" >/dev/null 2>&1
    [[ -s "$output" ]] || { echo 'Encryption failed.' >&2; exit 4; }
    echo 'Encrypted package generated; plaintext not published.'
    ;;
  verify)
    [[ -s "$source" && ! -e "$destination" ]] || { echo 'Invalid encrypted input or restore folder already exists.' >&2; exit 2; }
    parent="$(dirname "$destination")"
    mkdir -p "$parent"
    temp_tar="$(mktemp "$parent/apd-verify.XXXXXXXX.tar")"
    trap 'rm -f "$temp_tar"' EXIT
    if ! gpg --batch --yes --no-tty --pinentry-mode loopback \
      --passphrase-fd 3 --decrypt --output "$temp_tar" "$source" \
      3<<<"$APD_BACKUP_ENCRYPTION_PASSPHRASE" >/dev/null 2>&1; then
      echo 'Authentication/decryption failed; refusing backup.' >&2
      exit 5
    fi
    expected="$(printf '%s\n' roles.sql schema.sql data.sql counts.tsv SHA256SUMS | LC_ALL=C sort)"
    names="$(tar -tf "$temp_tar" | LC_ALL=C sort)"
    [[ "$names" == "$expected" ]] || { echo 'Backup archive has unexpected/missing paths.' >&2; exit 6; }
    mkdir -m 700 "$destination"
    tar -xf "$temp_tar" -C "$destination" --no-same-owner --no-same-permissions
    if ! (cd "$destination" && sha256sum --status --check SHA256SUMS); then
      echo 'Backup SHA-256 verification failed.' >&2
      exit 7
    fi
    echo 'Encryption authenticated and all component checksums verified.'
    ;;
  *) usage ;;
esac

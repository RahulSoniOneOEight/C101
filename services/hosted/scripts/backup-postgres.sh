#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-$(dirname "$0")/../docker-compose.hosted.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/buildkart}"
RECIPIENT_FILE="${RECIPIENT_FILE:-/etc/buildkart/backup-age-recipient}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATABASES="${DATABASES:-buildkart buildkart_experience bazarbee_workspace buildkart_tryton buildkart_cms}"

umask 077
mkdir -p "$BACKUP_DIR"
recipient="$(cat "$RECIPIENT_FILE")"

for database in $DATABASES; do
  output="$BACKUP_DIR/${database}-${STAMP}.dump.age"
  # pipefail makes a failed pg_dump fail the pipeline; age would otherwise exit 0
  # and leave a small, valid-looking encrypted file with no dump inside it.
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$1"' -- "$database" \
    | age -r "$recipient" -o "$output"
  test -s "$output"
  bytes="$(wc -c < "$output")"
  if [ "$bytes" -lt 200 ]; then
    echo "backup too small for $database: $bytes bytes" >&2
    rm -f "$output"
    exit 1
  fi
  echo "backed up $database ($bytes bytes, encrypted)"
done

find "$BACKUP_DIR" -type f -name '*.dump.age' -mtime +14 -delete
echo "Encrypted PostgreSQL backup completed: $STAMP"

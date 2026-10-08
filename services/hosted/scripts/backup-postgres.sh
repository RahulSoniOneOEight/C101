#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-$(dirname "$0")/../docker-compose.hosted.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/buildkart}"
RECIPIENT_FILE="${RECIPIENT_FILE:-/etc/buildkart/backup-age-recipient}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

umask 077
mkdir -p "$BACKUP_DIR"
recipient="$(cat "$RECIPIENT_FILE")"

for database in buildkart buildkart_experience buildkart_tryton; do
  output="$BACKUP_DIR/${database}-${STAMP}.dump.age"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$1"' -- "$database" \
    | age -r "$recipient" -o "$output"
  test -s "$output"
done

find "$BACKUP_DIR" -type f -name '*.dump.age' -mtime +14 -delete
echo "Encrypted PostgreSQL backup completed: $STAMP"

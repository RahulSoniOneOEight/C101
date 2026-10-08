#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 /path/to/buildkart_experience-*.dump.age" >&2
  exit 2
fi

COMPOSE_FILE="${COMPOSE_FILE:-$(dirname "$0")/../docker-compose.hosted.yml}"
IDENTITY_FILE="${IDENTITY_FILE:-/etc/buildkart/backup-age-identity}"
RESTORE_DB="buildkart_restore_proof_$(date -u +%Y%m%d%H%M%S)"

cleanup() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' -- "$RESTORE_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'createdb -U "$POSTGRES_USER" "$1"' -- "$RESTORE_DB"
age -d -i "$IDENTITY_FILE" "$1" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges' -- "$RESTORE_DB"

table_count="$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$1" -Atc "select count(*) from information_schema.tables where table_schema = '\''public'\''"' -- "$RESTORE_DB")"
test "$table_count" -gt 0
echo "Restore proof passed for $RESTORE_DB with $table_count public tables."

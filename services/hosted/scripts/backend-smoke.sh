#!/usr/bin/env bash
# Read-only backend smoke check for the hosted BuildKart staging stack.
#
#   ssh root@<vps> 'bash /opt/buildkart/services/hosted/scripts/backend-smoke.sh'
#
# Verifies Commerce (Medusa), Marketplace (Mercur), ERP (Tryton), Postgres, NATS and the
# composed Experience API. It is safe to run repeatedly: it never mutates state.
set -uo pipefail

COMPOSE="docker compose -f /opt/buildkart/services/hosted/docker-compose.hosted.yml"
NET=buildkart-hosted-pilot_private
PG=buildkart-hosted-pilot-postgres-1
CURL="docker run --rm --network $NET curlimages/curl:8.11.1 -s -m 15"
PUB=$(grep '^MEDUSA_PUBLISHABLE_KEY=' /etc/buildkart/secrets/experience-api.env | cut -d= -f2-)

hr() { echo; echo "=============== $1 ==============="; }
q()  { docker exec "$PG" psql -U buildkart -d "$1" -Atc "$2" 2>&1 | head -1; }

hr "Containers"
$COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'

hr "Commerce - Medusa (in-network :9010)"
$CURL http://medusa-api:9010/health; echo

hr "Commerce - Medusa Store API (products)"
$CURL -H "x-publishable-api-key: $PUB" "http://medusa-api:9010/store/products?limit=1" | head -c 240; echo

hr "Marketplace - Mercur (sellers / offers)"
printf 'sellers: '; $CURL -H "x-publishable-api-key: $PUB" "http://medusa-api:9010/store/sellers?limit=1" | head -c 160; echo
printf 'offers:  '; $CURL -H "x-publishable-api-key: $PUB" "http://medusa-api:9010/store/offers?limit=1"  | head -c 160; echo

hr "Commerce DB counts (buildkart)"
for t in product seller offer '"order"' cart customer; do
  printf '%-12s ' "$t:"; q buildkart "select count(*) from $t;"
done

hr "ERP - Tryton DB counts (buildkart_tryton)"
printf '%-20s ' "tables:";         q buildkart_tryton "select count(*) from information_schema.tables where table_schema='public';"
for t in product_template party_party stock_move stock_location; do
  printf '%-20s ' "$t:"; q buildkart_tryton "select count(*) from $t;"
done

hr "NATS JetStream"
$CURL http://nats:8222/jsz | head -c 200; echo

hr "Experience API (composed, public)"
curl -s -m 10 https://api-staging.pinakaplay.cloud/health; echo
printf 'products: '; curl -s -m 15 "https://api-staging.pinakaplay.cloud/v1/products?limit=1" | head -c 160; echo

hr "Notifications / deliveries (buildkart_experience)"
printf 'notifications:     '; q buildkart_experience "select count(*) from pilot_notification;"
printf 'delivery_attempts: '; q buildkart_experience "select count(*) from pilot_notification_delivery_attempt;"

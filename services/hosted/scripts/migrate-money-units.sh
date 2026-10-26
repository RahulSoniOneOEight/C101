#!/usr/bin/env bash
#
# Convert the Medusa database from minor units (paise stored as if they were rupees) to major
# units, which is what Medusa and the native admin console expect.
#
#   ./migrate-money-units.sh              # dry run: applies inside a transaction, prints, rolls back
#   ./migrate-money-units.sh --apply      # real run: applies once and records a marker
#
# Preconditions:
#   - the Experience API has been deployed with MEDUSA_MONEY_UNITS still unset (behaviour unchanged)
#   - take a database snapshot first (services/hosted/scripts/backup-postgres.sh)
#
# Rollback: restore the snapshot, then unset MEDUSA_MONEY_UNITS and restart the Experience API.
set -euo pipefail

MODE="dry-run"
[ "${1:-}" = "--apply" ] && MODE="apply"
PG="${PG_CONTAINER:-buildkart-hosted-pilot-postgres-1}"
DB="${DB_NAME:-buildkart}"
VERSION="2026-10-major-units"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

psql_q() { docker exec -i "$PG" psql -U buildkart -d "$DB" -v ON_ERROR_STOP=1 -At "$@"; }

psql_q -c "select 1" >/dev/null || { echo "cannot reach $PG" >&2; exit 1; }

psql_q -c "create table if not exists money_units_migration (
  version text primary key,
  applied_at timestamptz not null default now(),
  details jsonb
);" >/dev/null

if [ "$(psql_q -c "select count(*) from money_units_migration where version='$VERSION'")" != "0" ]; then
  echo "migration $VERSION has already been applied; refusing to run again" >&2
  exit 3
fi

read -r -d '' SQL <<'EOSQL' || true
begin;

create temporary table money_before on commit drop as
select 'price' as bucket, count(*) as rows, coalesce(max(amount),0) as max_amount from price
union all select 'cart_line_item', count(*), coalesce(max(unit_price),0) from cart_line_item
union all select 'order_line_item', count(*), coalesce(max(unit_price),0) from order_line_item
union all select 'order_shipping_method', count(*), coalesce(max(amount),0) from order_shipping_method
union all select 'payment_collection', count(*), coalesce(max(amount),0) from payment_collection
union all select 'commission_line', count(*), coalesce(max(amount),0) from commission_line;

update price set amount = amount / 100;
update price set raw_amount = jsonb_set(raw_amount, '{value}', to_jsonb(((raw_amount->>'value')::numeric / 100)::text))
  where raw_amount ? 'value';

update cart_line_item set unit_price = unit_price / 100 where unit_price is not null;
update cart_line_item set compare_at_unit_price = compare_at_unit_price / 100 where compare_at_unit_price is not null;
update cart_line_item
  set raw_unit_price = jsonb_set(raw_unit_price, '{value}', to_jsonb(((raw_unit_price->>'value')::numeric / 100)::text))
  where raw_unit_price ? 'value';
update cart_line_item
  set raw_compare_at_unit_price = jsonb_set(raw_compare_at_unit_price, '{value}', to_jsonb(((raw_compare_at_unit_price->>'value')::numeric / 100)::text))
  where raw_compare_at_unit_price ? 'value';
update cart_line_item_adjustment set amount = amount / 100;

update cart_shipping_method set amount = amount / 100;
update cart_shipping_method
  set raw_amount = jsonb_set(raw_amount, '{value}', to_jsonb(((raw_amount->>'value')::numeric / 100)::text))
  where raw_amount ? 'value';
update cart_shipping_method_adjustment set amount = amount / 100;

update order_line_item set unit_price = unit_price / 100 where unit_price is not null;
update order_line_item set compare_at_unit_price = compare_at_unit_price / 100 where compare_at_unit_price is not null;
update order_line_item
  set raw_unit_price = jsonb_set(raw_unit_price, '{value}', to_jsonb(((raw_unit_price->>'value')::numeric / 100)::text))
  where raw_unit_price ? 'value';
update order_line_item
  set raw_compare_at_unit_price = jsonb_set(raw_compare_at_unit_price, '{value}', to_jsonb(((raw_compare_at_unit_price->>'value')::numeric / 100)::text))
  where raw_compare_at_unit_price ? 'value';
update order_line_item_adjustment set amount = amount / 100;

update order_shipping_method set amount = amount / 100;
update order_shipping_method
  set raw_amount = jsonb_set(raw_amount, '{value}', to_jsonb(((raw_amount->>'value')::numeric / 100)::text))
  where raw_amount ? 'value';
update order_shipping_method_adjustment set amount = amount / 100;

update payment_collection set amount = amount / 100;
update payment_collection set authorized_amount = authorized_amount / 100 where authorized_amount is not null;
update payment_collection set captured_amount = captured_amount / 100 where captured_amount is not null;
update payment_collection set refunded_amount = refunded_amount / 100 where refunded_amount is not null;
update payment_collection
  set raw_amount = jsonb_set(raw_amount, '{value}', to_jsonb(((raw_amount->>'value')::numeric / 100)::text))
  where raw_amount ? 'value';

update payment set amount = amount / 100;
update payment
  set raw_amount = jsonb_set(raw_amount, '{value}', to_jsonb(((raw_amount->>'value')::numeric / 100)::text))
  where raw_amount ? 'value';
update payment_session set amount = amount / 100;
update capture set amount = amount / 100;
update refund set amount = amount / 100;
update order_transaction set amount = amount / 100;
update credit_line set amount = amount / 100;
update order_credit_line set amount = amount / 100;
update order_change_action set amount = amount / 100;
update return set refund_amount = refund_amount / 100 where refund_amount is not null;
update order_claim set refund_amount = refund_amount / 100 where refund_amount is not null;
update commission_line set amount = amount / 100;
update promotion_application_method set value = value / 100 where type = 'fixed';

do $$
declare r record; k text; v jsonb; rebuilt jsonb;
begin
  for r in select id, totals from order_summary loop
    rebuilt := '{}'::jsonb;
    for k, v in select key, value from jsonb_each(r.totals) loop
      if jsonb_typeof(v) = 'number' then
        rebuilt := rebuilt || jsonb_build_object(k, (v::text)::numeric / 100);
      elsif jsonb_typeof(v) = 'object' and v ? 'value' then
        rebuilt := rebuilt || jsonb_build_object(
          k, jsonb_set(v, '{value}', to_jsonb((((v->>'value')::numeric) / 100)::text))
        );
      else
        rebuilt := rebuilt || jsonb_build_object(k, v);
      end if;
    end loop;
    update order_summary set totals = rebuilt where id = r.id;
  end loop;
end $$;

select bucket, rows, max_amount as before_max, round(max_amount / 100.0, 2) as after_max
from money_before order by bucket;
EOSQL

if [ "$MODE" = "apply" ]; then
  echo "applying $VERSION to $DB ..."
  printf '%s\ninsert into money_units_migration (version, details) values (%s, %s);\ncommit;\n' \
    "$SQL" "'$VERSION'" "'{\"converted\":\"minor-to-major\",\"factor\":100}'" |
    docker exec -i "$PG" psql -U buildkart -d "$DB" -v ON_ERROR_STOP=1
  echo "applied; set MEDUSA_MONEY_UNITS=major and restart the Experience API"
else
  echo "dry run: applying inside a transaction and rolling back ..."
  printf '%s\nrollback;\n' "$SQL" |
    docker exec -i "$PG" psql -U buildkart -d "$DB" -v ON_ERROR_STOP=1
  echo "dry run complete; nothing was written"
fi

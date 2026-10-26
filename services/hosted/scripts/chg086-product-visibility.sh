#!/usr/bin/env bash
# Governed CHG-086 staging data change.
#
#   ./chg086-product-visibility.sh           # validate and roll back
#   ./chg086-product-visibility.sh --apply   # validate and commit
#
# Preconditions: take an encrypted PostgreSQL backup before --apply.
# This script never deletes rows or changes product/variant/offer/order identifiers.
set -euo pipefail

MODE="dry-run"
if [ "${1:-}" = "--apply" ]; then
  MODE="apply"
elif [ -n "${1:-}" ]; then
  echo "Usage: $0 [--apply]" >&2
  exit 2
fi

PG="${PG_CONTAINER:-buildkart-hosted-pilot-postgres-1}"
DB="${DB_NAME:-buildkart}"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

if [ "$MODE" = "apply" ]; then
  END_SQL="COMMIT;"
else
  END_SQL="ROLLBACK;"
fi

docker exec -i "$PG" psql -U buildkart -d "$DB" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
LOCK TABLE product, product_attribute IN ROW EXCLUSIVE MODE;

CREATE TEMP TABLE chg086_products(id text PRIMARY KEY);
INSERT INTO chg086_products(id) VALUES
  ('prod_01M4EC9DSW5MSACQWETJ3R38AW'),
  ('prod_01M4EC9DSW6J984KKM619VKZEA'),
  ('prod_01M5TC4ZM09R4FJMAFKP3G1H6C'),
  ('prod_01M5VAK0F4R5G7V2MYS0PPQ4TM');

CREATE TEMP TABLE chg086_attributes(id text PRIMARY KEY);
INSERT INTO chg086_attributes(id) VALUES
  ('pattr_01M4EC9BX8J18G5Z2JYF9FN6TD'),
  ('pattr_01M4EC9BX947JYA00T2YRSQTDB');

DO \$\$
BEGIN
  IF (SELECT count(*) FROM product p JOIN chg086_products a ON a.id = p.id) <> 4 THEN
    RAISE EXCEPTION 'CHG-086 product allowlist does not resolve to exactly four rows';
  END IF;
  IF (SELECT count(*) FROM product_attribute p JOIN chg086_attributes a ON a.id = p.id) <> 2 THEN
    RAISE EXCEPTION 'CHG-086 attribute allowlist does not resolve to exactly two rows';
  END IF;
END \$\$;

CREATE TEMP TABLE chg086_order_snapshot AS
SELECT
  p.id AS product_id,
  count(oli.id)::integer AS reference_count,
  coalesce(
    md5(string_agg(
      concat_ws('|', oli.id, oli.product_id, oli.variant_id, oli.product_title,
                oli.variant_sku, oli.unit_price::text, oli.metadata::text),
      E'\n' ORDER BY oli.id
    )),
    md5('')
  ) AS snapshot_hash
FROM chg086_products p
LEFT JOIN order_line_item oli
  ON oli.product_id = p.id AND oli.deleted_at IS NULL
GROUP BY p.id;

\echo 'CHG-086 before state'
SELECT 'product' AS kind, p.id, p.title,
       concat('status=', p.status, ';source=', coalesce(p.metadata->>'catalogue_source',''),
              ';legacy=', coalesce(p.metadata->>'catalogue_import',''),
              ';lifecycle=', coalesce(p.metadata->>'lifecycle_state','')) AS state
FROM product p JOIN chg086_products a ON a.id = p.id
UNION ALL
SELECT 'attribute', p.id, p.name,
       concat('axis=', p.is_variant_axis, ';active=', p.is_active,
              ';filterable=', p.is_filterable)
FROM product_attribute p JOIN chg086_attributes a ON a.id = p.id
ORDER BY kind, id;

-- Provenance is audit context only. Preserve catalogue_import verbatim.
UPDATE product
SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'catalogue_source',
      CASE
        WHEN metadata->>'buildkart_product_studio' = 'true' THEN 'product_studio'
        WHEN nullif(metadata->>'catalogue_import', '') IS NOT NULL THEN 'catalogue_import'
        ELSE 'legacy_catalogue'
      END
    ),
    updated_at = now()
WHERE deleted_at IS NULL
  AND nullif(metadata->>'catalogue_source', '') IS NULL
  AND (
    nullif(metadata->>'catalogue_import', '') IS NOT NULL
    OR metadata->>'buildkart_product_studio' = 'true'
  );

UPDATE product_attribute
SET is_variant_axis = false,
    updated_at = now()
WHERE id IN (SELECT id FROM chg086_attributes)
  AND is_variant_axis IS DISTINCT FROM false;

-- Archive reversibly: Medusa has no archived status, so retain the lifecycle state in metadata and
-- return the record to draft. Existing orders keep their line snapshots and identifiers.
UPDATE product p
SET status = 'draft',
    metadata = coalesce(p.metadata, '{}'::jsonb)
      || jsonb_build_object(
           'lifecycle_state', 'archived',
           'catalogue_source',
           CASE
             WHEN p.metadata->>'buildkart_product_studio' = 'true' THEN 'product_studio'
             WHEN nullif(p.metadata->>'catalogue_import', '') IS NOT NULL THEN 'catalogue_import'
             ELSE coalesce(nullif(p.metadata->>'catalogue_source', ''), 'legacy_catalogue')
           END,
           'archived_by_change', 'CHG-086'
         ),
    updated_at = now()
FROM chg086_products a
WHERE p.id = a.id
  AND (
    p.status IS DISTINCT FROM 'draft'
    OR p.metadata->>'lifecycle_state' IS DISTINCT FROM 'archived'
    OR p.metadata->>'archived_by_change' IS DISTINCT FROM 'CHG-086'
  );

DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1 FROM product p JOIN chg086_products a ON a.id = p.id
    WHERE p.deleted_at IS NOT NULL
       OR p.status <> 'draft'
       OR p.metadata->>'lifecycle_state' <> 'archived'
       OR p.metadata->>'archived_by_change' <> 'CHG-086'
  ) THEN
    RAISE EXCEPTION 'CHG-086 archive postcondition failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product_attribute p JOIN chg086_attributes a ON a.id = p.id
    WHERE p.is_variant_axis IS DISTINCT FROM false
       OR p.is_active IS DISTINCT FROM true
       OR p.is_filterable IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'CHG-086 attribute postcondition failed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM chg086_order_snapshot before
    LEFT JOIN (
      SELECT
        p.id AS product_id,
        count(oli.id)::integer AS reference_count,
        coalesce(
          md5(string_agg(
            concat_ws('|', oli.id, oli.product_id, oli.variant_id, oli.product_title,
                      oli.variant_sku, oli.unit_price::text, oli.metadata::text),
            E'\n' ORDER BY oli.id
          )),
          md5('')
        ) AS snapshot_hash
      FROM chg086_products p
      LEFT JOIN order_line_item oli
        ON oli.product_id = p.id AND oli.deleted_at IS NULL
      GROUP BY p.id
    ) after USING (product_id)
    WHERE before.reference_count IS DISTINCT FROM after.reference_count
       OR before.snapshot_hash IS DISTINCT FROM after.snapshot_hash
  ) THEN
    RAISE EXCEPTION 'CHG-086 historical order-line snapshot changed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product
    WHERE id IN ('prod_01M5Q98Y7CEHEPKZENTNGF9CVW', 'prod_01M5SFFZ0VCJ50ZYPHABT2CY15')
      AND (
        metadata->>'archived_by_change' = 'CHG-086'
        OR metadata->>'lifecycle_state' = 'archived'
      )
  ) THEN
    RAISE EXCEPTION 'CHG-086 no-touch product was archived';
  END IF;
END \$\$;

\echo 'CHG-086 proposed after state'
SELECT 'product' AS kind, p.id, p.title,
       concat('status=', p.status, ';source=', coalesce(p.metadata->>'catalogue_source',''),
              ';legacy=', coalesce(p.metadata->>'catalogue_import',''),
              ';lifecycle=', coalesce(p.metadata->>'lifecycle_state','')) AS state
FROM product p JOIN chg086_products a ON a.id = p.id
UNION ALL
SELECT 'attribute', p.id, p.name,
       concat('axis=', p.is_variant_axis, ';active=', p.is_active,
              ';filterable=', p.is_filterable)
FROM product_attribute p JOIN chg086_attributes a ON a.id = p.id
ORDER BY kind, id;

SELECT 'order_references_preserved' AS check, product_id,
       reference_count::text AS value
FROM chg086_order_snapshot
ORDER BY product_id;

SELECT 'provenance_rows' AS check,
       count(*) FILTER (WHERE metadata->>'catalogue_source' = 'product_studio') AS product_studio,
       count(*) FILTER (WHERE metadata->>'catalogue_source' = 'catalogue_import') AS catalogue_import
FROM product
WHERE deleted_at IS NULL;

$END_SQL
SQL

if [ "$MODE" = "apply" ]; then
  echo "CHG-086 allowlisted staging data change committed."
else
  echo "CHG-086 dry run passed; transaction rolled back."
fi

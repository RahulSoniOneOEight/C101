-- CHG-098: normalize existing BuildKart B2B Studio price lists.
--
-- Medusa price-list amounts are major units in this deployment. The Product
-- Studio previously wrote minor units (e.g. 35000 for ₹350) and used the old
-- price-list rule attribute `customer_group_id`. Medusa now expects
-- `customer.groups.id`. This script corrects both, idempotently, using the
-- `b2b_price_units = major` metadata marker.
--
-- Staging only. Run against the BuildKart Medusa database.

BEGIN;

CREATE TEMP TABLE _chg098_b2b_targets ON COMMIT DROP AS
SELECT id
FROM price_list
WHERE metadata->>'buildkart_b2b' = 'true'
  AND COALESCE(metadata->>'b2b_price_units', 'minor') <> 'major';

UPDATE price p
SET amount = p.amount / 100.0,
    raw_amount = jsonb_set(
      p.raw_amount,
      '{value}',
      to_jsonb((p.amount / 100.0)::text),
      true
    ),
    updated_at = now()
WHERE p.price_list_id IN (SELECT id FROM _chg098_b2b_targets);

-- Older studio rows used attribute='0' with the real attribute nested inside
-- value ({"attribute":"customer_group_id","value":[...]}). Normalize both the
-- legacy and the intermediate `customer_group_id` form.
UPDATE price_list_rule r
SET attribute = 'customer.groups.id',
    value = CASE
      WHEN jsonb_typeof(r.value) = 'object' THEN r.value->'value'
      ELSE r.value
    END,
    updated_at = now()
FROM price_list pl
WHERE r.price_list_id = pl.id
  AND pl.metadata->>'buildkart_b2b' = 'true'
  AND (
    r.attribute IN ('0', 'customer_group_id')
    OR r.value->>'attribute' = 'customer_group_id'
  );

UPDATE price_list pl
SET metadata = COALESCE(pl.metadata, '{}'::jsonb)
      || jsonb_build_object('b2b_price_units', 'major'),
    updated_at = now()
WHERE pl.id IN (SELECT id FROM _chg098_b2b_targets);

COMMIT;

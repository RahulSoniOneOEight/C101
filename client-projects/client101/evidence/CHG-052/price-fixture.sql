-- CHG-052 — staging list/selling price and merchandising tag fixture.
--
-- Run against the Mercur staging database (buildkart) as a one-off. Idempotent:
-- offers that already carry staging_price_fixture are skipped, so a re-run never
-- compounds a discount. Staging only; this is not a supplier-funded price.
--
-- list price  = the imported source amount
-- selling     = list - a deterministic 5-18% (hash of SKU, never random per request)
-- tags        = 20% of imported products, split across Best Deal / Seasonal / Flash Deal

DO $$
DECLARE r RECORD; d int; list bigint; sell bigint; n int := 0;
BEGIN
  FOR r IN
    SELECT o.id AS offer_id, o.sku, o.metadata, l.price_id, p.amount
    FROM offer o
    JOIN offer_offer_pricing_price l ON l.offer_id = o.id
    JOIN price p ON p.id = l.price_id
    JOIN product prod ON prod.id = o.product_id
    WHERE prod.metadata->>'catalogue_import' = 'CHG-049'
      AND p.currency_code = 'inr'
      AND (o.metadata->>'staging_price_fixture') IS NULL
  LOOP
    d := 5 + (abs(hashtext(r.sku)) % 14);
    list := r.amount::bigint;
    sell := round(list::numeric * (100 - d) / 100.0)::bigint;
    UPDATE price
       SET amount = sell,
           raw_amount = jsonb_build_object('value', sell::text, 'precision', 20),
           updated_at = now()
     WHERE id = r.price_id;
    UPDATE offer
       SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'list_price_minor', list,
             'selling_price_minor', sell,
             'discount_percent', d,
             'staging_price_fixture', true
           ),
           updated_at = now()
     WHERE id = r.offer_id;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'updated % offers', n;
END $$;

INSERT INTO product_tag (id, value, metadata, created_at, updated_at)
SELECT 'ptag_' || substr(md5(v), 1, 24), v,
       '{"staging_merchandising_fixture": true}'::jsonb, now(), now()
FROM (VALUES ('Best Deal'), ('Seasonal'), ('Flash Deal')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM product_tag pt WHERE pt.value = t.v);

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM product
  WHERE metadata->>'catalogue_import' = 'CHG-049'
), tagged AS (
  SELECT id AS product_id,
         CASE rn % 3 WHEN 0 THEN 'Best Deal' WHEN 1 THEN 'Seasonal' ELSE 'Flash Deal' END AS tag_value
  FROM numbered
  WHERE rn % 5 = 0
)
INSERT INTO product_tags (product_id, product_tag_id)
SELECT t.product_id, pt.id
FROM tagged t
JOIN product_tag pt ON pt.value = t.tag_value
WHERE NOT EXISTS (
  SELECT 1 FROM product_tags x
  WHERE x.product_id = t.product_id AND x.product_tag_id = pt.id
);

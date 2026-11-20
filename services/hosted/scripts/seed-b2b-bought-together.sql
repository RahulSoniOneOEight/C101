-- Staging-only B2B Bought Together demo pair.
--
-- Wonder Cement + Sumsan Fold 7 both carry active B2B pricing, so the trade PDP can render a
-- non-empty pair. Run against buildkart_experience:
--   psql "$EXPERIENCE_DATABASE_URL" -f services/hosted/scripts/seed-b2b-bought-together.sql
--
-- The pair is additive test data. It does not alter the existing B2C pair.

BEGIN;

INSERT INTO bought_together_pairs
  (id, product_a_id, product_b_id, variant_a_id, variant_b_id, channel, status, version,
   created_by, updated_by, test_data)
VALUES
  ('btp_bazarbee_b2b_qc',
   'prod_01M5Q98Y7CEHEPKZENTNGF9CVW',
   'prod_01M637Y1F4N6AZF9BRC5K7KP6S',
   'variant_01M5Q98YJZX8G09WT738SG6AGJ',
   'variant_01M637Y1SNGEJ6FXGB9ARZZEV0',
   'b2b', 'active', 1, 'pilot_superadmin01', 'pilot_superadmin01', true)
ON CONFLICT (id) DO UPDATE
SET channel = 'b2b', status = 'active', updated_at = now();

INSERT INTO bought_together_active_members
  (product_id, variant_id, member_key, channel, pair_id)
VALUES
  ('prod_01M5Q98Y7CEHEPKZENTNGF9CVW',
   'variant_01M5Q98YJZX8G09WT738SG6AGJ',
   'variant_01M5Q98YJZX8G09WT738SG6AGJ',
   'b2b', 'btp_bazarbee_b2b_qc'),
  ('prod_01M637Y1F4N6AZF9BRC5K7KP6S',
   'variant_01M637Y1SNGEJ6FXGB9ARZZEV0',
   'variant_01M637Y1SNGEJ6FXGB9ARZZEV0',
   'b2b', 'btp_bazarbee_b2b_qc')
ON CONFLICT (member_key, channel) DO UPDATE
SET pair_id = EXCLUDED.pair_id;

COMMIT;

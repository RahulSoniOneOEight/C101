-- Staging-only shared list for the web drawer QC.
-- Run against buildkart_workspace:
--   psql "$WORKSPACE_DATABASE_URL" -f services/hosted/scripts/seed-web-shared-list.sql
--
-- Creates one accepted Wonder Cement line and one pending quantity proposal in the shared pilot
-- workspace. Additive test data; it does not alter a tester's own household list.

BEGIN;

INSERT INTO purchase_draft
  (id, workspace_id, channel_id, name, lifecycle_status, validation_status, current_version, created_by)
VALUES
  ('drf_bazarbee_pilot', 'ws_bazarbee_pilot', 'ch_bazarbee_pilot_procurement',
   'BazarBee Pilot shared list', 'draft', 'unvalidated', 1, 'pilot_superadmin01')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, current_version = 1, updated_at = now();

INSERT INTO draft_revision
  (id, draft_id, version, canonical_payload, commercial_hash, created_by, supersedes_version)
VALUES
  ('rev_bazarbee_pilot_v1', 'drf_bazarbee_pilot', 1,
   '{"lines":[{"line_key":"catalogue:variant_01M5Q98YJZX8G09WT738SG6AGJ","product_id":"prod_01M5Q98Y7CEHEPKZENTNGF9CVW","variant_id":"variant_01M5Q98YJZX8G09WT738SG6AGJ","offer_id":"offer_01M5XWDZ2YHB5YBHBVMVE4MJ7M","quantity":2,"unit_amount_minor":35000,"currency_code":"INR"}],"schema_version":1}'::jsonb,
   'bazarbee0000000000000000000000000000000000000000000000000000000000',
   'pilot_superadmin01', NULL)
ON CONFLICT (id) DO UPDATE
SET canonical_payload = EXCLUDED.canonical_payload, commercial_hash = EXCLUDED.commercial_hash;

INSERT INTO draft_line_revision
  (revision_id, line_key, product_id, variant_id, seller_id, offer_id,
   fulfilment_context_id, quantity, commercial_snapshot, material_instruction)
VALUES
  ('rev_bazarbee_pilot_v1',
   'catalogue:variant_01M5Q98YJZX8G09WT738SG6AGJ',
   'prod_01M5Q98Y7CEHEPKZENTNGF9CVW',
   'variant_01M5Q98YJZX8G09WT738SG6AGJ',
   '',
   'offer_01M5XWDZ2YHB5YBHBVMVE4MJ7M',
   'default', 2,
   '{"sku":"WON-PPC-DAN-01","seller_name":"PowerMax Depot","currency_code":"INR","product_title":"Wonder Cement","unit_amount_minor":35000}'::jsonb,
   NULL)
ON CONFLICT (revision_id, line_key) DO UPDATE
SET quantity = EXCLUDED.quantity, commercial_snapshot = EXCLUDED.commercial_snapshot;

INSERT INTO proposal
  (id, draft_id, kind, payload, expected_version, status, proposed_by, idempotency_key)
VALUES
  ('prop_bazarbee_pilot_qty', 'drf_bazarbee_pilot', 'update_quantity',
   '{"line_key":"catalogue:variant_01M5Q98YJZX8G09WT738SG6AGJ","quantity":4}'::jsonb,
   1, 'pending', 'pilot_buyer_b2b01', 'seed_bazarbee_pilot_qty')
ON CONFLICT (id) DO NOTHING;

COMMIT;

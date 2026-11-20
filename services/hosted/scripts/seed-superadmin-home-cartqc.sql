-- Staging-only household shared lists for web cart-build and draft-selector QC.
-- Insert-only: rerunning must never reset an edited draft's current_version.
BEGIN;

INSERT INTO purchase_draft
  (id, workspace_id, channel_id, name, lifecycle_status, validation_status, current_version, created_by)
VALUES
  ('drf_superadmin_home_cartqc', 'ws_c4b7187481ef4a2191a3c45e7522792b',
   'ch_fffd06147432497f9b456e1553b44bbe', 'Super Admin Home shared list',
   'draft', 'unvalidated', 1, 'pilot_superadmin01'),
  ('drf_superadmin_home_cartqc_b', 'ws_c4b7187481ef4a2191a3c45e7522792b',
   'ch_fffd06147432497f9b456e1553b44bbe', 'Super Admin Home second list',
   'draft', 'unvalidated', 1, 'pilot_superadmin01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO draft_revision
  (id, draft_id, version, canonical_payload, commercial_hash, created_by, supersedes_version)
VALUES
  ('rev_superadmin_home_cartqc_v1', 'drf_superadmin_home_cartqc', 1,
   '{"lines":[{"line_key":"catalogue:variant_01M5Q98YJZX8G09WT738SG6AGJ","product_id":"prod_01M5Q98Y7CEHEPKZENTNGF9CVW","variant_id":"variant_01M5Q98YJZX8G09WT738SG6AGJ","offer_id":"offer_01M5XWDZ2YHB5YBHBVMVE4MJ7M","quantity":2,"unit_amount_minor":35000,"currency_code":"INR"}],"schema_version":1}'::jsonb,
   'cartqc000000000000000000000000000000000000000000000000000000000000',
   'pilot_superadmin01', NULL),
  ('rev_superadmin_home_cartqc_b_v1', 'drf_superadmin_home_cartqc_b', 1,
   '{"lines":[{"line_key":"catalogue:variant_01M5Q98YJZX8G09WT738SG6AGJ","product_id":"prod_01M5Q98Y7CEHEPKZENTNGF9CVW","variant_id":"variant_01M5Q98YJZX8G09WT738SG6AGJ","offer_id":"offer_01M5XWDZ2YHB5YBHBVMVE4MJ7M","quantity":1,"unit_amount_minor":35000,"currency_code":"INR"}],"schema_version":1}'::jsonb,
   'cartqcb00000000000000000000000000000000000000000000000000000000000',
   'pilot_superadmin01', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO draft_line_revision
  (revision_id, line_key, product_id, variant_id, seller_id, offer_id,
   fulfilment_context_id, quantity, commercial_snapshot, material_instruction)
VALUES
  ('rev_superadmin_home_cartqc_v1',
   'catalogue:variant_01M5Q98YJZX8G09WT738SG6AGJ',
   'prod_01M5Q98Y7CEHEPKZENTNGF9CVW',
   'variant_01M5Q98YJZX8G09WT738SG6AGJ',
   '',
   'offer_01M5XWDZ2YHB5YBHBVMVE4MJ7M',
   'default', 2,
   '{"sku":"WON-PPC-DAN-01","seller_name":"PowerMax Depot","currency_code":"INR","product_title":"Wonder Cement","unit_amount_minor":35000}'::jsonb,
   NULL),
  ('rev_superadmin_home_cartqc_b_v1',
   'catalogue:variant_01M5Q98YJZX8G09WT738SG6AGJ',
   'prod_01M5Q98Y7CEHEPKZENTNGF9CVW',
   'variant_01M5Q98YJZX8G09WT738SG6AGJ',
   '',
   'offer_01M5XWDZ2YHB5YBHBVMVE4MJ7M',
   'default', 1,
   '{"sku":"WON-PPC-DAN-01","seller_name":"PowerMax Depot","currency_code":"INR","product_title":"Wonder Cement","unit_amount_minor":35000}'::jsonb,
   NULL)
ON CONFLICT (revision_id, line_key) DO NOTHING;

COMMIT;

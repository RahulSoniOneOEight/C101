-- Shared staging workspace for the dual-channel pilot testers.
--
-- Run against the workspace database after the super-admin has granted both channels:
--   psql "$WORKSPACE_DATABASE_URL" -f services/hosted/scripts/provision-pilot-workspace.sql
--
-- The workspace is a membership projection for staging testers, not a business-account source
-- of truth. All 21 pilot users are added; the super-admin owns the workspace and the rest are
-- buyers. Existing rows are preserved and re-activated.

BEGIN;

INSERT INTO workspace (id, scope_type, scope_id, owner_user_id, name, status)
VALUES (
  'ws_bazarbee_pilot',
  'business_account',
  'business_bazarbee_pilot',
  'pilot_superadmin01',
  'BazarBee Pilot Trade',
  'active'
)
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET name = EXCLUDED.name, status = 'active';

INSERT INTO channel (id, workspace_id, kind, name)
VALUES
  ('ch_bazarbee_pilot_procurement', 'ws_bazarbee_pilot', 'procurement', 'Procurement'),
  ('ch_bazarbee_pilot_approvals', 'ws_bazarbee_pilot', 'approvals', 'Approvals'),
  ('ch_bazarbee_pilot_assistant', 'ws_bazarbee_pilot', 'assistant', 'BazarBee Cart Assistant')
ON CONFLICT (workspace_id, kind) DO UPDATE
SET name = EXCLUDED.name, status = 'active';

INSERT INTO workspace_member (workspace_id, user_id, role, status)
VALUES
  ('ws_bazarbee_pilot', 'pilot_superadmin01', 'owner', 'active'),
  ('ws_bazarbee_pilot', 'pilot_admin_b2b01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_approver_b2b01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_buyer_b2b01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_buyer_b2b02', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_catalog_seller01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_customer_b2c01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_customer_b2c02', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_customer_b2c03', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_customer_b2c04', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_customer_b2c05', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_customer_b2c06', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_customer_b2c07', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_erp_ops01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_finance_ops01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_marketplace_ops01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_orders_seller01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_orders_seller02', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_owner_seller01', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_owner_seller02', 'buyer', 'active'),
  ('ws_bazarbee_pilot', 'pilot_support_ops01', 'buyer', 'active')
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = EXCLUDED.role, status = 'active';

COMMIT;

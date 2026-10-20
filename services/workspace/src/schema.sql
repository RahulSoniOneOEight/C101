-- BuildKart Workspace Service — Phase 1 kernel.
-- Own database; no shared tables with Medusa, Experience API or Tryton.

CREATE TABLE IF NOT EXISTS workspace (
  id text PRIMARY KEY,
  scope_type text NOT NULL CHECK (scope_type IN ('business_account')),
  scope_id text NOT NULL,
  owner_user_id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS workspace_member (
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('buyer', 'admin', 'approver', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  source_membership_version text NOT NULL DEFAULT 'staging-phase1',
  projected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS channel (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('procurement', 'approvals')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind)
);

CREATE TABLE IF NOT EXISTS message (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  channel_id text NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  body text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  sequence bigserial UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS message_channel_sequence_idx
  ON message(channel_id, sequence);

CREATE TABLE IF NOT EXISTS read_cursor (
  channel_id text NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  last_event_sequence bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS activity_event (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  draft_id text,
  kind text NOT NULL,
  entity_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  resulting_version integer,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  sequence bigserial UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_workspace_sequence_idx
  ON activity_event(workspace_id, sequence);

CREATE TABLE IF NOT EXISTS workspace_outbox (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_outbox_unpublished_idx
  ON workspace_outbox(created_at) WHERE published_at IS NULL;

-- Deterministic staging seed for the two approved business accounts. These are
-- membership projections for the pilot, not a second business-account register.
INSERT INTO workspace (id, scope_type, scope_id, owner_user_id, name)
VALUES
  ('ws_arjun_procurement', 'business_account', 'business_arjun_traders', 'pilot_admin_b2b01', 'Arjun Traders Procurement'),
  ('ws_shakti_procurement', 'business_account', 'business_shakti_hardware', 'pilot_buyer_b2b02', 'Shakti Hardware Procurement')
ON CONFLICT (scope_type, scope_id) DO NOTHING;

INSERT INTO workspace_member (workspace_id, user_id, role)
VALUES
  ('ws_arjun_procurement', 'pilot_buyer_b2b01', 'buyer'),
  ('ws_arjun_procurement', 'pilot_admin_b2b01', 'admin'),
  ('ws_arjun_procurement', 'pilot_approver_b2b01', 'approver'),
  ('ws_shakti_procurement', 'pilot_buyer_b2b02', 'admin')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO channel (id, workspace_id, kind, name)
VALUES
  ('ch_arjun_procurement', 'ws_arjun_procurement', 'procurement', 'Procurement'),
  ('ch_arjun_approvals', 'ws_arjun_procurement', 'approvals', 'Approvals'),
  ('ch_shakti_procurement', 'ws_shakti_procurement', 'procurement', 'Procurement')
ON CONFLICT (workspace_id, kind) DO NOTHING;

INSERT INTO message (id, workspace_id, channel_id, actor_id, actor_name, body, message_type)
SELECT 'msg_arjun_welcome', 'ws_arjun_procurement', 'ch_arjun_procurement',
       'pilot_admin_b2b01', 'Arjun Traders Admin',
       'Procurement workspace ready. Share a product from the catalogue to start a draft.',
       'text'
WHERE NOT EXISTS (SELECT 1 FROM message WHERE id = 'msg_arjun_welcome');

INSERT INTO activity_event (id, workspace_id, kind, entity_ref, actor_id, payload_summary)
SELECT 'act_arjun_workspace_created', 'ws_arjun_procurement', 'workspace.created',
       '{"type":"workspace","id":"ws_arjun_procurement"}'::jsonb, 'pilot_admin_b2b01',
       '{"message":"Workspace created for the staging pilot"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM activity_event WHERE id = 'act_arjun_workspace_created');

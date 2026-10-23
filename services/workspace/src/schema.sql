-- BuildKart Workspace Service — Phase 1 kernel, with the CHG-072 household extension.
-- Own database; no shared tables with Medusa, Experience API or Tryton.
--
-- Every statement below is idempotent: ensureSchema() re-runs this file on each boot.

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

ALTER TABLE message ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS message_channel_idempotency_idx
  ON message(channel_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_reference (
  message_id text NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  display_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (message_id, reference_type, reference_id)
);

-- A product capture is unique per conversation. Existing Phase 1 rows keep a
-- null dedupe key so immutable history is not rewritten; all new captures use
-- the channel-scoped key below.
ALTER TABLE message_reference
  ADD COLUMN IF NOT EXISTS channel_id text REFERENCES channel(id) ON DELETE CASCADE;
ALTER TABLE message_reference ADD COLUMN IF NOT EXISTS dedupe_key text;
UPDATE message_reference mr
   SET channel_id = m.channel_id
  FROM message m
 WHERE mr.message_id = m.id AND mr.channel_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS message_reference_channel_dedupe_idx
  ON message_reference(channel_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_draft (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  channel_id text NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
  name text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'review_requested', 'approved', 'changes_requested', 'ordered', 'cancelled')),
  validation_status text NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated', 'valid', 'changed', 'blocked', 'expired')),
  current_version integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS draft_revision (
  id text PRIMARY KEY,
  draft_id text NOT NULL REFERENCES purchase_draft(id) ON DELETE CASCADE,
  version integer NOT NULL,
  canonical_payload jsonb NOT NULL,
  commercial_hash text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_version integer,
  UNIQUE (draft_id, version)
);

CREATE TABLE IF NOT EXISTS draft_line_revision (
  revision_id text NOT NULL REFERENCES draft_revision(id) ON DELETE CASCADE,
  line_key text NOT NULL,
  product_id text NOT NULL,
  variant_id text NOT NULL,
  seller_id text NOT NULL,
  offer_id text NOT NULL,
  fulfilment_context_id text NOT NULL DEFAULT 'default',
  quantity integer NOT NULL CHECK (quantity > 0),
  commercial_snapshot jsonb NOT NULL,
  material_instruction text,
  PRIMARY KEY (revision_id, line_key)
);

CREATE TABLE IF NOT EXISTS proposal (
  id text PRIMARY KEY,
  draft_id text NOT NULL REFERENCES purchase_draft(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  expected_version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'edited_accepted', 'rejected', 'cancelled', 'stale')),
  proposed_by text NOT NULL,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  idempotency_key text NOT NULL,
  UNIQUE (draft_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS approval_request (
  id text PRIMARY KEY,
  draft_id text NOT NULL REFERENCES purchase_draft(id) ON DELETE CASCADE,
  revision_id text NOT NULL REFERENCES draft_revision(id) ON DELETE CASCADE,
  commercial_hash text NOT NULL,
  requested_by text NOT NULL,
  decided_by text,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'rejected', 'changes_requested', 'superseded')),
  comment text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
ALTER TABLE approval_request ADD COLUMN IF NOT EXISTS decision_comment text;
CREATE UNIQUE INDEX IF NOT EXISTS approval_request_one_pending_idx
  ON approval_request(draft_id)
  WHERE decision = 'pending';

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

-- CHG-072: a household project shares the kernel with a business-account workspace, but never
-- shares its scope. Existing rows keep scope_type = 'business_account'.
ALTER TABLE workspace DROP CONSTRAINT IF EXISTS workspace_scope_type_check;
ALTER TABLE workspace ADD CONSTRAINT workspace_scope_type_check
  CHECK (scope_type IN ('business_account', 'household'));

-- 'owner' is the single household owner; 'member' is an invited participant.
-- B2B keeps buyer/admin/approver.
ALTER TABLE workspace_member DROP CONSTRAINT IF EXISTS workspace_member_role_check;
ALTER TABLE workspace_member ADD CONSTRAINT workspace_member_role_check
  CHECK (role IN ('buyer', 'admin', 'approver', 'member', 'owner'));

ALTER TABLE channel DROP CONSTRAINT IF EXISTS channel_kind_check;
ALTER TABLE channel ADD CONSTRAINT channel_kind_check
  CHECK (kind IN ('procurement', 'approvals', 'project', 'assistant'));

-- One active owner per workspace. B2B workspaces have no 'owner' row, so this never applies there.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_one_active_owner_idx
  ON workspace_member(workspace_id)
  WHERE role = 'owner' AND status = 'active';

CREATE TABLE IF NOT EXISTS workspace_invitation (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  invitee_email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by text NOT NULL,
  accepted_by text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One live invitation per invitee email per project; re-inviting rotates the token instead.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitation_one_pending_idx
  ON workspace_invitation(workspace_id, lower(invitee_email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workspace_invitation_status_idx
  ON workspace_invitation(workspace_id, status);

-- The three-participant cap is enforced in the database, not only in the API.
CREATE OR REPLACE FUNCTION enforce_household_member_limits() RETURNS trigger AS $$
DECLARE
  scope text;
  participants integer;
BEGIN
  SELECT scope_type INTO scope FROM workspace WHERE id = NEW.workspace_id;
  IF scope = 'household' AND NEW.status = 'active' AND NEW.role = 'member' THEN
    SELECT count(*) INTO participants
      FROM workspace_member
     WHERE workspace_id = NEW.workspace_id
       AND role = 'member'
       AND status = 'active'
       AND user_id <> NEW.user_id;
    IF participants >= 3 THEN
      RAISE EXCEPTION 'household participant cap reached'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS household_member_limits ON workspace_member;
CREATE TRIGGER household_member_limits
  BEFORE INSERT OR UPDATE OF role, status ON workspace_member
  FOR EACH ROW EXECUTE FUNCTION enforce_household_member_limits();

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
  ('ch_arjun_assistant', 'ws_arjun_procurement', 'assistant', 'BuildKart Cart Assistant'),
  ('ch_shakti_procurement', 'ws_shakti_procurement', 'procurement', 'Procurement'),
  ('ch_shakti_assistant', 'ws_shakti_procurement', 'assistant', 'BuildKart Cart Assistant')
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

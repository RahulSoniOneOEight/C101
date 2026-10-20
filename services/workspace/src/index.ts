import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { connect, type NatsConnection } from "nats";
import { Pool, type PoolClient } from "pg";

type Role =
  | "b2b_buyer"
  | "b2b_account_admin"
  | "b2b_approver"
  | "super_admin"
  | "customer"
  | "seller_admin"
  | "seller_catalog_manager"
  | "seller_order_manager"
  | "support_operator"
  | "marketplace_operator"
  | "erp_operator"
  | "finance_operator";

type Actor = {
  userId: string;
  name: string;
  roles: Role[];
  businessAccountId?: string;
  sellerId?: string;
  iat: number;
  correlationId: string;
};

type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  correlation_id: string;
};

const PORT = Number.parseInt(process.env.PORT ?? "9040", 10);
const DATABASE_URL = process.env.WORKSPACE_DATABASE_URL;
const SERVICE_SECRET = process.env.WORKSPACE_SERVICE_SECRET;

if (!DATABASE_URL) throw new Error("WORKSPACE_DATABASE_URL is required.");
if (!SERVICE_SECRET || SERVICE_SECRET.length < 24) {
  throw new Error("WORKSPACE_SERVICE_SECRET must be at least 24 characters.");
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const NATS_URL = process.env.NATS_URL?.trim() || undefined;
const NATS_USER = process.env.NATS_USER?.trim() || undefined;
const NATS_PASSWORD = process.env.NATS_PASSWORD?.trim() || undefined;
let natsConnection: NatsConnection | null = null;

type WorkspaceSocketData = {
  workspaceId: string;
  userId: string;
  cursor: number;
};
const workspaceSockets = new Map<string, Set<ServerWebSocket<unknown>>>();
const ALLOWED_ROLES = new Set<Role>([
  "b2b_buyer",
  "b2b_account_admin",
  "b2b_approver",
  "super_admin",
]);
const WRITE_ROLES = new Set<Role>([
  "b2b_buyer",
  "b2b_account_admin",
  "b2b_approver",
  "super_admin",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function problem(
  status: number,
  code: string,
  detail: string,
  correlationId: string,
): Response {
  const body: Problem = {
    type: "about:blank",
    title: code,
    status,
    detail,
    code,
    correlation_id: correlationId,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}

function verifyActor(encoded: string, signature: string): Actor | Response {
  let actor: Actor;
  try {
    actor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Actor;
  } catch {
    return problem(401, "invalid-workspace-context", "Actor context is invalid.", "unknown");
  }
  const expected = createHmac("sha256", SERVICE_SECRET as string).update(encoded).digest();
  const provided = Buffer.from(signature, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return problem(401, "invalid-workspace-signature", "Actor signature is invalid.", actor.correlationId ?? "unknown");
  }
  if (!actor.userId || !actor.name || !Array.isArray(actor.roles) || !actor.businessAccountId) {
    return problem(401, "incomplete-workspace-context", "Actor context is incomplete.", actor.correlationId ?? "unknown");
  }
  if (!Number.isInteger(actor.iat) || Math.abs(Date.now() / 1000 - actor.iat) > 120) {
    return problem(401, "expired-workspace-context", "Actor context has expired.", actor.correlationId);
  }
  if (!actor.roles.some((role) => ALLOWED_ROLES.has(role))) {
    return problem(403, "workspace-role-required", "A business-account role is required.", actor.correlationId);
  }
  return actor;
}

function parseActor(req: Request): Actor | Response {
  const encoded = req.headers.get("x-workspace-actor");
  const signature = req.headers.get("x-workspace-signature");
  if (!encoded || !signature) {
    return problem(401, "workspace-context-required", "Signed actor context is required.", "unknown");
  }
  return verifyActor(encoded, signature);
}

function parseStreamActor(url: URL): Actor | Response {
  const ticket = url.searchParams.get("ticket");
  const signature = url.searchParams.get("signature");
  if (!ticket || !signature) {
    return problem(401, "workspace-ticket-required", "A signed workspace stream ticket is required.", "ws");
  }
  return verifyActor(ticket, signature);
}

async function ensureSchema(): Promise<void> {
  const sql = await Bun.file(new URL("./schema.sql", import.meta.url)).text();
  await pool.query(sql);
  console.log("[workspace] schema ready");
}

type WorkspaceRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  owner_user_id: string;
  name: string;
  status: string;
  created_at: Date;
  role?: string;
  unread_count?: number;
};

async function workspaceForMember(
  workspaceId: string,
  actor: Actor,
): Promise<WorkspaceRow | null> {
  const result = await pool.query<WorkspaceRow>(
    `select w.id, w.scope_type, w.scope_id, w.owner_user_id, w.name, w.status, w.created_at, wm.role
       from workspace w
       join workspace_member wm on wm.workspace_id = w.id
      where w.id = $1 and w.scope_id = $2 and w.status = 'active'
        and wm.user_id = $3 and wm.status = 'active'`,
    [workspaceId, actor.businessAccountId, actor.userId],
  );
  return result.rows[0] ?? null;
}

type ChannelRow = {
  id: string;
  workspace_id: string;
  kind: string;
  name: string;
  status: string;
  created_at: Date;
  role?: string;
  unread_count?: number;
};

async function channelForMember(
  channelId: string,
  actor: Actor,
): Promise<ChannelRow | null> {
  const result = await pool.query<ChannelRow>(
    `select c.id, c.workspace_id, c.kind, c.name, c.status, c.created_at, wm.role
       from channel c
       join workspace w on w.id = c.workspace_id
       join workspace_member wm on wm.workspace_id = w.id
      where c.id = $1 and c.status = 'active'
        and w.scope_id = $2 and w.status = 'active'
        and wm.user_id = $3 and wm.status = 'active'`,
    [channelId, actor.businessAccountId, actor.userId],
  );
  return result.rows[0] ?? null;
}

function canWrite(actor: Actor): boolean {
  return actor.roles.some((role) => WRITE_ROLES.has(role));
}

async function listWorkspaces(actor: Actor): Promise<Response> {
  const result = await pool.query(
    `select w.id, w.scope_type, w.scope_id, w.name, w.status, w.created_at, wm.role,
            coalesce((
              select count(*) from message m
                join channel c on c.id = m.channel_id
               where c.workspace_id = w.id and m.actor_id <> $2 and m.deleted_at is null
                 and m.sequence > coalesce((
                   select rc.last_event_sequence from read_cursor rc
                    where rc.channel_id = c.id and rc.user_id = $2
                 ), 0)
            ), 0)::int as unread_count
       from workspace w
       join workspace_member wm on wm.workspace_id = w.id
      where wm.user_id = $2 and wm.status = 'active' and w.status = 'active'
        and w.scope_id = $1
      order by w.created_at asc`,
    [actor.businessAccountId, actor.userId],
  );
  return json({
    workspaces: result.rows,
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function createWorkspace(req: Request, actor: Actor): Promise<Response> {
  if (!actor.roles.some((role) => role === "b2b_account_admin" || role === "super_admin")) {
    return problem(403, "workspace-admin-required", "Only a business-account admin can create a workspace.", actor.correlationId);
  }
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const name = body.name?.trim();
  if (!name || name.length > 120) {
    return problem(400, "invalid-workspace-name", "A workspace name of 1-120 characters is required.", actor.correlationId);
  }
  const existing = await pool.query(
    "select id from workspace where scope_type = 'business_account' and scope_id = $1",
    [actor.businessAccountId],
  );
  if (existing.rows[0]) {
    return problem(409, "workspace-exists", "This business account already has a workspace.", actor.correlationId);
  }
  const workspaceId = `ws_${randomUUID().replaceAll("-", "")}`;
  const procurementId = `ch_${randomUUID().replaceAll("-", "")}`;
  const approvalsId = `ch_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into workspace (id, scope_type, scope_id, owner_user_id, name)
       values ($1, 'business_account', $2, $3, $4)`,
      [workspaceId, actor.businessAccountId, actor.userId, name],
    );
    await client.query(
      `insert into workspace_member (workspace_id, user_id, role)
       values ($1, $2, 'admin')`,
      [workspaceId, actor.userId],
    );
    await client.query(
      `insert into channel (id, workspace_id, kind, name)
       values ($1, $2, 'procurement', 'Procurement'), ($3, $2, 'approvals', 'Approvals')`,
      [procurementId, workspaceId, approvalsId],
    );
    await client.query(
      `insert into activity_event (id, workspace_id, kind, entity_ref, actor_id, payload_summary)
       values ($1, $2, 'workspace.created', $3, $4, $5)`,
      [
        `act_${randomUUID().replaceAll("-", "")}`,
        workspaceId,
        JSON.stringify({ type: "workspace", id: workspaceId }),
        actor.userId,
        JSON.stringify({ message: "Workspace created" }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const created = await workspaceForMember(workspaceId, actor);
  return json({ workspace: created }, 201);
}

async function listChannels(workspaceId: string, actor: Actor): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) {
    return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  }
  const result = await pool.query(
    `select c.id, c.workspace_id, c.kind, c.name, c.status, c.created_at,
            coalesce((
              select count(*) from message m
               where m.channel_id = c.id and m.actor_id <> $3 and m.deleted_at is null
                 and m.sequence > coalesce((
                   select rc.last_event_sequence from read_cursor rc
                    where rc.channel_id = c.id and rc.user_id = $3
                 ), 0)
            ), 0)::int as unread_count
       from channel c
      where c.workspace_id = $1 and c.status = 'active' and $2 = true
      order by case c.kind when 'procurement' then 0 else 1 end, c.created_at asc`,
    [workspaceId, true, actor.userId],
  );
  return json({
    channels: result.rows,
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function getWorkspace(workspaceId: string, actor: Actor): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) {
    return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  }
  return json({
    workspace,
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function attachReferences(
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((row) => row.id);
  const result = await pool.query(
    `select message_id, reference_type, reference_id, display_snapshot
       from message_reference where message_id = any($1::text[])
      order by reference_type asc, reference_id asc`,
    [ids],
  );
  const byMessage = new Map<string, Record<string, unknown>[]>();
  for (const row of result.rows) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push({
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      display_snapshot: row.display_snapshot,
    });
    byMessage.set(row.message_id, list);
  }
  return rows.map((row) => ({ ...row, references: byMessage.get(String(row.id)) ?? [] }));
}

async function listMessages(
  channelId: string,
  actor: Actor,
  url: URL,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) {
    return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  }
  const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
  if (!Number.isInteger(cursor) || cursor < 0) {
    return problem(400, "invalid-cursor", "Cursor must be a non-negative integer.", actor.correlationId);
  }
  const result = await pool.query(
    `select id, workspace_id, channel_id, actor_id, actor_name, body, message_type,
            sequence, created_at, edited_at
       from message
      where channel_id = $1 and sequence > $2 and deleted_at is null
      order by sequence asc
      limit 50`,
    [channelId, cursor],
  );
  const nextCursor = result.rows.length ? result.rows[result.rows.length - 1].sequence : cursor;
  return json({
    messages: await attachReferences(result.rows),
    next_cursor: String(nextCursor),
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function postMessage(
  req: Request,
  channelId: string,
  actor: Actor,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) {
    return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  }
  if (!canWrite(actor)) {
    return problem(403, "message-write-forbidden", "This role cannot post messages.", actor.correlationId);
  }
  let body: { body?: string; message_type?: string };
  try {
    body = (await req.json()) as { body?: string; message_type?: string };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const text = body.body?.trim();
  if (!text || text.length > 4000) {
    return problem(400, "invalid-message", "Message body must be 1-4000 characters.", actor.correlationId);
  }
  const type = body.message_type === "mention" ? "mention" : "text";
  const messageId = `msg_${randomUUID().replaceAll("-", "")}`;
  const activityId = `act_${randomUUID().replaceAll("-", "")}`;
  const outboxId = `out_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  let row: Record<string, unknown>;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `insert into message (id, workspace_id, channel_id, actor_id, actor_name, body, message_type)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, workspace_id, channel_id, actor_id, actor_name, body, message_type, sequence, created_at`,
      [messageId, channel.workspace_id, channelId, actor.userId, actor.name, text, type],
    );
    row = inserted.rows[0];
    await client.query(
      `insert into activity_event (id, workspace_id, kind, entity_ref, actor_id, payload_summary)
       values ($1, $2, 'message.created', $3, $4, $5)`,
      [
        activityId,
        channel.workspace_id,
        JSON.stringify({ type: "message", id: messageId, channel_id: channelId }),
        actor.userId,
        JSON.stringify({ message_type: type }),
      ],
    );
    await client.query(
      `insert into workspace_outbox
         (id, event_type, aggregate_type, aggregate_id, correlation_id, payload)
       values ($1, 'workspace.message.created', 'workspace_message', $2, $3, $4)`,
      [
        outboxId,
        messageId,
        actor.correlationId,
        JSON.stringify({
          workspace_id: channel.workspace_id,
          channel_id: channelId,
          message_id: messageId,
          actor_id: actor.userId,
          message_type: type,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  broadcast(channel.workspace_id, { type: "message.created", message: row });
  return json(
    {
      message: row,
      environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
      test_data: true,
      correlation_id: actor.correlationId,
    },
    201,
  );
}

type ShareBody = {
  product_id?: string;
  variant_id?: string;
  offer_id?: string;
  quantity?: number;
  material_instruction?: string;
  seller_id?: string;
  product_title?: string;
  body?: string;
  commercial_snapshot?: Record<string, unknown>;
};

function validShare(body: ShareBody): string | null {
  if (!body.product_id || !body.variant_id || !body.offer_id) {
    return "product_id, variant_id and offer_id are required.";
  }
  if (!Number.isInteger(body.quantity) || (body.quantity as number) < 1) {
    return "quantity must be a positive integer.";
  }
  return null;
}

async function sharePreview(
  req: Request,
  channelId: string,
  actor: Actor,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  let body: ShareBody;
  try {
    body = (await req.json()) as ShareBody;
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const invalid = validShare(body);
  if (invalid) return problem(400, "invalid-share", invalid, actor.correlationId);
  const shared = {
    product_id: body.product_id,
    variant_id: body.variant_id,
    offer_id: body.offer_id,
    seller_id: body.seller_id ?? null,
    quantity: body.quantity,
    material_instruction: body.material_instruction?.trim() || null,
    product_title: body.product_title ?? null,
    commercial_snapshot: body.commercial_snapshot ?? {},
  };
  return json({
    product_id: body.product_id,
    variant_id: body.variant_id,
    current: shared,
    shared_at: shared,
    changed: false,
    validation_basis: "staging-fixture",
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function shareProduct(
  req: Request,
  channelId: string,
  actor: Actor,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  if (!canWrite(actor)) {
    return problem(403, "share-forbidden", "This role cannot share products.", actor.correlationId);
  }
  let body: ShareBody;
  try {
    body = (await req.json()) as ShareBody;
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const invalid = validShare(body);
  if (invalid) return problem(400, "invalid-share", invalid, actor.correlationId);
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await pool.query(
      `select id, workspace_id, channel_id, actor_id, actor_name, body, message_type,
              sequence, created_at, edited_at
         from message where channel_id = $1 and idempotency_key = $2 and deleted_at is null`,
      [channelId, idempotencyKey],
    );
    if (existing.rows[0]) {
      const [withReferences] = await attachReferences([existing.rows[0]]);
      return json(withReferences, 201);
    }
  }
  const title = body.product_title?.trim() || "a catalogue product";
  const text = body.body?.trim() || `Shared ${title} for procurement review.`;
  const messageId = `msg_${randomUUID().replaceAll("-", "")}`;
  const snapshot = {
    ...(body.commercial_snapshot ?? {}),
    product_title: body.product_title ?? null,
    seller_id: body.seller_id ?? null,
    quantity: body.quantity,
    material_instruction: body.material_instruction?.trim() || null,
    validation_basis: "staging-fixture",
  };
  const client = await pool.connect();
  let row: Record<string, unknown>;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `insert into message
         (id, workspace_id, channel_id, actor_id, actor_name, body, message_type, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,'product_share',$7)
       returning id, workspace_id, channel_id, actor_id, actor_name, body, message_type,
                 sequence, created_at, edited_at`,
      [messageId, channel.workspace_id, channelId, actor.userId, actor.name, text.slice(0, 4000), idempotencyKey],
    );
    row = inserted.rows[0];
    await client.query(
      `insert into message_reference (message_id, reference_type, reference_id, display_snapshot)
       values ($1, 'product', $2, $3)`,
      [messageId, body.variant_id, JSON.stringify(snapshot)],
    );
    await client.query(
      `insert into activity_event (id, workspace_id, kind, entity_ref, actor_id, payload_summary)
       values ($1,$2,'product.shared',$3,$4,$5)`,
      [
        `act_${randomUUID().replaceAll("-", "")}`,
        channel.workspace_id,
        JSON.stringify({ type: "message", id: messageId, channel_id: channelId, variant_id: body.variant_id }),
        actor.userId,
        JSON.stringify({ product_id: body.product_id, quantity: body.quantity }),
      ],
    );
    await client.query(
      `insert into workspace_outbox
         (id, event_type, aggregate_type, aggregate_id, correlation_id, payload)
       values ($1,'workspace.product.shared','workspace_message',$2,$3,$4)`,
      [
        `out_${randomUUID().replaceAll("-", "")}`,
        messageId,
        actor.correlationId,
        JSON.stringify({
          workspace_id: channel.workspace_id,
          channel_id: channelId,
          message_id: messageId,
          product_id: body.product_id,
          variant_id: body.variant_id,
          quantity: body.quantity,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const shared = {
    ...row,
    references: [{
      reference_type: "product",
      reference_id: body.variant_id,
      display_snapshot: snapshot,
    }],
  };
  broadcast(channel.workspace_id, { type: "message.created", message: shared });
  return json(shared, 201);
}

async function setReadCursor(
  req: Request,
  channelId: string,
  actor: Actor,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) {
    return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  }
  let body: { last_event_sequence?: number };
  try {
    body = (await req.json()) as { last_event_sequence?: number };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const seq = body.last_event_sequence;
  if (!Number.isInteger(seq) || (seq as number) < 0) {
    return problem(400, "invalid-cursor", "last_event_sequence must be a non-negative integer.", actor.correlationId);
  }
  await pool.query(
    `insert into read_cursor (channel_id, user_id, last_event_sequence, updated_at)
     values ($1, $2, $3, now())
     on conflict (channel_id, user_id)
     do update set last_event_sequence = greatest(read_cursor.last_event_sequence, excluded.last_event_sequence),
                   updated_at = now()`,
    [channelId, actor.userId, seq],
  );
  return new Response(null, { status: 204 });
}

async function listActivity(
  workspaceId: string,
  actor: Actor,
  url: URL,
): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) {
    return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  }
  const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
  if (!Number.isInteger(cursor) || cursor < 0) {
    return problem(400, "invalid-cursor", "Cursor must be a non-negative integer.", actor.correlationId);
  }
  const result = await pool.query(
    `select id, workspace_id, draft_id, kind, entity_ref, actor_id,
            resulting_version, payload_summary, sequence, occurred_at
       from activity_event
      where workspace_id = $1 and sequence > $2
      order by sequence asc
      limit 50`,
    [workspaceId, cursor],
  );
  const nextCursor = result.rows.length ? result.rows[result.rows.length - 1].sequence : cursor;
  return json({
    events: result.rows,
    next_cursor: String(nextCursor),
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function streamBacklog(
  workspaceId: string,
  cursor: number,
): Promise<Record<string, unknown>[]> {
  const result = await pool.query(
    `select m.id, m.workspace_id, m.channel_id, m.actor_id, m.actor_name, m.body,
            m.message_type, m.sequence, m.created_at, m.edited_at
       from message m
       join channel c on c.id = m.channel_id
      where c.workspace_id = $1 and m.sequence > $2 and m.deleted_at is null
      order by m.sequence asc
      limit 100`,
    [workspaceId, cursor],
  );
  return attachReferences(result.rows);
}

function broadcast(workspaceId: string, payload: unknown): void {
  const listeners = workspaceSockets.get(workspaceId);
  if (!listeners?.size) return;
  const text = JSON.stringify(payload);
  for (const socket of listeners) {
    try {
      socket.send(text);
    } catch {
      listeners.delete(socket);
    }
  }
}

async function handleStream(
  req: Request,
  server: Bun.Server,
  url: URL,
  workspaceId: string,
): Promise<Response | undefined> {
  const actor = parseStreamActor(url);
  if (actor instanceof Response) return actor;
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) {
    return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  }
  const cursorRaw = url.searchParams.get("cursor") ?? "0";
  const cursor = Number.parseInt(cursorRaw, 10);
  if (!Number.isInteger(cursor) || cursor < 0) {
    return problem(400, "invalid-cursor", "Cursor must be a non-negative integer.", actor.correlationId);
  }
  const upgraded = server.upgrade(req, {
    data: { workspaceId, userId: actor.userId, cursor },
  });
  if (!upgraded) {
    return problem(400, "websocket-upgrade-failed", "WebSocket upgrade failed.", actor.correlationId);
  }
  return undefined;
}

async function drainOutbox(): Promise<void> {
  if (!natsConnection) return;
  const result = await pool.query(
    `select id, event_type, aggregate_type, aggregate_id, correlation_id, payload
       from workspace_outbox
      where published_at is null and next_at <= now()
      order by created_at asc
      limit 50`,
  );
  for (const row of result.rows) {
    try {
      natsConnection.publish(
        `workspace.${row.event_type}`,
        new TextEncoder().encode(
          JSON.stringify({
            id: row.id,
            event_type: row.event_type,
            aggregate_type: row.aggregate_type,
            aggregate_id: row.aggregate_id,
            correlation_id: row.correlation_id,
            payload: row.payload,
            occurred_at: new Date().toISOString(),
          }),
        ),
      );
      await pool.query(
        "update workspace_outbox set published_at = now() where id = $1",
        [row.id],
      );
    } catch (error) {
      console.warn("[workspace] outbox publish failed:", (error as Error).message);
      await pool.query(
        `update workspace_outbox
            set attempts = attempts + 1,
                next_at = now() + make_interval(secs => least(60, power(2, attempts)))
          where id = $1`,
        [row.id],
      );
    }
  }
}

async function startNats(): Promise<void> {
  if (!NATS_URL) {
    console.log("[workspace] NATS not configured; outbox will remain unpublished");
    return;
  }
  try {
    natsConnection = await connect({
      servers: NATS_URL,
      ...(NATS_USER ? { user: NATS_USER } : {}),
      ...(NATS_PASSWORD ? { pass: NATS_PASSWORD } : {}),
    });
    console.log("[workspace] NATS connected; outbox publisher active");
    setInterval(() => {
      drainOutbox().catch((error) =>
        console.warn("[workspace] outbox drain failed:", (error as Error).message),
      );
    }, 1000);
  } catch (error) {
    console.warn("[workspace] NATS connect failed:", (error as Error).message);
  }
}

type DraftLineInput = {
  line_key: string;
  product_id: string;
  variant_id: string;
  seller_id: string;
  offer_id: string;
  fulfilment_context_id: string;
  quantity: number;
  unit_amount_minor: number;
  currency_code: string;
  commercial_snapshot: Record<string, unknown>;
  material_instruction?: string | null;
};

type DraftRow = {
  id: string;
  workspace_id: string;
  channel_id: string;
  name: string;
  lifecycle_status: string;
  validation_status: string;
  current_version: number;
  created_by: string;
  role: string;
  scope_id: string;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function revisionPayload(lines: DraftLineInput[]): Record<string, unknown> {
  const canonicalLines = [...lines]
    .map((line) => ({
      line_key: line.line_key,
      product_id: line.product_id,
      variant_id: line.variant_id,
      seller_id: line.seller_id,
      offer_id: line.offer_id,
      fulfilment_context_id: line.fulfilment_context_id || "default",
      quantity: line.quantity,
      currency_code: line.currency_code || "INR",
      unit_amount_minor: line.unit_amount_minor,
      line_amount_minor: line.quantity * line.unit_amount_minor,
      tax_basis: "staging",
      tax_rate_basis_points: 0,
      tax_inclusive: false,
      material_instruction: line.material_instruction?.trim() || null,
    }))
    .sort((a, b) => a.line_key.localeCompare(b.line_key));
  return {
    schema_version: 1,
    currency_code: "INR",
    lines: canonicalLines,
    delivery_address_id: null,
    shipping_option_id: null,
    required_delivery_date: null,
    payment_terms: null,
    project_id: null,
    po_number: null,
    cost_centre: null,
  };
}

async function createRevision(
  client: PoolClient,
  draft: DraftRow,
  lines: DraftLineInput[],
  createdBy: string,
  version: number,
): Promise<{ revisionId: string; hash: string; version: number }> {
  if (lines.length === 0) throw new Error("A purchase draft needs at least one line.");
  for (const line of lines) {
    if (!line.line_key || !line.variant_id || !line.offer_id || line.quantity < 1 ||
        line.unit_amount_minor < 0) {
      throw new Error("Each draft line needs a key, variant, offer, positive quantity and valid amount.");
    }
  }
  const payload = revisionPayload(lines);
  const hash = createHash("sha256").update(stableStringify(payload)).digest("hex");
  const revisionId = `rev_${randomUUID().replaceAll("-", "")}`;
  await client.query(
    `insert into draft_revision
       (id, draft_id, version, canonical_payload, commercial_hash, created_by, supersedes_version)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [revisionId, draft.id, version, JSON.stringify(payload), hash, createdBy,
      version > 1 ? version - 1 : null],
  );
  for (const line of lines) {
    await client.query(
      `insert into draft_line_revision
         (revision_id, line_key, product_id, variant_id, seller_id, offer_id,
          fulfilment_context_id, quantity, commercial_snapshot, material_instruction)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [revisionId, line.line_key, line.product_id, line.variant_id, line.seller_id,
        line.offer_id, line.fulfilment_context_id || "default", line.quantity,
        JSON.stringify(line.commercial_snapshot ?? {}),
        line.material_instruction?.trim() || null],
    );
  }
  await client.query(
    `update purchase_draft
        set current_version = $2, lifecycle_status = 'draft',
            validation_status = 'unvalidated', updated_at = now()
      where id = $1`,
    [draft.id, version],
  );
  await client.query(
    `update approval_request
        set decision = 'superseded', decided_at = now()
      where draft_id = $1 and decision in ('pending', 'approved')`,
    [draft.id],
  );
  await client.query(
    `insert into activity_event (id, workspace_id, draft_id, kind, entity_ref, actor_id, resulting_version, payload_summary)
     values ($1,$2,$3,'draft.revision.created',$4,$5,$6,$7)`,
    [
      `act_${randomUUID().replaceAll("-", "")}`,
      draft.workspace_id,
      draft.id,
      JSON.stringify({ type: "draft_revision", id: revisionId, version }),
      createdBy,
      version,
      JSON.stringify({ commercial_hash: hash }),
    ],
  );
  await client.query(
    `insert into workspace_outbox
       (id, event_type, aggregate_type, aggregate_id, correlation_id, payload)
     values ($1,'draft.revision.created','purchase_draft',$2,$3,$4)`,
    [
      `out_${randomUUID().replaceAll("-", "")}`,
      draft.id,
      `draft-${draft.id}-${version}`,
      JSON.stringify({ workspace_id: draft.workspace_id, draft_id: draft.id, version, revision_id: revisionId, commercial_hash: hash }),
    ],
  );
  return { revisionId, hash, version };
}

async function draftForMember(draftId: string, actor: Actor): Promise<DraftRow | null> {
  const result = await pool.query<DraftRow>(
    `select d.id, d.workspace_id, d.channel_id, d.name, d.lifecycle_status,
            d.validation_status, d.current_version, d.created_by, wm.role, w.scope_id
       from purchase_draft d
       join workspace w on w.id = d.workspace_id
       join workspace_member wm on wm.workspace_id = w.id
      where d.id = $1 and w.scope_id = $2 and wm.user_id = $3
        and wm.status = 'active' and w.status = 'active'`,
    [draftId, actor.businessAccountId, actor.userId],
  );
  return result.rows[0] ?? null;
}

async function linesForRevision(revisionId: string): Promise<DraftLineInput[]> {
  const result = await pool.query(
    `select line_key, product_id, variant_id, seller_id, offer_id,
            fulfilment_context_id, quantity, commercial_snapshot, material_instruction
       from draft_line_revision where revision_id = $1 order by line_key asc`,
    [revisionId],
  );
  return result.rows.map((row) => {
    const snapshot = (row.commercial_snapshot ?? {}) as Record<string, unknown>;
    return {
      line_key: row.line_key,
      product_id: row.product_id,
      variant_id: row.variant_id,
      seller_id: row.seller_id,
      offer_id: row.offer_id,
      fulfilment_context_id: row.fulfilment_context_id,
      quantity: row.quantity,
      unit_amount_minor: Number(snapshot.unit_amount_minor ?? 0),
      currency_code: String(snapshot.currency_code ?? "INR"),
      commercial_snapshot: snapshot,
      material_instruction: row.material_instruction,
    };
  });
}

async function draftView(draft: DraftRow): Promise<Record<string, unknown>> {
  const revision = await pool.query(
    `select id, version, commercial_hash, canonical_payload, created_by, created_at
       from draft_revision where draft_id = $1 and version = $2`,
    [draft.id, draft.current_version],
  );
  const current = revision.rows[0];
  const lines = current ? await linesForRevision(current.id) : [];
  const approval = await pool.query(
    `select id, revision_id, commercial_hash, requested_by, decided_by, decision, comment,
            decision_comment, requested_at, decided_at
       from approval_request where draft_id = $1 order by requested_at desc limit 1`,
    [draft.id],
  );
  const proposals = await pool.query(
    `select id, kind, payload, expected_version, status, proposed_by, decided_by,
            created_at, decided_at
       from proposal where draft_id = $1 order by created_at desc limit 20`,
    [draft.id],
  );
  return {
    draft: {
      id: draft.id,
      workspace_id: draft.workspace_id,
      channel_id: draft.channel_id,
      name: draft.name,
      lifecycle_status: draft.lifecycle_status,
      validation_status: draft.validation_status,
      current_version: draft.current_version,
      created_by: draft.created_by,
      role: draft.role,
    },
    revision: current
      ? {
          id: current.id,
          draft_id: draft.id,
          version: current.version,
          commercial_hash: current.commercial_hash,
          created_by: current.created_by,
          created_at: current.created_at,
          lines,
        }
      : null,
    approval: approval.rows[0] ?? null,
    proposals: proposals.rows,
  };
}

function applyProposal(
  lines: DraftLineInput[],
  kind: string,
  payload: Record<string, unknown>,
): DraftLineInput[] {
  const copy = lines.map((line) => ({ ...line }));
  if (kind === "add_line") {
    const raw = payload.line as Record<string, unknown> | undefined;
    if (!raw) throw new Error("add_line requires a line.");
    const line: DraftLineInput = {
      line_key: String(raw.line_key ?? raw.variant_id ?? ""),
      product_id: String(raw.product_id ?? ""),
      variant_id: String(raw.variant_id ?? ""),
      seller_id: String(raw.seller_id ?? ""),
      offer_id: String(raw.offer_id ?? ""),
      fulfilment_context_id: String(raw.fulfilment_context_id ?? "default"),
      quantity: Number(raw.quantity ?? 0),
      unit_amount_minor: Number(raw.unit_amount_minor ?? 0),
      currency_code: String(raw.currency_code ?? "INR"),
      commercial_snapshot: (raw.commercial_snapshot as Record<string, unknown>) ?? {},
      material_instruction: raw.material_instruction as string | undefined,
    };
    if (copy.some((existing) => existing.line_key === line.line_key)) {
      throw new Error("A line with this key already exists.");
    }
    copy.push(line);
    return copy;
  }
  const lineKey = String(payload.line_key ?? "");
  const index = copy.findIndex((line) => line.line_key === lineKey);
  if (index < 0) throw new Error("The referenced line does not exist.");
  if (kind === "update_quantity") {
    const quantity = Number(payload.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be a positive integer.");
    copy[index].quantity = quantity;
    return copy;
  }
  if (kind === "remove_line") {
    copy.splice(index, 1);
    return copy;
  }
  if (kind === "update_instruction") {
    copy[index].material_instruction = String(payload.material_instruction ?? "").trim() || null;
    return copy;
  }
  throw new Error("Unsupported proposal kind.");
}

async function handleProposalDecision(
  req: Request,
  proposalId: string,
  action: "accept" | "edit-and-accept" | "reject" | "cancel",
  actor: Actor,
): Promise<Response> {
  const result = await pool.query(
    `select p.*, d.workspace_id, d.channel_id, d.name, d.lifecycle_status,
            d.validation_status, d.current_version, d.created_by, d.role
       from proposal p
       join (
         select pd.*, wm.role
           from purchase_draft pd
           join workspace w on w.id = pd.workspace_id
           join workspace_member wm on wm.workspace_id = w.id
          where w.scope_id = $2 and wm.user_id = $3 and wm.status = 'active'
       ) d on d.id = p.draft_id
      where p.id = $1`,
    [proposalId, actor.businessAccountId, actor.userId],
  );
  const proposal = result.rows[0];
  if (!proposal) return problem(404, "proposal-not-found", "Proposal not found.", actor.correlationId);
  if (action === "cancel" && proposal.proposed_by !== actor.userId) {
    return problem(403, "proposal-cancel-forbidden", "Only the proposer can cancel.", actor.correlationId);
  }
  if (action !== "cancel" && !["buyer", "admin"].includes(proposal.role)) {
    return problem(403, "proposal-decision-forbidden", "Only a buyer or account admin can decide a proposal.", actor.correlationId);
  }
  if (proposal.status !== "pending") {
    return problem(409, "proposal-not-pending", "This proposal is no longer pending.", actor.correlationId);
  }
  if (proposal.expected_version !== proposal.current_version) {
    await pool.query("update proposal set status='stale' where id=$1", [proposalId]);
    return json({
      type: "about:blank",
      title: "stale-proposal",
      status: 409,
      code: "stale-proposal",
      detail: "The draft changed after this proposal was created.",
      current_version: proposal.current_version,
      required_action: "review-and-resubmit",
      correlation_id: actor.correlationId,
    }, 409);
  }
  if (action === "reject" || action === "cancel") {
    await pool.query(
      "update proposal set status=$2, decided_by=$3, decided_at=now() where id=$1",
      [proposalId, action === "reject" ? "rejected" : "cancelled", actor.userId],
    );
    return new Response(null, { status: 204 });
  }

  const revision = await pool.query(
    "select id from draft_revision where draft_id=$1 and version=$2",
    [proposal.draft_id, proposal.current_version],
  );
  const currentLines = revision.rows[0]
    ? await linesForRevision(revision.rows[0].id)
    : [];
  let lines: DraftLineInput[];
  if (action === "edit-and-accept") {
    let body: { lines?: DraftLineInput[] };
    try { body = (await req.json()) as { lines?: DraftLineInput[] }; } catch { body = {}; }
    lines = body.lines?.length ? body.lines : applyProposal(currentLines, proposal.kind, proposal.payload);
  } else {
    lines = applyProposal(currentLines, proposal.kind, proposal.payload);
  }
  const draft: DraftRow = {
    id: proposal.draft_id,
    workspace_id: proposal.workspace_id,
    channel_id: proposal.channel_id,
    name: proposal.name,
    lifecycle_status: proposal.lifecycle_status,
    validation_status: proposal.validation_status,
    current_version: proposal.current_version,
    created_by: proposal.created_by,
    role: proposal.role,
    scope_id: actor.businessAccountId as string,
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await createRevision(client, draft, lines, actor.userId, draft.current_version + 1);
    await client.query(
      `update proposal set status=$2, decided_by=$3, decided_at=now() where id=$1`,
      [proposalId, action === "edit-and-accept" ? "edited_accepted" : "accepted", actor.userId],
    );
    await client.query("COMMIT");
    broadcast(draft.workspace_id, {
      type: "draft.updated",
      workspace_id: draft.workspace_id,
      draft_id: draft.id,
      version: created.version,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return problem(400, "proposal-apply-failed", (error as Error).message, actor.correlationId);
  } finally {
    client.release();
  }
  const updatedRevision = await pool.query(
    `select id, draft_id, version, commercial_hash, canonical_payload, created_by,
            created_at, supersedes_version
       from draft_revision where draft_id=$1 and version=$2`,
    [proposal.draft_id, proposal.current_version + 1],
  );
  const row = updatedRevision.rows[0];
  if (!row) return problem(500, "revision-missing", "The accepted revision could not be read.", actor.correlationId);
  return json({ ...row, lines: await linesForRevision(row.id) });
}

async function handleApprovalAction(
  req: Request,
  approvalId: string,
  action: "approve" | "reject" | "request-changes",
  actor: Actor,
): Promise<Response> {
  let comment: string | null = null;
  try {
    const body = (await req.json()) as { comment?: string };
    comment = body.comment?.trim().slice(0, 2000) || null;
  } catch {
    comment = null;
  }
  if (action === "request-changes" && !comment) {
    return problem(400, "comment-required", "Requesting changes needs a comment.", actor.correlationId);
  }
  const result = await pool.query(
    `select a.*, d.workspace_id, d.channel_id, d.name, d.lifecycle_status,
            d.validation_status, d.current_version, d.created_by, d.role
       from approval_request a
       join (
         select pd.*, wm.role
           from purchase_draft pd
           join workspace w on w.id = pd.workspace_id
           join workspace_member wm on wm.workspace_id = w.id
          where w.scope_id = $2 and wm.user_id = $3 and wm.status = 'active'
       ) d on d.id = a.draft_id
      where a.id = $1`,
    [approvalId, actor.businessAccountId, actor.userId],
  );
  const approval = result.rows[0];
  if (!approval) return problem(404, "approval-not-found", "Approval request not found.", actor.correlationId);
  if (approval.role !== "approver" && !actor.roles.includes("super_admin")) {
    return problem(403, "approver-required", "An approver role is required.", actor.correlationId);
  }
  if (approval.requested_by === actor.userId) {
    return problem(403, "self-approval-forbidden", "The requester cannot approve this revision.", actor.correlationId);
  }
  if (approval.decision !== "pending") {
    return problem(409, "approval-not-pending", "This approval is no longer pending.", actor.correlationId);
  }
  const decision = action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested";
  const lifecycle = action === "approve" ? "approved" : action === "reject" ? "draft" : "changes_requested";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `update approval_request
          set decision=$2, decided_by=$3, decision_comment=$4, decided_at=now()
        where id=$1`,
      [approvalId, decision, actor.userId, comment],
    );
    await client.query(
      "update purchase_draft set lifecycle_status=$2, updated_at=now() where id=$1",
      [approval.draft_id, lifecycle],
    );
    await client.query(
      `insert into activity_event (id, workspace_id, draft_id, kind, entity_ref, actor_id, resulting_version, payload_summary)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        `act_${randomUUID().replaceAll("-", "")}`,
        approval.workspace_id,
        approval.draft_id,
        `approval.${decision}`,
        JSON.stringify({ type: "approval_request", id: approvalId }),
        actor.userId,
        approval.current_version,
        JSON.stringify({ decision, comment }),
      ],
    );
    await client.query(
      `insert into workspace_outbox
         (id, event_type, aggregate_type, aggregate_id, correlation_id, payload)
       values ($1,$2,'purchase_draft',$3,$4,$5)`,
      [
        `out_${randomUUID().replaceAll("-", "")}`,
        `approval.${decision}`,
        approval.draft_id,
        actor.correlationId,
        JSON.stringify({ workspace_id: approval.workspace_id, draft_id: approval.draft_id, decision, approval_id: approvalId }),
      ],
    );
    await client.query("COMMIT");
    broadcast(approval.workspace_id, {
      type: "draft.updated",
      workspace_id: approval.workspace_id,
      draft_id: approval.draft_id,
      lifecycle_status: lifecycle,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return problem(500, "approval-failed", "The approval decision could not be saved.", actor.correlationId);
  } finally {
    client.release();
  }
  const decided = await pool.query(
    `select id, draft_id, revision_id, commercial_hash, requested_by, decided_by,
            decision, comment, decision_comment, requested_at, decided_at
       from approval_request where id=$1`,
    [approvalId],
  );
  return json(decided.rows[0] ?? { ok: true });
}

async function listDrafts(
  workspaceId: string,
  actor: Actor,
): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  const result = await pool.query(
    `select id, workspace_id, channel_id, name, lifecycle_status, validation_status,
            current_version, created_by, created_at, updated_at
       from purchase_draft where workspace_id = $1 order by updated_at desc`,
    [workspaceId],
  );
  return json({ drafts: result.rows, correlation_id: actor.correlationId });
}

async function createDraft(
  req: Request,
  workspaceId: string,
  actor: Actor,
): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  if (!["buyer", "admin"].includes(workspace.role ?? "")) {
    return problem(403, "draft-write-forbidden", "Only a buyer or account admin can create a draft.", actor.correlationId);
  }
  let body: { name?: string; channel_id?: string; lines?: DraftLineInput[] };
  try {
    body = (await req.json()) as { name?: string; channel_id?: string; lines?: DraftLineInput[] };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const name = body.name?.trim();
  if (!name) return problem(400, "invalid-draft-name", "A draft name is required.", actor.correlationId);
  const channelId = body.channel_id ??
    (workspace.id === "ws_arjun_procurement"
      ? "ch_arjun_procurement"
      : "ch_shakti_procurement");
  const channel = await channelForMember(channelId, actor);
  if (!channel || channel.workspace_id !== workspaceId) {
    return problem(404, "channel-not-found", "Channel not found in this workspace.", actor.correlationId);
  }
  const lines = body.lines ?? [];
  const draftId = `drf_${randomUUID().replaceAll("-", "")}`;
  const draft: DraftRow = {
    id: draftId,
    workspace_id: workspaceId,
    channel_id: channelId,
    name,
    lifecycle_status: "draft",
    validation_status: "unvalidated",
    current_version: 0,
    created_by: actor.userId,
    role: workspace.role ?? "buyer",
    scope_id: actor.businessAccountId as string,
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into purchase_draft
         (id, workspace_id, channel_id, name, lifecycle_status, validation_status, current_version, created_by)
       values ($1,$2,$3,$4,'draft','unvalidated',0,$5)`,
      [draftId, workspaceId, channelId, name, actor.userId],
    );
    if (lines.length) {
      await createRevision(client, draft, lines, actor.userId, 1);
    }
    await client.query("COMMIT");
    broadcast(workspaceId, { type: "draft.updated", workspace_id: workspaceId, draft_id: draftId });
  } catch (error) {
    await client.query("ROLLBACK");
    return problem(400, "draft-create-failed", (error as Error).message, actor.correlationId);
  } finally {
    client.release();
  }
  const updated = await draftForMember(draftId, actor);
  return json(updated ? await draftView(updated) : { ok: true }, 201);
}

async function getDraft(draftId: string, actor: Actor): Promise<Response> {
  const draft = await draftForMember(draftId, actor);
  if (!draft) return problem(404, "draft-not-found", "Purchase draft not found.", actor.correlationId);
  return json(await draftView(draft));
}

async function getDraftRevision(
  draftId: string,
  version: number,
  actor: Actor,
): Promise<Response> {
  const draft = await draftForMember(draftId, actor);
  if (!draft) return problem(404, "draft-not-found", "Purchase draft not found.", actor.correlationId);
  const revision = await pool.query(
    `select id, version, commercial_hash, canonical_payload, created_by, created_at
       from draft_revision where draft_id=$1 and version=$2`,
    [draftId, version],
  );
  if (!revision.rows[0]) return problem(404, "revision-not-found", "Revision not found.", actor.correlationId);
  const row = revision.rows[0];
  return json({
    revision: {
      ...row,
      lines: await linesForRevision(row.id),
    },
    correlation_id: actor.correlationId,
  });
}

async function postProposal(
  req: Request,
  draftId: string,
  actor: Actor,
): Promise<Response> {
  const draft = await draftForMember(draftId, actor);
  if (!draft) return problem(404, "draft-not-found", "Purchase draft not found.", actor.correlationId);
  if (!["buyer", "admin"].includes(draft.role)) {
    return problem(403, "proposal-forbidden", "Only a buyer or account admin can propose a change.", actor.correlationId);
  }
  let body: { expected_version?: number; kind?: string; payload?: Record<string, unknown> };
  try {
    body = (await req.json()) as { expected_version?: number; kind?: string; payload?: Record<string, unknown> };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  if (body.expected_version !== draft.current_version) {
    return json({
      type: "about:blank",
      title: "stale-version",
      status: 409,
      code: "stale-version",
      detail: "The draft has a newer revision.",
      current_version: draft.current_version,
      required_action: "review-and-resubmit",
      correlation_id: actor.correlationId,
    }, 409);
  }
  const kind = String(body.kind ?? "");
  if (!["add_line", "update_quantity", "remove_line", "update_instruction"].includes(kind)) {
    return problem(400, "invalid-proposal-kind", "Unsupported proposal kind.", actor.correlationId);
  }
  const payload = body.payload ?? {};
  try {
    const revision = await pool.query(
      "select id from draft_revision where draft_id=$1 and version=$2",
      [draftId, draft.current_version],
    );
    if (!revision.rows[0]) return problem(409, "draft-has-no-revision", "The draft has no current revision.", actor.correlationId);
    applyProposal(await linesForRevision(revision.rows[0].id), kind, payload);
  } catch (error) {
    return problem(400, "invalid-proposal", (error as Error).message, actor.correlationId);
  }
  const idempotencyKey = req.headers.get("idempotency-key") ?? randomUUID();
  const proposalId = `prop_${randomUUID().replaceAll("-", "")}`;
  try {
    await pool.query(
      `insert into proposal (id, draft_id, kind, payload, expected_version, proposed_by, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [proposalId, draftId, kind, JSON.stringify(payload), draft.current_version, actor.userId, idempotencyKey],
    );
  } catch (error) {
    return problem(409, "duplicate-proposal", "This proposal idempotency key was already used.", actor.correlationId);
  }
  await pool.query(
    `insert into activity_event (id, workspace_id, draft_id, kind, entity_ref, actor_id, resulting_version, payload_summary)
     values ($1,$2,$3,'proposal.created',$4,$5,$6,$7)`,
    [
      `act_${randomUUID().replaceAll("-", "")}`,
      draft.workspace_id,
      draftId,
      JSON.stringify({ type: "proposal", id: proposalId, kind }),
      actor.userId,
      draft.current_version,
      JSON.stringify({ kind }),
    ],
  );
  broadcast(draft.workspace_id, { type: "draft.updated", workspace_id: draft.workspace_id, draft_id: draftId });
  return json({ proposal_id: proposalId, status: "pending", correlation_id: actor.correlationId }, 201);
}

async function requestApproval(
  req: Request,
  draftId: string,
  actor: Actor,
): Promise<Response> {
  const draft = await draftForMember(draftId, actor);
  if (!draft) return problem(404, "draft-not-found", "Purchase draft not found.", actor.correlationId);
  if (!["buyer", "admin"].includes(draft.role)) {
    return problem(403, "approval-request-forbidden", "Only a buyer or account admin can request approval.", actor.correlationId);
  }
  let body: { expected_version?: number; revision_id?: string; commercial_hash?: string; comment?: string };
  try {
    body = (await req.json()) as { expected_version?: number; revision_id?: string; commercial_hash?: string; comment?: string };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  if (body.expected_version !== draft.current_version) {
    return json({
      type: "about:blank",
      title: "stale-version",
      status: 409,
      code: "stale-version",
      detail: "The draft has a newer revision.",
      current_version: draft.current_version,
      required_action: "review-and-resubmit",
      correlation_id: actor.correlationId,
    }, 409);
  }
  const revision = await pool.query(
    `select id, commercial_hash from draft_revision
      where draft_id=$1 and version=$2`,
    [draftId, draft.current_version],
  );
  const current = revision.rows[0];
  if (!current || current.id !== body.revision_id || current.commercial_hash !== body.commercial_hash) {
    return problem(409, "approval-revision-mismatch", "Approval must bind to the current revision and hash.", actor.correlationId);
  }
  const approvalId = `apr_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into approval_request
         (id, draft_id, revision_id, commercial_hash, requested_by, comment, decision)
       values ($1,$2,$3,$4,$5,$6,'pending')`,
      [approvalId, draftId, current.id, current.commercial_hash, actor.userId, body.comment?.trim() || null],
    );
    await client.query(
      "update purchase_draft set lifecycle_status='review_requested', updated_at=now() where id=$1",
      [draftId],
    );
    await client.query(
      `insert into activity_event (id, workspace_id, draft_id, kind, entity_ref, actor_id, resulting_version, payload_summary)
       values ($1,$2,$3,'approval.requested',$4,$5,$6,$7)`,
      [
        `act_${randomUUID().replaceAll("-", "")}`,
        draft.workspace_id,
        draftId,
        JSON.stringify({ type: "approval_request", id: approvalId, revision_id: current.id }),
        actor.userId,
        draft.current_version,
        JSON.stringify({ commercial_hash: current.commercial_hash }),
      ],
    );
    await client.query("COMMIT");
    broadcast(draft.workspace_id, { type: "draft.updated", workspace_id: draft.workspace_id, draft_id: draftId, lifecycle_status: "review_requested" });
  } catch (error) {
    await client.query("ROLLBACK");
    return problem(500, "approval-request-failed", "The approval request could not be saved.", actor.correlationId);
  } finally {
    client.release();
  }
  const created = await pool.query(
    `select id, draft_id, revision_id, commercial_hash, requested_by, decided_by,
            decision, comment, decision_comment, requested_at, decided_at
       from approval_request where id=$1`,
    [approvalId],
  );
  return json(created.rows[0] ?? { ok: true }, 201);
}

async function ensureSeedDraft(): Promise<void> {
  const existing = await pool.query(
    "select id from purchase_draft where id = 'drf_arjun_staging'",
  );
  if (existing.rows[0]) return;
  const lines: DraftLineInput[] = [
    {
      line_key: "line_board",
      product_id: "prod_01M59JS4A6QTH32AXVW9P2D3A3",
      variant_id: "variant_01M59JS4DN9Q4S8TF4ATNFTYRS",
      seller_id: "sel_01M4EC9DK3DWFSYX18FNDSGYC2",
      offer_id: "offer_01M59JTETF6DG8WP2V4QAQJX8A",
      fulfilment_context_id: "default",
      quantity: 4,
      unit_amount_minor: 43690,
      currency_code: "INR",
      commercial_snapshot: {
        product_title: "Action Tesa HDHMR Board, Plain, 8' X 4'",
        seller_name: "UrbanBuild Supply",
        sku: "ACTION-TESA-HDHMR-8X4",
        unit_amount_minor: 43690,
        currency_code: "INR",
      },
    },
    {
      line_key: "line_tyre",
      product_id: "prod_01M59JHMK6M811FFT63G2WJMCV",
      variant_id: "variant_01M59JHMQSD6FXZGB6PHH5VEN4",
      seller_id: "sel_01M5897CE4PTBHS4AA7H0G79G7",
      offer_id: "offer_01M59JHP06A9WGCMQTFQBES07Z",
      fulfilment_context_id: "default",
      quantity: 2,
      unit_amount_minor: 93906,
      currency_code: "INR",
      commercial_snapshot: {
        product_title: "RANGER A/T",
        seller_name: "BuildKart Direct",
        sku: "RANGER-A-T-215-75R15",
        unit_amount_minor: 93906,
        currency_code: "INR",
      },
    },
  ];
  const draft: DraftRow = {
    id: "drf_arjun_staging",
    workspace_id: "ws_arjun_procurement",
    channel_id: "ch_arjun_procurement",
    name: "Arjun site replenishment",
    lifecycle_status: "draft",
    validation_status: "unvalidated",
    current_version: 0,
    created_by: "pilot_admin_b2b01",
    role: "admin",
    scope_id: "business_arjun_traders",
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into purchase_draft
         (id, workspace_id, channel_id, name, lifecycle_status, validation_status, current_version, created_by)
       values ($1,$2,$3,$4,'draft','unvalidated',0,$5)`,
      [draft.id, draft.workspace_id, draft.channel_id, draft.name, draft.created_by],
    );
    await createRevision(client, draft, lines, draft.created_by, 1);
    await client.query("COMMIT");
    console.log("[workspace] seeded Phase 2 purchase draft");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === "/health") return json({ status: "ok", service: "workspace" });
  if (path === "/ready") {
    await pool.query("select 1");
    return json({ status: "ready", service: "workspace" });
  }

  const actorOrResponse = parseActor(req);
  if (actorOrResponse instanceof Response) return actorOrResponse;
  const actor = actorOrResponse;

  if (path === "/v1/workspaces" && req.method === "GET") {
    return listWorkspaces(actor);
  }
  if (path === "/v1/workspaces" && req.method === "POST") {
    return createWorkspace(req, actor);
  }

  const workspaceMatch = path.match(/^\/v1\/workspaces\/([^/]+)$/);
  if (workspaceMatch && req.method === "GET") {
    return getWorkspace(workspaceMatch[1], actor);
  }
  const channelsMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/channels$/);
  if (channelsMatch && req.method === "GET") {
    return listChannels(channelsMatch[1], actor);
  }
  const activityMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/activity$/);
  if (activityMatch && req.method === "GET") {
    return listActivity(activityMatch[1], actor, url);
  }
  const draftsMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/purchase-drafts$/);
  if (draftsMatch && req.method === "GET") {
    return listDrafts(draftsMatch[1], actor);
  }
  if (draftsMatch && req.method === "POST") {
    return createDraft(req, draftsMatch[1], actor);
  }
  const draftMatch = path.match(/^\/v1\/purchase-drafts\/([^/]+)$/);
  if (draftMatch && req.method === "GET") {
    return getDraft(draftMatch[1], actor);
  }
  const revisionMatch = path.match(/^\/v1\/purchase-drafts\/([^/]+)\/revisions\/(\d+)$/);
  if (revisionMatch && req.method === "GET") {
    return getDraftRevision(revisionMatch[1], Number(revisionMatch[2]), actor);
  }
  const proposalsMatch = path.match(/^\/v1\/purchase-drafts\/([^/]+)\/proposals$/);
  if (proposalsMatch && req.method === "POST") {
    return postProposal(req, proposalsMatch[1], actor);
  }
  const proposalDecisionMatch = path.match(
    /^\/v1\/proposals\/([^/]+)\/(accept|edit-and-accept|reject|cancel)$/,
  );
  if (proposalDecisionMatch && req.method === "POST") {
    return handleProposalDecision(
      req,
      proposalDecisionMatch[1],
      proposalDecisionMatch[2] as "accept" | "edit-and-accept" | "reject" | "cancel",
      actor,
    );
  }
  const approvalRequestMatch = path.match(
    /^\/v1\/purchase-drafts\/([^/]+)\/approval-requests$/,
  );
  if (approvalRequestMatch && req.method === "POST") {
    return requestApproval(req, approvalRequestMatch[1], actor);
  }
  const approvalDecisionMatch = path.match(
    /^\/v1\/approval-requests\/([^/]+)\/(approve|reject|request-changes)$/,
  );
  if (approvalDecisionMatch && req.method === "POST") {
    return handleApprovalAction(
      req,
      approvalDecisionMatch[1],
      approvalDecisionMatch[2] as "approve" | "reject" | "request-changes",
      actor,
    );
  }
  const sharePreviewMatch = path.match(/^\/v1\/channels\/([^/]+)\/shares\/preview$/);
  if (sharePreviewMatch && req.method === "POST") {
    return sharePreview(req, sharePreviewMatch[1], actor);
  }
  const sharesMatch = path.match(/^\/v1\/channels\/([^/]+)\/shares$/);
  if (sharesMatch && req.method === "POST") {
    return shareProduct(req, sharesMatch[1], actor);
  }
  const messagesMatch = path.match(/^\/v1\/channels\/([^/]+)\/messages$/);
  if (messagesMatch && req.method === "GET") {
    return listMessages(messagesMatch[1], actor, url);
  }
  if (messagesMatch && req.method === "POST") {
    return postMessage(req, messagesMatch[1], actor);
  }
  const cursorMatch = path.match(/^\/v1\/channels\/([^/]+)\/read-cursor$/);
  if (cursorMatch && req.method === "POST") {
    return setReadCursor(req, cursorMatch[1], actor);
  }

  return problem(404, "not-found", "No workspace route matched.", actor.correlationId);
}

await ensureSchema();
await ensureSeedDraft();

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    try {
      const url = new URL(req.url);
      const streamMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/stream$/);
      if (streamMatch && req.method === "GET") {
        return await handleStream(req, server, url, streamMatch[1]);
      }
      return await route(req);
    } catch (error) {
      console.error("[workspace] request failed:", (error as Error).message);
      return problem(500, "workspace-error", "The workspace request failed.", "unknown");
    }
  },
  websocket: {
    open(ws) {
      const data = ws.data as WorkspaceSocketData;
      const listeners = workspaceSockets.get(data.workspaceId) ?? new Set();
      listeners.add(ws);
      workspaceSockets.set(data.workspaceId, listeners);
      streamBacklog(data.workspaceId, data.cursor)
        .then((messages) => {
          for (const message of messages) {
            ws.send(JSON.stringify({ type: "message.created", message }));
          }
          const nextCursor = messages.length
            ? (messages[messages.length - 1].sequence as number)
            : data.cursor;
          ws.send(JSON.stringify({
            type: "workspace.ready",
            workspace_id: data.workspaceId,
            next_cursor: String(nextCursor),
          }));
        })
        .catch((error) => {
          console.warn("[workspace] stream backlog failed:", (error as Error).message);
          ws.close(1011, "backlog-unavailable");
        });
    },
    message() {
      // The feed is server-push only; client frames are ignored.
    },
    close(ws) {
      const data = ws.data as WorkspaceSocketData;
      const listeners = workspaceSockets.get(data.workspaceId);
      if (!listeners) return;
      listeners.delete(ws);
      if (listeners.size === 0) workspaceSockets.delete(data.workspaceId);
    },
  },
});

console.log(`[workspace] listening on ${server.port}`);
startNats().catch((error) =>
  console.warn("[workspace] NATS startup failed:", (error as Error).message),
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await natsConnection?.close();
    await pool.end();
    server.stop();
    process.exit(0);
  });
}
